// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const on =
  (channel: string) =>
  (cb: (payload: any) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, payload: any): void => cb(payload)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  }

const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch: unknown) => ipcRenderer.invoke('config:set', patch),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  load: () => ipcRenderer.invoke('data:load'),
  apply: (c: string, id: string, ops: unknown[]) => ipcRenderer.invoke('data:apply', c, id, ops),
  create: (c: string, p: unknown) => ipcRenderer.invoke('data:create', c, p),
  remove: (c: string, id: string) => ipcRenderer.invoke('data:remove', c, id),
  activity: (projectId: string) => ipcRenderer.invoke('data:activity', projectId),
  savePerson: (p: unknown) => ipcRenderer.invoke('people:save', p),
  exportXlsx: (projectId: string) => ipcRenderer.invoke('export:xlsx', projectId),
  mcpInfo: () => ipcRenderer.invoke('mcp:info'),
  connectClaude: () => ipcRenderer.invoke('mcp:connect-claude'),
  loadSheets: () => ipcRenderer.invoke('sheets:load'),
  applySheet: (person: string, week: string, cells: unknown) => ipcRenderer.invoke('sheets:apply', person, week, cells),
  exportTimesheets: (week: string) => ipcRenderer.invoke('export:timesheets', week),
  onSheet: on('sheet'),
  onNavigate: on('navigate'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onChanged: on('changed'),
  onRemoved: on('removed'),
  onPeople: on('people'),
  onOnline: on('online'),
  onUpdate: on('update')
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
