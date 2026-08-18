// 协议适配层:把 OpenAI Chat Completions 请求转发到不同的上游 API 形态,并把响应转回 OpenAI 兼容结构。
// 支持 Responses API(OpenAI)、Messages API(Anthropic)、以及自定义路由(不转换,原样透传)。
// 转换覆盖常用字段(系统消息/文本/工具/抽样参数/用量);非文本或极端结构尽量原样透传。

import type { ChannelRow } from './db.js'

export type ApiStyle = 'chat' | 'responses' | 'claude' | 'custom'

export const STYLES: { value: ApiStyle; label: string; desc: string }[] = [
  { value: 'chat', label: 'OpenAI Chat', desc: 'POST {base}/chat/completions,Authorization Bearer' },
  { value: 'responses', label: 'OpenAI Responses', desc: 'POST {base}/v1/responses,Authorization Bearer' },
  { value: 'claude', label: 'Anthropic Messages', desc: 'POST {base}/v1/messages,x-api-key + anthropic-version' },
  { value: 'custom', label: '自定义路由', desc: 'POST {base}/{api_path},原样透传(不转换)' },
]

export const STYLE_DEFAULTS: Record<ApiStyle, { path: string; auth: 'bearer' | 'x-api-key' }> = {
  chat: { path: 'chat/completions', auth: 'bearer' },
  responses: { path: 'v1/responses', auth: 'bearer' },
  claude: { path: 'v1/messages', auth: 'x-api-key' },
  custom: { path: 'chat/completions', auth: 'bearer' },
}

export function styleOf(c: ChannelRow): ApiStyle {
  return (c.api_style || 'chat') as ApiStyle
}

export function resolveEndpoint(c: ChannelRow): string {
  const base = (c.base_url || '').replace(/\/+$/, '')
  const p = (c.api_path || STYLE_DEFAULTS[styleOf(c)].path).replace(/^\/+/, '')
  return base + '/' + p
}

export function authHeaders(c: ChannelRow): Record<string, string> {
  const auth = STYLE_DEFAULTS[styleOf(c)].auth
  if (auth === 'x-api-key') {
    return { 'x-api-key': c.api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
  }
  return { authorization: `Bearer ${c.api_key}`, 'content-type': 'application/json' }
}

// 是否需要做协议转换(chat/custom 原样,responses/claude 转换)
export function needsConversion(style: ApiStyle): boolean {
  return style === 'responses' || style === 'claude'
}

function textContent(m: { role?: string; content?: unknown }): string {
  const c = m.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text ?? '') : ''))
      .join('')
  }
  return ''
}

// ---- OpenAI Chat -> Responses ----
function chatToResponses(body: Record<string, unknown>): Record<string, unknown> {
  const msgs = Array.isArray(body.messages) ? (body.messages as any[]) : []
  const system = msgs.filter((m) => m.role === 'system').map((m) => textContent(m)).join('\n')
  const input: unknown[] = []
  for (const m of msgs) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: m.tool_call_id || '', output: textContent(m) })
      continue
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const text = textContent(m)
      if (text) input.push({ role: 'assistant', content: text })
      for (const tc of m.tool_calls) {
        input.push({ type: 'function_call', call_id: tc.id || '', name: tc.function?.name || '', arguments: tc.function?.arguments || '{}' })
      }
      continue
    }
    input.push({ role: m.role === 'function' ? 'developer' : m.role, content: textContent(m) })
  }
  const out: Record<string, unknown> = {
    model: body.model,
    input,
    stream: !!body.stream,
  }
  if (system) out.instructions = system
  if (body.temperature !== undefined) out.temperature = body.temperature
  if (body.top_p !== undefined) out.top_p = body.top_p
  if (body.max_tokens !== undefined) out.max_output_tokens = body.max_tokens
  else if (body.max_completion_tokens !== undefined) out.max_output_tokens = body.max_completion_tokens
  if (Array.isArray(body.tools)) {
    out.tools = body.tools
      .filter((t: any) => t?.type === 'function')
      .map((t: any) => ({ type: 'function', name: t.function?.name, description: t.function?.description, parameters: t.function?.parameters }))
  }
  if (body.tool_choice !== undefined) out.tool_choice = body.tool_choice
  return out
}

// Responses -> OpenAI Chat JSON
function responsesToOpenAI(raw: unknown): Record<string, unknown> {
  const r = (raw || {}) as Record<string, any>
  const output = Array.isArray(r.output) ? r.output : []
  let content = ''
  const toolCalls: unknown[] = []
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      content += item.content.map((b: any) => b?.text || '').join('')
    } else if (item.type === 'function_call') {
      toolCalls.push({ id: item.id, type: 'function', function: { name: item.name, arguments: item.arguments || '{}' } })
    }
  }
  let finish = 'stop'
  if (r.status === 'incomplete') finish = 'length'
  else if (r.status === 'failed') finish = 'content_filter'
  else if (toolCalls.length) finish = 'tool_calls'
  const u = (r.usage || {}) as Record<string, any>
  const pt = Number(u.input_tokens ?? 0)
  return {
    id: r.id || 'resp',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: r.model || '',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finish,
      },
    ],
    usage: {
      prompt_tokens: pt,
      completion_tokens: Number(u.output_tokens ?? 0),
      total_tokens: Number(u.total_tokens ?? pt + Number(u.output_tokens ?? 0)),
      prompt_tokens_details: { cached_tokens: Number(u.input_tokens_details?.cached_tokens ?? u.cached_tokens ?? 0) },
    },
  }
}

// ---- OpenAI Chat -> Claude Messages ----
function chatToClaude(body: Record<string, unknown>): Record<string, unknown> {
  const msgs = Array.isArray(body.messages) ? (body.messages as any[]) : []
  const system = msgs.filter((m) => m.role === 'system').map((m) => textContent(m)).join('\n')
  const claudeMsgs: any[] = []
  for (const m of msgs) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      claudeMsgs.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id || 'call', content: textContent(m) }],
      })
      continue
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const content: any[] = []
      const text = textContent(m)
      if (text) content.push({ type: 'text', text })
      for (const tc of m.tool_calls) {
        let input = {}
        try {
          input = JSON.parse(tc.function?.arguments || '{}')
        } catch {
          input = {}
        }
        content.push({ type: 'tool_use', id: tc.id || 'call', name: tc.function?.name || 'fn', input })
      }
      claudeMsgs.push({ role: 'assistant', content })
      continue
    }
    const role = m.role === 'function' ? 'user' : m.role
    if (role !== 'user' && role !== 'assistant') continue
    claudeMsgs.push({ role, content: textContent(m) })
  }
  if (!claudeMsgs.length) claudeMsgs.push({ role: 'user', content: '' })
  const maxTokens =
    Number(body.max_tokens ?? body.max_completion_tokens) ||
    (() => {
      const l = Number(body.max_output_tokens)
      return Number.isFinite(l) && l > 0 ? l : 4096
    })()

  const out: Record<string, unknown> = {
    model: body.model,
    messages: claudeMsgs,
    max_tokens: maxTokens,
    stream: !!body.stream,
  }
  if (system) out.system = system
  if (body.temperature !== undefined) out.temperature = body.temperature
  if (body.top_p !== undefined) out.top_p = body.top_p
  if (Array.isArray(body.tools)) {
    out.tools = body.tools
      .filter((t: any) => t?.type === 'function')
      .map((t: any) => ({ name: t.function?.name, description: t.function?.description, input_schema: t.function?.parameters || { type: 'object' } }))
  }
  if (body.tool_choice !== undefined) {
    const tc = body.tool_choice as any
    if (tc === 'none') out.tool_choice = { type: 'none' }
    else if (tc === 'required' || tc === 'auto') out.tool_choice = { type: 'auto' }
    else if (tc && typeof tc === 'object' && tc.function) out.tool_choice = { type: 'tool', name: tc.function.name }
  }
  return out
}

// Claude -> OpenAI Chat JSON
function claudeToOpenAI(raw: unknown): Record<string, unknown> {
  const r = (raw || {}) as Record<string, any>
  const contentArr = Array.isArray(r.content) ? r.content : []
  let text = ''
  const toolCalls: unknown[] = []
  for (const b of contentArr) {
    if (b.type === 'text') text += b.text || ''
    else if (b.type === 'tool_use') {
      toolCalls.push({
        id: b.id,
        type: 'function',
        function: { name: b.name, arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}) },
      })
    }
  }
  let finish = 'stop'
  if (r.stop_reason === 'max_tokens') finish = 'length'
  else if (r.stop_reason === 'tool_use') finish = 'tool_calls'
  else if (r.stop_reason === 'refusal') finish = 'content_filter'
  const u = (r.usage || {}) as Record<string, any>
  const pt = Number(u.input_tokens ?? 0)
  return {
    id: r.id || 'msg',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: r.model || '',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finish,
      },
    ],
    usage: {
      prompt_tokens: pt,
      completion_tokens: Number(u.output_tokens ?? 0),
      total_tokens: Number(u.total_tokens ?? pt + Number(u.output_tokens ?? 0)),
      prompt_tokens_details: { cached_tokens: Number(u.cache_read_input_tokens ?? u.cached_tokens ?? 0) },
    },
  }
}

// 出站:OpenAI Chat body -> 目标协议 body(chat/custom 原样)
export function convertOutbound(style: ApiStyle, openaiBody: Record<string, unknown>): Record<string, unknown> {
  if (style === 'responses') return chatToResponses(openaiBody)
  if (style === 'claude') return chatToClaude(openaiBody)
  return openaiBody
}

// 入站:目标协议原始响应 -> OpenAI Chat JSON
export function convertInbound(style: ApiStyle, rawText: string): Record<string, unknown> {
  let data: unknown = null
  try {
    data = JSON.parse(rawText)
  } catch {
    // 非法 JSON:让上层报错
    throw new Error('upstream returned non-JSON')
  }
  if (style === 'responses') return responsesToOpenAI(data)
  if (style === 'claude') return claudeToOpenAI(data)
  return (data as Record<string, unknown>) ?? {}
}

// 把 OpenAI Chat JSON 转成一段 OpenAI SSE 文本(用于 non-stream 上游 + 客户端要流式时)
export function openAIToSSE(completion: Record<string, unknown>): string {
  const choice = (completion.choices as any[])?.[0] || {}
  const firstChunk = {
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: completion.model,
    choices: [{ index: 0, delta: { role: 'assistant', content: choice.message?.content || '' }, finish_reason: null }],
  }
  const lastChunk = {
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: completion.model,
    choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason || 'stop' }],
    usage: completion.usage,
  }
  return `data: ${JSON.stringify(firstChunk)}\n\n` + `data: ${JSON.stringify(lastChunk)}\n\n` + 'data: [DONE]\n\n'
}