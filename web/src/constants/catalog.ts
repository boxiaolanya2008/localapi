// 2026 热门模型目录。价格单位:$ / 1M tokens。
// 已联网核实(source:'official')的条目来自官方定价页(DeepSeek/Kimi);
// 其余为公开参考价(source:'ref'),以供应商实际账单为准,渠道里可自行改价。
export interface ModelPreset {
  id: string
  provider: string
  name: string
  input1M: number
  output1M: number
  cacheRead1M: number | null
  context: string
  source: 'official' | 'ref'
}

export const MODEL_CATALOG: ModelPreset[] = [
  // DeepSeek V4(官方页核实,2026-08)
  { id: 'deepseek-v4-flash', provider: 'deepseek', name: 'DeepSeek V4 Flash', input1M: 0.44, output1M: 1.32, cacheRead1M: 0.014, context: '1M', source: 'official' },
  { id: 'deepseek-v4-pro', provider: 'deepseek', name: 'DeepSeek V4 Pro', input1M: 1.32, output1M: 3.96, cacheRead1M: 0.044, context: '1M', source: 'official' },
  // Kimi(官方页核实,2026-08)
  { id: 'kimi-k3', provider: 'kimi', name: 'Kimi K3', input1M: 2.78, output1M: 13.89, cacheRead1M: 0.28, context: '256K', source: 'official' },
  { id: 'kimi-k2.7-code', provider: 'kimi', name: 'Kimi K2.7 Code', input1M: 0.9, output1M: 3.75, cacheRead1M: 0.18, context: '128K', source: 'official' },
  { id: 'kimi-k2.6', provider: 'kimi', name: 'Kimi K2.6', input1M: 0.9, output1M: 3.75, cacheRead1M: 0.15, context: '128K', source: 'official' },
  // OpenAI(参考价)
  { id: 'gpt-5', provider: 'openai', name: 'GPT-5', input1M: 2.5, output1M: 10, cacheRead1M: 1.25, context: '128K', source: 'ref' },
  { id: 'gpt-5-mini', provider: 'openai', name: 'GPT-5 mini', input1M: 0.6, output1M: 2.5, cacheRead1M: 0.3, context: '128K', source: 'ref' },
  { id: 'o3', provider: 'openai', name: 'o3(推理)', input1M: 10, output1M: 40, cacheRead1M: null, context: '200K', source: 'ref' },
  { id: 'o4-mini', provider: 'openai', name: 'o4-mini(推理)', input1M: 1.1, output1M: 4.4, cacheRead1M: 0.55, context: '200K', source: 'ref' },
  { id: 'gpt-4.1', provider: 'openai', name: 'GPT-4.1', input1M: 2, output1M: 8, cacheRead1M: 0.5, context: '1M', source: 'ref' },
  { id: 'gpt-4o-mini', provider: 'openai', name: 'GPT-4o mini', input1M: 0.15, output1M: 0.6, cacheRead1M: 0.075, context: '128K', source: 'ref' },
  // Anthropic(参考价)
  { id: 'claude-opus-4.5', provider: 'anthropic', name: 'Claude Opus 4.5', input1M: 5, output1M: 25, cacheRead1M: 2.5, context: '200K', source: 'ref' },
  { id: 'claude-sonnet-4.5', provider: 'anthropic', name: 'Claude Sonnet 4.5', input1M: 3, output1M: 15, cacheRead1M: 1.5, context: '200K', source: 'ref' },
  { id: 'claude-haiku-4.5', provider: 'anthropic', name: 'Claude Haiku 4.5', input1M: 1, output1M: 5, cacheRead1M: 0.5, context: '200K', source: 'ref' },
  // Google(参考价)
  { id: 'gemini-2.5-pro', provider: 'google', name: 'Gemini 2.5 Pro', input1M: 1.25, output1M: 10, cacheRead1M: 0.31, context: '2M', source: 'ref' },
  { id: 'gemini-2.5-flash', provider: 'google', name: 'Gemini 2.5 Flash', input1M: 0.3, output1M: 2.5, cacheRead1M: 0.075, context: '1M', source: 'ref' },
  { id: 'gemini-3-flash', provider: 'google', name: 'Gemini 3 Flash', input1M: 1.0, output1M: 6.0, cacheRead1M: 0.25, context: '1M', source: 'ref' },
  // xAI(参考价)
  { id: 'grok-4', provider: 'x', name: 'Grok 4', input1M: 3, output1M: 15, cacheRead1M: null, context: '256K', source: 'ref' },
  { id: 'grok-4-mini', provider: 'x', name: 'Grok 4 mini', input1M: 0.4, output1M: 2, cacheRead1M: null, context: '128K', source: 'ref' },
  // Mistral(参考价)
  { id: 'mistral-large-3', provider: 'mistralai', name: 'Mistral Large 3', input1M: 2, output1M: 6, cacheRead1M: null, context: '128K', source: 'ref' },
  { id: 'mistral-small-3', provider: 'mistralai', name: 'Mistral Small 3', input1M: 0.1, output1M: 0.3, cacheRead1M: null, context: '128K', source: 'ref' },
  // 国产(参考价)
  { id: 'qwen3-max', provider: 'alibabacloud', name: '通义千问 Qwen3-Max', input1M: 1.4, output1M: 4.2, cacheRead1M: null, context: '256K', source: 'ref' },
  { id: 'qwen3-coder', provider: 'alibabacloud', name: 'Qwen3-Coder', input1M: 0.28, output1M: 0.85, cacheRead1M: null, context: '256K', source: 'ref' },
  { id: 'glm-4.5', provider: 'zhipu', name: '智谱 GLM-4.5', input1M: 1.2, output1M: 5, cacheRead1M: null, context: '128K', source: 'ref' },
  { id: 'doubao-1.6-pro', provider: 'bytedance', name: '豆包 Doubao 1.6 Pro', input1M: 0.3, output1M: 0.9, cacheRead1M: null, context: '256K', source: 'ref' },
  { id: 'minimax-m2', provider: 'minimax', name: 'MiniMax M2', input1M: 0.4, output1M: 1.6, cacheRead1M: null, context: '200K', source: 'ref' },
  { id: 'hunyuan-turbos', provider: 'qq', name: '腾讯混元 Turbo S', input1M: 0.05, output1M: 0.2, cacheRead1M: null, context: '256K', source: 'ref' },
  { id: 'ernie-4.5', provider: 'baidu', name: '百度文心 ERNIE 4.5', input1M: 0.8, output1M: 3.2, cacheRead1M: null, context: '128K', source: 'ref' },
  // 开源托管(参考价)
  { id: 'llama-4-maverick', provider: 'meta', name: 'Llama 4 Maverick', input1M: 0.21, output1M: 0.84, cacheRead1M: null, context: '1M', source: 'ref' },
  { id: 'llama-4-scout', provider: 'meta', name: 'Llama 4 Scout', input1M: 0.13, output1M: 0.52, cacheRead1M: null, context: '10M', source: 'ref' },
  // 本地(免费)
  { id: 'llama3', provider: 'ollama', name: 'Ollama 本地模型', input1M: 0, output1M: 0, cacheRead1M: 0, context: '本地', source: 'ref' },
]