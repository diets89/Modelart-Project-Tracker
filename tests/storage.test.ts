import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Storage } from '../src/main/storage'
import { blankProject, newGroup, newItem, newSection } from '../src/shared/factory'
import { itemStatus } from '../src/shared/status'
import type { Project } from '../src/shared/types'

let root: string
let base: Project

function seed(): Project {
  const p = blankProject('Test model')
  const s = newSection('Structures')
  const g = newGroup('Precinct A')
  for (let i = 0; i < 20; i++) g.items.push(newItem('Building ' + i))
  s.groups.push(g)
  p.sections.push(s)
  return p
}

afterEach(async () => {
  if (process.env.MAT_TEST_ROOT) await fs.rm(root, { recursive: true, force: true })
})

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(process.env.MAT_TEST_ROOT ?? os.tmpdir(), 'mat-test-'))
  base = seed()
  await new Storage(root).create('projects', base, 'tester')
})

describe('concurrent writers', () => {
  it('keeps every edit when two PCs save at the same time', async () => {
    const a = new Storage(root) // PC 1
    const b = new Storage(root) // PC 2
    const items = base.sections[0].groups[0].items
    await Promise.all(
      items.map((it, n) =>
        (n % 2 ? a : b).apply('projects', base.id, [{ type: 'item.step', itemId: it.id, stepId: 'draw', mark: 'done' }], n % 2 ? 'mia' : 'garth')
      )
    )
    const saved = await a.read('projects', base.id)
    const marks = saved.sections[0].groups[0].items.map((i) => i.steps.draw?.s)
    expect(marks.every((m) => m === 'done')).toBe(true)
    expect(saved.rev).toBe(20)
    const log = await a.activity(base.id)
    expect(log.length).toBe(21) // 20 edits + created
  })

  it('recovers from a stale lock left by a crashed PC, even when the server clock is off', async () => {
    const f = path.join(root, 'projects', base.id + '.json.lock')
    await fs.writeFile(f, '{}')
    const s = new Storage(root, 400) // treat a lock untouched for 0.4 s as abandoned
    const { project } = await s.apply('projects', base.id, [{ type: 'project.update', patch: { scale: '1:500' } }], 'x')
    expect(project.scale).toBe('1:500')
  })

  it('reports edits to items someone else deleted, without failing the batch', async () => {
    const s = new Storage(root)
    const id = base.sections[0].groups[0].items[0].id
    await s.apply('projects', base.id, [{ type: 'item.delete', itemId: id }], 'a')
    const r = await s.apply(
      'projects',
      base.id,
      [
        { type: 'item.step', itemId: id, stepId: 'draw', mark: 'done' },
        { type: 'project.update', patch: { client: 'Azania' } }
      ],
      'b'
    )
    expect(r.errors.length).toBe(1)
    expect(r.project.client).toBe('Azania')
  })
})

describe('status', () => {
  const steps = blankProject('x').steps
  it('derives status from steps', () => {
    const i = newItem('a')
    expect(itemStatus(i, steps).label).toBe('Not started')
    i.steps.draw = { s: 'done', by: '', at: '' }
    expect(itemStatus(i, steps).label).toBe('Up next: Mach')
    i.steps.mach = { s: 'started', by: '', at: '' }
    expect(itemStatus(i, steps).label).toBe('In progress: Mach')
    i.steps.mach.s = 'done'
    i.steps.assy = { s: 'done', by: '', at: '' }
    i.steps.inst = { s: 'na', by: '', at: '' }
    expect(itemStatus(i, steps).kind).toBe('done')
    i.flag = 'hold'
    expect(itemStatus(i, steps).label).toBe('On hold')
  })
})
