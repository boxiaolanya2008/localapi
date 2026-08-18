import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { genKey, hashKey, parseJsonArray, uuid, now } from './util.js'

export interface ChannelRow {
  id: number
  name: string
  provider: string
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
  inject_system_prompt: string
  inject_system_enabled: number
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
  group_id: number
  group_name: string
  group_multiplier: number
  group_system_prompt: string
  group_inject_system: number
  created_at: number
  last_used_at: number | null
  total_prompt_tokens: number
  total_completion_tokens: number
  request_count: number
}

export interface GroupRow {
  id: number
  name: string
  multiplier: number
  model_limit: string[]
  system_prompt: string
  inject_system: number
  note: string
  created_at: number
}

export interface UsageRow {
  id: number
  ts: number
  channel_id: number | null
  channel_name: string
  model: string
  key_id: string | null
  key_name: string
  group_id: number | null
  group_name: string
  rate: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost: number
  latency_ms: number | null
  status: number
  error: string | null
  request_id: string
  cached_tokens: number
}

const CHANNEL_FIELDS = new Set([  'name', 'provider', 'base_url', 'api_key', 'models', 'price_in', 'price_out', 'credit',
  'billing_endpoint', 'theme_name', 'theme_color', 'icon_svg',
  'inject_system_prompt', 'inject_system_enabled', 'enabled',
])

const KEY_FIELDS = new Set(['name', 'status', 'note', 'group_id'])

const GROUP_FIELDS = new Set(['name', 'multiplier', 'model_limit', 'system_prompt', 'inject_system', 'note'])

// 破甲分组内置的授权安全测试提示词(只协助授权测试/CTF/学习)
const AUTH_PENTEST_PROMPT =
  '你是资深安全研究专家,只协助明确授权的安全测试、CTF 竞赛与学习实验。开始前先确认目标与授权范围;拒绝协助任何未授权的入侵、破坏或真实世界的违法活动;涉及漏洞利用时,坚持在隔离的实验环境验证,并给出修复建议。'

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
        provider TEXT NOT NULL DEFAULT '',
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
        inject_system_prompt TEXT NOT NULL DEFAULT '',
        inject_system_enabled INTEGER NOT NULL DEFAULT 0,
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
        group_id INTEGER,
        group_name TEXT,
        rate REAL NOT NULL DEFAULT 1,
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

    this.ensureColumn('api_keys', 'group_id', 'INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('channels', 'provider', "TEXT NOT NULL DEFAULT ''")
    this.ensureColumn('channels', 'inject_system_prompt', "TEXT NOT NULL DEFAULT ''")
    this.ensureColumn('channels', 'inject_system_enabled', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureColumn('usage', 'group_id', 'INTEGER')
    this.ensureColumn('usage', 'group_name', "TEXT NOT NULL DEFAULT ''")
    this.ensureColumn('usage', 'rate', 'REAL NOT NULL DEFAULT 1')
    this.ensureColumn('usage', 'cached_tokens', 'INTEGER NOT NULL DEFAULT 0')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        multiplier REAL NOT NULL DEFAULT 1,
        model_limit TEXT NOT NULL DEFAULT '[]',
        system_prompt TEXT NOT NULL DEFAULT '',
        inject_system INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `)
    this.ensureColumn('groups', 'system_prompt', "TEXT NOT NULL DEFAULT ''")
    this.ensureColumn('groups', 'inject_system', 'INTEGER NOT NULL DEFAULT 0')
    const n = (this.db.prepare('SELECT COUNT(*) AS c FROM groups').get() as { c: number }).c
    if (n === 0) {
      this.db.prepare('INSERT INTO groups (name, multiplier, note, created_at) VALUES (?, ?, ?, ?)').run('默认', 1, '原价计费', now())
      this.db.prepare('INSERT INTO groups (name, multiplier, note, created_at) VALUES (?, ?, ?, ?)').run('体验价', 0.5, '半价,适合内部试用', now())
      this.db
        .prepare(
          'INSERT INTO groups (name, multiplier, system_prompt, inject_system, note, created_at) VALUES (?, ?, ?, 1, ?, ?)'
        )
        .run(
          '破甲',
          0,
          AUTH_PENTEST_PROMPT,
          '免费计费 + 自动注入授权安全测试提示词',
          now(),
        )
    }
    // 老库迁移:已存在的破甲组没有提示词时回填(用户清空过的不动)
    const armor = this.db.prepare("SELECT system_prompt FROM groups WHERE name = '破甲'").get() as { system_prompt: string } | undefined
    if (armor && !armor.system_prompt) {
      this.db.prepare("UPDATE groups SET system_prompt = ?, inject_system = 1 WHERE name = '破甲'").run(AUTH_PENTEST_PROMPT)
    }
  }

  private ensureColumn(table: string, column: string, ddl: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (cols.some((c) => c.name === column)) return
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }

  // ---- channels ----

  seedChannels(list: { name: string; baseUrl: string; apiKey: string; models: string[]; priceIn: number; priceOut: number; credit: number; billingEndpoint: string }[]): void {
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
        'INSERT INTO channels (name, base_url, api_key, models, price_in, price_out, credit, billing_endpoint, provider, theme_name, theme_color, icon_svg, inject_system_prompt, inject_system_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
        String(input.provider ?? ''),
        String(input.theme_name ?? '默认'),
        String(input.theme_color ?? '#10b981'),
        String(input.icon_svg ?? ''),
        String(input.inject_system_prompt ?? ''),
        Number(input.inject_system_enabled ?? 0),
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

  // ---- groups ----

  listGroups(): GroupRow[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY id').all() as Record<string, unknown>[]
    return rows.map((r) => ({ ...(r as unknown as GroupRow), model_limit: parseJsonArray(String(r.model_limit ?? '[]')) }))
  }

  getGroup(id: number): GroupRow | null {
    const r = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? { ...(r as unknown as GroupRow), model_limit: parseJsonArray(String(r.model_limit ?? '[]')) } : null
  }

  createGroup(input: Record<string, unknown>): GroupRow | null {
    const res = this.db
      .prepare('INSERT INTO groups (name, multiplier, model_limit, system_prompt, inject_system, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        String(input.name ?? '新分组'),
        Number(input.multiplier ?? 1),
        JSON.stringify(Array.isArray(input.model_limit) ? input.model_limit : []),
        String(input.system_prompt ?? ''),
        Number(input.inject_system ?? 0),
        String(input.note ?? ''),
        now(),
      )
    return this.getGroup(Number(res.lastInsertRowid))
  }

  updateGroup(id: number, patch: Record<string, unknown>): GroupRow | null {
    const cols = Object.keys(patch).filter((c) => GROUP_FIELDS.has(c) && patch[c] !== undefined)
    if (!cols.length) return this.getGroup(id)
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    const vals = cols.map((c) => (c === 'model_limit' ? JSON.stringify(patch[c]) : patch[c])) as (string | number)[]
    this.db.prepare(`UPDATE groups SET ${sets} WHERE id = ?`).run(...vals, id)
    return this.getGroup(id)
  }

  deleteGroup(id: number): boolean {
    if (id === 1) return false
    const res = this.db.prepare('DELETE FROM groups WHERE id = ?').run(id)
    if (res.changes > 0) {
      this.db.prepare('UPDATE api_keys SET group_id = 1 WHERE group_id = ?').run(id)
    }
    return res.changes > 0
  }

  groupUsage(): { group_name: string; tokens: number; requests: number; cost: number; cache_hit: number }[] {
    return this.db
      .prepare(
        "SELECT COALESCE(NULLIF(group_name, ''), key_name, '未知') AS group_name, COUNT(*) AS requests, SUM(total_tokens) AS tokens, SUM(cost) AS cost, SUM(cached_tokens) AS cache_hit FROM usage GROUP BY group_name ORDER BY cost DESC"
      )
      .all() as unknown as { group_name: string; requests: number; tokens: number; cost: number; cache_hit: number }[]
  }

  // ---- api keys ----

  private keySelect = `
    SELECT k.*, g.name AS group_name, g.multiplier AS group_multiplier,
           g.system_prompt AS group_system_prompt, g.inject_system AS group_inject_system
    FROM api_keys k LEFT JOIN groups g ON g.id = k.group_id
  `

  addKey(name: string, note: string, groupId = 1): KeyRow {
    const key = genKey()
    const id = uuid()
    const hash = hashKey(key)
    this.db
      .prepare('INSERT INTO api_keys (id, name, key, key_hash, note, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, key, hash, note, groupId, now())
    return this.getKeyById(id) as KeyRow
  }

  private mapKey(r: Record<string, unknown>): KeyRow {
    return {
      ...(r as unknown as KeyRow),
      group_id: Number(r.group_id ?? 1),
      group_multiplier: Number(r.group_multiplier ?? 1),
      group_inject_system: Number(r.group_inject_system ?? 0),
    }
  }

  getKeyById(id: string): KeyRow | null {
    const r = this.db.prepare(this.keySelect + ' WHERE k.id = ?').get(id) as Record<string, unknown> | undefined
    return r ? this.mapKey(r) : null
  }

  getKeyByHash(hash: string): KeyRow | null {
    const r = this.db.prepare(this.keySelect + ' WHERE k.key_hash = ?').get(hash) as Record<string, unknown> | undefined
    return r ? this.mapKey(r) : null
  }

  listKeys(): KeyRow[] {
    const rows = this.db.prepare(this.keySelect + ' ORDER BY k.created_at DESC').all() as Record<string, unknown>[]
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
    groupId: number | null
    groupName: string
    rate: number
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    cost: number
    latencyMs: number | null
    status: number
    error: string | null
    requestId: string
  }): void {
    this.db
      .prepare(
        'INSERT INTO usage (ts, channel_id, channel_name, model, key_id, key_name, group_id, group_name, rate, prompt_tokens, completion_tokens, total_tokens, cached_tokens, cost, latency_ms, status, error, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        now(), u.channelId, u.channelName, u.model, u.keyId, u.keyName, u.groupId, u.groupName, u.rate,
        u.promptTokens, u.completionTokens, u.promptTokens + u.completionTokens,
        u.cachedTokens, u.cost, u.latencyMs, u.status, u.error, u.requestId,
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

  usageTotals(): { tokens: number; requests: number; cost: number; cache_hit: number } {
    const r = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests, COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(cached_tokens), 0) AS cache_hit FROM usage')
      .get() as { tokens: number; requests: number; cost: number; cache_hit: number }
    return r
  }

  usageSince(ts: number): { tokens: number; requests: number; cost: number; cache_hit: number } {
    const r = this.db
      .prepare('SELECT COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests, COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(cached_tokens), 0) AS cache_hit FROM usage WHERE ts >= ?')
      .get(ts) as { tokens: number; requests: number; cost: number; cache_hit: number }
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