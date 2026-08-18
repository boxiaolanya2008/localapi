import { config as loadDotenv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '../..')

export interface EnvChannel {
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  priceIn: number
  priceOut: number
  credit: number
  billingEndpoint: string
}

export interface EnvConfig {
  port: number
  host: string
  adminToken: string
  defaultModel: string
  modelMap: Record<string, string>
  dataDir: string
  channels: EnvChannel[]
}

function toNum(v: unknown, def: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

function splitModels(s: string): string[] {
  return s.split(',').map((m) => m.trim()).filter(Boolean)
}

function parseModelMap(s: string | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const pair of (s ?? '').split(',')) {
    const idx = pair.indexOf('=')
    if (idx > 0) {
      const a = pair.slice(0, idx).trim()
      const b = pair.slice(idx + 1).trim()
      if (a && b) map[a] = b
    }
  }
  return map
}

export function loadConfig(): EnvConfig {
  loadDotenv({ path: path.join(repoRoot, '.env') })
  const e = process.env

  const models = splitModels(e.MODEL ?? 'deepseek-chat')
  const main: EnvChannel = {
    name: 'default',
    baseUrl: (e.BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey: e.API_KEY ?? '',
    models,
    priceIn: toNum(e.PRICE_IN, 0),
    priceOut: toNum(e.PRICE_OUT, 0),
    credit: toNum(e.CREDIT, 0),
    billingEndpoint: e.BILLING_ENDPOINT ?? '',
  }

  const extra: EnvChannel[] = []
  try {
    const raw: unknown[] = JSON.parse(e.EXTRA_CHANNELS_JSON || '[]')
    for (const c of raw as Record<string, unknown>[]) {
      extra.push({
        name: String(c.name ?? 'channel'),
        baseUrl: String(c.base_url ?? '').replace(/\/+$/, ''),
        apiKey: String(c.api_key ?? ''),
        models: Array.isArray(c.models) ? c.models.map(String) : [],
        priceIn: toNum(c.price_in, 0),
        priceOut: toNum(c.price_out, 0),
        credit: toNum(c.credit, 0),
        billingEndpoint: String(c.billing_endpoint ?? ''),
      })
    }
  } catch {
    // bad EXTRA_CHANNELS_JSON:忽略
  }

  return {
    port: toNum(e.PORT, 3000),
    host: e.HOST || '127.0.0.1',
    adminToken: e.ADMIN_TOKEN || 'admin',
    defaultModel: models[0] ?? 'deepseek-chat',
    modelMap: parseModelMap(e.MODEL_MAP),
    dataDir: e.DATA_DIR || path.join(repoRoot, 'data'),
    channels: main.apiKey ? [main, ...extra] : extra,
  }
}