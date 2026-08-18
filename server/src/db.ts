import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import type { EnvChannel } from './config.js'
import { genKey, hashKey, parseJsonArray, uuid, now } from './util.js'

export interface ChannelRow {
  id: number
  name: string
  base_url: string
  api_key: string
  models: string[]
  price_in: number
  price_out: number
  credit: number
  billing_endpoint: string
  theme_name: string
  theme_color: string
  icon_svg: string
  enabled: number
  created_at: number
}

export interface KeyRow {
  id: string
  name: string
  key: string
  key_hash: string
  status: number
  note: string
  created_at: number
  last_used_at: number | null
  total_prompt_tokens: number
  total_completion_tokens: number
  request_count: number
}

export interface UsageRow {
  id: number
  ts: number
  channel_id: number | null
  channel_name: string
  model: string
  key_id: string | null
  key_name: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost: number
  latency_ms: number | null
  status: number
  error: string | null
  request_id: string
}

const CHANNEL_FIELDS = new Set([
  'name', 'base_url', 'api_key', 'models', 'price_in', 'price_out', 'credit',
  'billing_endpoint', 'theme_name', 'theme_color', 'icon_svg', 'enabled',
])

const KEY_FIELDS = new Set(['name', 'status', 'note'])

interface BalanceCacheRow {
  channel_id: number
  source: 'live' | 'estimate'
  amount: number
  fetched_at: number
}

export class Store {
  private db: DatabaseSync

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.db = new DatabaseSync(path.join(dataDir, 'localapi.db'))
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 3000')
    this.initSchema()
  }

  close(): void {
    this.db.close()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        status INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
        total_completion_tokens INTEGER NOT NULL DEFAULT 0,
        request_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        models TEXT NOT NULL DEFAULT '[]',
        price_in REAL NOT NULL DEFAULT 0,
        price_out REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        billing_endpoint TEXT NOT NULL DEFAULT '',
        theme_name TEXT NOT NULL DEFAULT '默认',
        theme_color TEXT NOT NULL DEFAULT '#10b981',
        icon_svg TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        channel_id INTEGER,
        channel_name TEXT,
        model TEXT,
        key_id TEXT,
        key_name TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        status INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        request_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(ts);
      CREATE INDEX IF NOT EXISTS idx_usage_channel ON usage(channel_id);
      CREATE INDEX IF NOT EXISTS idx_usage_key ON usage(key_id);
      CREATE TABLE IF NOT EXISTS balance_cache (
        channel_id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        amount REAL NOT NULL,
        fetched_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }

  // ---- channels ----

  seedChannels(list: EnvChannel[]): void {
    const n = (this.db.prepare('SELECT COUNT(*) AS c FROM channels').get() as { c: number }).c
    if (n > 0) return
    const ins = this.db.prepare(
      'INSERT INTO channels (name, base_url, api_key, models, price_in, price_out, credit, billing_endpoint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const c of list) {
      ins.run(c.name, c.baseUrl, c.apiKey, JSON.stringify(c.models), c.priceIn, c.priceOut, c.credit, c.billingEndpoint, now())
    }
  }

  private mapChannel(r: Record<string, unknown>): ChannelRow {
    return {
      ...(r as unknown as ChannelRow),
      models: parseJsonArray(String(r.models ?? '[]')),
    }
  }

  listChannels(): ChannelRow[] {
    const rows = this.db.prepare('SELECT * FROM channels ORDER BY id').all() as Record<string, unknown>[]
    return rows.map((r) => this.mapChannel(r))
  }

  getChannel(id: number): ChannelRow | null {
    const r = this.db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? this.mapChannel(r) : null
  }

  createChannel(input: Record<string, unknown>): ChannelRow | null {
    const models = Array.isArray(input.models) ? JSON.stringify(input.models) : JSON.stringify([])
    const res = this.db
      .prepare(
        'INSERT INTO channels (name, base_url, api_key, models, price_in, price_out, credit, billing_endpoint, theme_name, theme_color, icon_svg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        String(input.name ?? 'channel'),
        String(input.base_url ?? ''),
        String(input.api_key ?? ''),
        models,
        Number(input.price_in ?? 0),
        Number(input.price_out ?? 0),
        Number(input.credit ?? 0),
        String(input.billing_endpoint ?? ''),
        String(input.theme_name ?? '默认'),
        String(input.theme_color ?? '#10b981'),
        String(input.icon_svg ?? ''),
        now(),
      )
    const id = Number(res.lastInsertRowid)
    return this.getChannel(id)
  }

  updateChannel(id: number, patch: Record<string, unknown>): ChannelRow | null {
    const cols = Object.keys(patch).filter((c) => CHANNEL_FIELDS.has(c) && patch[c] !== undefined)
    if (!cols.length) return this.getChannel(id)
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    const vals = cols.map((c) => (c === 'models' ? JSON.stringify(patch[c]) : patch[c])) as (string | number)[]
    this.db.prepare(`UPDATE channels SET ${sets} WHERE id = ?`).run(...vals, id)
    return this.getChannel(id)
  }

  deleteChannel(id: number): boolean {
    const res = this.db.prepare('DELETE FROM channels WHERE id = ?').run(id)
    return res.changes > 0
  }

  channelCostSum(channelId: number): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(cost), 0) AS s FROM usage WHERE channel_id = ?').get(channelId) as { s: number }
    return r.s
  }

  // ---- api keys ----

  addKey(name: string, note: string): KeyRow {
    const key = genKey()
    const id = uuid()
    const hash = hashKey(key)
    this.db
      .prepare('INSERT INTO api_keys (id, name, key, key_hash, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, key, hash, note, now())
    return this.getKeyById(id) as KeyRow
  }

  private mapKey(r: Record<string, unknown>): KeyRow {
    return r as unknown as KeyRow
  }

  getKeyById(id: string): KeyRow | null {
    const r = this.db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? this.mapKey(r) : null
  }

  getKeyByHash(hash: string): KeyRow | null {
    const r = this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash) as Record<string, unknown> | undefined
    return r ? this.mapKey(r) : null
  }

  listKeys(): KeyRow[] {
    const rows = this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as Record<string, unknown>[]
    return rows.map((r) => this.mapKey(r))
  }

  updateKey(id: string, patch: Record<string, unknown>): KeyRow | null {
    const cols = Object.keys(patch).filter((c) => KEY_FIELDS.has(c) && patch[c] !== undefined)
    if (!cols.length) return this.getKeyById(id)
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    const vals = cols.map((c) => patch[c]) as (string | number)[]
    this.db.prepare(`UPDATE api_keys SET ${sets} WHERE id = ?`).run(...vals, id)
    return this.getKeyById(id)
  }

  deleteKey(id: string): boolean {
    const res = this.db.prepare('DELETE FROM api_keys WHERE id = ?').run(id)
    return res.changes > 0
  }

  bumpKey(id: string, promptTokens: number, completionTokens: number): void {
    this.db
      .prepare(
        'UPDATE api_keys SET total_prompt_tokens = total_prompt_tokens + ?, total_completion_tokens = total_completion_tokens + ?, request_count = request_count + 1, last_used_at = ? WHERE id = ?'
      )
      .run(promptTokens, completionTokens, now(), id)
  }

  // ---- usage ----

  addUsage(u: {
    channelId: number | null
    channelName: string
    model: string
    keyId: string | null
    keyName: string
    promptTokens: number
    completionTokens: number
    cost: number
    latencyMs: number | null
    status: number
    error: string | null
    requestId: string
  }): void {
    this.db
      .prepare(
        'INSERT INTO usage (ts, channel_id, channel_name, model, key_id, key_name, prompt_tokens, completion_tokens, total_tokens, cost, latency_ms, status, error, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        now(), u.channelId, u.channelName, u.model, u.keyId, u.keyName,
        u.promptTokens, u.completionTokens, u.promptTokens + u.completionTokens,
        u.cost, u.latencyMs, u.status, u.error, u.requestId,
      )
  }

  queryUsage(f: { from?: number; to?: number; keyId?: string; channelId?: number; page?: number; size?: number }): {
    rows: UsageRow[]
    total: number
    page: number
    size: number
  } {
    const where: string[] = []
    const vals: (string | number)[] = []
    if (f.from) { where.push('ts >= ?'); vals.push(f.from) }
    if (f.to) { where.push('ts <= ?'); vals.push(f.to) }
    if (f.keyId) { where.push('key_id = ?'); vals.push(f.keyId) }
    if (f.channelId) { where.push('channel_id = ?'); vals.push(f.channelId) }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM usage ${w}`).get(...vals) as { c: number }).c
    const size = Math.min(Math.max(f.size ?? 20, 1), 200)
    const page = Math.max(f.page ?? 1, 1)
    const rows = this.db
      .prepare(`SELECT * FROM usage ${w} ORDER BY ts DESC LIMIT ? OFFSET ?`)
      .all(...vals, size, (page - 1) * size) as unknown as UsageRow[]
    return { rows, total, page, size }
  }

  usageTotals(): { tokens: number; requests: number; cost: number } {
    const r = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests, COALESCE(SUM(cost), 0) AS cost FROM usage')
      .get() as { tokens: number; requests: number; cost: number }
    return r
  }

  usageSince(ts: number): { tokens: number; requests: number; cost: number } {
    const r = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests, COALESCE(SUM(cost), 0) AS cost FROM usage WHERE ts >= ?')
      .get(ts) as { tokens: number; requests: number; cost: number }
    return r
  }

  groupByChannel(): { channel_name: string; requests: number; tokens: number; cost: number }[] {
    return this.db
      .prepare(
        'SELECT channel_name, COUNT(*) AS requests, SUM(total_tokens) AS tokens, SUM(cost) AS cost FROM usage GROUP BY channel_name ORDER BY tokens DESC'
      )
      .all() as unknown as { channel_name: string; requests: number; tokens: number; cost: number }[]
  }

  groupByModel(): { model: string; requests: number; tokens: number; cost: number }[] {
    return this.db
      .prepare('SELECT model, COUNT(*) AS requests, SUM(total_tokens) AS tokens, SUM(cost) AS cost FROM usage GROUP BY model ORDER BY tokens DESC')
      .all() as unknown as { model: string; requests: number; tokens: number; cost: number }[]
  }

  topKeys(limit = 5): { key_id: string; key_name: string; tokens: number; requests: number }[] {
    return this.db
      .prepare(
        'SELECT key_id, key_name, SUM(total_tokens) AS tokens, COUNT(*) AS requests FROM usage WHERE key_id IS NOT NULL GROUP BY key_id, key_name ORDER BY tokens DESC LIMIT ?'
      )
      .all(limit) as unknown as { key_id: string; key_name: string; tokens: number; requests: number }[]
  }

  // ---- balance cache ----

  getBalanceCache(channelId: number): BalanceCacheRow | null {
    const r = this.db.prepare('SELECT * FROM balance_cache WHERE channel_id = ?').get(channelId) as BalanceCacheRow | undefined
    return r ?? null
  }

  setBalanceCache(channelId: number, source: 'live' | 'estimate', amount: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO balance_cache (channel_id, source, amount, fetched_at) VALUES (?, ?, ?, ?)')
      .run(channelId, source, amount, now())
  }

  // ---- settings ----

  getSetting(key: string, def = ''): string {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return r ? r.value : def
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }
}