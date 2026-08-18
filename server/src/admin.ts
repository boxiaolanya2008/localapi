import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import type { Store, ChannelRow } from './db.js'
import type { EnvConfig } from './config.js'
import { maskKey, dayStart, parseJsonArray, now, jsonStr } from './util.js'
import { getBalance } from './billing.js'

export function adminRouter(store: Store, cfg: EnvConfig): Router {
  const r = Router()

  r.use((req: Request, res: Response, next: NextFunction) => {
    const h = req.headers['x-admin-token']
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
    const token = typeof h === 'string' ? h : bearer
    if (!cfg.adminToken || token !== cfg.adminToken) {
      return res.status(403).json({ message: 'forbidden' })
    }
    next()
  })

  r.get('/keys', (_req, res) => {
    res.json(store.listKeys())
  })

  r.post('/keys', (req, res) => {
    const name = String(req.body?.name ?? '新密钥').trim() || '新密钥'
    const note = String(req.body?.note ?? '').trim()
    const key = store.addKey(name, note)
    res.json(key)
  })

  r.patch('/keys/:id', (req, res) => {
    const row = store.updateKey(req.params.id, req.body ?? {})
    if (!row) return res.status(404).json({ message: 'key not found' })
    res.json(row)
  })

  r.delete('/keys/:id', (req, res) => {
    if (!store.deleteKey(req.params.id)) return res.status(404).json({ message: 'key not found' })
    res.json({ ok: true })
  })

  r.get('/usage', (req, res) => {
    const q = req.query
    const page = Number(q.page ?? 1)
    const size = Number(q.size ?? 20)
    const channelId = q.channelId !== undefined ? Number(q.channelId) : undefined
    const data = store.queryUsage({
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      keyId: typeof q.keyId === 'string' ? q.keyId : undefined,
      channelId: Number.isFinite(channelId) ? channelId : undefined,
      page: Number.isFinite(page) ? page : undefined,
      size: Number.isFinite(size) ? size : undefined,
    })
    res.json(data)
  })

  r.get('/usage/export', (req, res) => {
    const q = req.query
    const { rows } = store.queryUsage({
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      keyId: typeof q.keyId === 'string' ? q.keyId : undefined,
      channelId: q.channelId !== undefined ? Number(q.channelId) : undefined,
      size: 100000,
    })
    const head = 'ts,channel,model,key,prompt_tokens,completion_tokens,total_tokens,cost,latency_ms,status,request_id'
    const lines = rows.map((r) =>
      [
        new Date(r.ts).toISOString(), r.channel_name, r.model, r.key_name,
        r.prompt_tokens, r.completion_tokens, r.total_tokens, r.cost.toFixed(6),
        r.latency_ms ?? '', r.status === 0 ? 'ok' : 'error', r.request_id,
      ].join(','),
    )
    res.set({
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="usage.csv"',
    })
    res.send([head, ...lines].join('\n'))
  })

  r.get('/stats', async (_req, res) => {
    const today = store.usageSince(dayStart())
    const total = store.usageTotals()
    const channels = store.listChannels()
    const balanceMap: Record<number, { source: 'live' | 'estimate'; amount: number }> = {}
    await Promise.all(channels.map(async (c) => {
      const b = await getBalance(store, c)
      balanceMap[c.id] = { source: b.source, amount: b.amount }
    }))
    res.json({
      today,
      total,
      series: seriesDays(store, 7),
      byChannel: store.groupByChannel(),
      byModel: store.groupByModel(),
      topKeys: store.topKeys(5),
      channels: channels.map((c) => ({
        id: c.id, name: c.name, models: c.models, enabled: c.enabled,
        theme_color: c.theme_color, balance: balanceMap[c.id] ?? { source: 'estimate', amount: c.credit },
      })),
    })
  })

  r.get('/channels', async (_req, res) => {
    const rows = store.listChannels()
    const out = await Promise.all(rows.map(async (c) => ({
      ...publicChannel(c),
      balance: await getBalance(store, c),
    })))
    res.json(out)
  })

  r.post('/channels', (req, res) => {
    const body = req.body ?? {}
    if (!body.name || !body.base_url || !body.api_key) {
      return res.status(400).json({ message: 'name, base_url, api_key are required' })
    }
    const row = store.createChannel(normalizeChannelInput(body))
    res.json(row ? publicChannel(row) : null)
  })

  r.patch('/channels/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' })
    const row = store.updateChannel(id, normalizeChannelInput(req.body ?? {}))
    if (!row) return res.status(404).json({ message: 'channel not found' })
    res.json(publicChannel(row))
  })

  r.delete('/channels/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' })
    if (!store.deleteChannel(id)) return res.status(404).json({ message: 'channel not found' })
    res.json({ ok: true })
  })

  r.post('/channels/:id/test', async (req, res) => {
    const id = Number(req.params.id)
    const ch = store.getChannel(id)
    if (!ch) return res.status(404).json({ message: 'channel not found' })
    const url = ch.base_url.replace(/\/+$/, '') + '/models'
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const started = now()
    try {
      const up = await fetch(url, { headers: { authorization: `Bearer ${ch.api_key}` }, signal: ctrl.signal })
      const latencyMs = now() - started
      res.json({ ok: up.ok, status: up.status, latencyMs })
    } catch (err) {
      const latencyMs = now() - started
      res.json({ ok: false, latencyMs, error: String((err as Error).message ?? err) })
    } finally {
      clearTimeout(t)
    }
  })

  r.get('/settings', (_req, res) => {
    const main = cfg.channels[0]
    res.json({
      version: '0.1.0',
      env: {
        port: cfg.port,
        host: cfg.host,
        adminToken: cfg.adminToken ? 'set' : 'unset',
        defaultModel: cfg.defaultModel,
        baseUrl: main ? maskUrl(main.baseUrl) : '',
        dataDir: cfg.dataDir,
        apiKeySet: !!main?.apiKey,
        modelMap: cfg.modelMap,
      },
      defaults: {
        priceIn: store.getSetting('default_price_in', '0'),
        priceOut: store.getSetting('default_price_out', '0'),
      },
    })
  })

  r.patch('/settings', (req, res) => {
    const body = req.body ?? {}
    if (body.price_in !== undefined) store.setSetting('default_price_in', String(body.price_in))
    if (body.price_out !== undefined) store.setSetting('default_price_out', String(body.price_out))
    res.json({ ok: true })
  })

  return r
}

function normalizeChannelInput(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  if (typeof out.models === 'string') {
    out.models = out.models.split(',').map((s) => String(s).trim()).filter(Boolean)
  }
  if ('price_in' in out && typeof out.price_in === 'string') out.price_in = Number(out.price_in)
  if ('price_out' in out && typeof out.price_out === 'string') out.price_out = Number(out.price_out)
  if ('credit' in out && typeof out.credit === 'string') out.credit = Number(out.credit)
  if ('enabled' in out && typeof out.enabled === 'string') out.enabled = out.enabled === '1' || out.enabled === 'true' ? 1 : 0
  return out
}

function publicChannel(c: ChannelRow): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    base_url: c.base_url,
    api_key_masked: maskKey(c.api_key),
    models: c.models,
    price_in: c.price_in,
    price_out: c.price_out,
    credit: c.credit,
    billing_endpoint: c.billing_endpoint,
    theme_name: c.theme_name,
    theme_color: c.theme_color,
    icon_svg: c.icon_svg,
    enabled: c.enabled,
    created_at: c.created_at,
  }
}

function rounded(n: number): number {
  return Math.round(n * 10000) / 10000
}

function maskUrl(u: string): string {
  try {
    const url = new URL(u)
    return url.protocol + '//' + url.host
  } catch {
    return maskKey(u)
  }
}

function seriesDays(store: Store, n: number): { date: string; tokens: number; requests: number; cost: number }[] {
  const out: { date: string; tokens: number; requests: number; cost: number }[] = []
  const today = dayStart()
  for (let i = n - 1; i >= 0; i--) {
    const start = today - i * 86_400_000
    const s = store.usageSince(start)
    const d = new Date(start)
    out.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      tokens: s.tokens,
      requests: s.requests,
      cost: Math.round(s.cost * 10000) / 10000,
    })
  }
  return out
}