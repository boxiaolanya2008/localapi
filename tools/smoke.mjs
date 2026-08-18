// 冒烟脚本:对运行中的中转站(默认 127.0.0.1:3000)整链路验证
const base = 'http://127.0.0.1:3000'
const admin = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const created = await fetch(base + '/admin/keys', { method: 'POST', headers: admin, body: JSON.stringify({ name: 'smoke-cli' }) }).then((r) => r.json())
  const key = created.key
  console.log('key created:', key.slice(0, 14) + '...')

  const chat = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'demo-model', messages: [{ role: 'user', content: 'ping' }] }),
  })
  const chatJson = await chat.json()
  console.log('chat:', chat.status, JSON.stringify(chatJson.choices?.[0]?.message?.content ?? chatJson.error?.message))

  const stream = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'demo-model', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  })
  const sseText = await stream.text()
  const chunkCount = sseText.split('\n\n').filter((l) => l.startsWith('data:')).length
  console.log('stream:', stream.status, sseText.includes('data: [DONE]') ? 'SSE-OK' : 'SSE-FAIL', chunkCount, 'chunks')

  const embeddings = await fetch(base + '/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'demo-model', input: 'hello' }),
  })
  console.log('embeddings status:', embeddings.status)

  const models = await fetch(base + '/v1/models', { headers: { authorization: 'Bearer ' + key } }).then((r) => r.json())
  console.log('models:', models.data.map((m) => m.id).join(','))

  const usage = await fetch(base + '/admin/usage', { headers: admin }).then((r) => r.json())
  console.log('usage rows:', usage.total)

  const stats = await fetch(base + '/admin/stats', { headers: admin }).then((r) => r.json())
  console.log('today tokens:', stats.today.tokens, 'requests:', stats.today.requests, 'cost:', stats.today.cost)
  console.log('channel balance:', JSON.stringify(stats.channels.map((c) => ({ name: c.name, balance: c.balance }))))

  const channels = await fetch(base + '/admin/channels', { headers: admin }).then((r) => r.json())
  const test = await fetch(base + '/admin/channels/' + channels[0].id + '/test', { method: 'POST', headers: admin }).then((r) => r.json())
  console.log('channel test:', JSON.stringify(test))

  const exportRes = await fetch(base + '/admin/usage/export', { headers: admin })
  const csv = await exportRes.text()
  console.log('csv:', exportRes.headers.get('content-type'), csv.split('\n').length + ' lines, header=' + csv.split('\n')[0])

  const bad = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-lapi-wrong' },
    body: JSON.stringify({ model: 'demo-model' }),
  })
  console.log('bad key status:', bad.status)
}

main().catch((e) => {
  console.error('SMOKE FAIL', e)
  process.exit(1)
})