import { useState } from 'react'
import { Plus, Stack } from '@phosphor-icons/react'
import { allItems } from '@shared/status'
import { useStore } from '../store'
import { Button, Empty, fmtWhen } from '../ui'
import { NewProject } from './NewProject'

export function Templates() {
  const templates = Object.values(useStore((s) => s.docs.templates)).sort((a, b) => a.name.localeCompare(b.name))
  const go = useStore((s) => s.go)
  const [creating, setCreating] = useState(false)
  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Templates</h1>
          <p className="mt-0.5 max-w-xl text-muted">
            The starting layout for a new project: sections, groups, items and which steps each item needs. Mark a step N/A on an item and new projects skip it.
          </p>
        </div>
        <Button tone="primary" icon={<Plus size={15} weight="bold" />} onClick={() => setCreating(true)}>
          New template
        </Button>
      </div>
      {templates.length === 0 ? (
        <Empty icon={<Stack size={22} />} title="No templates yet">
          Create one here, or open a project's settings and choose Save as template.
        </Empty>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => go({ page: 'board', collection: 'templates', id: t.id })}
              className="press flex flex-col gap-3 rounded-xl border border-line bg-panel p-5 text-left hover:border-line-strong"
            >
              <div>
                <div className="text-[16px] font-semibold tracking-tight">{t.name}</div>
                <div className="mt-0.5 text-[12.5px] text-muted">
                  {t.sections.length} sections, {allItems(t).length} items{t.scale && `, scale ${t.scale}`}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.steps.map((s) => (
                  <span key={s.id} className="rounded-md bg-sunken px-2 py-0.5 font-mono text-[11.5px] text-muted">
                    {s.short}
                  </span>
                ))}
              </div>
              <div className="text-[11.5px] text-faint">Updated {fmtWhen(t.updatedAt)}</div>
            </button>
          ))}
        </div>
      )}
      {creating && <NewProject asTemplate onClose={() => setCreating(false)} />}
    </div>
  )
}
