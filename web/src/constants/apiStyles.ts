// 渠道 API 协议选项(与后端 server/src/protocol.ts 对应)
export const API_STYLES: { value: string; label: string; desc: string }[] = [
  { value: 'chat', label: 'OpenAI Chat', desc: 'POST {base}/chat/completions · Authorization' },
  { value: 'responses', label: 'OpenAI Responses', desc: 'POST {base}/v1/responses · Authorization' },
  { value: 'claude', label: 'Anthropic Messages', desc: 'POST {base}/v1/messages · x-api-key' },
  { value: 'custom', label: '自定义路由', desc: 'POST {base}/{路由路径} · 原样透传不转换' },
]

export const STYLE_DEFAULT_PATH: Record<string, string> = {
  chat: 'chat/completions',
  responses: 'v1/responses',
  claude: 'v1/messages',
  custom: '',
}