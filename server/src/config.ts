import { config as loadDotenv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '../..')

export interface EnvConfig {
  port: number
  host: string
  adminToken: string
  modelMap: Record<string, string>
  dataDir: string
}

function toNum(v: unknown, def: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
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

// 渠道、API key、模型一律在管理界面配置,env 只留服务级参数
export function loadConfig(): EnvConfig {
  loadDotenv({ path: path.join(repoRoot, '.env') })
  const e = process.env
  return {
    port: toNum(e.PORT, 3000),
    host: e.HOST || '127.0.0.1',
    adminToken: e.ADMIN_TOKEN || 'admin',
    modelMap: parseModelMap(e.MODEL_MAP),
    dataDir: e.DATA_DIR || path.join(repoRoot, 'data'),
  }
}