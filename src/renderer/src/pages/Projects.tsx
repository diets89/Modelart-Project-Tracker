import { useState } from 'react'
import { CalendarBlank, CubeFocus, Plus } from '@phosphor-icons/react'
import { allItems, summarize } from '@shared/status'
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
