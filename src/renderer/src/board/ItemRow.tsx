import { ArrowDown, ArrowUp, NotePencil, Trash } from '@phosphor-icons/react'
import { itemStatus } from '@shared/status'
import type { Collection, Item, Project } from '@shared/types'
import { useStore } from '../store'
import { AvatarStack, IconButton, StatusChip, confirmDelete, cx } from '../ui'
import { StepCell } from './StepCell'

export const gridCols = (steps: number): string => `minmax(240px, 2.2fr) 96px repeat(${steps}, 40px) 158px minmax(140px, 1.4fr)`

export function ItemRow({
  project,
  collection,
  item,
  editing,
  subtitle
}: {
  project: Project
  collection: Collection
  item: Item
  editing?: boolean
  subtitle?: string
}) {
  const dispatch = useStore((s) => s.dispatch)
  const openItem = useStore((s) => s.openItem)
  const setOpenItem = useStore((s) => s.setOpenItem)
  const template = project.kind === 'template'
  const status = itemStatus(item, project.steps)
  const people = [...new Set([...item.lead, ...item.drawBy, ...item.assyBy])]
  const selected = openItem === item.id
  const op = (ops: Parameters<typeof dispatch>[2]): void => dispatch(collection, project.id, ops)

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => setOpenItem(item.id)}
      onKeyDown={(e) => e.key === 'Enter' && setOpenItem(item.id)}
      className={cx(
        'group grid cursor-default items-center gap-x-3 border-b border-line/70 px-4 py-[5px] outline-none',
        selected ? 'bg-accent-soft/60' : 'hover:bg-hover/60 focus-visible:bg-hover/60'
      )}
      style={{ gridTemplateColumns: gridCols(project.steps.length) }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px]">{item.name}</div>
          {subtitle && <div className="truncate text-[11.5px] text-faint">{subtitle}</div>}
        </div>
        {item.qty && item.qty !== '1' && <span className="shrink-0 rounded bg-sunken px-1.5 font-mono text-[11px] text-muted tnum">x{item.qty}</span>}
        {editing && (
          <span className="ml-auto flex shrink-0 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <IconButton label="Move up" onClick={() => op([{ type: 'item.move', itemId: item.id, dir: -1 }])}>
              <ArrowUp size={14} />
            </IconButton>
            <IconButton label="Move down" onClick={() => op([{ type: 'item.move', itemId: item.id, dir: 1 }])}>
              <ArrowDown size={14} />
            </IconButton>
            <IconButton label="Delete item" onClick={() => confirmDelete(`"${item.name}"`) && op([{ type: 'item.delete', itemId: item.id }])}>
              <Trash size={14} />
            </IconButton>
          </span>
        )}
      </div>
      <div>{people.length > 0 ? <AvatarStack ids={people} /> : <span className="text-faint">-</span>}</div>
      {project.steps.map((s) => (
        <div key={s.id} className="flex justify-center">
          <StepCell
            step={s}
            template={template}
            stamp={item.steps[s.id]}
            onSet={(mark) => op([{ type: 'item.step', itemId: item.id, stepId: s.id, mark }])}
          />
        </div>
      ))}
      <div>{template ? <span className="text-faint">-</span> : <StatusChip status={status} />}</div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
        {item.notes && <NotePencil size={13} className="shrink-0 text-faint" />}
        <span className="truncate">{item.notes}</span>
      </div>
    </div>
  )
}
