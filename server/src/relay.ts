import { Router } from 'express'
import type { Request as Req, Response as Res, NextFunction } from 'express'
import type { Store, ChannelRow, KeyRow } from './db.js'
import type { EnvConfig } from './config.js'
import { hashKey, uuid, estimateTokens, openaiError, now, jsonStr } from './util.js'
import { costFor } from './billing.js'

const RELAY_TIMEOUT_MS = 120_000
const STREAM_TIMEOUT_MS = 5 * 60_000

export function relayRouter(store: Store, cfg: EnvConfig): Router {
  const r = Router()

  r.use((req: Req, res: Res, next: NextFunction) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')
    const token = m?.[1]
    if (!token) return openaiError(res, 401, 'invalid_api_key', 'You must provide an API key.')
    const key = store.getKeyByHash(hashKey(token))
    if (!key || key.status !== 1) return openaiError(res, 401, 'invalid_api_key', 'Invalid API key.')
    ;(req as Req & { localkey: KeyRow }).localkey = key
    next()
  })

  r.get('/models', (_req, res) => {
    const ids = [...new Set(store.listChannels().filter((c) => c.enabled === 1).flatMap((c) => c.models))]
    res.json({ object: 'list', data: ids.map((id) => ({ id, object: 'model', owned_by: 'localapi' })) })
  })

  r.post('/chat/completions', (req, res) => void proxy(req, res, 'chat/completions', cfg, store))
  r.post('/completions', (req, res) => void proxy(req, res, 'completions', cfg, store))
  r.post('/embeddings', (req, res) => void proxy(req, res, 'embeddings', cfg, store))

  return r
}

function pickChannel(store: Store, cfg: EnvConfig, model?: string): { channel: ChannelRow; upstreamModel: string } | null {
  const chs = store.listChannels().filter((c) => c.enabled === 1)
  if (!chs.length) return null
  const local = model || cfg.defaultModel
  const mapped = cfg.modelMap[local] ?? local
  const hit =
    chs.find((c) => c.models.includes(mapped)) ??
    chs.find((c) => c.models.includes(local)) ??
    chs.find((c) => c.models.includes('*'))
  return { channel: hit ?? chs[0], upstreamModel: mapped }
}

async function proxy(req: Req, res: Res, path: string, cfg: EnvConfig, store: Store): Promise<void> {
  const key = (req as Req & { localkey: KeyRow }).localkey
  const started = now()
  const body = req.body ?? {}
  const model = typeof body.model === 'string' && body.model ? body.model : cfg.defaultModel
  const picked = pickChannel(store, cfg, model)
  if (!picked) return openaiError(res, 400, 'no_channel', 'no enabled channel available')

  const upstreamBody = { ...body, model: picked.upstreamModel }
  const url = picked.channel.base_url.replace(/\/+$/, '') + '/' + path
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), body.stream ? STREAM_TIMEOUT_MS : RELAY_TIMEOUT_MS)

  let upstream: globalThis.Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${picked.channel.api_key}`,
      },
      body: jsonStr(upstreamBody),
      signal: ctrl.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = (err as Error).name === 'AbortError' ? 'upstream timeout' : String((err as Error).message ?? err)
    recordError(store, key, picked.channel, model, started, msg, uuid())
    return openaiError(res, 502, 'upstream_error', msg)
  }
  clearTimeout(timer)

  if (body.stream) {
    return handleStream(res, upstream, store, key, picked.channel, model, started, upstreamBody)
  }

  const payload = await upstream.text()
  if (!upstream.ok) {
    recordError(store, key, picked.channel, model, started, payload.slice(0, 500), uuid())
    res.status(upstream.status).set('content-type', 'application/json').send(payload)
    return
  }

  let data: Record<string, unknown> | null = null
  try {
    data = JSON.parse(payload)
  } catch {
    // 上游返回了非法 JSON,按错误记录
  }
  const usage = data && typeof data.usage === 'object' ? (data.usage as Record<string, unknown>) : null
  const pt = usage && Number.isFinite(Number(usage.prompt_tokens)) ? Number(usage.prompt_tokens) : estimateTokens(jsonStr(upstreamBody))
  const ct = usage && Number.isFinite(Number(usage.completion_tokens)) ? Number(usage.completion_tokens) : estimateTokens(payload)
  recordOk(store, key, picked.channel, model, started, pt, ct, uuid(), null)
  res.set('content-type', 'application/json').status(upstream.status).send(payload)
}

function recordOk(
  store: Store, key: KeyRow, channel: ChannelRow, model: string, started: number,
  pt: number, ct: number, requestId: string, latencyMs: number | null,
): void {
  const cost = costFor(channel, pt, ct)
  store.addUsage({
    channelId: channel.id, channelName: channel.name, model, keyId: key.id, keyName: key.name,
    promptTokens: pt, completionTokens: ct, cost, latencyMs: latencyMs ?? now() - started, status: 0, error: null, requestId,
  })
  store.bumpKey(key.id, pt, ct)
}

function recordError(store: Store, key: KeyRow, channel: ChannelRow, model: string, started: number, error: string, requestId: string): void {
  store.addUsage({
    channelId: channel.id, channelName: channel.name, model, keyId: key.id, keyName: key.name,
    promptTokens: 0, completionTokens: 0, cost: 0, latencyMs: now() - started, status: 1, error, requestId,
  })
  store.bumpKey(key.id, 0, 0)
}

async function handleStream(
  res: Res, upstream: globalThis.Response, store: Store, key: KeyRow, channel: ChannelRow, model: string,
  started: number, upstreamBody: Record<string, unknown>,
): Promise<void> {
  const requestId = uuid()
  if (!upstream.ok) {
    const text = await upstream.text()
    recordError(store, key, channel, model, started, text.slice(0, 500), requestId)
    res.status(upstream.status).set('content-type', 'application/json').send(text)
    return
  }

  res.set({
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  res.flushHeaders()

  let usage: { prompt_tokens: number; completion_tokens: number } | null = null
  let outChars = 0
  const promptEst = estimateTokens(jsonStr(upstreamBody))

  try {
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      const text = chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : String(chunk)
      outChars += text.length
      usage = usage ?? extractUsage(text)
      res.write(chunk instanceof Uint8Array ? chunk : Buffer.from(text))
    }
  } catch (err) {
    const msg = String((err as Error).message ?? err)
    recordError(store, key, channel, model, started, 'stream aborted: ' + msg, requestId)
    res.end()
    return
  }

  const pt = usage?.prompt_tokens ?? promptEst
  const ct = usage?.completion_tokens ?? estimateTokens(String(outChars))
  recordOk(store, key, channel, model, started, pt, ct, requestId, now() - started)
  res.end()
}

function extractUsage(text: string): { prompt_tokens: number; completion_tokens: number } | null {
  const idx = text.indexOf('"usage"')
  if (idx === -1) return null
  try {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json || json === '[DONE]') continue
      const obj = JSON.parse(json)
      const u = obj?.usage
      if (u && Number.isFinite(Number(u.prompt_tokens))) {
        return { prompt_tokens: Number(u.prompt_tokens), completion_tokens: Number(u.completion_tokens ?? 0) }
      }
    }
  } catch {
    // 解析失败继续按估算
  }
  return null
}