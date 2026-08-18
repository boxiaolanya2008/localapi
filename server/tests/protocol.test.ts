import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convertOutbound, convertInbound, openAIToSSE } from '../src/protocol.js'

const chatBody = {
  model: 'm',
  messages: [
    { role: 'system', content: 'S' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Bei"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'sunny' },
  ],
  temperature: 0.3,
  tools: [{ type: 'function', function: { name: 'get_weather', parameters: { type: 'object' } } }],
  tool_choice: 'auto',
}

test('chat -> responses 转换', () => {
  const r = convertOutbound('responses', chatBody)
  assert.equal(r.instructions, 'S')
  assert.equal((r.input as any[])[0].role, 'user')
  assert.equal((r.input as any[])[1].type, 'function_call')
  assert.equal((r.input as any[])[2].type, 'function_call_output')
  assert.equal((r.tools as any[])[0].name, 'get_weather')
})

test('responses -> openai 转换(含工具与缓存)', () => {
  const raw = JSON.stringify({
    id: 'r1', model: 'm', status: 'completed',
    output: [
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] },
      { type: 'function_call', id: 'c1', name: 'get_weather', arguments: '{"city":"x"}' },
    ],
    usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15, input_tokens_details: { cached_tokens: 6 } },
  })
  const o = convertInbound('responses', raw) as any
  assert.equal(o.choices[0].message.content, 'hello')
  assert.equal(o.choices[0].message.tool_calls[0].function.name, 'get_weather')
  assert.equal(o.choices[0].finish_reason, 'tool_calls')
  assert.equal(o.usage.prompt_tokens_details.cached_tokens, 6)
})

test('chat -> claude 转换', () => {
  const r = convertOutbound('claude', chatBody) as any
  assert.equal(r.system, 'S')
  assert.equal(r.max_tokens, 4096)
  const ast = r.messages.find((m: any) => m.role === 'assistant')
  assert.equal(ast.content[0].type, 'tool_use')
  assert.equal(ast.content[0].name, 'get_weather')
  const toolMsg = r.messages.find((m: any) => Array.isArray(m.content) && m.content[0]?.type === 'tool_result')
  assert.ok(toolMsg)
})

test('claude -> openai 转换(含工具与缓存)', () => {
  const raw = JSON.stringify({
    id: 'msg1', model: 'm',
    content: [
      { type: 'text', text: '你好' },
      { type: 'tool_use', id: 'c1', name: 'get_weather', input: { city: 'x' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15, cache_read_input_tokens: 6 },
  })
  const o = convertInbound('claude', raw) as any
  assert.equal(o.choices[0].message.content, '你好')
  assert.equal(o.choices[0].message.tool_calls[0].function.name, 'get_weather')
  assert.equal(o.choices[0].message.tool_calls[0].function.arguments, JSON.stringify({ city: 'x' }))
  assert.equal(o.choices[0].finish_reason, 'tool_calls')
  assert.equal(o.usage.prompt_tokens_details.cached_tokens, 6)
})

test('openAIToSSE 生成 delta + [DONE]', () => {
  const sse = openAIToSSE({
    id: 'x', object: 'chat.completion', model: 'm',
    choices: [{ message: { content: 'ab' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  } as any)
  assert.ok(sse.includes('data: [DONE]'))
  assert.ok(sse.includes('"content":"ab"'))
  assert.ok(sse.includes('"usage"'))
})