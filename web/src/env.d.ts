/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface Window {
  localapi?: {
    getAppInfo: () => Promise<{ version: string; dataDir: string; serverUrl: string; logPath: string; isPackaged: boolean }>
    getAdminToken: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    onServerStatus: (cb: (s: { url: string; status: string }) => void) => void
  }
}