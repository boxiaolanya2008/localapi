// 验证:默认分组(无注入)的请求也会被强制注入全局编码规则
const base = 'http://127.0.0.1:3000'
const H = { 'x-admin-token': 'localapi-admin-123456', 'content-type': 'application/json' }

async function main() {
  const k = await fetch(base + '/admin/keys', { headers: H, method: 'POST', body: JSON.stringify({ name: 'default-grp-check', groupId: 1 }) }).then((r) => r.json())
  const chat = await fetch(base + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k.key },
    body: JSON.stringify({ model: 'demo-model', messages: [{ role: 'user', content: 'hi' }] }),
  })
  const d = await chat.json()
  const msgs = d.echo_messages || []
  console.log('消息序数:', msgs.length)
  console.log('[0]', msgs[0]?.role, '=>', String(msgs[0]?.content || '').slice(0, 40))
  console.log('含"装饰"?', String(msgs[0]?.content || '').includes('装饰'))
  console.log('最后一个=用户消息?', msgs[msgs.length - 1]?.role === 'user')
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})