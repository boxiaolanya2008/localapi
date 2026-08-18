// 实机验证:建组->建密钥->转发->倍率计费全链路
const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const groups = await fetch(base + '/admin/groups', { headers: H }).then((r) => r.json())
  console.log('groups:', groups.map((x) => x.name + ' x' + x.multiplier).join(', '))

  const created = await fetch(base + '/admin/groups', {
    headers: H,
    method: 'POST',
    body: JSON.stringify({ name: '破甲实验', multiplier: 0.3 }),
  }).then((r) => r.json())
  console.log('created group id:', created.id)

  const k = await fetch(base + '/admin/keys', {
    headers: H,
    method: 'POST',
    body: JSON.stringify({ name: 'live-group-key', groupId: created.id }),
  }).then((r) => r.json())
  console.log('key:', k.key.slice(0, 14) + '...', 'group=' + k.group_name, 'rate=' + k.group_multiplier)

  const chat = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k.key },
    body: JSON.stringify({ model: 'demo-model', messages: [{ role: 'user', content: 'hello' }] }),
  })
  console.log('relay status:', chat.status)

  const usage = await fetch(base + '/admin/usage', { headers: H }).then((r) => r.json())
  const row = usage.rows[0]
  console.log('newest usage: key=' + row.key_name, 'group=' + row.group_name, 'rate=' + row.rate, 'cost=' + row.cost, 'tokens=' + row.total_tokens)
  console.log('expected: 原价 0.000019 x0.3 =', (0.000019 * 0.3).toFixed(10))
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})