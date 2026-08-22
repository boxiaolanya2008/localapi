import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import type { Store, ChannelRow } from './db.js'
import type { EnvConfig } from './config.js'
import { maskKey, dayStart, now } from './util.js'
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

  // ---- keys ----

  r.get('/keys', (_req, res) => {
    res.json(store.listKeys())
  })

  r.post('/keys', (req, res) => {
    const name = String(req.body?.name ?? '新密钥').trim() || '新密钥'
    const note = String(req.body?.note ?? '').trim()
    const groupId = Number(req.body?.groupId ?? 1)
    const key = store.addKey(name, note, groupId)
    res.json(key)
  })

  r.patch('/keys/:id', (req, res) => {
    const patch = req.body ?? {}
    if (patch.groupId !== undefined) patch.group_id = Number(patch.groupId)
    const row = store.updateKey(req.params.id, patch)
    if (!row) return res.status(404).json({ message: 'key not found' })
    res.json(row)
  })

  r.delete('/keys/:id', (req, res) => {
    if (!store.deleteKey(req.params.id)) return res.status(404).json({ message: 'key not found' })
    res.json({ ok: true })
  })

  // ---- groups ----

  r.get('/groups', (_req, res) => {
    res.json(store.listGroups())
  })

  r.post('/groups', (req, res) => {
    const body = req.body ?? {}
    if (!String(body.name ?? '').trim()) return res.status(400).json({ message: 'name is required' })
    const row = store.createGroup(body)
    res.json(row)
  })

  r.patch('/groups/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' })
    const row = store.updateGroup(id, req.body ?? {})
    if (!row) return res.status(404).json({ message: 'group not found' })
    res.json(row)
  })

  r.delete('/groups/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' })
    if (!store.deleteGroup(id)) return res.status(400).json({ message: '默认分组不可删除' })
    res.json({ ok: true })
  })

  // ---- usage ----

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

  // 按时间范围与筛选汇总用量(今日/近N天/自定义xxx-xxx)
  r.get('/usage/summary', (req, res) => {
    const q = req.query
    const channelId = q.channelId !== undefined ? Number(q.channelId) : undefined
    const groupId = q.groupId !== undefined ? Number(q.groupId) : undefined
    const agg = store.usageAgg({
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      keyId: typeof q.keyId === 'string' ? q.keyId : undefined,
      channelId: Number.isFinite(channelId) ? channelId : undefined,
      groupId: Number.isFinite(groupId) ? groupId : undefined,
    })
    res.json(agg)
  })

  r.get('/usage/export', (req, res) => {    const q = req.query
    const { rows } = store.queryUsage({
      from: q.from ? Number(q.from) : undefined,
      to: q.to ? Number(q.to) : undefined,
      keyId: typeof q.keyId === 'string' ? q.keyId : undefined,
      channelId: q.channelId !== undefined ? Number(q.channelId) : undefined,
      size: 100000,
    })
    const head = 'ts,channel,model,key,group,rate,prompt_tokens,cached_tokens,completion_tokens,total_tokens,cost,latency_ms,status,request_id'
    const lines = rows.map((r) =>
      [
        new Date(r.ts).toISOString(), r.channel_name, r.model, r.key_name, r.group_name, r.rate,
        r.prompt_tokens, r.cached_tokens, r.completion_tokens, r.total_tokens, r.cost.toFixed(6),
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
      byGroup: store.groupUsage(),
      topKeys: store.topKeys(5),
      channels: channels.map((c) => ({
        id: c.id, name: c.name, provider: c.provider, models: c.models, enabled: c.enabled,
        theme_color: c.theme_color, balance: balanceMap[c.id] ?? { source: 'estimate', amount: c.credit },
      })),
    })
  })

  // ---- channels ----

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

  r.post('/channels/:id/credit', (req, res) => {
    const id = Number(req.params.id)
    const delta = Number(req.body?.delta ?? 0)
    if (!Number.isFinite(id) || !Number.isFinite(delta)) return res.status(400).json({ message: 'bad input' })
    const next = store.addChannelCredit(id, delta)
    if (next === null) return res.status(404).json({ message: 'channel not found' })
    res.json({ ok: true, credit: next, delta })
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

  // ---- settings ----

  r.get('/settings', (_req, res) => {
    const mdRaw = store.getSetting('md_system_updated_at', '')
    res.json({
      version: '0.1.0',
      env: {
        port: cfg.port,
        host: cfg.host,
        adminToken: cfg.adminToken ? 'set' : 'unset',
        dataDir: cfg.dataDir,
        modelMap: cfg.modelMap,
      },
      defaults: {
        priceIn: store.getSetting('default_price_in', '0'),
        priceOut: store.getSetting('default_price_out', '0'),
      },
      features: {
        premiumUnlocked: store.getSetting('feature_unlocked', '0') === '1',
      },
      mdPrompt: {
        enabled: store.getSetting('md_system_enabled', '0') === '1',
        name: store.getSetting('md_system_name', ''),
        content: store.getSetting('md_system_prompt', ''),
        updatedAt: mdRaw ? Number(mdRaw) : null,
      },
    })
  })

  r.patch('/settings', (req, res) => {
    const body = req.body ?? {}
    if (body.price_in !== undefined) store.setSetting('default_price_in', String(body.price_in))
    if (body.price_out !== undefined) store.setSetting('default_price_out', String(body.price_out))
    res.json({ ok: true })
  })

  const DEMO_VIP_KEY = 'LP-VIP-LOCAL-2026'
  r.post('/settings/activate', (req, res) => {
    const key = String(req.body?.activate_key ?? '').trim()
    if (!key) return res.status(400).json({ message: '请输入解锁密钥' })
    if (key === DEMO_VIP_KEY || store.getSetting('premium_key', '') === key) {
      store.setSetting('feature_unlocked', '1')
      return res.json({ ok: true, unlocked: true })
    }
    res.status(403).json({ message: '解锁密钥无效' })
  })

  r.get('/settings/md', (_req, res) => {
    const raw = store.getSetting('md_system_updated_at', '')
    res.json({
      enabled: store.getSetting('md_system_enabled', '0') === '1',
      name: store.getSetting('md_system_name', ''),
      content: store.getSetting('md_system_prompt', ''),
      updatedAt: raw ? Number(raw) : null,
    })
  })

  r.put('/settings/md', (req, res) => {
    const body = req.body ?? {}
    let touched = false
    if (body.content !== undefined) {
      const content = String(body.content)
      if (content.length > 50000) return res.status(400).json({ message: 'content too long, max 50000 chars' })
      store.setSetting('md_system_prompt', content)
      touched = true
    }
    if (body.enabled !== undefined) {
      const v = body.enabled
      const enabled = v === true || v === 1 || v === '1' || v === 'true' ? '1' : '0'
      store.setSetting('md_system_enabled', enabled)
      touched = true
    }
    if (body.name !== undefined) {
      store.setSetting('md_system_name', String(body.name))
      touched = true
    }
    if (touched) store.setSetting('md_system_updated_at', String(now()))
    const raw = store.getSetting('md_system_updated_at', '')
    res.json({
      ok: true,
      enabled: store.getSetting('md_system_enabled', '0') === '1',
      name: store.getSetting('md_system_name', ''),
      content: store.getSetting('md_system_prompt', ''),
      updatedAt: raw ? Number(raw) : null,
    })
  })

  // ---- param presets ----

  r.get('/params', (_req, res) => {
    res.json(store.listParamPresets())
  })

  r.post('/params', (req, res) => {
    const body = req.body ?? {}
    if (!String(body.name ?? '').trim()) return res.status(400).json({ message: 'name is required' })
    const row = store.createParamPreset(body)
    res.json(row)
  })

  r.patch('/params/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' })
    const row = store.updateParamPreset(id, req.body ?? {})
    if (!row) return res.status(404).json({ message: 'param preset not found' })
    res.json(row)
  })

  r.delete('/params/:id', (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'bad id' })
    if (!store.deleteParamPreset(id)) return res.status(404).json({ message: 'param preset not found' })
    res.json({ ok: true })
  })

  return r
}

function normalizeChannelInput(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  if (typeof out.models === 'string') {
    out.models = out.models.split(',').map((s) => String(s).trim()).filter(Boolean)
  }
  for (const k of ['price_in', 'price_out', 'credit'] as const) {
    if (typeof out[k] === 'string') out[k] = Number(out[k])
  }
  if ('enabled' in out && typeof out.enabled === 'string') out.enabled = out.enabled === '1' || out.enabled === 'true' ? 1 : 0
  if ('inject_system_enabled' in out && typeof out.inject_system_enabled === 'string') out.inject_system_enabled = out.inject_system_enabled === '1' || out.inject_system_enabled === 'true' ? 1 : 0
  return out
}

function publicChannel(c: ChannelRow): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    provider: c.provider,
    base_url: c.base_url,
    api_key_masked: maskKey(c.api_key),
    api_style: c.api_style || 'chat',
    api_path: c.api_path || '',
    models: c.models,
    price_in: c.price_in,
    price_out: c.price_out,
    credit: c.credit,
    billing_endpoint: c.billing_endpoint,
    theme_name: c.theme_name,
    theme_color: c.theme_color,
    icon_svg: c.icon_svg,
    inject_system_prompt: c.inject_system_prompt,
    inject_system_enabled: c.inject_system_enabled,
    enabled: c.enabled,
    created_at: c.created_at,
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