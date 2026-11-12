import { create } from 'zustand'
import { applyOp, type Op } from '@shared/ops'
import type { Collection, Person, Project } from '@shared/types'
import { ACTIVITIES, applySheetCells, emptySheet, weekOf, type Cell, type Timesheet } from '@shared/timesheet'
import { api, errText, type AppConfig, type UpdateState } from './api'

export type Route =
  | { page: 'projects' }
  | { page: 'board'; collection: Collection; id: string }
  | { page: 'mine' }
  | { page: 'templates' }
  | { page: 'settings' }
  | { page: 'timesheet' }

/** What the timesheet editor starts with, e.g. after "Log time" on a ticked step. */
export interface TimePrefill {
  a: string
  p?: string
  i?: string
}

interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
}

interface Pending {
  ops: Op[]
}

interface State {
  ready: boolean
  config: AppConfig | null
  online: boolean
  people: Person[]
  docs: Record<Collection, Record<string, Project>>
  route: Route
  openItem: string | null
  saving: number
  toasts: Toast[]
  update: UpdateState
  dark: boolean
  /** Timesheets keyed "person/week" */
  sheets: Record<string, Timesheet>
  sheetPerson: string
  sheetWeek: string
  timePrefill: TimePrefill | null
  openTimesheet(opts?: { person?: string; week?: string; prefill?: TimePrefill }): void
  setSheetView(v: { person?: string; week?: string }): void
  saveCells(person: string, week: string, cells: Record<string, Cell | null>): void
  init(): Promise<void>
  reload(): Promise<void>
  setConfig(patch: Partial<AppConfig>): Promise<void>
  go(r: Route): void
  setOpenItem(id: string | null): void
  dispatch(c: Collection, id: string, ops: Op[]): void
  createDoc(c: Collection, p: Project): Promise<boolean>
  removeDoc(c: Collection, id: string): Promise<void>
  savePerson(p: Person): Promise<void>
  toast(text: string, tone?: Toast['tone'], action?: Toast['action']): void
}

// Server copies (what is on the network drive) and edits not yet saved.
const base: Record<Collection, Record<string, Project>> = { projects: {}, templates: {} }
const pending: Record<string, Pending[]> = {}
const queues: Record<string, Promise<void>> = {}
let toastId = 0
const sheetBase: Record<string, Timesheet> = {}
const sheetPending: Record<string, Record<string, Cell | null>[]> = {}
const sheetQueues: Record<string, Promise<void>> = {}

/** True when someone has logged time on this item for work that goes towards the step. */
export function hasTimeFor(sheets: Record<string, Timesheet>, itemId: string, stepId: string): boolean {
  const codes = ACTIVITIES.filter((a) => a.step === stepId).map((a) => a.code)
  for (const t of Object.values(sheets))
    for (const c of Object.values(t.cells)) if (c.i === itemId && (!codes.length || codes.includes(c.a))) return true
  return false
}

export const useStore = create<State>((set, get) => {
  const view = (c: Collection, id: string): void => {
    const b = base[c][id]
    const key = c + '/' + id
    const docs = { ...get().docs, [c]: { ...get().docs[c] } }
    if (!b) delete docs[c][id]
    else if (!pending[key]?.length) docs[c][id] = b
    else {
      const p = structuredClone(b)
      const stamp = { by: get().config?.userId ?? '', at: new Date().toISOString() }
      for (const e of pending[key])
        for (const op of e.ops)
          try {
            applyOp(p, op, stamp)
          } catch {
            /* will be reported when the save comes back */
          }
      docs[c][id] = p
    }
    set({ docs })
  }

  const applyTheme = (): void => {
    const t = get().config?.theme ?? 'system'
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    set({ dark })
  }

  const sheetView = (key: string): void => {
    const b = sheetBase[key]
    const [person, week] = key.split('/')
    const t = structuredClone(b ?? emptySheet(person, week))
    for (const cells of sheetPending[key] ?? []) applySheetCells(t, cells, t.updatedAt)
    set({ sheets: { ...get().sheets, [key]: t } })
  }

  // Ticking a step done: nudge if nobody has logged time for it yet. People forget, that's all.
  const checkTime = (c: Collection, id: string, ops: Op[]): void => {
    if (c !== 'projects') return
    const p = get().docs.projects[id]
    if (!p) return
    for (const op of ops) {
      if (op.type !== 'item.step' || op.mark !== 'done') continue
      if (hasTimeFor(get().sheets, op.itemId, op.stepId)) continue
      const item = p.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((i) => i.id === op.itemId)
      const step = p.steps.find((s) => s.id === op.stepId)
      if (!item || !step) continue
      const a = ACTIVITIES.find((x) => x.step === op.stepId)?.code ?? 'MBC'
      get().toast(`No time logged for ${step.label} on ${item.name} yet.`, 'info', {
        label: 'Log time',
        run: () => get().openTimesheet({ prefill: { a, p: p.id, i: item.id } })
      })
    }
  }

  return {
    ready: false,
    config: null,
    online: true,
    people: [],
    docs: { projects: {}, templates: {} },
    route: { page: 'projects' },
    openItem: null,
    saving: 0,
    toasts: [],
    update: { state: 'idle' },
    dark: false,
    sheets: {},
    sheetPerson: '',
    sheetWeek: weekOf(new Date()),
    timePrefill: null,

    openTimesheet(opts = {}) {
      set({
        route: { page: 'timesheet' },
        openItem: null,
        sheetPerson: opts.person ?? (get().sheetPerson || get().config?.userId || ''),
        sheetWeek: opts.week ?? (opts.prefill ? weekOf(new Date()) : get().sheetWeek),
        timePrefill: opts.prefill ?? null
      })
    },
    setSheetView(v) {
      set({ sheetPerson: v.person ?? get().sheetPerson, sheetWeek: v.week ?? get().sheetWeek })
    },
    saveCells(person, week, cells) {
      if (!get().online) {
        get().toast('The network folder is not reachable, so changes are paused.', 'error')
        return
      }
      const key = person + '/' + week
      ;(sheetPending[key] ??= []).push(cells)
      sheetView(key)
      set({ saving: get().saving + 1 })
      sheetQueues[key] = (sheetQueues[key] ?? Promise.resolve()).then(async () => {
        try {
          sheetBase[key] = await api().applySheet(person, week, cells)
        } catch (e) {
          get().toast(errText(e), 'error')
        } finally {
          sheetPending[key] = sheetPending[key].filter((x) => x !== cells)
          sheetView(key)
          set({ saving: get().saving - 1 })
        }
      })
    },

    async init() {
      const config = await api().getConfig()
      set({ config })
      applyTheme()
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
      api().onChanged(({ collection, project }) => {
        const cur = base[collection][project.id]
        if (cur && (project.rev ?? 0) < (cur.rev ?? 0)) return
        base[collection][project.id] = project
        view(collection, project.id)
      })
      api().onRemoved(({ collection, id }) => {
        delete base[collection][id]
        view(collection, id)
        const r = get().route
        if (r.page === 'board' && r.id === id) set({ route: { page: collection === 'projects' ? 'projects' : 'templates' } })
      })
      api().onPeople((people) => set({ people }))
      api().onOnline((online) => {
        set({ online })
        get().toast(online ? 'Network folder is back. Changes are saving again.' : 'Lost the network folder. Showing the last copy, read only.', online ? 'info' : 'error')
        if (online) get().reload()
      })
      api().onUpdate((update) => set({ update }))
      api().onSheet((t) => {
        const key = t.person + '/' + t.week
        if (sheetBase[key] && t.rev < sheetBase[key].rev) return
        sheetBase[key] = t
        sheetView(key)
      })
      api().onNavigate((r) => r.page === 'timesheet' && get().openTimesheet({ week: weekOf(new Date()), person: get().config?.userId }))
      await get().reload()
      set({ ready: true })
    },

    async reload() {
      const r = await api().load()
      base.projects = Object.fromEntries(r.projects.map((p) => [p.id, p]))
      base.templates = Object.fromEntries(r.templates.map((p) => [p.id, p]))
      const sheets = await api().loadSheets()
      for (const k of Object.keys(sheetBase)) delete sheetBase[k]
      for (const t of sheets) sheetBase[t.person + '/' + t.week] = t
      set({ online: r.online, people: r.people, docs: { projects: { ...base.projects }, templates: { ...base.templates } }, sheets: { ...sheetBase } })
    },

    async setConfig(patch) {
      await api().setConfig(patch)
      set({ config: { ...get().config!, ...patch } })
      if (patch.theme) applyTheme()
      if (patch.dataDir !== undefined) await get().reload()
    },

    go(route) {
      set({ route, openItem: null })
    },
    setOpenItem(openItem) {
      set({ openItem })
    },

    dispatch(c, id, ops) {
      if (!get().online) {
        get().toast('The network folder is not reachable, so changes are paused.', 'error')
        return
      }
      checkTime(c, id, ops)
      const key = c + '/' + id
      const entry: Pending = { ops }
      ;(pending[key] ??= []).push(entry)
      view(c, id)
      set({ saving: get().saving + 1 })
      queues[key] = (queues[key] ?? Promise.resolve()).then(async () => {
        try {
          const r = await api().apply(c, id, ops)
          base[c][id] = r.project
          for (const e of r.errors) get().toast(e, 'error')
        } catch (e) {
          get().toast(errText(e), 'error')
        } finally {
          pending[key] = pending[key].filter((x) => x !== entry)
          view(c, id)
          set({ saving: get().saving - 1 })
        }
      })
    },

    async createDoc(c, p) {
      try {
        const saved = await api().create(c, p)
        base[c][saved.id] = saved
        view(c, saved.id)
        return true
      } catch (e) {
        get().toast(errText(e), 'error')
        return false
      }
    },

    async removeDoc(c, id) {
      try {
        await api().remove(c, id)
        delete base[c][id]
        view(c, id)
      } catch (e) {
        get().toast(errText(e), 'error')
      }
    },

    async savePerson(p) {
      try {
        set({ people: await api().savePerson(p) })
      } catch (e) {
        get().toast(errText(e), 'error')
      }
    },

    toast(text, tone = 'info', action) {
      const id = ++toastId
      set({ toasts: [...get().toasts, { id, text, tone, action }] })
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), action ? 9000 : tone === 'error' ? 6000 : 3500)
    }
  }
})

export const usePerson = (id: string | undefined): Person | undefined => useStore((s) => s.people.find((p) => p.id === id))
export const me = (): string => useStore.getState().config?.userId ?? ''
