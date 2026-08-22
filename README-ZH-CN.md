# LocalAPI / 本地 API 中转站

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

本地跑一个 OpenAI 兼容的中转服务 + Vue 管理台。把各个 CLI 工具的 `base_url` 指过来，密钥、渠道、用量、余额统一管。短。

## 特性

- OpenAI 兼容：`/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/models`，stream 流式透传，上游缺 `[DONE]` 自动补
- 管理台录入一切：渠道、API Key、模型、价格、分组，不再依赖 `.env`。可选模型名映射 `MODEL_MAP`
- 价格目录：内置 2026 热门模型每百万 token 输入/输出/缓存价，DeepSeek V4、Kimi K3/K2 已联网核实，其余为参考价，一键建渠道自动带价
- 19 家提供商 logo：OpenAI/Anthropic/Gemini/DeepSeek/Kimi/通义/豆包/混元/文心/Grok/GLM/硅基流动等，选提供商自动填官方地址，也可指向任意兼容服务
- 分组计费：自定义倍率，0.5 半价、1 原价、>1 加价；可限制模型；密钥绑定分组，费用按倍率算
- 协议适配：渠道支持 OpenAI Chat / OpenAI Responses / Anthropic Messages / 自定义路由，自动双向转换
- 提示词：内置 7 个免费预设 + 3 个付费高级，渠道/分组可选注入，默认关闭就是 100% 透传
- 管理台：Vue 3 + Element Plus + ECharts，密钥/渠道/分组/模型目录/使用记录/仪表盘/余额双源
- 存储：SQLite，`node:sqlite`，零额外依赖
- 默认只监听 `127.0.0.1`，够谨慎

## 安装

需要 Node.js 20+ 和 pnpm 11+。

```bash
pnpm install
cp .env.example .env   # 改 ADMIN_TOKEN，必须
```

> IMPORTANT：`ADMIN_TOKEN` 不改就别放公网。默认 `change-me-...` 只是占位。

## 启动

```bash
pnpm start   # 生产：后端 + 前端静态，单端口 3000
pnpm dev     # 开发：后端 3000 + 前端 5173，双热更新（默认仅 Web，不含桌面端）
pnpm desktop # 桌面端: Electron 壳(自带服务，无需另起 pnpm dev)
pnpm watch   # 自研热更新：保存即重编重启
pnpm demo    # 本地 mock 上游 4000，零成本试跑
```

> [!NOTE]
> 默认 `pnpm dev` 仅启动 Web，需要桌面端时用 `pnpm desktop` 或 `pnpm dev:desktop`；`pnpm dev:all` 会同时启动 server+web+desktop（一般不需要，桌面端已内置服务）。

日常 `pnpm start` 一个命令就够。`.env` 指到 mock 时先 `pnpm demo` 再 `pnpm start`。改前端后 `pnpm build`。

## 用法

CLI 指向本地：

```bash
export OPENAI_BASE_URL=http://127.0.0.1:3000/v1
export OPENAI_API_KEY=sk-lapi-xxx   # 管理台「密钥管理」创建
```

浏览器打开 `http://127.0.0.1:3000`，输入 `ADMIN_TOKEN` 登录。首次：模型目录 → 添加为渠道 → 填上游 API Key → 保存；密钥管理 → 建密钥选分组 → 给 CLI 用。

## 目录

```
server/   后端 Express + node:sqlite，中转与管理接口
web/      前端 Vue 3 + Element Plus + ECharts
  src/constants/  价格目录、提供商 logo、提示词
tools/    mock 上游与验证脚本
data/     运行时 SQLite，已 gitignore
```

## 开发

```bash
pnpm test            # 后端测试
pnpm --dir web run typecheck
```

更多见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [AGENTS.md](AGENTS.md)。

## 许可证

GPL-3.0，见 [LICENSE](LICENSE)。
