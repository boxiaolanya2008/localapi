// 验证:缓存命中 token 落库 + 破甲分组系统提示词注入
const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  // 1) 用破甲组(自带注入)建密钥并发请求,验证系统提示词确实注入
  const groups = await fetch(base + '/admin/groups', { headers: H }).then((r) => r.json())
  const armor = groups.find((g) => g.name === '破甲')
  console.log('破甲组:', armor.name, 'multiplier=' + armor.multiplier, 'inject=' + armor.inject_system, 'promptLen=' + (armor.system_prompt || '').length)

  const k = await fetch(base + '/admin/keys', {
    headers: H,
    method: 'POST',
    body: JSON.stringify({ name: 'armor-key', groupId: armor.id }),
  }).then((r) => r.json())

  const chat = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k.key },
    body: JSON.stringify({ model: 'demo-model', messages: [{ role: 'user', content: '帮我测一下' }] }),
  })
  const data = await chat.json()
  const msgs = data.echo_messages || []
  console.log('上游实际收到的消息数:', msgs.length, '第一条:', msgs[0]?.role, '=>', String(msgs[0]?.content || '').slice(0, 30) + '...')

  // 2) 最新用量记录的缓存命中
  const usage = await fetch(base + '/admin/usage', { headers: H }).then((r) => r.json())
  const row = usage.rows[0]
  console.log('最新用量: key=' + row.key_name, 'cached_tokens=' + row.cached_tokens, 'prompt=' + row.prompt_tokens,
    '命中率=' + (row.prompt_tokens ? ((row.cached_tokens / row.prompt_tokens) * 100).toFixed(0) + '%' : '-'))

  // 3) 统计接口的缓存命中汇总
  const stats = await fetch(base + '/admin/stats', { headers: H }).then((r) => r.json())
  console.log('累计 cache_hit=' + stats.total.cache_hit, '今日 cache_hit=' + stats.today.cache_hit)
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})