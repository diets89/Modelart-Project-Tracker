import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { Storage } from './storage'
import { exportXlsx } from './exporter'
import type { Op } from '../shared/ops'
import type { Collection, Person, Project } from '../shared/types'

interface Config {
  dataDir: string
  userId: string
  theme: 'system' | 'light' | 'dark'
}

const DEFAULT_DIR = 'Z:\\Data\\Shared Files\\Modelart Tracker'
const configPath = (): string => path.join(app.getPath('userData'), 'config.json')
let config: Config = { dataDir: '', userId: '', theme: 'system' }
let storage: Storage | null = null
let win: BrowserWindow | null = null
let online = true

async function loadConfig(): Promise<void> {
  try {
    config = { ...config, ...JSON.parse(await fs.readFile(configPath(), 'utf8')) }
  } catch {
    /* first run */
  }
  // allow pointing a test instance at another folder
  if (process.env.MAT_DATA_DIR) config.dataDir = process.env.MAT_DATA_DIR
  if (process.env.MAT_USER) config.userId = process.env.MAT_USER
  if (process.env.MAT_THEME) config.theme = process.env.MAT_THEME as Config['theme']
  if (config.dataDir) storage = new Storage(config.dataDir)
}

async function saveConfig(): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true })
  await fs.writeFile(configPath(), JSON.stringify(config, null, 1))
}

const OVERLAY = {
  light: { color: '#fafafa', symbolColor: '#3f3f46' },
  dark: { color: '#121214', symbolColor: '#d4d4d8' }
}

function applyTheme(): void {
  nativeTheme.themeSource = config.theme
  const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  try {
    win?.setTitleBarOverlay({ ...OVERLAY[mode], height: 40 })
  } catch {
    /* not supported on this platform */
  }
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

// ---------- polling the network folder for other people's changes ----------
const known: Record<string, number> = {}
async function poll(): Promise<void> {
  if (!storage) return
  const isOnline = await storage.online()
  if (isOnline !== online) {
    online = isOnline
    send('online', online)
  }
  if (!online) return
  for (const c of ['projects', 'templates'] as Collection[]) {
    const m = await storage.mtimes(c)
    for (const [id, t] of Object.entries(m)) {
      const key = c + '/' + id
      if (known[key] !== t) {
        known[key] = t
        try {
          send('changed', { collection: c, project: await storage.read(c, id) })
        } catch {
          /* mid-write, next poll gets it */
        }
      }
    }
    for (const key of Object.keys(known))
      if (key.startsWith(c + '/') && !(key.slice(c.length + 1) in m)) {
        delete known[key]
        send('removed', { collection: c, id: key.slice(c.length + 1) })
      }
  }
  const pm = await storage.peopleMtime()
  if (known['people'] !== pm) {
    known['people'] = pm
    send('people', await storage.people())
  }
}

function requireStorage(): Storage {
  if (!storage) throw new Error('No data folder chosen yet.')
  if (!online) throw new Error('The network folder is not reachable. Changes are paused until it is back.')
  return storage
}

async function markKnown(c: Collection, id: string): Promise<void> {
  const m = await storage!.mtimes(c)
  if (m[id]) known[c + '/' + id] = m[id]
}

// ---------- IPC ----------
function registerIpc(): void {
  ipcMain.handle('config:get', () => ({ ...config, defaultDir: DEFAULT_DIR, version: app.getVersion() }))
  ipcMain.handle('config:set', async (_e, patch: Partial<Config>) => {
    config = { ...config, ...patch }
    if (patch.dataDir !== undefined) {
      storage = patch.dataDir ? new Storage(patch.dataDir) : null
      if (storage) await storage.ensure()
      for (const k of Object.keys(known)) delete known[k]
    }
    if (patch.theme) applyTheme()
    await saveConfig()
    return config
  })
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], title: 'Choose the shared data folder' })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('data:load', async () => {
    if (!storage) return { online: false, projects: [], templates: [], people: [] }
    online = await storage.online()
    if (!online) return { online, projects: [], templates: [], people: [] }
    await storage.ensure()
    const projects = await storage.list('projects')
    const templates = await storage.list('templates')
    for (const { project, mtime } of projects) known['projects/' + project.id] = mtime
    for (const { project, mtime } of templates) known['templates/' + project.id] = mtime
    known['people'] = await storage.peopleMtime()
    return {
      online,
      projects: projects.map((x) => x.project),
      templates: templates.map((x) => x.project),
      people: await storage.people()
    }
  })
  ipcMain.handle('data:apply', async (_e, c: Collection, id: string, ops: Op[]) => {
    const s = requireStorage()
    const r = await s.apply(c, id, ops, config.userId)
    await markKnown(c, id)
    return r
  })
  ipcMain.handle('data:create', async (_e, c: Collection, p: Project) => {
    const s = requireStorage()
    const r = await s.create(c, p, config.userId)
    await markKnown(c, p.id)
    return r
  })
  ipcMain.handle('data:remove', async (_e, c: Collection, id: string) => {
    await requireStorage().remove(c, id, config.userId)
    delete known[c + '/' + id]
  })
  ipcMain.handle('data:activity', (_e, projectId: string) => storage?.activity(projectId) ?? [])
  ipcMain.handle('people:save', async (_e, p: Person) => {
    const list = await requireStorage().savePerson(p, config.userId || p.id)
    known['people'] = await storage!.peopleMtime()
    return list
  })
  ipcMain.handle('export:xlsx', async (_e, projectId: string) => {
    const s = requireStorage()
    const project = await s.read('projects', projectId)
    const people = await s.people()
    const r = await dialog.showSaveDialog(win!, {
      title: 'Export to Excel',
      defaultPath: path.join(app.getPath('documents'), `${project.code ? project.code.replace(/\//g, '-') + ' ' : ''}${project.name}.xlsx`),
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    })
    if (r.canceled || !r.filePath) return null
    await exportXlsx(project, people, r.filePath)
    shell.showItemInFolder(r.filePath)
    return r.filePath
  })

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { state: 'dev' }
    try {
      await autoUpdater.checkForUpdates()
      return { state: 'checking' }
    } catch (e) {
      return { state: 'error', message: String(e) }
    }
  })
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
}

function setupUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.on('update-available', (i) => send('update', { state: 'downloading', version: i.version }))
  autoUpdater.on('update-not-available', () => send('update', { state: 'latest' }))
  autoUpdater.on('download-progress', (p) => send('update', { state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => send('update', { state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => send('update', { state: 'error', message: e.message }))
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}

function createWindow(): void {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Modelart Tracker',
    backgroundColor: dark ? '#121214' : '#fafafa',
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...OVERLAY[dark ? 'dark' : 'light'], height: 40 },
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  // Dev-only screenshot hook used for automated visual checks.
  if (!app.isPackaged && process.env.MAT_SHOT) {
    win.webContents.once('did-finish-load', async () => {
      const steps = (process.env.MAT_SHOT_JS ?? '').split('|||').filter(Boolean)
      await new Promise((r) => setTimeout(r, 1500))
      const shots = process.env.MAT_SHOT!.split(',')
      for (let i = 0; i < shots.length; i++) {
        if (steps[i]) await win!.webContents.executeJavaScript(steps[i]).catch((e) => console.error(e))
        await new Promise((r) => setTimeout(r, 900))
        const img = await win!.webContents.capturePage()
        await fs.writeFile(shots[i], img.toPNG())
      }
      app.quit()
    })
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock() && !process.env.MAT_DATA_DIR) app.quit()
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(async () => {
    app.setAppUserModelId('za.co.modelart.tracker')
    if (process.env.MAT_PROFILE) app.setPath('userData', path.join(app.getPath('userData'), process.env.MAT_PROFILE))
    await loadConfig()
    registerIpc()
    createWindow()
    applyTheme()
    nativeTheme.on('updated', applyTheme)
    setupUpdater()
    setInterval(() => poll().catch(() => {}), 3000)
  })
  app.on('window-all-closed', () => app.quit())
}
