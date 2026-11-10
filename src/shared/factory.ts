import type { Group, Item, Project, Section, Step } from './types'

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 8)
  return prefix + Date.now().toString(36) + r
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'project'
  )
}

export function newItem(name: string, at = new Date().toISOString()): Item {
  return { id: uid('i'), name, qty: '', lead: [], drawBy: [], assyBy: [], steps: {}, flag: null, notes: '', duplicates: '', updatedAt: at }
}

export function newGroup(name: string): Group {
  return { id: uid('g'), name, items: [] }
}

export function newSection(name: string): Section {
  return { id: uid('s'), name, groups: [] }
}

export const DEFAULT_STEPS: Step[] = [
  { id: 'draw', label: 'Drawing', short: 'Draw' },
  { id: 'mach', label: 'Machining', short: 'Mach' },
  { id: 'assy', label: 'Assembly', short: 'Assy' },
  { id: 'inst', label: 'Install', short: 'Inst' }
]

export function blankProject(name: string, kind: Project['kind'] = 'project'): Project {
  const at = new Date().toISOString()
  return {
    id: slug(name) + '-' + uid().slice(-4),
    kind,
    name,
    code: '',
    scale: '',
    client: '',
    due: '',
    status: 'active',
    steps: DEFAULT_STEPS.map((s) => ({ ...s })),
    sections: [],
    createdAt: at,
    updatedAt: at,
    rev: 0
  }
}

/** Deep copy of structure with fresh ids. Progress is dropped unless keepProgress. */
export function cloneStructure(src: Project, name: string, kind: Project['kind'], keepProgress = false): Project {
  const p = blankProject(name, kind)
  p.code = kind === 'template' ? '' : src.code
  p.scale = src.scale
  p.steps = src.steps.map((s) => ({ ...s }))
  const at = p.createdAt
  p.sections = src.sections.map((s) => ({
    id: uid('s'),
    name: s.name,
    groups: s.groups.map((g) => ({
      id: uid('g'),
      name: g.name,
      items: g.items.map((i) => ({
        ...structuredClone(i),
        id: uid('i'),
        // N/A marks describe the structure, so templates keep them
        steps: keepProgress
          ? structuredClone(i.steps)
          : Object.fromEntries(Object.entries(i.steps).filter(([, v]) => v.s === 'na')),
        flag: keepProgress ? i.flag : null,
        notes: keepProgress ? i.notes : '',
        updatedAt: at
      }))
    }))
  }))
  return p
}
