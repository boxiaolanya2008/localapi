import type { Store, ChannelRow } from './db.js'
import { now } from './util.js'

const TTL_MS = 60_000

export interface Balance {
  source: 'live' | 'estimate'
  amount: number
  fetchedAt: number
}

export function costFor(channel: ChannelRow, promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1000) * channel.price_in + (completionTokens / 1000) * channel.price_out
}

async function tryLive(channel: ChannelRow): Promise<number | null> {
  const base = channel.billing_endpoint || channel.base_url.replace(/\/+$/, '') + '/dashboard/billing/credit_grants'
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(base, {
      headers: { authorization: `Bearer ${channel.api_key}` },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const j = JSON.parse(await res.text())
    if (j == null || typeof j !== 'object') return null
    const cands = [
      j.total_available,
      j.total_granted - j.total_used,
      j.balance,
      j.remaining_credit,
      j.amount,
    ]
    const v = cands.find((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)
    return typeof v === 'number' ? v : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function getBalance(store: Store, channel: ChannelRow): Promise<Balance> {
  const cached = store.getBalanceCache(channel.id)
  if (cached && now() - cached.fetched_at < TTL_MS) {
    return { source: cached.source, amount: cached.amount, fetchedAt: cached.fetched_at }
  }
  const live = await tryLive(channel)
  if (live !== null) {
    store.setBalanceCache(channel.id, 'live', live)
    return { source: 'live', amount: live, fetchedAt: now() }
  }
  const amount = channel.credit - store.channelCostSum(channel.id)
  store.setBalanceCache(channel.id, 'estimate', amount)
  return { source: 'estimate', amount, fetchedAt: now() }
}