// 在 4005 干净 mock 上验证 tools 透传(建临时渠道指向 4005,测完删除)
const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const probe = await fetch('http://127.0.0.1:4005/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer mock-key-123' },
    body: JSON.stringify({ model: 'demo-model', messages: [{ role: 'user', content: 'hi' }], tools: [{ type: 'function', function: { name: 'get_weather', description: '天气', parameters: { type: 'object' } } }] }),
  }).then((r) => r.json())
  console.log('mock4005 回显 tools =', JSON.stringify(probe.echo_tools))

  // 建临时渠道
  const ch = await fetch(base + '/admin/channels', { headers: H, method: 'POST', body: JSON.stringify({ name: 'probe-4005', base_url: 'http://127.0.0.1:4005/v1', api_key: 'mock-key-123', models: ['demo-model'], price_in: 0, price_out: 0 }) }).then((r) => r.json())
  console.log('临时渠道 id =', ch.id)

  const k = await fetch(base + '/admin/keys', { headers: H, method: 'POST', body: JSON.stringify({ name: 'probe-key', groupId: 1 }) }).then((r) => r.json())

  const chat = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k.key },
    body: JSON.stringify({
      model: 'demo-model',
      messages: [{ role: 'user', content: '查北京天气,用工具' }],
      tools: [{ type: 'function', function: { name: 'get_weather', description: '天气', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }],
      tool_choice: 'auto',
    }),
  })
  const d = await chat.json()
  console.log('经中继 HTTP', chat.status)
  console.log('上游收到的工具名:', JSON.stringify(d.echo_tools), '(一致=支持tools)')
  console.log('tool_choice 原样?', JSON.stringify(d.echo_tool_choice) === JSON.stringify('auto'))

  // 清理
  await fetch(base + '/admin/channels/' + ch.id, { headers: H, method: 'DELETE' })
  console.log('已删除临时渠道')
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})