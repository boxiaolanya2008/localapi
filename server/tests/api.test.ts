import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'localapi-test-'))
process.env.DATA_DIR = tmp
process.env.ADMIN_TOKEN = 'test-admin-token'

import { loadConfig } from '../src/config.js'
import { Store } from '../src/db.js'
import { createApp } from '../src/index.js'

function startMockUpstream(): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    if (url === '/v1/chat/completions') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const b = JSON.parse(body)
        if (b.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.write(
            'data: {"id":"m1","choices":[{"delta":{"content":"hi"}}],"usage":{"prompt_tokens":11,"completion_tokens":4,"total_tokens":15,"prompt_tokens_details":{"cached_tokens":6}}}\n\n',
          )
          res.end('data: [DONE]\n\n')
        } else {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              id: 'm1',
              choices: [{ message: { role: 'assistant', content: 'hi' } }],
              usage: {
                prompt_tokens: 11,
                completion_tokens: 4,
                total_tokens: 15,
                prompt_tokens_details: { cached_tokens: 6 },
              },
              echo_messages: b.messages ?? null,
              echo_params: { temperature: b.temperature ?? null, top_p: b.top_p ?? null },
            }),
          )
        }
      })
      return
    }
    if (url === '/v1/embeddings') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 3, total_tokens: 3 } }))
      return
    }
    if (url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'demo-model' }] }))
      return
    }
    if (url === '/v1/dashboard/billing/credit_grants') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ total_available: 42.5 }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{}')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({ port: addr.port, close: () => server.close() })
    })
  })
}

let mock: { port: number; close: () => void }
let base: string
let server: http.Server
let storeInstance: Store

before(async () => {
  mock = await startMockUpstream()
  const cfg = loadConfig()
  const store = new Store(cfg.dataDir)
  storeInstance = store
  store.seedChannels([
    {
      name: 'mock',
      baseUrl: `http://127.0.0.1:${mock.port}/v1`,
      apiKey: 'mock-key',
      models: ['demo-model'],
      priceIn: 0.001,
      priceOut: 0.002,
      credit: 50,
      billingEndpoint: '',
    },
  ])
  server = createApp(cfg, store).listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

after(() => {
  return new Promise<void>((resolve) => {
    server?.close(() => {
      storeInstance?.close()
      mock?.close()
      try {
        fs.rmSync(tmp, { recursive: true, force: true })
      } catch {
        // Windows 偶发文件占用,交给系统临时目录清理
      }
      resolve()
    })
  })
})

async function req(pathname: string, opts: { method?: string; token?: string; key?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token) headers['x-admin-token'] = opts.token
  if (opts.key) headers.authorization = 'Bearer ' + opts.key
  const res = await fetch(base + pathname, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, data, headers: res.headers }
}

test('admin endpoint rejects without token', async () => {
  const r = await req('/admin/keys')
  assert.equal(r.status, 403)
})

test('create key, relay chat, usage recorded, stats and live balance', async () => {
  const created = await req('/admin/keys', { token: 'test-admin-token', body: { name: 'cli' } })
  assert.equal(created.status, 200)
  const key = (created.data as { key: string }).key
  assert.ok(key.startsWith('sk-lapi-'))

  const chat = await req('/v1/chat/completions', { key, body: { model: 'demo-model', messages: [{ role: 'user', content: 'ping' }] } })
  assert.equal(chat.status, 200)
  assert.ok((chat.data as { choices: unknown[] }).choices.length > 0)

  const usage = await req('/admin/usage', { token: 'test-admin-token' })
  assert.equal((usage.data as { total: number }).total, 1)
  const row = (usage.data as { rows: { total_tokens: number; channel_name: string; status: number; cached_tokens: number }[] }).rows[0]
  assert.equal(row.total_tokens, 15)
  assert.equal(row.channel_name, 'mock')
  assert.equal(row.status, 0)
  assert.equal(row.cached_tokens, 6)

  const stats = await req('/admin/stats', { token: 'test-admin-token' })
  const s = stats.data as { today: { tokens: number; requests: number }; channels: { id: number; balance: { source: string; amount: number } }[] }
  assert.equal(s.today.tokens, 15)
  assert.equal(s.today.requests, 1)
  const ch = s.channels[0]
  assert.equal(ch.balance.source, 'live')
  assert.equal(ch.balance.amount, 42.5)

  const keys = await req('/admin/keys', { token: 'test-admin-token' })
  const k = (keys.data as { request_count: number; total_prompt_tokens: number }[])[0]
  assert.equal(k.request_count, 1)
  assert.equal(k.total_prompt_tokens, 11)
})

test('stream passthrough records usage from usage chunk', async () => {
  const keys = await req('/admin/keys', { token: 'test-admin-token' })
  const key = (keys.data as { key: string }[])[0].key
  const res = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'demo-model', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  })
  const text = await res.text()
  assert.equal(res.status, 200)
  assert.ok(text.includes('data: [DONE]'))
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)

  const usage = await req('/admin/usage', { token: 'test-admin-token' })
  const rows = (usage.data as { rows: { total_tokens: number; cached_tokens: number }[] }).rows
  assert.ok(rows.length >= 2)
  assert.equal(rows[0].total_tokens, 15)
  assert.equal(rows[0].cached_tokens, 6)
})

test('group system prompt is injected when enabled', async () => {
  const g = await req('/admin/groups', {
    token: 'test-admin-token',
    method: 'POST',
    body: { name: '注入组', multiplier: 1, inject_system: 1, force_obey: 1, system_prompt: '你是授权安全测试助手。' },
  })
  const gid = (g.data as { id: number }).id

  const created = await req('/admin/keys', { token: 'test-admin-token', body: { name: 'inject-key', groupId: gid } })
  const key = (created.data as { key: string }).key

  const chat = await req('/v1/chat/completions', { key, body: { model: 'demo-model', messages: [{ role: 'user', content: 'hi' }] } })
  const echo = (chat.data as { echo_messages: { role: string; content: string }[] | null }).echo_messages
  assert.ok(Array.isArray(echo) && echo.length === 3, `echo=${JSON.stringify(echo)}`)
  // [0]=全局编码规则 [1]=分组提示词 [2]=用户消息
  assert.equal(echo[1].role, 'system')
  assert.ok(echo[1].content.startsWith('你是授权安全测试助手。'), echo[1].content)
  assert.ok(echo[1].content.includes('最高优先级'), echo[1].content)
  assert.ok(echo[0].content.includes('装饰'), echo[0].content)
  assert.equal(echo[2].role, 'user')
})

test('group param preset fills missing request params', async () => {
  const p = await req('/admin/params', {
    token: 'test-admin-token',
    method: 'POST',
    body: { name: '测试参数', tag: 'coding', params: { temperature: 0.1, top_p: 0.2, max_tokens: 4096 } },
  })
  const pid = (p.data as { id: number }).id

  const g = await req('/admin/groups', {
    token: 'test-admin-token',
    method: 'POST',
    body: { name: '参数组', multiplier: 1, param_preset_id: pid },
  })
  const gid = (g.data as { id: number }).id

  const created = await req('/admin/keys', { token: 'test-admin-token', body: { name: 'param-key', groupId: gid } })
  const key = (created.data as { key: string }).key

  const chat = await req('/v1/chat/completions', { key, body: { model: 'demo-model', messages: [{ role: 'user', content: 'hi' }] } })
  const ep = (chat.data as { echo_params: { temperature: number | null; top_p: number | null } }).echo_params
  assert.equal(ep.temperature, 0.1)
  assert.equal(ep.top_p, 0.2)

  // 请求显式给定时,尊重请求值不覆盖
  const chat2 = await req('/v1/chat/completions', { key, body: { model: 'demo-model', temperature: 0.9, messages: [{ role: 'user', content: 'hi' }] } })
  const ep2 = (chat2.data as { echo_params: { temperature: number | null } }).echo_params
  assert.equal(ep2.temperature, 0.9)
})

test('relay rejects bad key with 401', async () => {
  const r = await req('/v1/chat/completions', { key: 'sk-lapi-wrong', body: { model: 'demo-model' } })
  assert.equal(r.status, 401)
  const e = r.data as { error: { code: string } }
  assert.equal(e.error.code, 'invalid_api_key')
})

test('models endpoint lists configured models', async () => {
  const keys = await req('/admin/keys', { token: 'test-admin-token' })
  const key = (keys.data as { key: string }[])[0].key
  const r = await req('/v1/models', { key })
  assert.equal(r.status, 200)
  const ids = (r.data as { data: { id: string }[] }).data.map((m) => m.id)
  assert.ok(ids.includes('demo-model'))
})

test('usage export returns csv', async () => {
  const r = await req('/admin/usage/export', { token: 'test-admin-token' })
  assert.match(r.headers.get('content-type') ?? '', /text\/csv/)
  assert.ok(String(r.data).startsWith('ts,channel'))
})

test('group multiplier halves the billed cost', async () => {
  const g = await req('/admin/groups', { token: 'test-admin-token', method: 'POST', body: { name: '半价', multiplier: 0.5 } })
  assert.equal(g.status, 200)
  const gid = (g.data as { id: number }).id

  const created = await req('/admin/keys', { token: 'test-admin-token', body: { name: 'group-cli', groupId: gid } })
  const key = (created.data as { key: string; group_name: string }).key
  assert.equal((created.data as { group_name: string }).group_name, '半价')

  await req('/v1/chat/completions', { key, body: { model: 'demo-model', messages: [{ role: 'user', content: 'hi' }] } })
  const usage = await req('/admin/usage', { token: 'test-admin-token' })
  const row = (usage.data as { rows: { key_name: string; cost: number; rate: number; group_name: string }[] }).rows[0]
  assert.equal(row.key_name, 'group-cli')
  assert.equal(row.rate, 0.5)
  // 原价 = 11/1000*0.001 + 4/1000*0.002 = 0.000019,半价 = 0.0000095
  assert.ok(Math.abs(row.cost - 0.0000095) < 1e-12, `cost=${row.cost}`)
})

test('default group protects default keys when deleting group', async () => {
  const r = await req('/admin/groups/1', { token: 'test-admin-token', method: 'DELETE' })
  assert.equal(r.status, 400)
})

test('anthropic(claude) channel is translated to OpenAI-compatible response', async (t) => {
  // 起一个 Anthropic Messages 形态的假上游
  const claude = http.createServer((q, s) => {
    if ((q.url ?? '').includes('/v1/messages')) {
      let body = ''
      q.on('data', (c) => (body += c))
      q.on('end', () => {
        const b = JSON.parse(body)
        s.writeHead(200, { 'content-type': 'application/json' })
        s.end(
          JSON.stringify({
            id: 'msg-claude',
            model: b.model,
            content: [{ type: 'text', text: '来自 Claude 的回复' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 8, output_tokens: 5, total_tokens: 13, cache_read_input_tokens: 3 },
          }),
        )
      })
      return
    }
    s.writeHead(404); s.end('{}')
  })
  await new Promise<void>((r) => claude.listen(0, '127.0.0.1', r))
  t.after(() => claude.close())
  const claudePort = (claude.address() as { port: number }).port

  const ch = await req('/admin/channels', {
    token: 'test-admin-token',
    body: {
      name: 'claude-up', base_url: `http://127.0.0.1:${claudePort}`, api_key: 'sk-claude',
      api_style: 'claude', api_path: 'v1/messages', models: ['claude-sonnet'], price_in: 0.001, price_out: 0.002,
    },
  })
  const chid = (ch.data as { id: number }).id

  const created = await req('/admin/keys', { token: 'test-admin-token', body: { name: 'claude-key', groupId: 1 } })
  const key = (created.data as { key: string }).key

  const chat = await req('/v1/chat/completions', { key, body: { model: 'claude-sonnet', messages: [{ role: 'user', content: 'hello' }] } })
  assert.equal(chat.status, 200)
  const d = chat.data as { choices: { message: { content: string } }[] }
  assert.equal(d.choices[0].message.content, '来自 Claude 的回复')

  const usage = await req('/admin/usage', { token: 'test-admin-token' })
  const row = (usage.data as { rows: { key_name: string; cached_tokens: number; prompt_tokens: number }[] }).rows[0]
  assert.equal(row.key_name, 'claude-key')
  assert.equal(row.cached_tokens, 3)
  assert.equal(row.prompt_tokens, 8)

  await req(`/admin/channels/${chid}`, { token: 'test-admin-token', method: 'DELETE' })
})

test('channel test endpoint pings mock upstream', async () => {
  const r = await req('/admin/channels', { token: 'test-admin-token' })
  const id = (r.data as { id: number }[])[0].id
  const t = await req(`/admin/channels/${id}/test`, { token: 'test-admin-token', method: 'POST' })
  assert.equal(t.status, 200)
  assert.equal((t.data as { ok: boolean }).ok, true)
})