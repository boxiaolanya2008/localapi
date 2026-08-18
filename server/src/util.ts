import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Response } from 'express'

export const now = (): number => Date.now()

export function dayStart(ts: number = now()): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function genKey(): string {
  return 'sk-lapi-' + randomBytes(24).toString('hex')
}

export function hashKey(k: string): string {
  return createHash('sha256').update(k).digest('hex')
}

export function maskKey(k: string): string {
  if (!k) return ''
  if (k.length <= 12) return k.slice(0, 4) + '****'
  return k.slice(0, 10) + '****' + k.slice(-4)
}

export const uuid = (): string => randomUUID()

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function jsonStr(v: unknown): string {
  return JSON.stringify(v)
}

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export function openaiError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { message, type: 'invalid_request_error', param: null, code } })
}

export function fmtNum(n: number, digits = 2): string {
  return n.toFixed(digits)
}