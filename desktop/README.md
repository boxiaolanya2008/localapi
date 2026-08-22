# LocalAPI Desktop

Electron wrapper for LocalAPI. One click to run relay + admin panel without terminal.

## Dev

```bash
pnpm install
pnpm build:desktop   # server + web + desktop tsc
pnpm desktop         # electron with local server
```

## Dist

```bash
pnpm dist:desktop   # --dir, unpacked at release/win-unpacked
pnpm --dir desktop dist   # full NSIS + portable
```

`release/` is gitignored. Icons at `desktop/build/icon.png`.

## How it works

- `src/main.ts` spawns `node server/dist/index.js` with `DATA_DIR=app.getPath('userData')/localapi-data`
- Waits for `http://127.0.0.1:3000`, loads it in BrowserWindow
- Tray + menu: show window / open browser / open data dir

## Notes

- First run generates `DATA_DIR/.admin_token` if `ADMIN_TOKEN` not set. Check `desktop.log` next to it.
- Keep `127.0.0.1` only, never `0.0.0.0`.
