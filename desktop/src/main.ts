import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const isPackaged = app.isPackaged

// GUI 模式下 stdout 已关闭，console.log 会抛 EPIPE，需全局吞掉
try {
  process.stdout.on('error', () => {})
  process.stderr.on('error', () => {})
} catch {}
process.on('uncaughtException', (err) => {
  try {
    const p = path.join(app.getPath('userData'), 'localapi-data', 'desktop.log')
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.appendFileSync(p, `[uncaught] ${String(err.stack ?? err)}\n`)
  } catch {}
})
process.on('unhandledRejection', (reason) => {
  try {
    const p = path.join(app.getPath('userData'), 'localapi-data', 'desktop.log')
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.appendFileSync(p, `[unhandledRejection] ${String(reason)}\n`)
  } catch {}
})

// resolve resources when packaged vs dev
function resolveResource(...segs: string[]): string {
  if (isPackaged) {
    return path.join(process.resourcesPath, ...segs)
  }
  return path.join(path.resolve(here, '../..'), ...segs)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProc: ChildProcess | null = null
let serverUrl = 'http://127.0.0.1:3000'

const DATA_DIR = path.join(app.getPath('userData'), 'localapi-data')
const LOG_PATH = path.join(DATA_DIR, 'desktop.log')

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(LOG_PATH, line)
  } catch {}
  try {
    if (process.stdout.writable) console.log(msg)
  } catch {}
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function getEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (!env.DATA_DIR) env.DATA_DIR = DATA_DIR
  if (!env.HOST) env.HOST = '127.0.0.1'
  if (!env.PORT) env.PORT = '3000'
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN === 'change-me-to-a-long-random-string' || env.ADMIN_TOKEN === 'admin') {
    const tokenFile = path.join(DATA_DIR, '.admin_token')
    if (fs.existsSync(tokenFile)) {
      env.ADMIN_TOKEN = fs.readFileSync(tokenFile, 'utf8').trim()
    } else {
      const token = 'local-' + Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14)
      fs.writeFileSync(tokenFile, token, 'utf8')
      env.ADMIN_TOKEN = token
      log(`generated ADMIN_TOKEN at ${tokenFile}`)
    }
  }
  serverUrl = `http://${env.HOST}:${env.PORT}`
  return env
}

function startServer(): void {
  const env = getEnv()
  ensureDataDir()
  const entry = resolveResource('server', 'index.js')
  const fallback = path.join(path.resolve(here, '../..'), 'server', 'dist', 'index.js')
  const target = fs.existsSync(entry) ? entry : fallback
  if (!fs.existsSync(target)) {
    log(`server entry not found: ${target}`)
    return
  }
  log(`starting server: node ${target} DATA_DIR=${env.DATA_DIR} PORT=${env.PORT}`)
  serverProc = spawn(process.execPath, [target], {
    // execPath 是 Electron 二进制,必须 RUN_AS_NODE 才会当纯 Node 跑(且 Electron>=35 的 Node 22.14 才有 node:sqlite)
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' } as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.dirname(target),
  })
  serverProc.stdout?.on('data', (d: Buffer) => log(`[server] ${d.toString().trim()}`))
  serverProc.stderr?.on('data', (d: Buffer) => log(`[server:err] ${d.toString().trim()}`))
  serverProc.stdout?.on('error', () => {})
  serverProc.stderr?.on('error', () => {})
  serverProc.on('error', (err) => log(`server spawn error: ${String((err as Error).message ?? err)}`))
  serverProc.on('exit', (code, sig) => {
    log(`server exited code=${code} sig=${sig}`)
    if (!isQuitting.value) {
      setTimeout(() => {
        log('restarting server...')
        startServer()
      }, 2000)
    }
  })
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + '/admin/settings', { headers: { 'x-admin-token': getEnv().ADMIN_TOKEN } as Record<string, string> }).catch(() => null)
      if (res && (res.status === 200 || res.status === 403)) return true
      const r2 = await fetch(url + '/', { method: 'GET' }).then((r) => r.status).catch(() => 0)
      if (r2 === 200) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: path.join(here, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const load = async (): Promise<void> => {
    const ok = await waitForServer(serverUrl, 20000)
    const target = ok ? serverUrl : serverUrl
    log(`loading ${target} (server ready=${ok})`)
    await mainWindow!.loadURL(target)
    mainWindow!.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
      log(`did-fail-load ${code} ${desc} ${validatedURL}`)
    })
  }

  void load()

  // open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(serverUrl) && !url.startsWith('file://')) {
      e.preventDefault()
      void shell.openExternal(url)
    }
  })
}

function createTray(): void {
  try {
    const iconPng = resolveResource('build', 'icon.png')
    const iconIco = resolveResource('build', 'icon.ico')
    const altPng = path.join(path.resolve(here, '../..'), 'desktop', 'build', 'icon.png')
    const altIco = path.join(path.resolve(here, '../..'), 'desktop', 'build', 'icon.ico')
    const iconPath = fs.existsSync(iconPng) ? iconPng : fs.existsSync(iconIco) ? iconIco : ''
    const altPath = fs.existsSync(altPng) ? altPng : altIco
    const p = fs.existsSync(iconPath) ? iconPath : altPath
    let image: Electron.NativeImage | undefined
    if (fs.existsSync(p)) image = nativeImage.createFromPath(p)
    tray = new Tray(image ?? nativeImage.createEmpty())
    const ctx = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => mainWindow?.show() },
      { label: `打开 ${serverUrl}`, click: () => void shell.openExternal(serverUrl) },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
    tray.setToolTip('LocalAPI')
    tray.setContextMenu(ctx)
    tray.on('click', () => mainWindow?.show())
  } catch (err) {
    log(`tray failed: ${String((err as Error).message)}`)
  }
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'LocalAPI',
      submenu: [
        { role: 'about', label: '关于 LocalAPI' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '打开管理台', click: () => void shell.openExternal(serverUrl) },
        { label: '打开数据目录', click: () => void shell.openPath(DATA_DIR) },
        { label: '查看日志', click: () => void shell.openPath(LOG_PATH) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  dataDir: DATA_DIR,
  serverUrl,
  logPath: LOG_PATH,
  isPackaged,
}))

ipcMain.handle('auth:getToken', () => getEnv().ADMIN_TOKEN)

ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(String(url)))

const isQuitting = { value: false }

app.whenReady().then(() => {
  ensureDataDir()
  // 设置 CSP 头，消除 Electron 的 Insecure CSP 警告
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; object-src 'none'; base-uri 'self'",
        ],
      },
    })
  })
  createMenu()
  startServer()
  createWindow()
  createTray()
  app.on('before-quit', () => {
    isQuitting.value = true
    serverProc?.kill()
  })
})

// single instance lock - second instance just shows window
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}
