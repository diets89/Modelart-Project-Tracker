import { useState } from 'react'
import { CalendarBlank, Confetti, CubeFocus, Plus } from '@phosphor-icons/react'
import { allItems, itemStatus, summarize } from '@shared/status'
import { dayDate, fmtHours, weekOf, weekStart } from '@shared/timesheet'
import type { ProjectStatus } from '@shared/types'
import { useStore } from '../store'
import { Button, Empty, Progress, cx, fmtDate, fmtWhen } from '../ui'
import { NewProject } from './NewProject'

const TABS: { id: ProjectStatus | 'all'; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'hold', label: 'On hold' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'all', label: 'All' }
]

export function Projects() {
  const docs = useStore((s) => s.docs.projects)
  const go = useStore((s) => s.go)
  const [tab, setTab] = useState<ProjectStatus | 'all'>('active')
  const [creating, setCreating] = useState(false)
  const list = Object.values(docs)
    .filter((p) => tab === 'all' || p.status === tab)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.updatedAt.localeCompare(a.updatedAt))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-muted">Every model in the workshop, with live progress from the team.</p>
        </div>
        <Button tone="primary" icon={<Plus size={15} weight="bold" />} onClick={() => setCreating(true)}>
          New project
        </Button>
      </div>

      <TeamWins />

      <div className="mt-6 flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const n = Object.values(docs).filter((p) => t.id === 'all' || p.status === t.id).length
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx('-mb-px border-b-2 px-3 pb-2.5 text-[13px]', tab === t.id ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}
            >
              {t.label} <span className="ml-1 text-faint tnum">{n}</span>
            </button>
          )
        })}
      </div>

      {list.length === 0 ? (
        <Empty icon={<CubeFocus size={22} />} title={tab === 'active' ? 'No active projects' : 'Nothing here'}>
          Start a project from a template, or copy the layout of an earlier model.
        </Empty>
      ) : (
        <div className="mt-4 grid gap-2.5">
          {list.map((p) => {
            const s = summarize(allItems(p), p.steps)
            const late = p.due && p.due < today && p.status === 'active'
            return (
              <button
                key={p.id}
                onClick={() => go({ page: 'board', collection: 'projects', id: p.id })}
                className="press grid grid-cols-[minmax(0,1fr)_220px_170px_130px] items-center gap-6 rounded-xl border border-line bg-panel px-5 py-4 text-left hover:border-line-strong"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <span className="font-mono tnum">{p.code || 'No code'}</span>
                    {p.scale && <span>Scale {p.scale}</span>}
                    {p.client && <span className="truncate">{p.client}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-[16px] font-semibold tracking-tight">{p.name}</div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                    <span className="font-mono font-semibold text-ink tnum">{Math.round(s.progress * 100)}%</span>
                    <span className="text-muted tnum">
                      {s.done} of {s.total} items
                    </span>
                  </div>
                  <Progress value={s.progress} />
                </div>
                <div className="text-[12.5px]">
                  {s.waiting + s.hold > 0 ? (
                    <span className="rounded-md bg-wait-soft px-2 py-1 font-medium text-wait">{s.waiting + s.hold} waiting or on hold</span>
                  ) : (
                    <span className="text-faint">Nothing blocked</span>
                  )}
                </div>
                <div className="text-right text-[12.5px]">
                  {p.due ? (
                    <span className={cx('inline-flex items-center gap-1', late ? 'font-medium text-accent' : 'text-ink')}>
                      <CalendarBlank size={14} />
                      {late ? 'Late, ' : ''}
                      {fmtDate(p.due)}
                    </span>
                  ) : (
                    <span className="text-faint">No due date</span>
                  )}
                  <div className="mt-0.5 text-[11.5px] text-faint">Updated {fmtWhen(p.updatedAt)}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </div>
  )
}

/** What the team got done this week. Team totals only, nobody gets ranked. */
function TeamWins() {
  const projects = Object.values(useStore((s) => s.docs.projects))
  const sheets = useStore((s) => s.sheets)
  const week = weekOf(new Date())
  const since = weekStart(week).toISOString()

  let items = 0
  const groups: { name: string; project: string }[] = []
  for (const p of projects) {
    for (const s of p.sections)
      for (const g of s.groups) {
        let latest = ''
        let all = g.items.length > 1
        for (const i of g.items) {
          const done = itemStatus(i, p.steps).kind === 'done'
          const at = Object.values(i.steps).reduce((m, st) => (st.by !== 'import' && st.at > m ? st.at : m), '')
          if (done && at >= since) items++
          if (!done) all = false
          if (at > latest) latest = at
        }
        if (all && latest >= since) groups.push({ name: g.name, project: p.name })
      }
  }
  let slots = 0
  for (const t of Object.values(sheets)) if (t.week === week) slots += Object.keys(t.cells).length

  const fmt = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const quiet = !items && !groups.length && !slots
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-line bg-panel px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-done-soft text-done">
          <Confetti size={19} weight="fill" />
        </span>
        <div>
          <div className="text-[13.5px] font-semibold">This week</div>
          <div className="text-[12px] text-muted">
            {fmt(dayDate(week, 0))} to {fmt(dayDate(week, 6))}
          </div>
        </div>
      </div>
      {quiet ? (
        <p className="text-[13px] text-muted">A fresh week. The first finished items show up here.</p>
      ) : (
        <>
          <Stat n={String(items)} label={items === 1 ? 'item finished' : 'items finished'} />
          <Stat n={String(groups.length)} label={groups.length === 1 ? 'group closed off' : 'groups closed off'} />
          <Stat n={fmtHours(slots / 2)} label="logged by the team" />
          {groups.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {groups.slice(0, 6).map((g) => (
                <span key={g.project + g.name} title={g.project} className="rounded-full bg-done-soft px-2.5 py-0.5 text-[12px] font-medium text-done">
                  {g.name}
                </span>
              ))}
              {groups.length > 6 && <span className="text-[12px] text-muted">+{groups.length - 6} more</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-[18px] font-semibold tnum">{n}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  )
}
