import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  ClockCounterClockwise,
  FileXls,
  GearSix,
  MagnifyingGlass,
  PencilSimpleLine,
  Plus,
  Trash,
  Tray
} from '@phosphor-icons/react'
import { itemStatus, involves, summarize, allItems, type StatusKind } from '@shared/status'
import { newGroup, newItem, newSection } from '@shared/factory'
import type { Collection, Group, Item, Project } from '@shared/types'
import { api, errText } from '../api'
import { useStore } from '../store'
import { Button, Empty, IconButton, InlineEdit, Progress, confirmDelete, cx, fmtDate } from '../ui'
import { ItemRow, gridCols } from './ItemRow'
import { ItemPanel } from './ItemPanel'
import { ActivityDrawer } from './ActivityDrawer'
import { ProjectSettings } from './ProjectSettings'

type Filter = 'all' | 'open' | 'waiting' | 'done'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'waiting', label: 'Waiting / hold' },
  { id: 'done', label: 'Complete' }
]
const matchFilter = (k: StatusKind, f: Filter): boolean =>
  f === 'all' || (f === 'open' && k !== 'done') || (f === 'waiting' && (k === 'waiting' || k === 'hold')) || (f === 'done' && k === 'done')

export function Board({ collection, id }: { collection: Collection; id: string }) {
  const project = useStore((s) => s.docs[collection][id])
  const people = useStore((s) => s.people)
  const openItem = useStore((s) => s.openItem)
  const toast = useStore((s) => s.toast)
  const dispatch = useStore((s) => s.dispatch)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [person, setPerson] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const template = project?.kind === 'template'

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const visible = useMemo(() => {
    if (!project) return (_: Item) => true
    const ql = q.trim().toLowerCase()
    return (i: Item): boolean =>
      (!ql || i.name.toLowerCase().includes(ql) || i.notes.toLowerCase().includes(ql)) &&
      (!person || involves(i, person)) &&
      matchFilter(itemStatus(i, project.steps).kind, filter)
  }, [project, q, person, filter])

  if (!project)
    return (
      <Empty icon={<Tray size={22} />} title="Project not found">
        It may have been deleted by someone else.
      </Empty>
    )

  const op = (ops: Parameters<typeof dispatch>[2]): void => dispatch(collection, project.id, ops)
  const sum = summarize(allItems(project), project.steps)
  const filtering = !!(q || person || filter !== 'all')
  const shownCount = allItems(project).filter(visible).length

  const exportXlsx = async (): Promise<void> => {
    try {
      const f = await api().exportXlsx(project.id)
      if (f) toast('Exported to ' + f)
    } catch (e) {
      toast(errText(e), 'error')
    }
  }

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="border-b border-line bg-panel px-6 pt-4 pb-3">
          <div className="flex items-start gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                {template ? <span>Template</span> : <span className="font-mono tnum">{project.code || 'No code'}</span>}
                {project.scale && <span>Scale {project.scale}</span>}
                {project.client && <span>{project.client}</span>}
                {project.due && <span>Due {fmtDate(project.due)}</span>}
              </div>
              <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-tight">{project.name}</h1>
            </div>
            {!template && (
              <div className="flex shrink-0 items-center gap-5 pt-1">
                <Stat label="Complete" value={`${Math.round(sum.progress * 100)}%`} />
                <Stat label="Items done" value={`${sum.done}/${sum.total}`} />
                <Stat label="Waiting" value={String(sum.waiting + sum.hold)} warn={sum.waiting + sum.hold > 0} />
              </div>
            )}
          </div>
          {!template && <Progress value={sum.progress} className="mt-3" />}

          {/* toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <MagnifyingGlass size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
              <input
                ref={search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items"
                aria-label="Search items"
                className="h-8 w-56 rounded-lg border border-line bg-bg pr-2 pl-8 text-[13px] outline-none placeholder:text-faint focus:border-accent"
              />
            </div>
            {!template && (
              <div className="flex rounded-lg border border-line bg-bg p-0.5" role="tablist">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cx('press h-[26px] rounded-md px-2.5 text-[12.5px]', filter === f.id ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted hover:text-ink')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              aria-label="Filter by person"
              className="h-8 rounded-lg border border-line bg-bg px-2 text-[13px] text-ink outline-none focus:border-accent"
            >
              <option value="">Everyone</option>
              {people
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            {filtering && (
              <span className="text-[12.5px] text-muted tnum">
                {shownCount} of {sum.total} items
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button tone={editing ? 'primary' : 'ghost'} icon={<PencilSimpleLine size={15} />} onClick={() => setEditing(!editing)}>
                {editing ? 'Done editing' : 'Edit layout'}
              </Button>
              {!template && (
                <>
                  <IconButton label="Activity" onClick={() => setShowActivity(!showActivity)} className={cx('size-8', showActivity && 'bg-hover text-ink')}>
                    <ClockCounterClockwise size={17} />
                  </IconButton>
                  <IconButton label="Export to Excel" onClick={exportXlsx} className="size-8">
                    <FileXls size={17} />
                  </IconButton>
                </>
              )}
              <IconButton label={template ? 'Template settings' : 'Project settings'} onClick={() => setShowSettings(true)} className="size-8">
                <GearSix size={17} />
              </IconButton>
            </div>
          </div>
        </header>

        {/* grid */}
        <div className="min-h-0 flex-1 overflow-auto" role="grid" aria-label={project.name}>
          <div className="min-w-[860px]">
            <div
              className="sticky top-0 z-10 grid items-end gap-x-3 border-b border-line bg-bg/95 px-4 py-2 text-[11.5px] font-medium text-muted backdrop-blur"
              style={{ gridTemplateColumns: gridCols(project.steps.length) }}
            >
              <span>Item</span>
              <span>People</span>
              {project.steps.map((s) => (
                <span key={s.id} className="text-center" title={s.label}>
                  {s.short}
                </span>
              ))}
              <span>Status</span>
              <span>Notes</span>
            </div>

            {project.sections.length === 0 && (
              <Empty icon={<Tray size={22} />} title="Nothing here yet">
                Click <b>Edit layout</b> to add sections, groups and items.
              </Empty>
            )}

            {project.sections.map((sec, si) => {
              const secItems = sec.groups.flatMap((g) => g.items).filter(visible)
              if (filtering && !editing && secItems.length === 0) return null
              return (
                <section key={sec.id} className="pb-2">
                  <div className="group flex items-center gap-2 px-4 pt-5 pb-1.5">
                    {editing ? (
                      <InlineEdit value={sec.name} onCommit={(name) => op([{ type: 'section.update', sectionId: sec.id, name }])} className="max-w-xs text-[15px] font-semibold" />
                    ) : (
                      <h2 className="text-[15px] font-semibold tracking-tight">{sec.name}</h2>
                    )}
                    {editing && (
                      <span className="flex">
                        <IconButton label="Move section up" disabled={si === 0} onClick={() => op([{ type: 'section.move', sectionId: sec.id, dir: -1 }])}>
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton label="Move section down" disabled={si === project.sections.length - 1} onClick={() => op([{ type: 'section.move', sectionId: sec.id, dir: 1 }])}>
                          <ArrowDown size={14} />
                        </IconButton>
                        <IconButton
                          label="Delete section"
                          onClick={() => confirmDelete(`the section "${sec.name}" and everything in it`) && op([{ type: 'section.delete', sectionId: sec.id }])}
                        >
                          <Trash size={14} />
                        </IconButton>
                      </span>
                    )}
                  </div>
                  {sec.groups.map((g, gi) => (
                    <GroupBlock
                      key={g.id}
                      project={project}
                      collection={collection}
                      group={g}
                      first={gi === 0}
                      last={gi === sec.groups.length - 1}
                      hideHeader={sec.groups.length === 1 && g.name === sec.name && !editing}
                      visible={visible}
                      filtering={filtering}
                      editing={editing}
                      collapsed={!!collapsed[g.id] && !filtering}
                      onToggle={() => setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })}
                    />
                  ))}
                  {editing && (
                    <AddRow
                      label="Add group"
                      onAdd={(name) => op([{ type: 'group.add', sectionId: sec.id, group: newGroup(name) }])}
                      className="pl-4"
                    />
                  )}
                </section>
              )
            })}
            {editing && (
              <div className="px-4 pt-3 pb-16">
                <AddRow label="Add section" onAdd={(name) => op([{ type: 'section.add', section: { ...newSection(name), groups: [newGroup(name)] } }])} />
              </div>
            )}
            {filtering && shownCount === 0 && (
              <Empty icon={<MagnifyingGlass size={22} />} title="No items match">
                Try a different search or filter.
              </Empty>
            )}
            <div className="h-16" />
          </div>
        </div>
      </div>

      {openItem && <ItemPanel project={project} collection={collection} itemId={openItem} />}
      {showActivity && !openItem && <ActivityDrawer project={project} onClose={() => setShowActivity(false)} />}
      {showSettings && <ProjectSettings project={project} collection={collection} onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="text-right">
      <div className={cx('font-mono text-[18px] font-semibold tnum', warn && 'text-wait')}>{value}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  )
}

function GroupBlock({
  project,
  collection,
  group,
  first,
  last,
  hideHeader,
  visible,
  filtering,
  editing,
  collapsed,
  onToggle
}: {
  project: Project
  collection: Collection
  group: Group
  first: boolean
  last: boolean
  hideHeader: boolean
  visible: (i: Item) => boolean
  filtering: boolean
  editing: boolean
  collapsed: boolean
  onToggle: () => void
}) {
  const dispatch = useStore((s) => s.dispatch)
  const op = (ops: Parameters<typeof dispatch>[2]): void => dispatch(collection, project.id, ops)
  const items = group.items.filter(visible)
  if (filtering && !editing && items.length === 0) return null
  const sum = summarize(group.items, project.steps)
  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-xl border border-line bg-panel">
      {!hideHeader && (
        <div className="group flex h-10 items-center gap-2 border-b border-line/70 px-2">
          <IconButton label={collapsed ? 'Expand group' : 'Collapse group'} onClick={onToggle}>
            {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
          </IconButton>
          {editing ? (
            <InlineEdit value={group.name} onCommit={(name) => op([{ type: 'group.update', groupId: group.id, name }])} className="max-w-sm font-medium" />
          ) : (
            <button className="text-left font-medium" onClick={onToggle}>
              {group.name}
            </button>
          )}
          {project.kind !== 'template' && (
            <span className="ml-1 flex items-center gap-2 text-[12px] text-muted tnum">
              {sum.done}/{sum.total}
              <Progress value={sum.progress} className="w-16" />
            </span>
          )}
          {editing && (
            <span className="ml-auto flex">
              <IconButton label="Move group up" disabled={first} onClick={() => op([{ type: 'group.move', groupId: group.id, dir: -1 }])}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton label="Move group down" disabled={last} onClick={() => op([{ type: 'group.move', groupId: group.id, dir: 1 }])}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label="Delete group" onClick={() => confirmDelete(`the group "${group.name}" and its items`) && op([{ type: 'group.delete', groupId: group.id }])}>
                <Trash size={14} />
              </IconButton>
            </span>
          )}
        </div>
      )}
      {!collapsed &&
        items.map((i) => <ItemRow key={i.id} project={project} collection={collection} item={i} editing={editing} />)}
      {!collapsed && editing && (
        <AddRow label="Add item" onAdd={(name) => op([{ type: 'item.add', groupId: group.id, item: newItem(name) }])} className="px-4 py-1.5" keepOpen />
      )}
    </div>
  )
}

function AddRow({ label, onAdd, className, keepOpen }: { label: string; onAdd: (name: string) => void; className?: string; keepOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  if (!open)
    return (
      <div className={className}>
        <Button tone="quiet" size="sm" icon={<Plus size={13} />} onClick={() => setOpen(true)}>
          {label}
        </Button>
      </div>
    )
  return (
    <form
      className={cx('flex items-center gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (v.trim()) onAdd(v.trim())
        setV('')
        if (!keepOpen) setOpen(false)
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !v && setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder={label.replace('Add ', '') + ' name, then Enter'}
        aria-label={label}
        className="h-8 w-80 rounded-lg border border-accent bg-panel px-3 text-[13px] outline-none"
      />
    </form>
  )
}
