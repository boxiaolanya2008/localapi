// 验证:破甲倍率=1 + 商城充值到账
const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const groups = await fetch(base + '/admin/groups', { headers: H }).then((r) => r.json())
  const armor = groups.find((g) => g.name === '破甲')
  console.log('破甲倍率 =', armor?.multiplier)

  const ch = await fetch(base + '/admin/channels', { headers: H }).then((r) => r.json())
  const cid = ch[0].id
  console.log('充值前渠道额度 =', ch[0].credit)

  const res = await fetch(base + `/admin/channels/${cid}/credit`, { headers: H, method: 'POST', body: JSON.stringify({ delta: 50 }) }).then((r) => r.json())
  console.log('充值 +50 后额度 =', res.credit)
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})