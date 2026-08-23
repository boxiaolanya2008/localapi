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

> [!NOTE]
> 安装包只提供 Windows x64 版本。Windows 可能会弹 SmartScreen 提示「未知发布者」——应用目前没有做代码签名，点「仍要运行」即可；介意的话可以自己从源码构建。

> [!WARNING]
> 请只从本仓库的 Releases 页面下载安装包，不要使用任何第三方转载的版本。
