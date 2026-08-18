import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig, repoRoot } from './config.js'
import { Store } from './db.js'
import { relayRouter } from './relay.js'
import { adminRouter } from './admin.js'

export function createApp(cfg: ReturnType<typeof loadConfig>, store: Store): express.Express {
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use((_req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-token')
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.use('/admin', adminRouter(store, cfg))
  app.use('/v1', relayRouter(store, cfg))

  // 统一 JSON 错误,不让 Express 默认 HTML 错误页漏给调用方
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: err.message || 'internal error' })
  })

  const dist = path.join(repoRoot, 'dist-web')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/admin') && !req.path.startsWith('/v1')) {
        return res.sendFile(path.join(dist, 'index.html'))
      }
      next()
    })
  } else {
    app.get('/', (_req, res) => {
      res.type('text/plain').send('web bundle not built yet. run: pnpm --dir web build')
    })
  }

  return app
}

export function start(): void {
  const cfg = loadConfig()
  const store = new Store(cfg.dataDir)
  // 渠道、模型、密钥全部在管理界面配置,不再从 env 灌入
  const app = createApp(cfg, store)
  const server = app.listen(cfg.port, cfg.host, () => {
    console.log(`localapi listening on http://${cfg.host}:${cfg.port}`)
    console.log(`relay base: http://127.0.0.1:${cfg.port}/v1`)
  })
  server.on('error', (err) => {
    console.error('listen failed:', err.message)
    process.exit(1)
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  start()
}