# AGENTS.md — Package: desktop

## Overview

Electron wrapper for LocalAPI. Starts the Express+SQLite relay as a child process and hosts the Vue admin in a BrowserWindow. Data lives in `app.getPath('userData')`.

## Dependencies

- `electron`: main process, BrowserWindow, Tray
- `electron-builder`: NSIS/portable/dmg/AppImage
- `typescript`: build `src/*.ts` → `dist/`

## Exports

- `src/main.ts` — Electron entry, server lifecycle, window/tray/menu
- `src/preload.ts` — contextBridge `window.localapi`

## Internal Modules

- `src/main.ts` — resolves `server/dist/index.js` via `extraResources`, spawns `node server/index.js` with `DATA_DIR=app.getPath('userData')`, waits for `/admin/settings`, loads `http://127.0.0.1:3000`
- `src/preload.ts` — `getAppInfo / openExternal / onServerStatus`

## Tests

No desktop unit tests. Verify via:
```bash
pnpm --dir desktop build
pnpm --dir server build && pnpm --dir web build
pnpm --dir desktop pack   # --dir, no installer
```

## Coding Rules

- No ornamental comments, no emoji
- Minimal syntax, stdlib first

> [!WARNING]
> Desktop data lives in `userData/localapi-data`, not `<repo>/data`. Don't delete the folder blindly when debugging.
