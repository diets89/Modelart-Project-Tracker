import { useEffect, useState } from 'react'
import { Trash, X } from '@phosphor-icons/react'
import { itemStatus } from '@shared/status'
import { FLAG_LABELS, type ActivityEntry, type Collection, type Flag, type Project, type StepMark } from '@shared/types'
import type { Op } from '@shared/ops'
import { api } from '../api'
import { useStore } from '../store'
import { Avatar, Button, IconButton, InlineEdit, PeoplePicker, StatusChip, confirmDelete, cx, fmtWhen } from '../ui'

const MARKS: { id: StepMark | null; label: string }[] = [
  { id: null, label: 'Not started' },
  { id: 'started', label: 'Started' },
  { id: 'done', label: 'Done' },
  { id: 'na', label: 'N/A' }
]

export function ItemPanel({ project, collection, itemId }: { project: Project; collection: Collection; itemId: string }) {
  const dispatch = useStore((s) => s.dispatch)
  const setOpenItem = useStore((s) => s.setOpenItem)
  const people = useStore((s) => s.people)
  const item = project.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((i) => i.id === itemId)
  const group = project.sections.flatMap((s) => s.groups.map((g) => ({ s, g }))).find(({ g }) => g.items.some((i) => i.id === itemId))
  const [history, setHistory] = useState<ActivityEntry[]>([])
  const template = project.kind === 'template'

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setOpenItem(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setOpenItem])

  useEffect(() => {
    if (template) return
    api()
      .activity(project.id)
      .then((a) => setHistory(a.filter((e) => e.itemId === itemId).slice(0, 30)))
  }, [project.id, itemId, item?.updatedAt, template])

  if (!item) return null
  const op = (ops: Parameters<typeof dispatch>[2]): void => dispatch(collection, project.id, ops)
  const update = (patch: Extract<Op, { type: 'item.update' }>['patch']): void => op([{ type: 'item.update', itemId: item.id, patch }])
  const status = itemStatus(item, project.steps)

  return (
    <aside className="slide-in flex w-[400px] shrink-0 flex-col border-l border-line bg-panel" aria-label="Item details">
      <div className="flex items-start gap-2 border-b border-line px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="truncate px-2 text-[12px] text-muted">
            {group?.s.name}
            {group && group.g.name !== group.s.name && ` / ${group.g.name}`}
          </div>
          <InlineEdit value={item.name} onCommit={(name) => name && update({ name })} className="text-[16px] font-semibold" />
        </div>
        <IconButton label="Close" onClick={() => setOpenItem(null)}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {!template && (
          <div className="flex items-center justify-between px-2">
            <StatusChip status={status} />
            <select
              value={item.flag ?? ''}
              onChange={(e) => update({ flag: (e.target.value || null) as Flag | null })}
              aria-label="Flag"
              className="h-8 rounded-lg border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
            >
              <option value="">No flag (automatic)</option>
              {(Object.keys(FLAG_LABELS) as Flag[]).map((f) => (
                <option key={f} value={f}>
                  {FLAG_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        )}

        <Block title="Steps">
          <div className="space-y-1.5">
            {project.steps.map((s) => {
              const st = item.steps[s.id]
              const by = st && st.by !== 'import' ? people.find((p) => p.id === st.by) : undefined
              return (
                <div key={s.id} className="flex items-center gap-3 px-2">
                  <span className="w-[84px] shrink-0 truncate text-[13px]">{s.label}</span>
                  <div className="flex shrink-0 rounded-lg border border-line bg-bg p-0.5">
                    {MARKS.filter((m) => !template || m.id === null || m.id === 'na').map((m) => {
                      const on = (st?.s ?? null) === m.id
                      return (
                        <button
                          key={String(m.id)}
                          onClick={() => op([{ type: 'item.step', itemId: item.id, stepId: s.id, mark: m.id }])}
                          className={cx(
                            'press h-6 whitespace-nowrap rounded-md px-2 text-[12px]',
                            on
                              ? m.id === 'done'
                                ? 'bg-done font-medium text-white'
                                : m.id === 'started'
                                  ? 'bg-done-soft font-medium text-done'
                                  : 'bg-panel font-medium text-ink shadow-sm'
                              : 'text-muted hover:text-ink'
                          )}
                        >
                          {template && m.id === null ? 'Applies' : m.label}
                        </button>
                      )
                    })}
                  </div>
                  {by && st && (
                    <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-faint" title={`${by.name}, ${fmtWhen(st.at)}`}>
                      <Avatar person={by} size={16} />
                      <span className="truncate">{fmtWhen(st.at)}</span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Block>

        <Block title="Quantity">
          <InlineEdit value={item.qty} onCommit={(qty) => update({ qty })} placeholder="e.g. 4" className="w-32 font-mono" />
        </Block>

        <Block title="Lead">
          <div className="px-2">
            <PeoplePicker value={item.lead} onChange={(lead) => update({ lead })} />
          </div>
        </Block>
        <Block title="Drawing">
          <div className="px-2">
            <PeoplePicker value={item.drawBy} onChange={(drawBy) => update({ drawBy })} />
          </div>
        </Block>
        <Block title="Assembly">
          <div className="px-2">
            <PeoplePicker value={item.assyBy} onChange={(assyBy) => update({ assyBy })} />
          </div>
        </Block>

        <Block title="Notes">
          <InlineEdit multiline value={item.notes} onCommit={(notes) => update({ notes })} placeholder="Info received dates, revisions, anything useful" />
        </Block>
        <Block title="Duplicates across the model">
          <InlineEdit value={item.duplicates} onCommit={(duplicates) => update({ duplicates })} placeholder="e.g. Prec A (x1), Prec B (x1)" />
        </Block>

        {!template && (
          <Block title="History">
            {history.length === 0 ? (
              <p className="px-2 text-[12.5px] text-faint">No changes recorded yet.</p>
            ) : (
              <ol className="space-y-2 px-2">
                {history.map((h, n) => {
                  const p = people.find((x) => x.id === h.by)
                  return (
                    <li key={n} className="flex gap-2 text-[12.5px]">
                      <Avatar person={p} size={18} />
                      <span className="min-w-0 flex-1 leading-snug">
                        <b className="font-medium">{p?.name ?? h.by}</b> <span className="text-muted">{h.text}</span>
                        <span className="block text-[11.5px] text-faint">{fmtWhen(h.at)}</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </Block>
        )}

        <div className="px-2 pb-4">
          <Button
            tone="danger"
            size="sm"
            icon={<Trash size={14} />}
            onClick={() => {
              if (confirmDelete(`"${item.name}"`)) {
                op([{ type: 'item.delete', itemId: item.id }])
                setOpenItem(null)
              }
            }}
          >
            Delete item
          </Button>
        </div>
      </div>
    </aside>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="px-2 text-[12px] font-medium text-muted">{title}</h3>
      {children}
    </div>
  )
}
