// 本地假上游,模拟 OpenAI 兼容接口,方便零成本试跑中转站
import http from 'node:http'

const PORT = Number(process.env.PORT || 4000)

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  const url = req.url || ''
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let parsed = {}
    try {
      parsed = body ? JSON.parse(body) : {}
    } catch {
      /* ignore */
    }
    const auth = req.headers.authorization || ''
    if (!auth.startsWith('Bearer ')) return json(res, 401, { error: { message: 'missing key', code: 'invalid_api_key' } })

    if (url === '/v1/dashboard/billing/credit_grants') {
      return json(res, 200, { total_granted: 100, total_used: 57.5, total_available: 42.5 })
    }
    if (url === '/v1/models') {
      return json(res, 200, { object: 'list', data: [{ id: 'demo-model', object: 'model' }] })
    }
    if (url.includes('/v1/chat/completions') || url.includes('/v1/completions')) {
      if (parsed.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write('data: {"id":"mock-1","object":"chat.completion.chunk","model":"' + parsed.model + '","choices":[{"index":0,"delta":{"role":"assistant","content":"你好，这是"}}]}\n\n')
        res.write('data: {"id":"mock-1","object":"chat.completion.chunk","model":"' + parsed.model + '","choices":[{"index":0,"delta":{"content":"来自 mock 上游的流式回复"}}]}\n\n')
        res.write('data: {"id":"mock-1","object":"chat.completion.chunk","model":"' + parsed.model + '","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":9,"total_tokens":21}}\n\n')
        res.end('data: [DONE]\n\n')
      } else {
        return json(res, 200, {
          id: 'mock-1',
          object: 'chat.completion',
          model: parsed.model,
          choices: [{ index: 0, message: { role: 'assistant', content: '这是来自 mock 上游的非流式回复' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21, prompt_tokens_details: { cached_tokens: 7 } },
              echo_messages: parsed.messages || null,
              echo_tools: (parsed.tools || []).map((t) => t.function?.name),
              echo_tool_choice: parsed.tool_choice ?? null,
            })
      }
      return
    }
    if (url.includes('/v1/embeddings')) {
      return json(res, 200, { object: 'list', data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: 5, total_tokens: 5 } })
    }
    json(res, 404, { error: { message: 'not found: ' + url, code: 'not_found' } })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('mock upstream listening on http://127.0.0.1:' + PORT)
  console.log('endpoints: /v1/models /v1/chat/completions /v1/embeddings /v1/dashboard/billing/credit_grants')
})