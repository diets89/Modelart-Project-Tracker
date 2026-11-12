import { create } from 'zustand'
import { applyOp, type Op } from '@shared/ops'
import type { Collection, Job, Person, Project } from '@shared/types'
import { ACTIVITIES, applySheetCells, cellGroup, emptySheet, groupOfItem, weekOf, type Cell, type Timesheet } from '@shared/timesheet'
import { api, errText, type AppConfig, type UpdateState } from './api'
import { celebrate, finished, lastBy, type FunSettings, type Moment } from './fun'

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
  g?: string
}

interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
  action?: { label: string; run: () => void }
  /** Toasts with the same key replace each other instead of stacking. */
  key?: string
}

/** A shared milestone shown as a banner, e.g. "Precinct A is complete!" */
export interface Milestone {
  id: number
  title: string
  sub: string
  big: boolean
}

interface Pending {
  ops: Op[]
}

interface State {
  ready: boolean
  config: AppConfig | null
  online: boolean
  people: Person[]
  jobs: Job[]
  avatars: Record<string, string>
  milestone: Milestone | null
  fun(kind: Moment): void
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
  saveJob(j: Job): Promise<boolean>
  toast(text: string, tone?: Toast['tone'], action?: Toast['action'], key?: string): void
}

// Server copies (what is on the network drive) and edits not yet saved.
const base: Record<Collection, Record<string, Project>> = { projects: {}, templates: {} }
const pending: Record<string, Pending[]> = {}
const queues: Record<string, Promise<void>> = {}
let toastId = 0
const sheetBase: Record<string, Timesheet> = {}
const sheetPending: Record<string, Record<string, Cell | null>[]> = {}
const sheetQueues: Record<string, Promise<void>> = {}

/** True when someone has logged time on this item's group for work that goes towards the step. */
export function hasTimeFor(sheets: Record<string, Timesheet>, p: Project, itemId: string, stepId: string): boolean {
  const codes = ACTIVITIES.filter((a) => a.step === stepId).map((a) => a.code)
  const gid = groupOfItem(p, itemId)
  for (const t of Object.values(sheets))
    for (const c of Object.values(t.cells))
      if (c.p === p.id && (c.i === itemId || (gid && cellGroup(p, c) === gid)) && (!codes.length || codes.includes(c.a))) return true
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
      if (hasTimeFor(get().sheets, p, op.itemId, op.stepId)) continue
      const grp = p.sections.flatMap((s) => s.groups).find((g) => g.items.some((i) => i.id === op.itemId))
      const item = grp?.items.find((i) => i.id === op.itemId)
      const step = p.steps.find((s) => s.id === op.stepId)
      if (!grp || !item || !step) continue
      const a = ACTIVITIES.find((x) => x.step === op.stepId)?.code ?? 'MBC'
      get().toast(`${step.label} done on ${item.name}. No ${step.label.toLowerCase()} time logged on ${grp.name} yet.`, 'info', {
        label: 'Log time',
        run: () => get().openTimesheet({ prefill: { a, p: p.id, g: grp.id } })
      }, 'time-nudge')
    }
  }

  const milestone = (f: ReturnType<typeof finished>, projectName: string, sub: string): void => {
    const g = f.groups[0]
    const title = f.project ? `${projectName} is complete!` : f.groups.length > 1 ? `${f.groups.map((x) => x.name).join(' and ')} are complete!` : `${g.name} is complete!`
    get().fun(f.project ? 'project' : 'group')
    set({ milestone: { id: Date.now(), title, sub: f.project ? sub || 'Every item, every step. Well done, team.' : sub || `${g.section}, ${projectName}`, big: f.project } })
  }

  return {
    ready: false,
    config: null,
    online: true,
    people: [],
    jobs: [],
    avatars: {},
    milestone: null,
    fun(kind) {
      const c = get().config
      const s: FunSettings = { celebrations: c?.celebrations !== false, sounds: !!c?.sounds }
      celebrate(kind, s)
    },
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
        // Someone else finished a group or the whole project: tell everyone.
        if (collection === 'projects') {
          const f = finished(cur, project)
          if (f.project || f.groups.length) {
            const by = lastBy(project, f.project ? undefined : f.groups[0].id)
            if (by && by !== get().config?.userId) {
              const who = get().people.find((p) => p.id === by)?.name ?? 'Someone'
              milestone(f, project.name, `${who} ticked the last step`)
            }
          }
        }
      })
      api().onRemoved(({ collection, id }) => {
        delete base[collection][id]
        view(collection, id)
        const r = get().route
        if (r.page === 'board' && r.id === id) set({ route: { page: collection === 'projects' ? 'projects' : 'templates' } })
      })
      api().onPeople((people) => set({ people }))
      api().onJobs((jobs) => set({ jobs }))
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
      api()
        .avatars()
        .then((avatars) => set({ avatars }))
        .catch(() => {})
      set({ online: r.online, people: r.people, jobs: r.jobs ?? [], docs: { projects: { ...base.projects }, templates: { ...base.templates } }, sheets: { ...sheetBase } })
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
      const before = get().docs[c][id]
      ;(pending[key] ??= []).push(entry)
      view(c, id)
      // Rewards: a tick, confetti for a finished item, more for a group or the whole model.
      if (c === 'projects' && ops.some((o) => o.type === 'item.step')) {
        const f = finished(before, get().docs[c][id])
        if (f.project || f.groups.length) milestone(f, before.name, '')
        else get().fun(f.items.length ? 'item' : 'tick')
      }
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

    async saveJob(j) {
      try {
        set({ jobs: await api().saveJob(j) })
        return true
      } catch (e) {
        get().toast(errText(e), 'error')
        return false
      }
    },

    async savePerson(p) {
      try {
        set({ people: await api().savePerson(p) })
      } catch (e) {
        get().toast(errText(e), 'error')
      }
    },

    toast(text, tone = 'info', action, key) {
      const id = ++toastId
      set({ toasts: [...get().toasts.filter((t) => !key || t.key !== key), { id, text, tone, action, key }] })
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), action ? 9000 : tone === 'error' ? 6000 : 3500)
    }
  }
})

export const usePerson = (id: string | undefined): Person | undefined => useStore((s) => s.people.find((p) => p.id === id))
export const me = (): string => useStore.getState().config?.userId ?? ''
