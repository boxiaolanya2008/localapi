// 自研热更新:检测 server/src 与 web/src 下的文件被保存即重新构建并重启/刷新
// 用法: pnpm watch  (或 node tools/watch.mjs)
// - 改 server/src → 重新 tsc 编译并重启后端进程(端口不变)
// - 改 web/src → 重新 vite 构建,刷新页面即拿到新前端
import { spawn, execSync } from 'node:child_process'
import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(dir, '..')
const DEBOUNCE = 350

let serverProc = null
let building = false
let pend = { server: false, web: false }
let flusher = null

function log(msg) {
  console.log(`[watch] ${msg}`)
}

function buildPkg(pkg) {
  log(`改动已保存 → 重新构建(${pkg === 'server' ? 'server' : 'web'})...`)
  const t = Date.now()
  try {
    execSync(`pnpm --dir ${pkg} build`, { cwd: ROOT, stdio: 'inherit' })
    log(`构建完成(${pkg},${((Date.now() - t) / 1000).toFixed(1)}s)`)
  } catch (e) {
    log(`构建失败(${pkg}):${e.message}`)
  }
}

function startServer() {
  if (serverProc) {
    log('后端已改动,重启进程...')
    serverProc.kill()
  }
  serverProc = spawn('node', ['server/dist/index.js'], { cwd: ROOT, stdio: 'inherit' })
  serverProc.on('exit', (code) => {
    if (code !== 0) log(`后端进程退出(code=${code})`)
  })
}

async function flush() {
  if (building) return
  building = true
  try {
    if (pend.server) {
      pend.server = false
      buildPkg('server')
      startServer()
    }
    if (pend.web) {
      pend.web = false
      buildPkg('web')
    }
  } finally {
    building = false
  }
}

function onEvent(pkg) {
  pend[pkg] = true
  if (flusher) clearTimeout(flusher)
  flusher = setTimeout(() => flush(), DEBOUNCE)
}

function watchTree(root, pkg) {
  try {
    watch(root, { recursive: true }, (_evt, name) => {
      if (building) return
      const f = String(name || '')
      // 忽略编译产物与临时文件,避免反馈循环
      if (/\.tsbuildinfo$|^dist\b|node_modules|\.d\.ts$/.test(f)) return
      onEvent(pkg)
    })
    log(`正在监听 ${pkg}: ${root}`)
  } catch (e) {
    log(`监听 ${pkg} 失败:${e.message}(Windows 可能需更高权限)`)
  }
}

// 首次构建
log('首次构建(server+web)...')
buildPkg('server')
buildPkg('web')
startServer()
watchTree(path.join(ROOT, 'server', 'src'), 'server')
watchTree(path.join(ROOT, 'web', 'src'), 'web')

log('热更新已就绪。改 server/src 自动重启后端,改 web/src 自动重建前端。Ctrl+C 退出。')
process.on('SIGINT', () => {
  if (serverProc) serverProc.kill()
  process.exit(0)
})