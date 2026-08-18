# LocalAPI / 本地 API 中转站

本地跑一个 OpenAI 兼容的中转服务 + Vue 管理台，其它 CLI 工具把 base_url 指过来就能走统一密钥、统一记账。

特性：

- OpenAI 兼容接口：`/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/models`，支持 stream 流式透传
- **渠道、API Key、模型全部在管理界面录入**，不再依赖 .env；可选模型名映射
- 内置 2026 热门模型价格目录：每百万 token 输入/输出/缓存命中价（DeepSeek V4、Kimi K3/K2 系已按官方页联网核实，其余标注参考价），一键导入渠道自动带出价格
- 内置 19 家提供商官方 logo（OpenAI/Anthropic/Gemini/DeepSeek/Kimi/通义/豆包/混元/文心/Grok/GLM/硅基流动等），选提供商自动填官方接口地址，也可改地址指向任意兼容服务
- **分组计费**：自定义倍率，0 = 免费破甲、0.5 = 半价、1 = 原价、>1 = 加价；分组可限制模型；密钥归属分组，费用按倍率计算
- 内置系统提示词预设（中文助手/代码专家/写作润色等）；默认关闭注入 = 请求 100% 原样透传
- Vue 3 管理台：密钥、渠道、分组、模型目录、使用记录、仪表盘图表、余额（实时/估算双源）
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

浏览器打开 http://127.0.0.1:3000 ，输入 `.env` 里的 ADMIN_TOKEN 进入管理台。首次使用：模型目录 → 添加为渠道 → 填你申请的 API Key → 保存；密钥管理 → 建密钥并选分组 → 把密钥给 CLI 工具用。

## 目录结构

```
server/   后端: Express + node:sqlite,中转与管理接口
web/      前端: Vue 3 + Element Plus + ECharts
  src/constants/   模型价格目录、提供商 logo、提示词预设
tools/    mock 上游与冒烟/实机验证脚本
data/     运行时数据(SQLite),已 gitignore
```

## License

GPL-3.0，见 [LICENSE](LICENSE)。

English: A local OpenAI-compatible API relay with a Vue admin dashboard. CLI tools point their base_url at `http://127.0.0.1:3000/v1`; keys, usage, channels, balance are managed in the web panel. Requires Node 20+ and pnpm. Data stored in SQLite via Node's built-in `node:sqlite`.