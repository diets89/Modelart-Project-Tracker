import { describe, it, expect } from 'vitest'
import { finished } from '../src/renderer/src/fun'
import { blankProject, newGroup, newItem, newSection } from '../src/shared/factory'
import { applyOp } from '../src/shared/ops'
import { streak } from '../src/shared/timesheet'

function model() {
  const p = blankProject('Test')
  const s = newSection('Base')
  const a = newGroup('Topography')
  const b = newGroup('Model Base')
  a.items.push(newItem('Topo'), newItem('Road Overlays'))
  b.items.push(newItem('Sides'), newItem('Main Egg Crate'))
  s.groups.push(a, b)
  p.sections.push(s)
  return p
}
const finish = (p: ReturnType<typeof model>, itemId: string) => {
  const q = structuredClone(p)
  for (const st of q.steps) applyOp(q, { type: 'item.step', itemId, stepId: st.id, mark: 'done' }, { by: 'diets', at: new Date().toISOString() })
  return q
}

describe('celebrations', () => {
  it('spots a finished item, then group, then the whole model', () => {
    const p = model()
    const [topo, roads] = p.sections[0].groups[0].items
    const [sides, crate] = p.sections[0].groups[1].items
    const p1 = finish(p, topo.id)
    expect(finished(p, p1)).toMatchObject({ items: [{ name: 'Topo' }], groups: [], project: false })
    const p2 = finish(p1, roads.id)
    expect(finished(p1, p2).groups.map((g) => g.name)).toEqual(['Topography'])
    const p3 = finish(finish(p2, sides.id), crate.id)
    const f = finished(finish(p2, sides.id), p3)
    expect(f.project).toBe(true)
    expect(finished(p3, p3).items).toHaveLength(0)
  })
})

describe('streaks', () => {
  it('counts weekdays in a row with a full day, skipping weekends and an unfilled today', () => {
    const full = Object.fromEntries(Array.from({ length: 16 }, (_, s) => [s, { a: 'CM' }]))
    const day = (d: number) => Object.fromEntries(Object.entries(full).map(([s, c]) => [`${d}:${s}`, c]))
    const sheets = {
      'diets/2026-W45': { person: 'diets', week: '2026-W45', cells: { ...day(3), ...day(4) }, rev: 1, updatedAt: '' },
      'diets/2026-W46': { person: 'diets', week: '2026-W46', cells: { ...day(0), ...day(1), ...day(2) }, rev: 1, updatedAt: '' }
    }
    // Thu 12 Nov, not filled yet: Mon-Wed this week + Thu-Fri last week = 5
    expect(streak(sheets, 'diets', new Date(2026, 10, 12, 10))).toBe(5)
    expect(streak(sheets, 'garth', new Date(2026, 10, 12, 10))).toBe(0)
  })
})
