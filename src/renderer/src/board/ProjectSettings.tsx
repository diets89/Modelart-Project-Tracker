import { useState } from 'react'
import { ArrowDown, ArrowUp, CopySimple, Plus, Trash } from '@phosphor-icons/react'
import { cloneStructure, uid } from '@shared/factory'
import type { Collection, Project, ProjectStatus } from '@shared/types'
import { useStore } from '../store'
import { Button, Dialog, Field, IconButton, InlineEdit, TextInput, confirmDelete } from '../ui'

export function ProjectSettings({ project, collection, onClose }: { project: Project; collection: Collection; onClose: () => void }) {
  const dispatch = useStore((s) => s.dispatch)
  const createDoc = useStore((s) => s.createDoc)
  const removeDoc = useStore((s) => s.removeDoc)
  const go = useStore((s) => s.go)
  const toast = useStore((s) => s.toast)
  const template = project.kind === 'template'
  const [d, setD] = useState({ name: project.name, code: project.code, scale: project.scale, client: project.client, due: project.due, status: project.status })
  const [newStep, setNewStep] = useState('')
  const op = (ops: Parameters<typeof dispatch>[2]): void => dispatch(collection, project.id, ops)

  const save = (): void => {
    const patch = Object.fromEntries(Object.entries(d).filter(([k, v]) => project[k as keyof Project] !== v))
    if (Object.keys(patch).length) op([{ type: 'project.update', patch }])
    onClose()
  }

  const saveAsTemplate = async (): Promise<void> => {
    const name = window.prompt('Template name', project.name + ' template')
    if (!name) return
    if (await createDoc('templates', cloneStructure(project, name, 'template'))) toast(`Saved template "${name}"`)
  }

  return (
    <Dialog
      title={template ? 'Template settings' : 'Project settings'}
      onClose={onClose}
      width={600}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Name">
            <TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
        </div>
        {!template && (
          <>
            <Field label="Job no.">
              <TextInput value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} placeholder="P34/26" />
            </Field>
            <Field label="Client">
              <TextInput value={d.client} onChange={(e) => setD({ ...d, client: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Scale">
          <TextInput value={d.scale} onChange={(e) => setD({ ...d, scale: e.target.value })} placeholder="1:500" />
        </Field>
        {!template && (
          <>
            <Field label="Due date">
              <TextInput type="date" value={d.due} onChange={(e) => setD({ ...d, due: e.target.value })} />
            </Field>
            <Field label="Status">
              <select
                value={d.status}
                onChange={(e) => setD({ ...d, status: e.target.value as ProjectStatus })}
                className="h-9 rounded-lg border border-line bg-panel px-2 outline-none focus:border-accent"
              >
                <option value="active">Active</option>
                <option value="hold">On hold</option>
                <option value="delivered">Delivered</option>
              </select>
            </Field>
          </>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-[13px] font-semibold">Steps</h3>
        <p className="mt-0.5 mb-2 text-[12.5px] text-muted">The columns every item moves through. Changes save straight away.</p>
        <div className="divide-y divide-line rounded-lg border border-line">
          {project.steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1">
              <InlineEdit value={s.label} onCommit={(label) => label && op([{ type: 'step.update', stepId: s.id, label, short: s.short }])} className="flex-1" />
              <InlineEdit value={s.short} onCommit={(short) => short && op([{ type: 'step.update', stepId: s.id, label: s.label, short }])} className="w-20 font-mono" />
              <IconButton label="Move step earlier" disabled={i === 0} onClick={() => op([{ type: 'step.move', stepId: s.id, dir: -1 }])}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton label="Move step later" disabled={i === project.steps.length - 1} onClick={() => op([{ type: 'step.move', stepId: s.id, dir: 1 }])}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton
                label="Delete step"
                onClick={() => confirmDelete(`the step "${s.label}" and its ticks on every item`) && op([{ type: 'step.delete', stepId: s.id }])}
              >
                <Trash size={14} />
              </IconButton>
            </div>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const label = newStep.trim()
            if (!label) return
            op([{ type: 'step.add', step: { id: uid('st'), label, short: label.slice(0, 5) } }])
            setNewStep('')
          }}
        >
          <TextInput value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="New step, e.g. UV Print" className="flex-1" aria-label="New step name" />
          <Button type="submit" icon={<Plus size={14} />}>
            Add step
          </Button>
        </form>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
        {!template && (
          <Button icon={<CopySimple size={15} />} onClick={saveAsTemplate}>
            Save as template
          </Button>
        )}
        <Button
          tone="danger"
          icon={<Trash size={15} />}
          onClick={async () => {
            if (!confirmDelete(`${template ? 'the template' : 'the project'} "${project.name}". A copy is kept in the "deleted" folder on the network drive`)) return
            await removeDoc(collection, project.id)
            onClose()
            go({ page: template ? 'templates' : 'projects' })
          }}
        >
          Delete {template ? 'template' : 'project'}
        </Button>
      </div>
    </Dialog>
  )
}
