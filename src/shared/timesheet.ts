import type { Project } from './types'

// Timesheets: one file per person per week, made of 30-minute slots, like the Excel sheets.
// Kept apart from project files so time entry never touches project tracking.

export interface Activity {
  code: string
  label: string
  /** General time (admin, lunch, out, quoting) doesn't count against a project. */
  general: boolean
  /** The project step this work goes towards, used to check time against ticked steps. */
  step?: string
}

export const ACTIVITIES: Activity[] = [
  { code: 'CM', label: 'Computer Model', general: false, step: 'draw' },
  { code: 'CM Art', label: 'CM Artwork', general: false, step: 'draw' },
  { code: 'Mch', label: 'Machining', general: false, step: 'mach' },
  { code: 'Pnt', label: 'Printing', general: false, step: 'mach' },
  { code: 'MBC', label: 'Model Building Construction', general: false, step: 'assy' },
  { code: 'P/F', label: 'Paint & Finish', general: false, step: 'assy' },
  { code: 'P/L', label: 'Plant & Landscaping', general: false, step: 'assy' },
  { code: 'LI', label: 'Lighting', general: false, step: 'assy' },
  { code: 'FDC', label: 'Frame, Dust Cover etc', general: false },
  { code: 'FPM', label: 'Freight Pack Model', general: false, step: 'inst' },
  { code: 'QT', label: 'Quoting', general: true },
  { code: 'AG', label: 'Admin General', general: true },
  { code: 'SM', label: 'Studio Maintenance', general: true },
  { code: 'OM', label: 'Out Modelart', general: true },
  { code: 'OP', label: 'Out Personal', general: true },
  { code: 'L/T', label: 'Lunch / Tea Time', general: true }
]

export const activity = (code: string): Activity | undefined => ACTIVITIES.find((a) => a.code === code)

/** Day starts 06:00, ends 19:00, in 30-minute slots. */
export const FIRST_HOUR = 6
export const SLOTS = 26
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface Cell {
  /** Activity code */
  a: string
  /** Project id (project work only) */
  p?: string
  /** Group id (e.g. Topography). Time is logged per group. */
  g?: string
  /** Item id: only on entries from before time was logged per group */
  i?: string
  /** Job id, for a job number with no tracker project */
  j?: string
  /** Who captured it, when not the person themself */
  by?: string
}

export interface Timesheet {
  person: string
  week: string // "2026-W46"
  /** Keyed "day:slot", day 0 = Monday, slot 0 = 06:00-06:30 */
  cells: Record<string, Cell>
  rev: number
  updatedAt: string
}

export const cellKey = (day: number, slot: number): string => `${day}:${slot}`

export function slotTime(slot: number): string {
  const m = FIRST_HOUR * 60 + slot * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`
}

export function emptySheet(person: string, week: string): Timesheet {
  return { person, week, cells: {}, rev: 0, updatedAt: '' }
}

/** Sets or clears cells. Applied on the latest copy from the network drive. */
export function applySheetCells(t: Timesheet, cells: Record<string, Cell | null>, at: string): void {
  for (const [k, v] of Object.entries(cells)) {
    if (v) t.cells[k] = v
    else delete t.cells[k]
  }
  t.rev = (t.rev ?? 0) + 1
  t.updatedAt = at
}

// ---------- weeks (ISO: Monday start, week 1 holds the first Thursday) ----------
export function weekOf(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

/** Local date of the Monday that starts the week. */
export function weekStart(week: string): Date {
  const [y, w] = week.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4)
  const mon = new Date(jan4)
  mon.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1) + (w - 1) * 7)
  return mon
}

export function dayDate(week: string, day: number): Date {
  const d = weekStart(week)
  d.setDate(d.getDate() + day)
  return d
}

export function addWeeks(week: string, n: number): string {
  const d = weekStart(week)
  d.setDate(d.getDate() + n * 7)
  return weekOf(d)
}

export const weekNo = (week: string): number => Number(week.split('-W')[1])

/** Day index of a date, 0 = Monday. */
export function todayIndex(d = new Date()): number {
  return (d.getDay() + 6) % 7
}

// ---------- totals ----------
export const hours = (slots: number): number => slots / 2

export function fmtHours(h: number): string {
  if (h > 0 && h < 1) return '30m'
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h30`
}

export function dayHours(t: Timesheet | undefined, day: number): number {
  if (!t) return 0
  let n = 0
  for (const k of Object.keys(t.cells)) if (k.startsWith(day + ':')) n++
  return hours(n)
}

// ---------- groups ----------
/** The group an entry is for. Older entries name an item, so use that item's group. */
export function cellGroup(p: Project | undefined, c: Cell): string | undefined {
  if (c.g) return c.g
  if (!p || !c.i) return undefined
  for (const s of p.sections) for (const g of s.groups) if (g.items.some((i) => i.id === c.i)) return g.id
  return undefined
}

export function groupOf(p: Project | undefined, groupId: string | undefined): { name: string; section: string } | undefined {
  if (!p || !groupId) return undefined
  for (const s of p.sections) for (const g of s.groups) if (g.id === groupId) return { name: g.name, section: s.name }
  return undefined
}

export function groupOfItem(p: Project, itemId: string): string | undefined {
  for (const s of p.sections) for (const g of s.groups) if (g.items.some((i) => i.id === itemId)) return g.id
  return undefined
}

// ---------- streaks ----------
/** Hours that count as a filled-in day. */
export const FULL_DAY = 7

/** Weekdays in a row with a full day logged. Today only counts once it is filled in. */
export function streak(sheets: Record<string, Timesheet>, person: string, now = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  let n = 0
  for (let k = 0; k < 400; k++) {
    const day = todayIndex(d)
    const h = dayHours(sheets[person + '/' + weekOf(d)], day)
    if (day < 5) {
      if (h >= FULL_DAY) n++
      else if (k > 0) break
    }
    d.setDate(d.getDate() - 1)
  }
  return n
}
