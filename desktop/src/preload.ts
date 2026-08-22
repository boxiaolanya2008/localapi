import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('localapi', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onServerStatus: (cb: (s: { url: string; status: string }) => void) => {
    ipcRenderer.on('server:status', (_e, v) => cb(v))
  },
})
