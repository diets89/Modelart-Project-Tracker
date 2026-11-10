import { useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { involves, itemStatus } from '@shared/status'
import { useStore } from '../store'
import { Avatar, Empty } from '../ui'
import { ItemRow, gridCols } from '../board/ItemRow'
import { ItemPanel } from '../board/ItemPanel'

export function MyTasks() {
  const projects = Object.values(useStore((s) => s.docs.projects)).filter((p) => p.status === 'active')
  const people = useStore((s) => s.people)
  const myId = useStore((s) => s.config?.userId ?? '')
  const openItem = useStore((s) => s.openItem)
  const [who, setWho] = useState(myId)
  const [showDone, setShowDone] = useState(false)
  const person = people.find((p) => p.id === who)

  const blocks = projects
    .map((p) => ({
      p,
      rows: p.sections.flatMap((s) =>
        s.groups.flatMap((g) =>
          g.items
            .filter((i) => involves(i, who) && (showDone || itemStatus(i, p.steps).kind !== 'done'))
            .map((i) => ({ i, sub: g.name === s.name ? s.name : `${s.name} / ${g.name}` }))
        )
      )
    }))
    .filter((b) => b.rows.length)
  const total = blocks.reduce((a, b) => a + b.rows.length, 0)
  const openProject = openItem ? blocks.find((b) => b.rows.some((r) => r.i.id === openItem))?.p : undefined

  return (
    <div className="flex h-full min-w-0">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="px-8 pt-7 pb-4">
          <div className="flex items-center gap-3">
            <Avatar person={person} size={34} />
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">{who === myId ? 'My tasks' : `${person?.name ?? ''}'s tasks`}</h1>
              <p className="text-muted">
                {total} {showDone ? '' : 'open '}item{total === 1 ? '' : 's'} where {who === myId ? 'you are' : 'they are'} lead, drawing or assembly.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[13px] text-muted">
                <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[var(--accent)]" />
                Show complete
              </label>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value)}
                aria-label="Person"
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
            </div>
          </div>
        </div>
        {total === 0 ? (
          <Empty icon={<CheckCircle size={22} />} title="All clear">
            Nothing open on active projects. Items show up here when someone adds {who === myId ? 'you' : 'them'} as lead, drawing or assembly.
          </Empty>
        ) : (
          <div className="min-w-[860px] space-y-6 px-3 pb-16">
            {blocks.map(({ p, rows }) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-line bg-panel">
                <div
                  className="grid items-end gap-x-3 border-b border-line bg-sunken/50 px-4 py-2 text-[11.5px] font-medium text-muted"
                  style={{ gridTemplateColumns: gridCols(p.steps.length) }}
                >
                  <span className="text-[13.5px] font-semibold text-ink">
                    {p.name} <span className="ml-1 font-mono text-[11.5px] font-normal text-faint">{p.code}</span>
                  </span>
                  <span />
                  {p.steps.map((s) => (
                    <span key={s.id} className="text-center">
                      {s.short}
                    </span>
                  ))}
                  <span>Status</span>
                  <span>Notes</span>
                </div>
                {rows.map(({ i, sub }) => (
                  <ItemRow key={i.id} project={p} collection="projects" item={i} subtitle={sub} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {openItem && openProject && <ItemPanel project={openProject} collection="projects" itemId={openItem} />}
    </div>
  )
}
