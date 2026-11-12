// MCP server: lets an AI agent (Claude Desktop, Claude Code, ...) read and update
// Modelart Tracker projects. It talks to the same shared data folder as the app and
// saves through the same lock + re-read + apply path, so it is safe alongside people.
//
// Run by the installed app:  "Modelart Tracker.exe" with ELECTRON_RUN_AS_NODE=1 and
// this file as the script. Options: --data <folder>  --user <person id>  --read-only
// Without options it uses the data folder and name chosen in the app on this PC.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { Storage } from '../main/storage'
import { cloneStructure, blankProject, newItem, newGroup } from '../shared/factory'
import type { Op } from '../shared/ops'
import { allItems, involves, itemStatus, summarize } from '../shared/status'
import { FLAG_LABELS, type Flag, type Item, type Person, type Project, type StepMark } from '../shared/types'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function appConfig(): Promise<{ dataDir?: string; userId?: string; agentEdits?: boolean }> {
  const base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  try {
    return JSON.parse(await fs.readFile(path.join(base, 'Modelart Tracker', 'config.json'), 'utf8'))
  } catch {
    return {}
  }
}

class UserError extends Error {}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })
const fail = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true })

async function main(): Promise<void> {
  const cfg = await appConfig()
  const dataDir = arg('data') ?? process.env.MAT_DATA_DIR ?? cfg.dataDir
  const userArg = arg('user') ?? process.env.MAT_USER ?? cfg.userId ?? ''
  const readOnly = process.argv.includes('--read-only')
  if (!dataDir) {
    console.error('No data folder. Open Modelart Tracker once on this PC, or pass --data <folder>.')
    process.exit(1)
  }
  const store = new Storage(dataDir)

  // ---------- lookups ----------
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

  async function people(): Promise<Person[]> {
    return store.people()
  }

  async function me(): Promise<string> {
    const list = await people()
    const p = list.find((x) => x.id === userArg) ?? list.find((x) => norm(x.name) === norm(userArg))
    if (!p) throw new UserError('No name is set for changes. Pick your name in Modelart Tracker (Settings > You), or pass --user.')
    return p.id
  }

  async function findPeople(names: string[]): Promise<string[]> {
    const list = (await people()).filter((p) => !p.archived)
    return names.map((n) => {
      const k = norm(n)
      const p = list.find((x) => x.id === n || norm(x.name) === k || norm(x.initials) === k) ?? list.filter((x) => norm(x.name).startsWith(k))[0]
      if (!p) throw new UserError(`Nobody called "${n}" in the team. Team: ${list.map((x) => x.name).join(', ')}`)
      return p.id
    })
  }

  async function findProject(ref: string, collection: 'projects' | 'templates' = 'projects'): Promise<Project> {
    const all = (await store.list(collection)).map((x) => x.project)
    const k = norm(ref)
    const hit =
      all.find((p) => p.id === ref) ??
      all.find((p) => norm(p.code) === k && k) ??
      all.find((p) => norm(p.name) === k) ??
      (all.filter((p) => norm(p.name).includes(k)).length === 1 ? all.find((p) => norm(p.name).includes(k)) : undefined)
    if (!hit) throw new UserError(`No ${collection === 'projects' ? 'project' : 'template'} matches "${ref}". Options: ${all.map((p) => `${p.name} (${p.id})`).join(', ') || 'none'}`)
    return hit
  }

  function findItem(p: Project, ref: string): Item {
    const items = allItems(p)
    const byId = items.find((i) => i.id === ref)
    if (byId) return byId
    const k = norm(ref)
    const exact = items.filter((i) => norm(i.name) === k)
    if (exact.length === 1) return exact[0]
    const part = items.filter((i) => norm(i.name).includes(k))
    if (part.length === 1) return part[0]
    const many = (exact.length ? exact : part).slice(0, 15)
    if (many.length) throw new UserError(`"${ref}" matches several items, use the id: ${many.map((i) => `${i.name} in ${where(p, i.id)} [${i.id}]`).join(', ')}`)
    throw new UserError(`No item matches "${ref}" in ${p.name}.`)
  }

  function findStep(p: Project, ref: string): string {
    const k = norm(ref)
    const s = p.steps.find((x) => x.id === ref || norm(x.label) === k || norm(x.short) === k) ?? p.steps.find((x) => norm(x.label).startsWith(k))
    if (!s) throw new UserError(`No step "${ref}". Steps: ${p.steps.map((x) => x.label).join(', ')}`)
    return s.id
  }

  function where(p: Project, itemId: string): string {
    for (const s of p.sections) for (const g of s.groups) if (g.items.some((i) => i.id === itemId)) return g.name === s.name ? s.name : `${s.name} / ${g.name}`
    return ''
  }

  // ---------- formatting ----------
  const MARK: Record<StepMark, string> = { done: 'done', started: 'started', na: 'n/a' }
  function itemLine(p: Project, i: Item, ppl: Person[]): string {
    const name = (ids: string[]): string => ids.map((id) => ppl.find((x) => x.id === id)?.name ?? id).join(', ')
    const steps = p.steps.map((s) => `${s.short}: ${i.steps[s.id] ? MARK[i.steps[s.id].s] : '-'}`).join(', ')
    const bits = [`${i.name}${i.qty ? ` (qty ${i.qty})` : ''} [${i.id}]`, itemStatus(i, p.steps).label, steps]
    if (i.lead.length) bits.push('lead ' + name(i.lead))
    if (i.drawBy.length) bits.push('drawing ' + name(i.drawBy))
    if (i.assyBy.length) bits.push('assembly ' + name(i.assyBy))
    if (i.notes) bits.push('notes: ' + i.notes.replace(/\s+/g, ' '))
    return '- ' + bits.join(' | ')
  }

  function projectHeader(p: Project): string {
    const s = summarize(allItems(p), p.steps)
    const meta = [p.code && `code ${p.code}`, p.client && `client ${p.client}`, p.scale && `scale ${p.scale}`, p.due && `due ${p.due}`, `status ${p.status}`]
    return (
      `${p.name} [${p.id}]: ${meta.filter(Boolean).join(', ')}\n` +
      `${s.total} items, ${s.done} complete, ${s.inProgress} in progress, ${s.waiting} awaiting, ${s.hold} on hold, ${Math.round(s.progress * 100)}% overall\n` +
      `Steps: ${p.steps.map((x) => `${x.label} (${x.short})`).join(', ')}`
    )
  }

  async function save(p: Project, ops: Op[]): Promise<string> {
    const r = await store.apply('projects', p.id, ops, await me(), 'ai')
    return r.errors.length ? 'Some changes failed: ' + r.errors.join('; ') : 'Saved.'
  }

  // Wraps a handler so friendly errors come back to the agent instead of crashing.
  function guard<A>(fn: (a: A) => Promise<ReturnType<typeof text>>) {
    return async (a: A) => {
      try {
        return await fn(a)
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    }
  }
  // Re-read each time, so the "Allow changes" switch in the app takes effect without restarting the agent.
  async function writable(): Promise<void> {
    if (readOnly || (await appConfig()).agentEdits === false) throw new UserError('This connection is read only. Turn on "Allow changes" in Modelart Tracker settings to let the agent edit.')
  }

  const server = new McpServer(
    { name: 'modelart-tracker', version: '1.0.0' },
    {
      instructions:
        'Modelart Tracker holds Modelart model-build projects. A project has sections > groups > items; each item moves through steps ' +
        '(e.g. Drawing, Machining, Assembly, Install), each step not started, started, done or n/a. Status is worked out from the steps ' +
        'unless a flag is set (on hold, awaiting info/material/delivery). Projects, items, steps and people can be referred to by name or id. ' +
        'Changes are saved to the shared network folder straight away and are visible to the whole team, recorded as made by the PC user "via AI". ' +
        'Confirm with the user before making many changes at once.'
    }
  )

  server.registerTool(
    'list_projects',
    { description: 'List projects with code, due date, status and progress.', inputSchema: { include_delivered: z.boolean().optional() } },
    guard(async ({ include_delivered }) => {
      const all = (await store.list('projects')).map((x) => x.project).filter((p) => include_delivered || p.status !== 'delivered')
      return text(all.length ? all.map(projectHeader).join('\n\n') : 'No projects.')
    })
  )

  server.registerTool(
    'get_project',
    {
      description: 'Show a project and its items with status, steps, people and notes. Filters narrow the list on big projects.',
      inputSchema: {
        project: z.string().describe('Project name, code or id'),
        section: z.string().optional().describe('Only this section or group (name contains)'),
        status: z.enum(['complete', 'in_progress', 'not_started', 'awaiting', 'on_hold', 'open']).optional().describe('open = anything not complete'),
        person: z.string().optional().describe('Only items this person leads, draws or assembles')
      }
    },
    guard(async ({ project, section, status, person }) => {
      const p = await findProject(project)
      const ppl = await people()
      const who = person ? (await findPeople([person]))[0] : undefined
      const kinds: Record<string, string[]> = {
        complete: ['done'],
        in_progress: ['progress'],
        not_started: ['idle'],
        awaiting: ['waiting'],
        on_hold: ['hold'],
        open: ['progress', 'idle', 'waiting', 'hold']
      }
      const out = [projectHeader(p)]
      let shown = 0
      for (const s of p.sections)
        for (const g of s.groups) {
          if (section && !norm(`${s.name} ${g.name}`).includes(norm(section))) continue
          const items = g.items.filter((i) => (!status || kinds[status].includes(itemStatus(i, p.steps).kind)) && (!who || involves(i, who)))
          if (!items.length) continue
          out.push(`\n## ${g.name === s.name ? s.name : `${s.name} / ${g.name}`} [group ${g.id}]`)
          for (const i of items) out.push(itemLine(p, i, ppl))
          shown += items.length
        }
      if (!shown) out.push('\nNo items match.')
      return text(out.join('\n'))
    })
  )

  server.registerTool(
    'person_tasks',
    {
      description: "Everything a person is involved in that isn't complete, across all active projects.",
      inputSchema: { person: z.string().optional().describe('Name; defaults to the PC user') }
    },
    guard(async ({ person }) => {
      const id = person ? (await findPeople([person]))[0] : await me()
      const ppl = await people()
      const out: string[] = []
      for (const { project: p } of await store.list('projects')) {
        if (p.status === 'delivered') continue
        const items = allItems(p).filter((i) => involves(i, id) && itemStatus(i, p.steps).kind !== 'done')
        if (!items.length) continue
        out.push(`## ${p.name} [${p.id}]`)
        for (const i of items) out.push(itemLine(p, i, ppl) + ` | in ${where(p, i.id)}`)
      }
      return text(out.length ? out.join('\n') : 'Nothing open.')
    })
  )

  server.registerTool(
    'search_items',
    { description: 'Find items by name or notes across all projects.', inputSchema: { query: z.string() } },
    guard(async ({ query }) => {
      const k = norm(query)
      const ppl = await people()
      const out: string[] = []
      for (const { project: p } of await store.list('projects'))
        for (const i of allItems(p))
          if (norm(i.name).includes(k) || norm(i.notes).includes(k)) out.push(itemLine(p, i, ppl) + ` | ${p.name} [${p.id}] / ${where(p, i.id)}`)
      return text(out.length ? out.slice(0, 80).join('\n') + (out.length > 80 ? `\n...and ${out.length - 80} more` : '') : 'No matches.')
    })
  )

  server.registerTool(
    'get_activity',
    { description: 'Recent changes on a project: who did what, when.', inputSchema: { project: z.string(), limit: z.number().int().min(1).max(300).optional() } },
    guard(async ({ project, limit }) => {
      const p = await findProject(project)
      const ppl = await people()
      const list = await store.activity(p.id, limit ?? 40)
      return text(list.length ? list.map((e) => `${e.at.slice(0, 16).replace('T', ' ')} ${ppl.find((x) => x.id === e.by)?.name ?? e.by} ${e.text}${e.via ? ' (via AI)' : ''}`).join('\n') : 'No activity yet.')
    })
  )

  server.registerTool(
    'list_people',
    { description: 'The team: names and initials.' },
    guard(async () => {
      const list = await people()
      const mine = await me().catch(() => '')
      return text(list.filter((p) => !p.archived).map((p) => `${p.name} (${p.initials})${p.id === mine ? ' - the PC user, changes are recorded under this name' : ''}`).join('\n'))
    })
  )

  server.registerTool(
    'list_templates',
    { description: 'Templates new projects can start from.' },
    guard(async () => {
      const list = (await store.list('templates')).map((x) => x.project)
      return text(list.length ? list.map((t) => `${t.name} [${t.id}]: ${allItems(t).length} items, steps ${t.steps.map((s) => s.short).join(', ')}`).join('\n') : 'No templates.')
    })
  )

  // ---------- changes ----------
  server.registerTool(
    'set_step',
    {
      description: "Mark a step on an item: done, started, n/a, or clear it back to not started.",
      inputSchema: {
        project: z.string(),
        item: z.string().describe('Item name or id'),
        step: z.string().describe('Step name, short name or id, e.g. "Machining" or "Mach"'),
        mark: z.enum(['done', 'started', 'na', 'clear'])
      }
    },
    guard(async ({ project, item, step, mark }) => {
      await writable()
      const p = await findProject(project)
      const i = findItem(p, item)
      const stepId = findStep(p, step)
      return text(`${i.name}: ${p.steps.find((s) => s.id === stepId)!.label} -> ${mark}. ` + (await save(p, [{ type: 'item.step', itemId: i.id, stepId, mark: mark === 'clear' ? null : mark }])))
    })
  )

  server.registerTool(
    'update_item',
    {
      description: 'Change an item: name, quantity, notes, flag, or the people on it. Only the fields given change. People lists replace the existing list.',
      inputSchema: {
        project: z.string(),
        item: z.string().describe('Item name or id'),
        name: z.string().optional(),
        qty: z.string().optional(),
        notes: z.string().optional().describe('Replaces the notes'),
        append_note: z.string().optional().describe('Adds a line to the notes'),
        flag: z.enum(['none', 'hold', 'aw-info', 'aw-mp', 'aw-del']).optional().describe(`none, ${Object.entries(FLAG_LABELS).map(([k, v]) => `${k} = ${v}`).join(', ')}`),
        lead: z.array(z.string()).optional(),
        drawing: z.array(z.string()).optional(),
        assembly: z.array(z.string()).optional()
      }
    },
    guard(async (a) => {
      await writable()
      const p = await findProject(a.project)
      const i = findItem(p, a.item)
      const patch: Extract<Op, { type: 'item.update' }>['patch'] = {}
      if (a.name !== undefined) patch.name = a.name
      if (a.qty !== undefined) patch.qty = a.qty
      if (a.notes !== undefined) patch.notes = a.notes
      if (a.append_note) patch.notes = (patch.notes ?? i.notes) ? `${patch.notes ?? i.notes}\n${a.append_note}` : a.append_note
      if (a.flag) patch.flag = a.flag === 'none' ? null : (a.flag as Flag)
      if (a.lead) patch.lead = await findPeople(a.lead)
      if (a.drawing) patch.drawBy = await findPeople(a.drawing)
      if (a.assembly) patch.assyBy = await findPeople(a.assembly)
      if (!Object.keys(patch).length) return text('Nothing to change.')
      return text(`${i.name}: ${Object.keys(patch).join(', ')} updated. ` + (await save(p, [{ type: 'item.update', itemId: i.id, patch }])))
    })
  )

  server.registerTool(
    'add_item',
    {
      description: 'Add an item to a group. If the group name is new, a group is created in the given section.',
      inputSchema: {
        project: z.string(),
        group: z.string().describe('Group name or id, e.g. "Precinct A"'),
        section: z.string().optional().describe('Needed only when creating a new group'),
        name: z.string(),
        qty: z.string().optional()
      }
    },
    guard(async (a) => {
      await writable()
      const p = await findProject(a.project)
      const groups = p.sections.flatMap((s) => s.groups.map((g) => ({ s, g })))
      let hit = groups.find(({ g }) => g.id === a.group || norm(g.name) === norm(a.group))
      const ops: Op[] = []
      if (!hit) {
        const sec = a.section && p.sections.find((s) => s.id === a.section || norm(s.name) === norm(a.section!))
        if (!sec) throw new UserError(`No group "${a.group}". Give a section to create it in. Sections: ${p.sections.map((s) => s.name).join(', ')}`)
        const g = newGroup(a.group)
        ops.push({ type: 'group.add', sectionId: sec.id, group: g })
        hit = { s: sec, g }
      }
      const item = newItem(a.name)
      if (a.qty) item.qty = a.qty
      ops.push({ type: 'item.add', groupId: hit.g.id, item })
      return text(`Added ${a.name} [${item.id}] to ${hit.g.name}. ` + (await save(p, ops)))
    })
  )

  server.registerTool(
    'update_project',
    {
      description: 'Change project details.',
      inputSchema: {
        project: z.string(),
        name: z.string().optional(),
        code: z.string().optional(),
        client: z.string().optional(),
        scale: z.string().optional(),
        due: z.string().optional().describe('yyyy-mm-dd, or empty to clear'),
        status: z.enum(['active', 'hold', 'delivered']).optional()
      }
    },
    guard(async ({ project, ...rest }) => {
      await writable()
      const p = await findProject(project)
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (patch.due && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due)) throw new UserError('Due date must be yyyy-mm-dd.')
      if (!Object.keys(patch).length) return text('Nothing to change.')
      return text(`${p.name}: ${Object.keys(patch).join(', ')} updated. ` + (await save(p, [{ type: 'project.update', patch }])))
    })
  )

  server.registerTool(
    'create_project',
    {
      description: 'Create a new project, from a template (recommended) or blank.',
      inputSchema: {
        name: z.string(),
        template: z.string().optional().describe('Template name or id'),
        code: z.string().optional(),
        client: z.string().optional(),
        scale: z.string().optional(),
        due: z.string().optional().describe('yyyy-mm-dd')
      }
    },
    guard(async (a) => {
      await writable()
      const p = a.template ? cloneStructure(await findProject(a.template, 'templates'), a.name, 'project') : blankProject(a.name)
      Object.assign(p, { code: a.code ?? p.code, client: a.client ?? '', scale: a.scale ?? p.scale, due: a.due ?? '' })
      await store.create('projects', p, await me(), 'ai')
      return text(`Created ${p.name} [${p.id}] with ${allItems(p).length} items.`)
    })
  )

  await server.connect(new StdioServerTransport())
  console.error(`Modelart Tracker MCP server on ${dataDir}${readOnly ? ' (read only)' : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
