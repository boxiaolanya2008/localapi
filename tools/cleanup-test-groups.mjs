// 清理验证期间创建的测试分组,只保留一个注入组(破甲)
const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const groups = await fetch(base + '/admin/groups', { headers: H }).then((r) => r.json())
  for (const g of groups) {
    if (/破甲实验/.test(g.name)) {
      await fetch(base + '/admin/groups/' + g.id, { headers: H, method: 'DELETE' })
      console.log('deleted:', g.name)
    }
  }
  const left = await fetch(base + '/admin/groups', { headers: H }).then((r) => r.json())
  console.log('剩余分组:', left.map((g) => g.name + (g.inject_system ? '(注入)' : '')).join(', '))
}

main().catch((e) => {
  console.error('FAIL', e.message)
})