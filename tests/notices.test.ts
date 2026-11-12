import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Storage } from '../src/main/storage'
import type { Notice } from '../src/shared/types'
import { cleanPath } from '../src/shared/paths'

describe('noticeboard storage', () => {
  let root: string
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.env.MAT_TEST_ROOT ?? os.tmpdir(), 'mat-nb-'))
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const notice = (id: string, to: string[]): Notice => ({
    id,
    from: 'garth',
    to,
    title: 'Gate House ready to machine',
    message: '',
    links: [{ path: 'Z:\\Jobs\\P34\\Gate House.dxf', kind: 'file' }],
    createdAt: new Date().toISOString(),
    readBy: ['garth']
  })

  it('keeps both marks when two people update a notice at once', async () => {
    const a = new Storage(root)
    const b = new Storage(root)
    await a.postNotice(notice('n1', ['conrad', 'mark']))
    await Promise.all([
      a.updateNotice('n1', (n) => n.readBy.push('conrad'), 'conrad'),
      b.updateNotice('n1', (n) => Object.assign(n, { doneBy: 'mark', doneAt: 'x', readBy: [...n.readBy, 'mark'] }), 'mark')
    ])
    const n = await a.readNotice('n1')
    expect(n.readBy.sort()).toEqual(['conrad', 'garth', 'mark'])
    expect(n.doneBy).toBe('mark')
  })

  it('lists notices and keeps a copy of removed ones', async () => {
    const s = new Storage(root)
    await s.postNotice(notice('n1', []))
    await s.postNotice(notice('n2', ['conrad']))
    expect((await s.notices()).map((n) => n.id).sort()).toEqual(['n1', 'n2'])
    await s.removeNotice('n1', 'garth')
    expect(Object.keys(await s.noticeMtimes())).toEqual(['n2'])
    expect((await fs.readdir(path.join(root, 'deleted'))).some((f) => f.startsWith('notice-n1-'))).toBe(true)
  })
})

describe('notice links', () => {
  it('accepts drive and network paths, refuses anything else', () => {
    expect(cleanPath(String.raw`Z:\Jobs\P34\Gate House.dxf`)).toBe(String.raw`Z:\Jobs\P34\Gate House.dxf`)
    expect(cleanPath(String.raw`"Z:\Jobs\P34"`)).toBe(String.raw`Z:\Jobs\P34`)
    expect(cleanPath(String.raw`\\server\share\file.dxf`)).toBe(String.raw`\\server\share\file.dxf`)
    expect(cleanPath('Z:/Jobs/P34')).toBe('Z:/Jobs/P34')
    for (const bad of ['https://example.com/x', 'C:file.dxf', String.raw`..\x`, String.raw`Jobs\P34`, String.raw`\\server`, ''])
      expect(() => cleanPath(bad)).toThrow()
  })
})
