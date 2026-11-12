import { useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight, CheckCircle, Eraser, FileXls } from '@phosphor-icons/react'
import type { Job, Project } from '@shared/types'
import { uid } from '@shared/factory'
import {
  ACTIVITIES,
  activity,
  cellGroup,
  groupOf,
  addWeeks,
  cellKey,
  DAYS,
  dayDate,
  dayHours,
  emptySheet,
  fmtHours,
  FULL_DAY,
  streak,
  SLOTS,
  slotTime,
  todayIndex,
  weekNo,
  weekOf,
  type Cell,
  type Timesheet
} from '@shared/timesheet'
import { api, errText } from '../api'
import { useStore } from '../store'
import { Avatar, Button, IconButton, StreakChip, cx } from '../ui'

const ROW = 22 // px per 30 minutes
const PALETTE = ['#2563eb', '#0d9488', '#9333ea', '#c2410c', '#0891b2', '#be185d', '#a16207', '#4f46e5']

interface Sel {
  d0: number
  d1: number
  s0: number
  s1: number
}

const norm = (s: Sel): Sel => ({ d0: Math.min(s.d0, s.d1), d1: Math.max(s.d0, s.d1), s0: Math.min(s.s0, s.s1), s1: Math.max(s.s0, s.s1) })
const same = (a?: Cell, b?: Cell): boolean => !!a && !!b && a.a === b.a && a.p === b.p && a.i === b.i
const fmtDay = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "p:<project id>" or "j:<job id>": what the time was for. */
const targetKey = (c: Cell): string => (c.p ? 'p:' + c.p : c.j ? 'j:' + c.j : '')

export function TimesheetPage() {
  const people = useStore((s) => s.people)
  const myId = useStore((s) => s.config?.userId ?? '')
  const projectsMap = useStore((s) => s.docs.projects)
  const jobs = useStore((s) => s.jobs)
  const person = useStore((s) => s.sheetPerson) || myId
  const week = useStore((s) => s.sheetWeek)
  const setView = useStore((s) => s.setSheetView)
  const saveCells = useStore((s) => s.saveCells)
  const prefill = useStore((s) => s.timePrefill)
  const toast = useStore((s) => s.toast)
  const fun = useStore((s) => s.fun)
  const myStreak = useStore((s) => streak(s.sheets, myId))
  const sheet: Timesheet = useStore((s) => s.sheets[person + '/' + week]) ?? emptySheet(person, week)
  const who = people.find((p) => p.id === person)
  const thisWeek = weekOf(new Date())

  const [sel, setSel] = useState<Sel | null>(null)
  // Start on the project this person has logged most to this week.
  const [draft, setDraft] = useState<Cell>(() => {
    if (prefill) return prefill
    const n: Record<string, number> = {}
    for (const c of Object.values(sheet.cells)) if (targetKey(c)) n[targetKey(c)] = (n[targetKey(c)] ?? 0) + 1
    const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0] ?? ''
    return { a: 'CM', ...(top.startsWith('p:') ? { p: top.slice(2) } : top.startsWith('j:') ? { j: top.slice(2) } : {}) }
  })
  const [weekend, setWeekend] = useState(false)
  const drag = useRef<{ d: number; s: number; moved: boolean } | null>(null)

  useEffect(() => {
    if (prefill) setDraft(prefill)
  }, [prefill])
  useEffect(() => setSel(null), [person, week])

  const hasWeekend = Object.keys(sheet.cells).some((k) => k.startsWith('5:') || k.startsWith('6:'))
  const days = DAYS.map((_, d) => d).filter((d) => d < 5 || weekend || hasWeekend)
  const colorOf = (key: string): string => {
    const ids = [...Object.keys(projectsMap).sort().map((id) => 'p:' + id), ...jobs.map((j) => 'j:' + j.id)]
    return PALETTE[Math.max(0, ids.indexOf(key)) % PALETTE.length]
  }

  // ---------- writing ----------
  const cellsIn = (s: Sel): string[] => {
    const out: string[] = []
    for (let d = s.d0; d <= s.d1; d++) for (let k = s.s0; k <= s.s1; k++) out.push(cellKey(d, k))
    return out
  }
  const fill = (): void => {
    if (!sel) return
    const act = activity(draft.a)
    if (!act) return
    if (!act.general && !draft.p && !draft.j) {
      toast('Pick the project or job number this time was for.', 'error')
      return
    }
    const cell: Cell = act.general
      ? { a: draft.a }
      : draft.p
        ? { a: draft.a, p: draft.p, ...(draft.g ? { g: draft.g } : {}) }
        : { a: draft.a, j: draft.j }
    if (person !== myId) cell.by = myId
    const keys = cellsIn(sel)
    const fullBefore = new Set(days.filter((d) => dayHours(sheet, d) >= FULL_DAY))
    saveCells(person, week, Object.fromEntries(keys.map((k) => [k, cell])))
    // A day just reached a full day's hours: a little reward, and the streak.
    const after = useStore.getState().sheets[person + '/' + week]
    const nowFull = days.filter((d) => !fullBefore.has(d) && dayHours(after, d) >= FULL_DAY)
    if (nowFull.length && person === myId) {
      fun('day')
      const n = streak(useStore.getState().sheets, myId)
      toast(n >= 2 ? `${DAYS[nowFull[0]]} is filled in. ${n} days in a row!` : `${DAYS[nowFull[0]]} is filled in. Nice one.`)
    }
    // Move on to the slot after the selection, ready for the next entry.
    if (sel.d0 === sel.d1 && sel.s1 + 1 < SLOTS) setSel({ d0: sel.d0, d1: sel.d0, s0: sel.s1 + 1, s1: sel.s1 + 1 })
    else setSel(null)
  }
  const clear = (): void => {
    if (!sel) return
    const keys = cellsIn(sel).filter((k) => sheet.cells[k])
    if (keys.length) saveCells(person, week, Object.fromEntries(keys.map((k) => [k, null])))
    setSel(null)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      if (!sel) return
      if (e.key === 'Enter') {
        e.preventDefault()
        fill()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        clear()
      } else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  // ---------- selecting with the mouse ----------
  const slotAt = (e: React.MouseEvent, el: HTMLElement): number => {
    const y = e.clientY - el.getBoundingClientRect().top
    return Math.max(0, Math.min(SLOTS - 1, Math.floor(y / ROW)))
  }
  const onDown = (d: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const s = slotAt(e, e.currentTarget)
    drag.current = { d, s, moved: false }
    setSel({ d0: d, d1: d, s0: s, s1: s })
  }
  const onMove = (d: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const s = slotAt(e, e.currentTarget)
    if (s !== drag.current.s || d !== drag.current.d) drag.current.moved = true
    setSel(norm({ d0: drag.current.d, d1: d, s0: drag.current.s, s1: s }))
  }
  useEffect(() => {
    const up = (): void => {
      const g = drag.current
      drag.current = null
      if (!g || g.moved) return
      // A plain click on an entry selects the whole entry and loads it for editing.
      const c = sheet.cells[cellKey(g.d, g.s)]
      if (!c) return
      let s0 = g.s
      let s1 = g.s
      while (s0 > 0 && same(sheet.cells[cellKey(g.d, s0 - 1)], c)) s0--
      while (s1 < SLOTS - 1 && same(sheet.cells[cellKey(g.d, s1 + 1)], c)) s1++
      setSel({ d0: g.d, d1: g.d, s0, s1 })
      setDraft({ a: c.a, p: c.p, g: cellGroup(c.p ? projectsMap[c.p] : undefined, c), j: c.j })
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [sheet])

  // ---------- blocks: runs of identical slots ----------
  const blocks = (d: number): { s0: number; s1: number; c: Cell }[] => {
    const out: { s0: number; s1: number; c: Cell }[] = []
    for (let s = 0; s < SLOTS; s++) {
      const c = sheet.cells[cellKey(d, s)]
      if (!c) continue
      const last = out[out.length - 1]
      if (last && last.s1 === s - 1 && same(last.c, c)) last.s1 = s
      else out.push({ s0: s, s1: s, c })
    }
    return out
  }

  const total = Object.keys(sheet.cells).length / 2
  const today = week === thisWeek ? todayIndex() : -1
  const exportWeek = async (): Promise<void> => {
    try {
      const f = await api().exportTimesheets(week)
      if (f) toast('Exported the timesheets for week ' + weekNo(week))
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  return (
    <div className="flex h-full min-w-0">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="flex flex-wrap items-center gap-3 px-8 pt-7 pb-4">
          <Avatar person={who} size={34} />
          <div className="mr-auto">
            <h1 className="text-[22px] font-semibold tracking-tight">{person === myId ? 'My timesheet' : `${who?.name ?? ''}'s timesheet`}</h1>
            <p className="text-muted">
              Week {weekNo(week)}, {fmtDay(dayDate(week, 0))} to {fmtDay(dayDate(week, 6))}. <span className="font-mono text-ink">{fmtHours(total)}</span> logged.
              {person === myId && myStreak >= 1 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-wait-soft px-2 py-0.5 align-middle text-[12px] text-wait">
                  <StreakChip days={myStreak} /> day{myStreak === 1 ? '' : 's'} in a row
                </span>
              )}
            </p>
          </div>
          <select
            value={person}
            onChange={(e) => setView({ person: e.target.value })}
            aria-label="Whose timesheet"
            className="h-8 rounded-lg border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
          >
            {people
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === myId ? `${p.name} (me)` : p.name}
                </option>
              ))}
          </select>
          <div className="flex items-center rounded-lg border border-line bg-panel">
            <IconButton label="Previous week" onClick={() => setView({ week: addWeeks(week, -1) })}>
              <CaretLeft size={14} />
            </IconButton>
            <button
              onClick={() => setView({ week: thisWeek })}
              disabled={week === thisWeek}
              className="press h-7 px-2 text-[12.5px] font-medium text-muted enabled:hover:text-ink disabled:text-ink"
            >
              This week
            </button>
            <IconButton label="Next week" onClick={() => setView({ week: addWeeks(week, 1) })}>
              <CaretRight size={14} />
            </IconButton>
          </div>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            <input type="checkbox" checked={weekend || hasWeekend} disabled={hasWeekend} onChange={(e) => setWeekend(e.target.checked)} className="accent-[var(--accent)]" />
            Weekend
          </label>
          <Button icon={<FileXls size={15} />} onClick={exportWeek}>
            Export
          </Button>
        </div>

        {person !== myId && (
          <div className="mx-8 mb-3 rounded-lg border border-line bg-sunken px-3 py-2 text-[12.5px] text-muted">
            You're filling in {who?.name}'s timesheet. Each entry notes that you captured it.
          </div>
        )}

        <div className="px-8 pb-16">
          <div className="min-w-[640px] overflow-hidden rounded-xl border border-line bg-panel select-none">
            <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div />
              {days.map((d) => (
                <div key={d} className={cx('border-l border-line px-2.5 py-2', d === today && 'bg-accent-soft/50')}>
                  <div className={cx('text-[12.5px] font-semibold', d === today && 'text-accent')}>
                    {DAYS[d]} {dayDate(week, d).getDate()}
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11.5px] text-muted">
                    {dayHours(sheet, d) ? fmtHours(dayHours(sheet, d)) : '-'}
                    {dayHours(sheet, d) >= FULL_DAY && <CheckCircle key={dayHours(sheet, d) >= FULL_DAY ? 'full' : 'no'} size={13} weight="fill" className="pop-in text-done" aria-label="Full day" />}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height: SLOTS * ROW }}>
                {Array.from({ length: SLOTS / 2 + 1 }, (_, h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10.5px] text-faint" style={{ top: h * 2 * ROW }}>
                    {h > 0 && h < SLOTS / 2 ? slotTime(h * 2) : ''}
                  </span>
                ))}
              </div>
              {days.map((d) => (
                <div
                  key={d}
                  onMouseDown={onDown(d)}
                  onMouseMove={onMove(d)}
                  className={cx('relative cursor-cell border-l border-line', d === today && 'bg-accent-soft/20')}
                  style={{
                    height: SLOTS * ROW,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW * 2 - 1}px, var(--line) ${ROW * 2 - 1}px, var(--line) ${ROW * 2}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW - 1}px, color-mix(in oklab, var(--line) 45%, transparent) ${ROW - 1}px, color-mix(in oklab, var(--line) 45%, transparent) ${ROW}px)`
                  }}
                >
                  {blocks(d).map((b) => {
                    const act = activity(b.c.a)
                    const p = b.c.p ? projectsMap[b.c.p] : undefined
                    const grp = groupOf(p, cellGroup(p, b.c))
                    const job = b.c.j ? jobs.find((x) => x.id === b.c.j) : undefined
                    const color = colorOf(targetKey(b.c))
                    const rows = b.s1 - b.s0 + 1
                    const capt = b.c.by ? people.find((x) => x.id === b.c.by)?.name : undefined
                    return (
                      <div
                        key={b.s0}
                        title={[`${slotTime(b.s0)}-${slotTime(b.s1 + 1)}`, `${b.c.a} ${act?.label ?? ''}`, p && `${p.code} ${p.name}`, job && `${job.code} ${job.name}`, grp && (grp.name === grp.section ? grp.name : `${grp.section} / ${grp.name}`), capt && `Captured by ${capt}`].filter(Boolean).join('\n')}
                        className={cx('pointer-events-none absolute inset-x-1 overflow-hidden rounded-md px-1.5 text-[11.5px] leading-[20px]', act?.general ? 'bg-sunken text-muted' : 'text-ink')}
                        style={{
                          top: b.s0 * ROW + 1,
                          height: rows * ROW - 2,
                          ...(act?.general
                            ? { boxShadow: 'inset 3px 0 0 var(--line-strong)' }
                            : { background: `color-mix(in oklab, ${color} 13%, var(--panel))`, boxShadow: `inset 3px 0 0 ${color}` })
                        }}
                      >
                        <div className="truncate pl-1">
                          <b className="font-mono font-semibold">{b.c.a}</b> {act?.general ? act.label : (grp?.name ?? p?.name ?? (job ? job.name || job.code : ''))}
                        </div>
                        {rows > 1 && (
                          <div className="truncate pl-1 text-muted">
                            {fmtHours(rows / 2)}
                            {!act?.general && p ? ` · ${p.code || p.name}` : ''}
                            {!act?.general && job ? ` · ${job.code}` : ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {sel && d >= sel.d0 && d <= sel.d1 && (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-accent bg-accent/10"
                      style={{ top: sel.s0 * ROW, height: (sel.s1 - sel.s0 + 1) * ROW }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[12px] text-faint">Drag over the grid to select time, then fill it in on the right. Click an entry to change it. Enter fills, Delete clears.</p>
        </div>
      </div>

      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel" aria-label="Time entry">
        <Editor sel={sel} draft={draft} setDraft={setDraft} onFill={fill} onClear={clear} week={week} hasPrefill={!!prefill} />
        <Summary sheet={sheet} colorOf={colorOf} />
      </aside>
    </div>
  )
}

function Editor({
  sel,
  draft,
  setDraft,
  onFill,
  onClear,
  week,
  hasPrefill
}: {
  sel: Sel | null
  draft: Cell
  setDraft: (c: Cell) => void
  onFill: () => void
  onClear: () => void
  week: string
  hasPrefill: boolean
}) {
  const projects = Object.values(useStore((s) => s.docs.projects))
    .filter((p) => p.status !== 'delivered' || p.id === draft.p)
    .sort((a, b) => a.name.localeCompare(b.name))
  const jobs = useStore((s) => s.jobs)
    .filter((j) => !j.archived || j.id === draft.j)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  const [adding, setAdding] = useState(false)
  const act = activity(draft.a)
  const project = projects.find((p) => p.id === draft.p)
  const n = sel ? (sel.d1 - sel.d0 + 1) * (sel.s1 - sel.s0 + 1) : 0

  const label = !sel
    ? null
    : `${sel.d0 === sel.d1 ? `${DAYS[sel.d0]} ${fmtDay(dayDate(week, sel.d0))}` : `${DAYS[sel.d0]} to ${DAYS[sel.d1]}`}, ${slotTime(sel.s0)} to ${slotTime(sel.s1 + 1)}`

  return (
    <div className="space-y-4 border-b border-line p-4">
      <div>
        <h2 className="text-[14px] font-semibold">{sel ? label : 'Add time'}</h2>
        <p className="text-[12.5px] text-muted">
          {sel ? `${fmtHours(n / 2)}${sel.d0 !== sel.d1 ? ` in total, ${fmtHours((sel.s1 - sel.s0 + 1) / 2)} a day` : ''}` : hasPrefill ? 'Select the time you spent on this, then press Fill.' : 'Select time on the grid first.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-muted">Project work</div>
        <div className="flex flex-wrap gap-1">
          {ACTIVITIES.filter((a) => !a.general).map((a) => (
            <Chip key={a.code} on={draft.a === a.code} title={a.label} onClick={() => setDraft({ ...draft, a: a.code })}>
              {a.code}
            </Chip>
          ))}
        </div>
        <div className="pt-1 text-[12px] font-medium text-muted">General, not against a project</div>
        <div className="flex flex-wrap gap-1">
          {ACTIVITIES.filter((a) => a.general).map((a) => (
            <Chip key={a.code} on={draft.a === a.code} title={a.label} onClick={() => setDraft({ ...draft, a: a.code })}>
              {a.code}
            </Chip>
          ))}
        </div>
        <p className="text-[12.5px] text-ink">{act?.label}</p>
      </div>

      {act && !act.general && (
        <>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-muted">Project</span>
            <select
              value={adding ? '+add' : draft.p ? 'p:' + draft.p : draft.j ? 'j:' + draft.j : ''}
              onChange={(e) => {
                const v = e.target.value
                if (v === '+add') return setAdding(true)
                setAdding(false)
                setDraft({ a: draft.a, ...(v.startsWith('p:') ? { p: v.slice(2) } : v.startsWith('j:') ? { j: v.slice(2) } : {}) })
              }}
              className="h-9 w-full rounded-lg border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
            >
              <option value="">Choose a project</option>
              <optgroup label="Projects in the tracker">
                {projects.map((p) => (
                  <option key={p.id} value={'p:' + p.id}>
                    {p.code ? `${p.code}  ${p.name}` : p.name}
                  </option>
                ))}
              </optgroup>
              {jobs.length > 0 && (
                <optgroup label="Job numbers, no tracker">
                  {jobs.map((j) => (
                    <option key={j.id} value={'j:' + j.id}>
                      {j.name ? `${j.code}  ${j.name}` : j.code}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="+add">+ Add a job number...</option>
            </select>
          </label>
          {adding && (
            <AddJob
              projects={projects}
              onDone={(t) => {
                setAdding(false)
                if (t) setDraft({ a: draft.a, ...t })
              }}
            />
          )}
          {project && !adding && <GroupPicker project={project} value={draft.g} onChange={(g) => setDraft({ ...draft, g })} />}
        </>
      )}

      <div className="flex gap-2">
        <Button tone="primary" disabled={!sel} onClick={onFill} className="flex-1">
          Fill
        </Button>
        <Button icon={<Eraser size={14} />} disabled={!sel} onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  )
}

/** Adds a job number that has no tracker project, so time can be logged against it. */
function AddJob({ projects, onDone }: { projects: Project[]; onDone: (t?: { p?: string; j?: string }) => void }) {
  const jobs = useStore((s) => s.jobs)
  const saveJob = useStore((s) => s.saveJob)
  const toast = useStore((s) => s.toast)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase()

  const add = async (): Promise<void> => {
    const c = code.trim().toUpperCase()
    if (!c) return
    const tracked = projects.find((p) => p.code && norm(p.code) === norm(c))
    if (tracked) {
      toast(`${c} already has a tracker: ${tracked.name}. Picked it for you.`)
      return onDone({ p: tracked.id })
    }
    const known = jobs.find((j) => norm(j.code) === norm(c))
    if (known) {
      if (known.archived) await saveJob({ ...known, archived: false })
      return onDone({ j: known.id })
    }
    const job: Job = { id: uid('j'), code: c, name: name.trim() }
    if (await saveJob(job)) onDone({ j: job.id })
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-line bg-sunken/60 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <div className="text-[12.5px] font-medium">New job number</div>
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="P34/26"
          aria-label="Job number"
          className="h-8 w-24 rounded-lg border border-line bg-panel px-2 font-mono text-[13px] outline-none focus:border-accent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          aria-label="Job name"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
        />
      </div>
      <p className="text-[11.5px] text-faint">For jobs without a tracker. Everyone sees it in their list.</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" tone="quiet" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button size="sm" type="submit" tone="primary" disabled={!code.trim()}>
          Add
        </Button>
      </div>
    </form>
  )
}

function Chip({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'press h-7 rounded-md border px-2 font-mono text-[12px]',
        on ? 'border-ink bg-ink font-semibold text-bg' : 'border-line bg-panel text-ink hover:bg-hover'
      )}
    >
      {children}
    </button>
  )
}

function GroupPicker({ project, value, onChange }: { project: Project; value?: string; onChange: (id: string | undefined) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-muted">Part of the model</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-9 w-full rounded-lg border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
      >
        <option value="">Whole project</option>
        {project.sections.map((s) => (
          <optgroup key={s.id} label={s.name}>
            {s.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function Summary({ sheet, colorOf }: { sheet: Timesheet; colorOf: (key: string) => string }) {
  const projectsMap = useStore((s) => s.docs.projects)
  const jobs = useStore((s) => s.jobs)
  const cells = Object.values(sheet.cells)
  if (!cells.length) return <p className="p-4 text-[12.5px] text-faint">No time this week yet.</p>

  const byProject = new Map<string, Map<string, number>>()
  const general = new Map<string, number>()
  for (const c of cells) {
    const key = targetKey(c)
    if (activity(c.a)?.general || !key) {
      general.set(c.a, (general.get(c.a) ?? 0) + 0.5)
      continue
    }
    const m = byProject.get(key) ?? new Map<string, number>()
    const gid = cellGroup(c.p ? projectsMap[c.p] : undefined, c) ?? ''
    m.set(gid, (m.get(gid) ?? 0) + 0.5)
    byProject.set(key, m)
  }
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-5 p-4">
      <h2 className="text-[14px] font-semibold">This week</h2>
      {[...byProject.entries()].map(([key, items]) => {
        const p = key.startsWith('p:') ? projectsMap[key.slice(2)] : undefined
        const job = key.startsWith('j:') ? jobs.find((j) => j.id === key.slice(2)) : undefined
        const name = p?.name ?? (job ? job.name || job.code : 'Removed project')
        const code = p?.code ?? (job?.name ? job.code : '')
        return (
          <div key={key}>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(key) }} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {name} <span className="font-mono text-[11.5px] font-normal text-faint">{code}</span>
              </span>
              <span className="font-mono text-[12.5px]">{fmtHours(sum(items))}</span>
            </div>
            <ul className="space-y-0.5 pl-4">
              {[...items.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([gid, h]) => (
                  <li key={gid} className="flex gap-2 text-[12.5px] text-muted">
                    <span className="min-w-0 flex-1 truncate">{gid ? (groupOf(p, gid)?.name ?? 'Removed group') : job ? 'No tracker' : 'Whole project'}</span>
                    <span className="font-mono">{fmtHours(h)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )
      })}
      {general.size > 0 && (
        <div>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="size-2 shrink-0 rounded-full bg-line-strong" />
            <span className="flex-1 text-[13px] font-medium">General</span>
            <span className="font-mono text-[12.5px]">{fmtHours(sum(general))}</span>
          </div>
          <ul className="space-y-0.5 pl-4">
            {[...general.entries()].map(([a, h]) => (
              <li key={a} className="flex gap-2 text-[12.5px] text-muted">
                <span className="flex-1">{activity(a)?.label ?? a}</span>
                <span className="font-mono">{fmtHours(h)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
