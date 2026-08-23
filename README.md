# LocalAPI

> Run a local OpenAI-compatible relay in one command. Point any CLI's `base_url` at `http://127.0.0.1:3000/v1` and get unified keys, unified billing, unified logs.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-0.4.0-green.svg)](CHANGELOG.md) [![Node](https://img.shields.io/badge/node-%3E%3D20-black.svg)](https://nodejs.org)

English | [中文](README-ZH-CN.md)

Local. No cloud. Your keys never leave `DATA_DIR`. One SQLite file, zero extra DB dependencies.

## Why

You have 3 upstream providers, 5 CLI tools, each with its own key. Cost is a mess. Logs are scattered. LocalAPI sits in the middle: CLI -> LocalAPI (`sk-lapi-xxx`) -> upstream. You get a single billing view, per-group multipliers, prompt injection control, and a dashboard that actually helps.

## Features

OpenAI compat: `POST /v1/chat/completions`, `/v1/completions`, `POST /v1/embeddings`, `GET /v1/models`. Stream passes through byte-for-byte. If upstream forgets `data: [DONE]`, we append it so clients don't throw `stream ended without terminal event`.

Channels, keys, models live in the web panel, not `.env`. 19 provider logos (OpenAI/Anthropic/Gemini/DeepSeek/Kimi/Qwen/Doubao/Hunyuan/GLM/Grok etc.) ship built-in; picking a provider auto-fills its base URL, or point it at any compatible endpoint. Optional `MODEL_MAP` like `gpt-4o-mini=my-internal-model` stays as an env escape hatch.

Pricing is built-in for 2026. Per-million input/output/cached price for DeepSeek V4, Kimi K3/K2 checked against official pages (marked `official`), others are `ref` — edit per channel. Creating a channel from the catalog auto-applies its prices.

Groups do the accounting. Multiplier 0.5 = half price, 1 = original, 2 = double, 0 = free (but now default armor group is 1 to avoid confusion). Each group can restrict models. Keys belong to a group, cost = `upstream_cost * multiplier`. `groupUsage` on the dashboard shows it clearly.

Protocol adapters: each channel chooses `OpenAI Chat` / `OpenAI Responses` / `Anthropic Messages` / `Custom`. LocalAPI converts bidirectionally (system messages, text, tool calls, sampling params, usage + cached tokens). Clients always speak OpenAI Chat; non-chat upstreams are called non-streaming then re-emitted as OpenAI SSE so streaming still works.

Prompts: 7 free presets + 3 premium (unlock with `LP-VIP-LOCAL-2026`). Disabled by default means 100% passthrough. When enabled, order is fixed `[Global coding rule, Group prompt, Local MD, Template system, ...your messages]` — each is a separate `system` message, never overwriting the next. Global rule forbids decorative comments for every request, it's non-negotiable.

Local MD system prompt: pick any `.md` / `.markdown` / `.txt` / `.mdx` locally in Settings, preview, save. 50k chars max. It coexists with the group prompt. Say you have a group "code" and a file `personal-rules.md` — both are injected. Toggle off and you're back to passthrough (except the global rule). No upload, just local `FileReader`.

Dashboard: Vue 3 + Element Plus + ECharts. StatCards, 7-day token line (big numbers as 2.70M), channel pie, model bar, group cost, channel balance (live from `dashboard/billing/credit_grants` with 60s TTL, or local estimate `credit - sum(cost)`).

Desktop: Electron shell in `desktop/`. One double-click starts the relay + window, tray stays resident, data lives in `app.getPath('userData')/localapi-data`. First run generates `ADMIN_TOKEN` to `DATA_DIR/.admin_token`. No terminal needed. `NOTE`: still listens on `127.0.0.1` only.

Storage: `node:sqlite` WAL mode, no extra deps. Schema auto-migrates via `ensureColumn`.

## Install

Requires Node 20+ and pnpm 11+.

```bash
pnpm install
cp .env.example .env   # then edit ADMIN_TOKEN, really
```
> [!IMPORTANT]
> Change `ADMIN_TOKEN`. Default `change-me-...` is a placeholder. Don't expose to LAN without setting it.

## Quick Start

```bash
pnpm start            # 一键启动(生产):后端 + 前端静态页,单端口 3000
pnpm dev              # 开发模式:后端 3000 + 前端 5173 (默认仅 Web，不含桌面端)
pnpm desktop          # 桌面端: Electron 壳(自带服务，无需另起 pnpm dev)
pnpm watch            # 自研热更新:文件一保存自动重编并重启后端/重建前端
pnpm demo             # 另开一个终端起本地 mock 上游(端口4000,零成本试跑)
```

> [!NOTE]
> 默认 `pnpm dev` 仅启动 Web，需要桌面端时用 `pnpm desktop` 或 `pnpm dev:desktop`；`pnpm dev:all` 会同时启动 server+web+desktop（一般不需要，桌面端已内置服务）。

一次只敲一条命令。日常用 `pnpm start` 就够了;`.env` 里 BASE_URL 指向 mock 时,先 `pnpm demo` 再 `pnpm start`。

Point a CLI at LocalAPI:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:3000/v1
export OPENAI_API_KEY=sk-lapi-xxx   # create in web panel -> Keys
```

Open `http://127.0.0.1:3000`, enter `ADMIN_TOKEN`. First time: Catalog -> Add as channel -> paste upstream API key -> Save; Keys -> New key -> pick a group -> give that `sk-lapi-xxx` to your CLI.

Desktop: download `LocalAPI-0.4.0-*.exe` or `portable` from [Releases](https://github.com/boxiaolanya2008/localapi/releases/tag/v0.4.0), install, tray icon -> Show. Data and logs are under `userData/localapi-data/desktop.log`.

## Configuration

Only these live in `.env`. Everything else is in the panel.

```ini
PORT=3000
HOST=127.0.0.1
ADMIN_TOKEN=your-long-random-string
MODEL_MAP=gpt-4o-mini=my-model,claude-sonnet=claude-3-5-sonnet-20241022
DATA_DIR=           # empty = <repo>/data, desktop = userData/localapi-data
```

> [!WARNING]
> `HOST=0.0.0.0` exposes the relay to LAN. Keep `127.0.0.1` unless you know what you're doing. `ADMIN_TOKEN` is the only auth for `/admin`.

## Using the Panel

Keys: create, disable, delete, see request count + token totals. Key is `sk-lapi-` + 48 hex, stored as `key_hash` only for lookup.

Channels: name/provider/base_url/api_key/models/price/theme/icon/inject. `Test` pings `GET /models`. Balance badge shows `live` or `estimate`. `Credit` is your manual top-up via Shop -> Recharge (local, no payment).

Groups: multiplier + model allowlist + system prompt + force obey. `Default` cannot be deleted; deleting a group reassigns its keys to `Default`. `Armor` group seeds with an authorized pentest prompt.

Params: 3 presets `armor/coding/ultimate` shipped. Bind a preset to a group; missing request params are backfilled, explicit values win.

Local MD: Settings -> Local MD system prompt -> Choose file -> Save. Toggle, preview, clear. Not per-group, it's global and never overwrites the group's prompt.

Usage: time presets Today/7d/30d/custom, filters by key/channel/group, CSV export, cached tokens column with hit rate.

## API

Relay (needs `Authorization: Bearer sk-lapi-xxx`):

```
GET  /v1/models
POST /v1/chat/completions   # stream: true -> text/event-stream
POST /v1/completions
POST /v1/embeddings
```

Admin (needs `x-admin-token: $ADMIN_TOKEN`):

```
GET/POST/PATCH/DELETE /admin/keys, /admin/groups, /admin/channels, /admin/params
GET /admin/usage?from&to&keyId&channelId&page&size
GET /admin/usage/summary?from&to&keyId&channelId&groupId
GET /admin/usage/export   # CSV
GET /admin/stats          # today/total/7d/byChannel/byModel/byGroup/topKeys/balance
GET/PUT /admin/settings/md
```

> [!NOTE]
> Desktop's `preload.ts` exposes `window.localapi.getAppInfo()` for version/dataDir/serverUrl.

## Structure

```
server/   Express + node:sqlite  (relay/admin/billing/protocol)
  src/    config/db/relay/protocol/billing/admin/util
  tests/  api.test.ts + protocol.test.ts  (18 tests)
web/      Vue 3 + Element Plus + ECharts + Iconify
  src/constants/  catalog/providers/prompts/apiStyles
desktop/  Electron main/preload, tray, builder (nsis/portable)
tools/    mock-upstream + smoke/verify scripts
data/     SQLite, gitignored
release/  electron-builder output, gitignored
```

## Develop

```bash
pnpm test                         # server tests 18/18
pnpm --dir web run typecheck
pnpm --dir desktop build          # tsc desktop
pnpm build:desktop                # server + web + desktop
pnpm dist:desktop                 # unpacked at release/win-unpacked
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Code style: no ornamental comments, no emoji (SVG via Iconify), minimal syntax. Commit `feat: ... (#123)`.

## License

GPL-3.0, see [LICENSE](LICENSE).
