const body = {
  model: 'demo-model',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ type: 'function', function: { name: 'get_weather', description: '天气', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }],
}

async function main() {
  const r = await fetch('http://127.0.0.1:4000/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer mock-key-123' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  console.log('直连反向 proxy 4000 HTTP', r.status)
  console.log('body:', text.slice(0, 200))
}

main().catch((e) => {
  console.error('FAIL', e.message)
})