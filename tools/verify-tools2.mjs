const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const chans = await fetch(base + '/admin/channels', { headers: H }).then((r) => r.json())
  console.log('渠道:', chans.map((c) => `${c.name} -> ${c.base_url}`).join(' | '))

  const k = await fetch(base + '/admin/keys', { headers: H, method: 'POST', body: JSON.stringify({ name: 'tools-check', groupId: 1 }) }).then((r) => r.json())

  const body = {
    model: 'demo-model',
    messages: [{ role: 'user', content: '帮我查北京天气,用工具返回' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: '查询城市天气',
          parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      },
    ],
    tool_choice: 'auto',
  }

  const chat = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k.key },
    body: JSON.stringify(body),
  })
  const text = await chat.text()
  let d = {}
  try {
    d = JSON.parse(text)
  } catch {
    d = { raw: text.slice(0, 120) }
  }
  console.log('HTTP', chat.status)
  console.log('echo_tools =', JSON.stringify(d.echo_tools))
  console.log('echo_tool_choice =', JSON.stringify(d.echo_tool_choice))
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})