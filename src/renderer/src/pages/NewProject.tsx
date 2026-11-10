import { useState } from 'react'
import { Check } from '@phosphor-icons/react'
import { blankProject, cloneStructure } from '@shared/factory'
import { allItems } from '@shared/status'
import type { Project } from '@shared/types'
import { useStore } from '../store'
import { Button, Dialog, Field, TextInput, cx } from '../ui'

type Source = { kind: 'blank' } | { kind: 'template' | 'project'; id: string }

export function NewProject({ onClose, asTemplate }: { onClose: () => void; asTemplate?: boolean }) {
  const templates = Object.values(useStore((s) => s.docs.templates)).sort((a, b) => a.name.localeCompare(b.name))
  const projects = Object.values(useStore((s) => s.docs.projects)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const createDoc = useStore((s) => s.createDoc)
  const go = useStore((s) => s.go)
  const [src, setSrc] = useState<Source>(templates[0] ? { kind: 'template', id: templates[0].id } : { kind: 'blank' })
  const [d, setD] = useState({ name: '', code: '', scale: '', client: '', due: '' })
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const create = async (): Promise<void> => {
    setTouched(true)
    if (!d.name.trim()) return
    setBusy(true)
    const kind = asTemplate ? 'template' : 'project'
    let p: Project
    if (src.kind === 'blank') p = blankProject(d.name.trim(), kind)
    else {
      const from = src.kind === 'template' ? templates.find((t) => t.id === src.id)! : projects.find((t) => t.id === src.id)!
      p = cloneStructure(from, d.name.trim(), kind)
    }
    Object.assign(p, { code: d.code.trim(), scale: d.scale.trim() || p.scale, client: d.client.trim(), due: d.due })
    const c = asTemplate ? 'templates' : 'projects'
    if (await createDoc(c, p)) {
      onClose()
      go({ page: 'board', collection: c, id: p.id })
    }
    setBusy(false)
  }

  const isOn = (value: Source): boolean =>
    src.kind === value.kind && (value.kind === 'blank' || (src as { id: string }).id === (value as { id: string }).id)

  const option = (key: string, value: Source, title: string, meta: string) => {
    const on = isOn(value)
    return (
      <button
        key={key}
        type="button"
        onClick={() => setSrc(value)}
        className={cx('press flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left', on ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-hover/60')}
      >
        <span className={cx('flex size-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent bg-accent text-white' : 'border-line-strong')}>
          {on && <Check size={10} weight="bold" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-[12px] text-muted">{meta}</span>
        </span>
      </button>
    )
  }

  const count = (p: Project): string =>
    `${p.sections.length} sections, ${allItems(p).length} items, steps: ${p.steps.map((s) => s.short).join(' / ')}`

  return (
    <Dialog
      title={asTemplate ? 'New template' : 'New project'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={create} disabled={busy}>
            {asTemplate ? 'Create template' : 'Create project'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
        className="grid grid-cols-2 gap-4"
      >
        <div className="col-span-2">
          <Field label="Name">
            <TextInput autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={asTemplate ? 'e.g. Estate model' : 'e.g. Waterfall City Phase 2'} />
          </Field>
          {touched && !d.name.trim() && <p className="mt-1.5 text-[12px] text-accent">Give it a name first.</p>}
        </div>
        {!asTemplate && (
          <>
            <Field label="Project code">
              <TextInput value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} placeholder="P26/27" />
            </Field>
            <Field label="Client">
              <TextInput value={d.client} onChange={(e) => setD({ ...d, client: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Scale">
          <TextInput value={d.scale} onChange={(e) => setD({ ...d, scale: e.target.value })} placeholder="1:500" />
        </Field>
        {!asTemplate && (
          <Field label="Due date">
            <TextInput type="date" value={d.due} onChange={(e) => setD({ ...d, due: e.target.value })} />
          </Field>
        )}
        <button type="submit" hidden />
      </form>

      <h3 className="mt-6 mb-2 text-[13px] font-semibold">Start from</h3>
      <div className="space-y-1.5">
        {templates.map((t) => option(t.id, { kind: 'template', id: t.id }, t.name, 'Template. ' + count(t)))}
        {option('blank', { kind: 'blank' }, 'Blank', 'Steps Draw / Mach / Assy / Inst, no items. Add them with Edit layout.')}
        {projects.length > 0 && <h4 className="pt-3 text-[12px] font-medium text-muted">Or copy the layout of a project (progress is not copied)</h4>}
        {projects.slice(0, 6).map((p) => option(p.id, { kind: 'project', id: p.id }, p.name, count(p)))}
      </div>
    </Dialog>
  )
}
