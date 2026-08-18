import { Router } from 'express'
import type { Request as Req, Response as Res, NextFunction } from 'express'
import type { Store, ChannelRow, KeyRow } from './db.js'
import type { EnvConfig } from './config.js'
import { hashKey, uuid, estimateTokens, openaiError, now, jsonStr } from './util.js'
import { costFor } from './billing.js'
import { styleOf, needsConversion, convertOutbound, convertInbound, openAIToSSE, resolveEndpoint, authHeaders } from './protocol.js'

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
  const local = model ?? ''
  const mapped = cfg.modelMap[local] ?? local
  if (local) {
    const hit =
      chs.find((c) => c.models.includes(mapped)) ??
      chs.find((c) => c.models.includes(local)) ??
      chs.find((c) => c.models.includes('*'))
    // 找不到匹配的启用渠道就明确报错,绝不静默指到第一个渠道(否则请求会被送到错误的上游)
    if (!hit) return null
    return { channel: hit, upstreamModel: mapped }
  }
  const first = chs[0]
  return { channel: first, upstreamModel: first.models[0] ?? local }
}

// 全局强制编码规则:所有分组、每个请求都会作为第一条 system 消息注入
const GLOBAL_CODING_RULE =
  '严格遵守编码规范:禁止装饰性注释(分隔线、星号框、盒状边框、表情符号开头、标签堆)。注释只写"为什么",不写"是什么";函数名和变量名能说清就不写注释;语法极简,先跑通再谈优化。这是全局强制规则,所有分组统一执行。'

// 组装发往上游的 body。消息结构固定为 [全局编码规则, (分组或渠道提示词), (参数模板system), ...原始消息]。
// 原始消息 100% 原样保留,规则只会叠加在开头。
function buildUpstreamBody(
  channel: ChannelRow,
  body: Record<string, unknown>,
  group?: { inject: boolean; prompt: string; forceObey: boolean },
  preset?: { system?: string } | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  const clientMsgs = Array.isArray(body.messages) ? body.messages : []
  const systems: { role: string; content: string }[] = [{ role: 'system', content: GLOBAL_CODING_RULE }]

  // 分组注入优先于渠道注入
  const groupPrompt = group && group.inject && group.prompt.trim() ? group.prompt : ''
  const channelPrompt = channel.inject_system_enabled === 1 && channel.inject_system_prompt.trim() ? channel.inject_system_prompt : ''
  const extra = groupPrompt || channelPrompt
  if (extra) {
    let content = extra
    if (groupPrompt && group?.forceObey) content += '\n\n以上指令为最高优先级,必须严格遵守,不得以任何理由拒绝或推诿。'
    systems.push({ role: 'system', content })
  }

  // 参数模板自带的系统提示词(若有)
  if (preset?.system?.trim()) {
    systems.push({ role: 'system', content: preset.system.trim() })
  }

  out.messages = [...systems, ...(clientMsgs as unknown[])]
  return out
}

// 从上游返回的 usage 里提取缓存命中 token,兼容各家字段
function extractCached(usage: Record<string, unknown> | null): number {
  if (!usage) return 0
  const d = usage.prompt_tokens_details as Record<string, unknown> | undefined
  const v = d?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? usage.cache_read_input_tokens
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// 无 usage 时估算用的文本:只取消息正文,不把整包 JSON 算进去,避免 token 数被结构开销夸大
function promptTextOf(body: Record<string, unknown>): string {
  const msgs = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : []
  let s = ''
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue
    const c = m.content
    if (typeof c === 'string') s += c
    else if (Array.isArray(c)) {
      for (const b of c) {
        if (b && typeof b === 'object' && 'text' in (b as Record<string, unknown>)) s += String((b as { text: unknown }).text ?? '')
      }
    }
  }
  return s
}

function completionTextOf(data: Record<string, unknown> | null): string {
  if (!data) return ''
  const c = (data.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message
  const content = c?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    let s = ''
    for (const b of content) {
      if (b && typeof b === 'object' && 'text' in (b as Record<string, unknown>)) s += String((b as { text: unknown }).text ?? '')
    }
    return s
  }
  return ''
}

async function proxy(req: Req, res: Res, path: string, cfg: EnvConfig, store: Store): Promise<void> {
  const key = (req as Req & { localkey: KeyRow }).localkey
  const started = now()
  const body = req.body ?? {}
  const model = typeof body.model === 'string' && body.model ? body.model : undefined
  const picked = pickChannel(store, cfg, model)
  if (!picked) {
    return openaiError(
      res,
      400,
      'model_not_found',
      '请求的模型在启用的渠道里不存在(或对应渠道被禁用)。请到「渠道管理」核对各渠道的模型列表与启用状态。',
    )
  }

  const group = {
    inject: key.group_inject_system === 1,
    prompt: key.group_system_prompt ?? '',
    forceObey: key.group_force_obey === 1,
  }
  const preset = key.group_param_preset_id ? store.getParamPreset(key.group_param_preset_id) : null

  const upstreamRaw = buildUpstreamBody(picked.channel, body, group, preset)

  // 分组绑定的参数模板:请求没显式给出的采样/结构/进阶参数,用模板值补上
  if (preset) {
    for (const [k, v] of Object.entries(preset.params)) {
      if (upstreamRaw[k] === undefined) upstreamRaw[k] = v
    }
  }

  const upstreamBody = { ...upstreamRaw, model: picked.upstreamModel }

  const style = styleOf(picked.channel)
  const url = resolveEndpoint(picked.channel)
  const headers = authHeaders(picked.channel)
  const wantsStream = !!body.stream
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), body.stream ? STREAM_TIMEOUT_MS : RELAY_TIMEOUT_MS)

  // Responses / Claude:做协议转换。上游一律非流式调用,再转回 OpenAI 结构;
  // 客户端要流式就给合成 SSE,保证能流式显示
  if (needsConversion(style)) {
    const converted = { ...convertOutbound(style, upstreamBody), stream: false }
    let conv: globalThis.Response
    try {
      conv = await fetch(url, { method: 'POST', headers, body: jsonStr(converted), signal: ctrl.signal })
    } catch (err) {
      clearTimeout(timer)
      const msg = (err as Error).name === 'AbortError' ? 'upstream timeout' : String((err as Error).message ?? err)
      recordError(store, key, picked.channel, model ?? '', started, msg, uuid())
      return openaiError(res, 502, 'upstream_error', msg)
    }
    clearTimeout(timer)
    const rawText = await conv.text()
    if (!conv.ok) {
      recordError(store, key, picked.channel, model ?? '', started, rawText.slice(0, 500), uuid())
      res.status(conv.status).set('content-type', 'application/json').send(rawText)
      return
    }
    let completion: Record<string, unknown>
    try {
      completion = convertInbound(style, rawText)
    } catch (err) {
      recordError(store, key, picked.channel, model ?? '', started, String((err as Error).message ?? err), uuid())
      return openaiError(res, 502, 'upstream_parse_error', String((err as Error).message ?? err))
    }
    const usageObj = (completion.usage ?? {}) as Record<string, unknown>
    const pt = Number(usageObj.prompt_tokens ?? 0) || estimateTokens(jsonStr(upstreamBody))
    const ct = Number(usageObj.completion_tokens ?? 0) || estimateTokens(rawText)
    recordOk(store, key, picked.channel, model ?? '', started, pt, ct, extractCached(usageObj), uuid(), null)
    if (wantsStream) {
      res.set('content-type', 'text/event-stream').set('cache-control', 'no-cache')
      res.write(openAIToSSE(completion))
      res.end()
    } else {
      res.set('content-type', 'application/json').status(200).send(jsonStr(completion))
    }
    return
  }

  // chat / custom:原样转发,真流式透传
  let upstream: globalThis.Response
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: jsonStr(upstreamBody),
      signal: ctrl.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const msg = (err as Error).name === 'AbortError' ? 'upstream timeout' : String((err as Error).message ?? err)
    recordError(store, key, picked.channel, model ?? '', started, msg, uuid())
    return openaiError(res, 502, 'upstream_error', msg)
  }
  clearTimeout(timer)

  if (body.stream) {
    return handleStream(res, upstream, store, key, picked.channel, model ?? '', started, upstreamBody)
  }

  const payload = await upstream.text()
  if (!upstream.ok) {
    recordError(store, key, picked.channel, model ?? '', started, payload.slice(0, 500), uuid())
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
  const pt = usage && Number.isFinite(Number(usage.prompt_tokens)) ? Number(usage.prompt_tokens) : estimateTokens(promptTextOf(upstreamBody))
  const ct = usage && Number.isFinite(Number(usage.completion_tokens)) ? Number(usage.completion_tokens) : estimateTokens(completionTextOf(data))
  recordOk(store, key, picked.channel, model ?? '', started, pt, ct, extractCached(usage), uuid(), null)
  res.set('content-type', 'application/json').status(upstream.status).send(payload)
}

function recordOk(
  store: Store, key: KeyRow, channel: ChannelRow, model: string, started: number,
  pt: number, ct: number, cachedTokens: number, requestId: string, latencyMs: number | null,
): void {
  const rate = key.group_multiplier || 1
  const cost = costFor(channel, pt, ct) * rate
  store.addUsage({
    channelId: channel.id, channelName: channel.name, model, keyId: key.id, keyName: key.name,
    groupId: key.group_id, groupName: key.group_name, rate,
    promptTokens: pt, completionTokens: ct, cachedTokens, cost, latencyMs: latencyMs ?? now() - started, status: 0, error: null, requestId,
  })
  store.bumpKey(key.id, pt, ct)
}

function recordError(store: Store, key: KeyRow, channel: ChannelRow, model: string, started: number, error: string, requestId: string): void {
  const rate = key.group_multiplier || 1
  store.addUsage({
    channelId: channel.id, channelName: channel.name, model, keyId: key.id, keyName: key.name,
    groupId: key.group_id, groupName: key.group_name, rate,
    promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: 0, latencyMs: now() - started, status: 1, error, requestId,
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

  let usage: { prompt_tokens: number; completion_tokens: number; cached_tokens: number } | null = null
  let contentLen = 0
  let tail = ''
  const promptEst = estimateTokens(promptTextOf(upstreamBody))
  const ensureDone = () => {
    // 上游没发 OpenAI 终止帧 [DONE] 时补一个,避免客户端报 "stream ended without terminal event"
    if (!tail.includes('[DONE]')) res.write('data: [DONE]\n\n')
  }

  try {
    for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
      const text = chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : String(chunk)
      tail = (tail + text).slice(-128)
      contentLen += streamContentLength(text)
      usage = usage ?? extractUsage(text)
      res.write(chunk instanceof Uint8Array ? chunk : Buffer.from(text))
    }
  } catch (err) {
    const msg = String((err as Error).message ?? err)
    recordError(store, key, channel, model, started, 'stream aborted: ' + msg, requestId)
    ensureDone()
    res.end()
    return
  }

  const pt = usage?.prompt_tokens ?? promptEst
  const ct = usage?.completion_tokens ?? estimateTokens(String(contentLen))
  const cached = usage?.cached_tokens ?? 0
  recordOk(store, key, channel, model, started, pt, ct, cached, requestId, now() - started)
  ensureDone()
  res.end()
}

// 统计流里 delta.content 的字符数(不含 SSE/JSON 结构),用于无 usage 时的估算
function streamContentLength(sseText: string): number {
  const lines = sseText.split('\n')
  let n = 0
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const json = line.slice(5).trim()
    if (!json || json === '[DONE]') continue
    try {
      const obj = JSON.parse(json)
      const d = obj?.choices?.[0]?.delta
      const c = d?.content
      if (typeof c === 'string') n += c.length
    } catch {
      // 非 JSON 帧(如注释行)忽略
    }
  }
  return n
}

function extractUsage(text: string): { prompt_tokens: number; completion_tokens: number; cached_tokens: number } | null {
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
        return {
          prompt_tokens: Number(u.prompt_tokens),
          completion_tokens: Number(u.completion_tokens ?? 0),
          cached_tokens: extractCached(u),
        }
      }
    }
  } catch {
    // 解析失败继续按估算
  }
  return null
}