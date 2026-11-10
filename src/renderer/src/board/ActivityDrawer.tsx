import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { ActivityEntry, Project } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Avatar, IconButton, fmtWhen } from '../ui'

export function ActivityDrawer({ project, onClose }: { project: Project; onClose: () => void }) {
  const people = useStore((s) => s.people)
  const setOpenItem = useStore((s) => s.setOpenItem)
  const [list, setList] = useState<ActivityEntry[] | null>(null)
  useEffect(() => {
    api().activity(project.id).then(setList)
  }, [project.id, project.rev])

  return (
    <aside className="slide-in flex w-[360px] shrink-0 flex-col border-l border-line bg-panel" aria-label="Activity">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold">Activity</h2>
        <IconButton label="Close activity" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {list === null && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-sunken" />
            ))}
          </div>
        )}
        {list?.length === 0 && <p className="py-8 text-center text-muted">No activity yet.</p>}
        <ol className="space-y-3">
          {list?.map((h, n) => {
            const p = people.find((x) => x.id === h.by)
            return (
              <li key={n} className="flex gap-2.5 text-[13px]">
                <Avatar person={p} size={22} />
                <button className="min-w-0 flex-1 text-left leading-snug" onClick={() => h.itemId && setOpenItem(h.itemId)}>
                  <b className="font-medium">{p?.name ?? h.by}</b> <span className="text-muted">{h.text}</span>
                  <span className="block text-[11.5px] text-faint">{fmtWhen(h.at)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </aside>
  )
}
