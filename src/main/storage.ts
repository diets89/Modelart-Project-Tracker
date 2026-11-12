// All reads and writes to the shared data folder (usually on the Z: drive).
// Writes go: take lock -> re-read latest -> apply ops -> write temp -> swap in -> release lock.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { applyOp, describeOp, OpError, type Op } from '../shared/ops'
import type { ActivityEntry, Collection, Person, Project } from '../shared/types'

const LOCK_STALE_MS = 10_000
const LOCK_WAIT_MS = 8_000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class Storage {
  private lockSeen = new Map<string, { content: string; since: number }>()
  constructor(
    public root: string,
    private staleMs = LOCK_STALE_MS
  ) {}

  dir(c: Collection | 'activity'): string {
    return path.join(this.root, c)
  }

  file(c: Collection, id: string): string {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Bad id')
    return path.join(this.dir(c), id + '.json')
  }

  async ensure(): Promise<void> {
    for (const d of ['projects', 'templates', 'activity'] as const) await fs.mkdir(this.dir(d), { recursive: true })
  }

  async online(): Promise<boolean> {
    try {
      await fs.access(this.root)
      return true
    } catch {
      return false
    }
  }

  // ---------- locking ----------
  private async lock(target: string, by: string): Promise<() => Promise<void>> {
    const lockPath = target + '.lock'
    const start = Date.now()
    for (;;) {
      try {
        const h = await fs.open(lockPath, 'wx')
        await h.writeFile(JSON.stringify({ by, at: new Date().toISOString(), pid: process.pid, n: Math.random() }))
        await h.close()
        return async () => {
          await fs.rm(lockPath, { force: true }).catch(() => {})
        }
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        // A lock is stale when the *same* lock has been sitting there for a while, timed on
        // this PC's own clock. File times come from the server, whose clock can be far off.
        try {
          const content = await fs.readFile(lockPath, 'utf8')
          const seen = this.lockSeen.get(lockPath)
          if (!seen || seen.content !== content) this.lockSeen.set(lockPath, { content, since: Date.now() })
          else if (Date.now() - seen.since > this.staleMs) {
            this.lockSeen.delete(lockPath)
            await fs.rm(lockPath, { force: true })
            continue
          }
        } catch {
          continue // lock vanished while we looked
        }
        if (Date.now() - start > LOCK_WAIT_MS) throw new Error('Someone else is saving right now. Try again in a moment.')
        await sleep(60 + Math.random() * 90)
      }
    }
  }

  private async writeAtomic(target: string, data: string): Promise<void> {
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmp, data, 'utf8')
    for (let i = 0; ; i++) {
      try {
        await fs.rename(tmp, target)
        return
      } catch (e) {
        // Windows: another PC may be reading the file for a moment
        if (i >= 20) {
          await fs.rm(tmp, { force: true }).catch(() => {})
          throw e
        }
        await sleep(50 + i * 25)
      }
    }
  }

  private async readJson<T>(file: string): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return JSON.parse(await fs.readFile(file, 'utf8')) as T
      } catch (e) {
        if (i >= 5 || (e as NodeJS.ErrnoException).code === 'ENOENT') throw e
        await sleep(80)
      }
    }
  }

  // ---------- projects / templates ----------
  async list(c: Collection): Promise<{ project: Project; mtime: number }[]> {
    let names: string[] = []
    try {
      names = (await fs.readdir(this.dir(c))).filter((n) => n.endsWith('.json'))
    } catch {
      return []
    }
    const out: { project: Project; mtime: number }[] = []
    for (const n of names) {
      const f = path.join(this.dir(c), n)
      try {
        const st = await fs.stat(f)
        out.push({ project: await this.readJson<Project>(f), mtime: st.mtimeMs })
      } catch {
        /* skip unreadable file */
      }
    }
    return out
  }

  async mtimes(c: Collection): Promise<Record<string, number>> {
    const out: Record<string, number> = {}
    let names: string[] = []
    try {
      names = (await fs.readdir(this.dir(c))).filter((n) => n.endsWith('.json'))
    } catch {
      return out
    }
    for (const n of names) {
      try {
        out[n.slice(0, -5)] = (await fs.stat(path.join(this.dir(c), n))).mtimeMs
      } catch {
        /* removed */
      }
    }
    return out
  }

  async read(c: Collection, id: string): Promise<Project> {
    return this.readJson<Project>(this.file(c, id))
  }

  async create(c: Collection, p: Project, by: string, via?: 'ai'): Promise<Project> {
    await this.ensure()
    const f = this.file(c, p.id)
    const release = await this.lock(f, by)
    try {
      try {
        await fs.access(f)
        throw new Error('A project with that id already exists.')
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
      await this.writeAtomic(f, JSON.stringify(p, null, 1))
    } finally {
      await release()
    }
    if (c === 'projects') await this.log({ at: p.createdAt, by, projectId: p.id, text: `created project ${p.name}`, via })
    return p
  }

  async remove(c: Collection, id: string, by: string): Promise<void> {
    const f = this.file(c, id)
    const release = await this.lock(f, by)
    try {
      // keep a copy rather than destroying data
      const trash = path.join(this.root, 'deleted')
      await fs.mkdir(trash, { recursive: true })
      await fs.rename(f, path.join(trash, `${c}-${id}-${Date.now()}.json`))
    } finally {
      await release()
    }
  }

  /** Re-reads the latest file, applies ops, writes back. Returns the saved project. */
  async apply(c: Collection, id: string, ops: Op[], by: string, via?: 'ai'): Promise<{ project: Project; errors: string[] }> {
    const f = this.file(c, id)
    const release = await this.lock(f, by)
    const errors: string[] = []
    const entries: ActivityEntry[] = []
    let project: Project
    try {
      project = await this.readJson<Project>(f)
      for (const op of ops) {
        const at = new Date().toISOString()
        const desc = describeOp(project, op)
        try {
          applyOp(project, op, { by, at })
          entries.push({ at, by, projectId: id, itemId: desc.itemId, text: desc.text, via })
        } catch (e) {
          if (e instanceof OpError) errors.push(e.message)
          else throw e
        }
      }
      await this.writeAtomic(f, JSON.stringify(project, null, 1))
    } finally {
      await release()
    }
    if (c === 'projects') for (const e of entries) await this.log(e)
    return { project, errors }
  }

  // ---------- activity ----------
  async log(e: ActivityEntry): Promise<void> {
    try {
      await fs.mkdir(this.dir('activity'), { recursive: true })
      await fs.appendFile(path.join(this.dir('activity'), e.projectId + '.log'), JSON.stringify(e) + '\n', 'utf8')
    } catch {
      /* the log is best effort */
    }
  }

  async activity(projectId: string, limit = 300): Promise<ActivityEntry[]> {
    try {
      const raw = await fs.readFile(path.join(this.dir('activity'), projectId + '.log'), 'utf8')
      const lines = raw.trim().split('\n').filter(Boolean)
      return lines
        .slice(-limit)
        .map((l) => {
          try {
            return JSON.parse(l) as ActivityEntry
          } catch {
            return null
          }
        })
        .filter((x): x is ActivityEntry => !!x)
        .reverse()
    } catch {
      return []
    }
  }

  // ---------- people ----------
  private peopleFile(): string {
    return path.join(this.root, 'people.json')
  }

  async people(): Promise<Person[]> {
    try {
      return await this.readJson<Person[]>(this.peopleFile())
    } catch {
      return []
    }
  }

  async savePerson(person: Person, by: string): Promise<Person[]> {
    const f = this.peopleFile()
    await fs.mkdir(this.root, { recursive: true })
    const release = await this.lock(f, by)
    try {
      const list = await this.people()
      const i = list.findIndex((p) => p.id === person.id)
      if (i >= 0) list[i] = person
      else list.push(person)
      await this.writeAtomic(f, JSON.stringify(list, null, 1))
      return list
    } finally {
      await release()
    }
  }

  async peopleMtime(): Promise<number> {
    try {
      return (await fs.stat(this.peopleFile())).mtimeMs
    } catch {
      return 0
    }
  }
}
