# LocalAPI / 本地 API 中转站

本地跑一个 OpenAI 兼容的中转服务 + Vue 管理台，其它 CLI 工具把 base_url 指过来就能走统一密钥、统一记账。

特性：

- OpenAI 兼容接口：`/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/models`，支持 stream 流式透传
- 从 `.env` 读上游 api/model/key，多渠道路由 + 模型名映射
- Vue 3 管理台：密钥管理、使用记录、渠道主题、今日 Token、余额、7 日图表
- 余额两种来源自动切换：上游 billing 接口实时查，失败退回「额度 − 累计消耗」本地估算
- 数据存 SQLite（Node 内置 `node:sqlite`，零额外依赖）
- 默认只监听 127.0.0.1

## 安装

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install
cp .env.example .env   # 填 BASE_URL / API_KEY / MODEL / ADMIN_TOKEN
```

## 启动

```bash
pnpm start            # 一键启动(生产):后端 + 前端静态页,单端口 3000
pnpm dev              # 开发模式:后端热更新 3000 + 前端热更新 5173
pnpm demo             # 另开一个终端起本地 mock 上游(端口4000,零成本试跑)
```

一次只敲一条命令。日常用 `pnpm start` 就够了;`.env` 里 BASE_URL 指向 mock 时,先 `pnpm demo` 再 `pnpm start`。

```bash
pnpm build  # 改了前端代码后重新构建
```

## 用法

CLI 工具指向本地：

```bash
export OPENAI_BASE_URL=http://127.0.0.1:3000/v1
export OPENAI_API_KEY=sk-lapi-xxx   # 在管理网页「密钥管理」里创建
```

浏览器打开 http://127.0.0.1:3000 ，输入 `.env` 里的 ADMIN_TOKEN 进入管理台。

## 目录结构

```
server/  后端: Express + node:sqlite,中转与管理接口
web/     前端: Vue 3 + Element Plus + ECharts
data/    运行时数据(SQLite),已 gitignore
```

## License

GPL-3.0，见 [LICENSE](LICENSE)。

English: A local OpenAI-compatible API relay with a Vue admin dashboard. CLI tools point their base_url at `http://127.0.0.1:3000/v1`; keys, usage, channels, balance are managed in the web panel. Requires Node 20+ and pnpm. Data stored in SQLite via Node's built-in `node:sqlite`.