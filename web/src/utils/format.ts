// 展示与换算工具

// 每千 token 价 -> 每百万 token 价显示
export function per1kTo1M(v: number): number {
  return v * 1000
}

// 每百万 token 价 -> 每千 token 价(渠道表单里存的是每千 token)
export function per1MTo1k(v: number): number {
  return v / 1000
}

export function fmtUsd(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return '-'
  return '$' + v.toFixed(digits)
}

// 大数字格式化:1200000 -> 1.2M
export function fmtBig(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.0+$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}