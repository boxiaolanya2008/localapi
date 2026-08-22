# LocalAPI Server

## 依赖声明

- 运行期:express(HTTP 路由)、dotenv(env 加载)
- 存储:Node 内置 `node:sqlite`,无第三方 DB 依赖
- 开发期:typescript、tsx(run/test)、@types/node、@types/express

## 模块与导出

- `config.ts`:`loadConfig()` 读 .env 返回 EnvConfig(渠道种子、端口、令牌)
- `db.ts`:`Store` 类,SQLite 表 api_keys / channels / usage / balance_cache / settings
- `relay.ts`:`relayRouter(store, cfg)` 挂载 /v1,OpenAI 兼容中转(流式透传、用量记账)
- `admin.ts`:`adminRouter(store, cfg)` 挂载 /admin,X-Admin-Token 校验
- `billing.ts`:余额双源(上游 billing 实时查 / 本地估算)
- `index.ts`:`createApp()` 组装应用,`start()` 启动监听

## 编码规则

沿用根 .simple-dev 预设:无装饰注释、禁 emoji、语法极简、conventional commit。

> [!TIP]
> 改 `db.ts` 后务必跑 `pnpm --dir server test`，18/18 过再提 PR。