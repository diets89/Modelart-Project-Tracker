import { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { Storage } from './storage'
import { exportXlsx, exportTimesheets } from './exporter'
import { SLOTS, todayIndex, weekOf, type Cell, type Timesheet } from '../shared/timesheet'
import type { Op } from '../shared/ops'
import type { Collection, Job, Person, Project } from '../shared/types'

interface Config {
  dataDir: string
  userId: string
  theme: 'system' | 'light' | 'dark'
  /** Whether an AI agent connected over MCP may make changes. */
  agentEdits: boolean
  /** End-of-day reminder to fill in the timesheet. */
  reminders: boolean
  reminderTime: string // "16:30"
  celebrations: boolean
  sounds: boolean
}

const DEFAULT_DIR = 'Z:\\Data\\Shared Files\\Modelart Tracker'
const configPath = (): string => path.join(app.getPath('userData'), 'config.json')
let config: Config = { dataDir: '', userId: '', theme: 'system', agentEdits: true, reminders: true, reminderTime: '16:30', celebrations: true, sounds: false }
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
  const sm = await storage.sheetMtimes()
  for (const [key, t] of Object.entries(sm)) {
    if (known['sheet/' + key] !== t) {
      known['sheet/' + key] = t
      const [person, week] = key.split('/')
      try {
        send('sheet', await storage.readSheet(person, week))
      } catch {
        /* mid-write */
      }
    }
  }
  const jm = await storage.jobsMtime()
  if (known['jobs'] !== jm) {
    known['jobs'] = jm
    send('jobs', await storage.jobs())
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

// ---------- MCP (AI agent) connection ----------
// The agent runs this app's own exe in Node mode with the bundled MCP server script.
function mcpLaunch(): { command: string; args: string[]; env: Record<string, string> } {
  const script = app.isPackaged ? path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'mcp.js') : path.join(app.getAppPath(), 'out', 'main', 'mcp.js')
  return { command: process.execPath, args: [script, ...(config.agentEdits ? [] : ['--read-only'])], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

/** Claude Desktop config files: the Microsoft Store build keeps its own copy of AppData. */
async function claudeConfigFiles(): Promise<string[]> {
  const out: string[] = []
  const local = process.env.LOCALAPPDATA ?? ''
  try {
    for (const d of await fs.readdir(path.join(local, 'Packages')))
      if (/^Claude_/i.test(d)) out.push(path.join(local, 'Packages', d, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'))
  } catch {
    /* no Store apps folder */
  }
  const classic = path.join(app.getPath('appData'), 'Claude')
  if (!out.length || (await fs.access(classic).then(() => true, () => false))) out.push(path.join(classic, 'claude_desktop_config.json'))
  return out
}

async function claudeConnected(): Promise<boolean> {
  for (const f of await claudeConfigFiles()) {
    try {
      if (JSON.parse(await fs.readFile(f, 'utf8')).mcpServers?.['modelart-tracker']) return true
    } catch {
      /* missing or unreadable */
    }
  }
  return false
}

async function connectClaude(): Promise<void> {
  for (const f of await claudeConfigFiles()) {
    let cfg: { mcpServers?: Record<string, unknown> } = {}
    try {
      const raw = await fs.readFile(f, 'utf8')
      cfg = JSON.parse(raw)
      await fs.writeFile(f + '.bak', raw)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Couldn't read ${f}. Fix or remove it, then try again.`)
    }
    cfg.mcpServers = { ...cfg.mcpServers, 'modelart-tracker': mcpLaunch() }
    await fs.mkdir(path.dirname(f), { recursive: true })
    await fs.writeFile(f, JSON.stringify(cfg, null, 2))
  }
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
    if (patch.agentEdits !== undefined && (await claudeConnected())) await connectClaude()
    await saveConfig()
    return config
  })
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], title: 'Choose the shared data folder' })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('data:load', async () => {
    if (!storage) return { online: false, projects: [], templates: [], people: [], jobs: [] }
    online = await storage.online()
    if (!online) return { online, projects: [], templates: [], people: [], jobs: [] }
    await storage.ensure()
    const projects = await storage.list('projects')
    const templates = await storage.list('templates')
    for (const { project, mtime } of projects) known['projects/' + project.id] = mtime
    for (const { project, mtime } of templates) known['templates/' + project.id] = mtime
    known['people'] = await storage.peopleMtime()
    known['jobs'] = await storage.jobsMtime()
    return {
      online,
      projects: projects.map((x) => x.project),
      templates: templates.map((x) => x.project),
      people: await storage.people(),
      jobs: await storage.jobs()
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
  ipcMain.handle('sheets:load', async () => {
    if (!storage || !online) return []
    const m = await storage.sheetMtimes()
    const out: Timesheet[] = []
    for (const [key, t] of Object.entries(m)) {
      const [person, week] = key.split('/')
      try {
        out.push(await storage.readSheet(person, week))
        known['sheet/' + key] = t
      } catch {
        /* unreadable, skip */
      }
    }
    return out
  })
  ipcMain.handle('sheets:apply', async (_e, person: string, week: string, cells: Record<string, Cell | null>) => {
    const s = requireStorage()
    const t = await s.applySheet(person, week, cells, config.userId)
    const m = await s.sheetMtimes()
    if (m[`${person}/${week}`]) known[`sheet/${person}/${week}`] = m[`${person}/${week}`]
    return t
  })
  ipcMain.handle('export:timesheets', async (_e, week: string) => {
    const s = requireStorage()
    const people = await s.people()
    const sheets: Timesheet[] = []
    for (const p of people) {
      const t = await s.readSheet(p.id, week)
      if (Object.keys(t.cells).length) sheets.push(t)
    }
    if (!sheets.length) throw new Error('Nobody has time on this week yet.')
    const projects = (await s.list('projects')).map((x) => x.project)
    const r = await dialog.showSaveDialog(win!, {
      title: 'Export timesheets',
      defaultPath: path.join(app.getPath('documents'), `Timesheets ${week}.xlsx`),
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    })
    if (r.canceled || !r.filePath) return null
    await exportTimesheets(week, sheets, people, projects, await s.jobs(), r.filePath)
    shell.showItemInFolder(r.filePath)
    return r.filePath
  })
  ipcMain.handle('data:activity', (_e, projectId: string) => storage?.activity(projectId) ?? [])
  // Profile pictures: images in <data folder>/avatars, shared by every PC.
  ipcMain.handle('avatars:list', async () => {
    if (!storage || !online) return {}
    const dir = path.join(storage.root, 'avatars')
    const out: Record<string, string> = {}
    const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
    try {
      for (const n of (await fs.readdir(dir)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
        const type = types[path.extname(n).toLowerCase()]
        if (!type) continue
        const buf = await fs.readFile(path.join(dir, n))
        if (buf.length < 2_000_000) out[n] = `data:${type};base64,${buf.toString('base64')}`
      }
    } catch {
      /* no avatars yet */
    }
    return out
  })
  ipcMain.handle('jobs:save', async (_e, j: Job) => {
    const list = await requireStorage().saveJob(j, config.userId)
    known['jobs'] = await storage!.jobsMtime()
    return list
  })
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

  ipcMain.handle('mcp:info', async () => ({ launch: mcpLaunch(), claude: await claudeConnected() }))
  ipcMain.handle('mcp:connect-claude', async () => {
    await connectClaude()
    return true
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

// ---------- end-of-day timesheet reminder ----------
let remindedOn = ''
async function remind(): Promise<void> {
  if (!config.reminders || !storage || !config.userId) return
  const now = new Date()
  const day = todayIndex(now)
  if (day > 4) return // weekdays only
  const [h, m] = (config.reminderTime || '16:30').split(':').map(Number)
  const mins = now.getHours() * 60 + now.getMinutes()
  // Only around the set time, so opening the app late at night doesn't nag.
  if (mins < h * 60 + m || mins > h * 60 + m + 120) return
  const today = now.toDateString()
  if (remindedOn === today) return
  remindedOn = today
  let slots = 0
  try {
    const t = await storage.readSheet(config.userId, weekOf(now))
    for (let s = 0; s < SLOTS; s++) if (t.cells[`${day}:${s}`]) slots++
  } catch {
    return
  }
  if (slots >= 14 || !Notification.isSupported()) return // 7 hours or more: looks filled in
  const n = new Notification({
    title: 'Fill in your timesheet',
    body: slots ? `You've logged ${slots / 2} hours today. Add the rest before you go.` : "Nothing logged for today yet. Add today's time before you go.",
    icon: path.join(__dirname, '../../resources/icon.png')
  })
  n.on('click', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    send('navigate', { page: 'timesheet' })
  })
  n.show()
  if (process.env.MAT_DEBUG) console.log('[reminder] shown, slots today:', slots)
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
    setInterval(() => remind().catch(() => {}), 30_000)
  })
  app.on('window-all-closed', () => app.quit())
}
