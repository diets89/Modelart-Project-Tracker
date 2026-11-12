import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Storage } from '../src/main/storage'
import { addWeeks, dayDate, weekOf, weekStart } from '../src/shared/timesheet'

describe('weeks', () => {
  it('matches the Excel timesheet numbering', () => {
    expect(weekOf(new Date(2026, 10, 9))).toBe('2026-W46') // Mon 9 Nov 2026
    expect(weekOf(new Date(2026, 10, 15))).toBe('2026-W46') // Sun 15 Nov
    expect(weekOf(new Date(2026, 10, 16))).toBe('2026-W47')
    expect(weekStart('2026-W46').toDateString()).toBe(new Date(2026, 10, 9).toDateString())
    expect(dayDate('2026-W46', 4).getDate()).toBe(13)
  })
  it('crosses year ends', () => {
    expect(weekOf(new Date(2025, 11, 29))).toBe('2026-W01')
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01')
    expect(addWeeks('2026-W01', -1)).toBe('2025-W52')
  })
})

describe('timesheet storage', () => {
  let root: string
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.env.MAT_TEST_ROOT ?? os.tmpdir(), 'mat-ts-'))
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('keeps both entries when two people save to the same sheet at once', async () => {
    const a = new Storage(root)
    const b = new Storage(root)
    await Promise.all([
      ...Array.from({ length: 10 }, (_, s) => a.applySheet('josias', '2026-W46', { [`0:${s}`]: { a: 'P/F', p: 'azania' } }, 'diets')),
      ...Array.from({ length: 10 }, (_, s) => b.applySheet('josias', '2026-W46', { [`1:${s}`]: { a: 'MBC', p: 'azania' } }, 'garth'))
    ])
    const t = await a.readSheet('josias', '2026-W46')
    expect(Object.keys(t.cells)).toHaveLength(20)
    await a.applySheet('josias', '2026-W46', { '0:0': null }, 'diets')
    expect(Object.keys((await a.readSheet('josias', '2026-W46')).cells)).toHaveLength(19)
    expect(Object.keys(await a.sheetMtimes())).toEqual(['josias/2026-W46'])
  })

  it('rejects odd ids', async () => {
    const s = new Storage(root)
    await expect(s.applySheet('../x', '2026-W46', {}, 'diets')).rejects.toThrow()
    await expect(s.applySheet('diets', '2026-46', {}, 'diets')).rejects.toThrow()
  })
})
