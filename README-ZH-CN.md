# LocalAPI / 本地 API 中转站

> 本地起一个 OpenAI 兼容的中转，CLI 把 `base_url` 指过来就走统一密钥、统一计费、统一日志。轻。稳。离线也能跑。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-0.4.0-green.svg)](CHANGELOG.md) [![Node](https://img.shields.io/badge/node-%3E%3D20-black.svg)](https://nodejs.org)

[English](README.md) | 中文

一句话：CLI -> LocalAPI (`sk-lapi-xxx`) -> 上游，其他什么都不用管。密钥不出 `DATA_DIR`，数据就一个 SQLite 文件。

## 为啥做

手里 3 家上游，5 个 CLI 工具，密钥满天飞，账对不上，日志找不到。LocalAPI 夹在中间做一层：你只给 CLI 一个本地 key，后面接哪家、怎么计费、注入什么提示词，都在网页里点点就好。

## 特性

OpenAI 全兼容：`POST /v1/chat/completions`、`/v1/completions`、`POST /v1/embeddings`、`GET /v1/models`，流式原样透传。上游偶尔漏发 `data: [DONE]`，中转自动补上，不然客户端会报 `stream ended without terminal event`。哎呀，这个坑踩过。

渠道、密钥、模型全在管理台录。19 家官方 logo 自带，选提供商自动填官方地址，也能改成任意兼容地址。`MODEL_MAP` 留作 env 兜底，比如 `gpt-4o-mini=内部模型名`。

价格目录 2026 版按百万 token 记，DeepSeek V4、Kimi K3/K2 已联网核实标 `official`，其余 `ref`，可在渠道里改。从目录一键建渠道自动带价，算账不抓瞎。

分组管计费。倍率 0.5 半价、1 原价、2 加价，现在破甲组也改回 1，避免 0 以为免费的误解。可限模型，密钥归分组，费用 `上游成本 * 倍率`，仪表盘 `groupUsage` 一眼清楚。

协议适配：每条渠道选 `OpenAI Chat / Responses / Anthropic Messages / 自定义路由`，自动双向转换系统消息、文本、工具调用、抽样参数、用量与缓存字段。客户端永远按 OpenAI Chat 发，非 chat 上游走非流式再合成 OpenAI SSE，流式体验不断。

提示词：内置 7 个免费 + 3 个付费（`LP-VIP-LOCAL-2026` 解锁），默认关闭就是 100% 透传。启用时固定顺序 `[全局编码规则, 分组提示词, 本地MD, 模板system, ...你的消息]`，每条独立 `system`，谁也不盖谁。全局规则那条最狠，禁止装饰性注释，所有请求都顶置。

本地 MD 系统提示词：设置页自选本地 `.md / .markdown / .txt / .mdx`，本地 `FileReader` 读，不上传，预览后点保存才生效，50k 字符以内。它跟分组提示词叠加，不是替换。举个例子，分组是“代码专家”，文件是 `个人规范.md`，请求会同时带上两条。关掉就回到透传，不过全局规则还在。

管理台 Vue 3 + Element Plus + ECharts：密钥、渠道、分组、模型目录、使用记录、7 日 Token 折线（2,700,379 显示成 2.70M）、渠道饼图、余额。余额双源，优先上游 `dashboard/billing/credit_grants` 实时查，60 秒 TTL，失败回退 `credit - sum(cost)` 估算。

桌面端 `desktop/`：Electron 壳，双击即跑，无需终端。数据落在 `app.getPath('userData')/localapi-data`，首次启动自动生成 `ADMIN_TOKEN` 到 `DATA_DIR/.admin_token`，托盘常驻。说实话，点一下比敲命令舒服多了。

存储就靠 `node:sqlite`，WAL，日誌 3000ms 超时，零额外依赖。结构自动迁移 `ensureColumn`。

## 安装

要 Node 20+ 和 pnpm 11+。

```bash
pnpm install
cp .env.example .env   # 然后把 ADMIN_TOKEN 改掉
```

> [!IMPORTANT]
> `ADMIN_TOKEN` 不改别往公网放。`change-me-...` 只是占位，6 个字符也能跑，但那就等于没锁。

## 快速开始

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

CLI 指过来：

```bash
export OPENAI_BASE_URL=http://127.0.0.1:3000/v1
export OPENAI_API_KEY=sk-lapi-xxx   # 网页 密钥管理 里建
```

浏览器开 `http://127.0.0.1:3000`，输入 `ADMIN_TOKEN`。首次：模型目录 -> 添加为渠道 -> 贴上游 API Key -> 保存；密钥管理 -> 新建密钥选分组 -> 把 `sk-lapi-xxx` 给 CLI。

桌面版：去 [Releases](https://github.com/boxiaolanya2008/localapi/releases/tag/v0.4.0) 下 `LocalAPI-0.4.0-*.exe` 或 portable，装好托盘点显示。数据与日志在 `userData/localapi-data/desktop.log`。

> [!NOTE]
> 安装包只提供 Windows x64 版本。Windows 可能会弹 SmartScreen 提示「未知发布者」——应用目前没有做代码签名，点「仍要运行」即可；介意的话可以自己从源码构建。

> [!WARNING]
> 请只从本仓库的 Releases 页面下载安装包，不要使用任何第三方转载的版本。

## 配置

`.env` 只留服务级参数，其他全在网页。

```ini
PORT=3000
HOST=127.0.0.1
ADMIN_TOKEN=一串长随机
MODEL_MAP=gpt-4o-mini=内部名,claude-sonnet=claude-3-5-sonnet-20241022
DATA_DIR=           # 空 = <仓库>/data，桌面端 = userData/localapi-data
```

> [!WARNING]
> `HOST=0.0.0.0` 会暴露到局域网。默认 `127.0.0.1` 最稳，别乱改。

## 面板怎么用

密钥：建、禁用、删，看请求数与 token 累计。`sk-lapi-` + 48 位 hex，库里只存 `key_hash`。

渠道：名称/提供商/地址/API Key/模型/单价/主题/图标/注入。`测试` 会 `GET /models` 探活。余额徽章 `实时` 或 `估算`，额度在商城充值里本地加。

分组：倍率、限模型、系统提示词、强制遵守。`默认` 删不掉，删分组会把密钥甩回默认。`破甲` 自带授权安全测试提示词。

参数模板：预置 `破甲/编码/极致` 3 套，绑到分组后缺啥补啥，已有值不覆盖。

本地 MD：设置 -> 本地 MD 系统提示词 -> 选文件 -> 保存。开关、文件名、更新时间、字符数、预览折叠都在。全局的，跟分组叠加。

使用记录：今天/7 天/30 天/自定义，密钥/渠道/分组筛选，CSV 导出，缓存命中列与 hit 率。

## 接口

中转（`Authorization: Bearer sk-lapi-xxx`）：

```
GET  /v1/models
POST /v1/chat/completions   # stream: true 走 text/event-stream
POST /v1/completions
POST /v1/embeddings
```

管理（`x-admin-token: $ADMIN_TOKEN`）：

```
GET/POST/PATCH/DELETE /admin/keys /admin/groups /admin/channels /admin/params
GET /admin/usage?from&to&keyId&channelId&page&size
GET /admin/usage/summary?from&to&keyId&channelId&groupId
GET /admin/usage/export
GET /admin/stats
GET/PUT /admin/settings/md
```

> [!NOTE]
> 桌面 `preload.ts` 暴露 `window.localapi.getAppInfo()` 拿版本与路径。

## 目录

```
server/   后端 Express + node:sqlite  (relay/admin/billing/protocol)
  src/    config/db/relay/protocol/billing/admin/util
  tests/  api.test.ts + protocol.test.ts  18 用例
web/      前端 Vue 3 + Element Plus + ECharts + Iconify
  src/constants/  catalog/providers/prompts/apiStyles
desktop/  Electron 主进程/预加载/托盘/打包
tools/    mock 上游 + 冒烟/验证脚本
data/     SQLite，gitignored
release/  打包产物，gitignored
```

## 开发

```bash
pnpm test                         # 后端 18/18
pnpm --dir web run typecheck
pnpm --dir desktop build
pnpm build:desktop                # server + web + desktop 一起
pnpm dist:desktop                 # 解压版在 release/win-unpacked
```

见 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [AGENTS.md](AGENTS.md)。无装饰注释，禁 emoji 用 SVG，语法极简。提交 `feat: ... (#123)`。

## 许可证

GPL-3.0，见 [LICENSE](LICENSE)。
