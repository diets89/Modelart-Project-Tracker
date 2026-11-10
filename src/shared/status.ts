import { FLAG_LABELS, type Item, type Project, type Step } from './types'

export type StatusKind = 'hold' | 'waiting' | 'progress' | 'idle' | 'done'

export interface Status {
  kind: StatusKind
  label: string
  /** Step the item is on (or waiting for). */
  stepId?: string
}

export function applicableSteps(item: Item, steps: Step[]): Step[] {
  return steps.filter((s) => item.steps[s.id]?.s !== 'na')
}

/**
 * Status rules:
 * 1. A manual flag (Hold, Awaiting info...) wins.
 * 2. All applicable steps done -> Complete.
 * 3. Earliest started-but-unfinished step -> "In progress: <step>".
 * 4. Otherwise the next step not done -> "Not started" if nothing done yet, else "Up next: <step>".
 */
export function itemStatus(item: Item, steps: Step[]): Status {
  if (item.flag === 'hold') return { kind: 'hold', label: FLAG_LABELS.hold }
  if (item.flag) return { kind: 'waiting', label: FLAG_LABELS[item.flag] }
  const app = applicableSteps(item, steps)
  if (app.length === 0) return { kind: 'idle', label: 'No steps' }
  const started = app.find((s) => item.steps[s.id]?.s === 'started')
  if (started) return { kind: 'progress', label: `In progress: ${started.short}`, stepId: started.id }
  const next = app.find((s) => item.steps[s.id]?.s !== 'done')
  if (!next) return { kind: 'done', label: 'Complete' }
  const anyDone = app.some((s) => item.steps[s.id]?.s === 'done')
  if (!anyDone) return { kind: 'idle', label: 'Not started', stepId: next.id }
  return { kind: 'idle', label: `Up next: ${next.short}`, stepId: next.id }
}

/** Progress as fraction of applicable step-units done (started counts as half). */
export function itemProgress(item: Item, steps: Step[]): number {
  const app = applicableSteps(item, steps)
  if (!app.length) return 0
  let n = 0
  for (const s of app) {
    const m = item.steps[s.id]?.s
    if (m === 'done') n += 1
    else if (m === 'started') n += 0.5
  }
  return n / app.length
}

export function allItems(p: Project): Item[] {
  return p.sections.flatMap((s) => s.groups.flatMap((g) => g.items))
}

export interface ProjectSummary {
  total: number
  done: number
  progress: number
  hold: number
  waiting: number
  inProgress: number
}

export function summarize(items: Item[], steps: Step[]): ProjectSummary {
  const r: ProjectSummary = { total: items.length, done: 0, progress: 0, hold: 0, waiting: 0, inProgress: 0 }
  let sum = 0
  for (const i of items) {
    const st = itemStatus(i, steps)
    if (st.kind === 'done') r.done++
    if (st.kind === 'hold') r.hold++
    if (st.kind === 'waiting') r.waiting++
    if (st.kind === 'progress') r.inProgress++
    sum += st.kind === 'done' ? 1 : itemProgress(i, steps)
  }
  r.progress = items.length ? sum / items.length : 0
  return r
}

export function involves(item: Item, personId: string): boolean {
  return item.lead.includes(personId) || item.drawBy.includes(personId) || item.assyBy.includes(personId)
}
