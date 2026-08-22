import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('localapi', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getAdminToken: () => ipcRenderer.invoke('auth:getToken'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onServerStatus: (cb: (s: { url: string; status: string }) => void) => {
    ipcRenderer.on('server:status', (_e, v) => cb(v))
  },
})
