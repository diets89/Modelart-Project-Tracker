// Turns the raw rows from export-xls.ps1 into a Modelart Tracker project + template.
// Usage: node scripts/import-breakdown.mjs raw.json <dataFolder> [--template "City model (Azania)"]
import fs from 'node:fs'
import path from 'node:path'

const [rawPath, dataDir] = process.argv.slice(2)
const tplIdx = process.argv.indexOf('--template')
const templateName = tplIdx > 0 ? process.argv[tplIdx + 1] : null
if (!rawPath || !dataDir) {
  console.error('usage: node import-breakdown.mjs raw.json <dataFolder> [--template name]')
  process.exit(1)
}

const rows = JSON.parse(fs.readFileSync(rawPath, 'utf8').replace(/^﻿/, ''))
const now = new Date().toISOString()
let n = 0
const uid = (p) => p + Date.now().toString(36) + (n++).toString(36).padStart(3, '0')

// ---- people ----
// Team list comes from <dataFolder>/people.json (id, name, initials, color), so no names live in the code.
const peopleFile = path.join(dataDir, 'people.json')
if (!fs.existsSync(peopleFile)) {
  console.error('Create ' + peopleFile + ' first: [{ "id": "sam", "name": "Sam", "initials": "S", "color": "#b45309" }, ...]')
  process.exit(1)
}
const PEOPLE = JSON.parse(fs.readFileSync(peopleFile, 'utf8')).map((p) => [p.id, p.name, p.initials, p.color])
const byName = Object.fromEntries(PEOPLE.map(([id, name]) => [name.toLowerCase(), id]))
const byInitial = Object.fromEntries(PEOPLE.map(([id, , ini]) => [ini.toLowerCase(), id]))
const unknown = new Set()
const names = (s) =>
  (s || '')
    .split(/[,&/]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .map((x) => byName[x] ?? (unknown.add(x), null))
    .filter(Boolean)
const initials = (s) =>
  (s || '')
    .split(/[,\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .map((x) => byInitial[x] ?? (unknown.add('initial ' + x), null))
    .filter(Boolean)

// ---- header ----
const cell = (r, c) => (r.cells[c] ?? '').trim()
const head = Object.fromEntries(rows.filter((r) => r.r <= 5).map((r) => [cell(r, 'B').replace(':', '').toLowerCase(), cell(r, 'C')]))
const fullName = head.model || 'Imported model'
const m = fullName.match(/^(P\d+\/\d+)\s+(.*)$/)
const code = m ? m[1] : ''
const name = (m ? m[2] : fullName).replace(/\s+Model$/i, '')

const steps = [
  { id: 'draw', label: 'Drawing', short: 'Draw' },
  { id: 'mach', label: 'Machining', short: 'Mach' },
  { id: 'assy', label: 'Assembly', short: 'Assy' },
  { id: 'inst', label: 'Install', short: 'Inst' }
]
// Spreadsheet columns: G Started, H Draw comp, I Mach start, J Mach comp, K Ass start, L Ass comp, M Install
const STEP_COLS = { draw: ['G', 'H'], mach: ['I', 'J'], assy: ['K', 'L'], inst: [null, 'M'] }
const STATUS_STEP = { drg: 'draw', mach: 'mach', assy: 'assy', instl: 'inst' }
const FLAGS = { hold: 'hold', 'aw info': 'aw-info', 'aw mp': 'aw-mp', 'aw del': 'aw-del' }

const sections = []
let section = null
let group = null
let prevBlank = true

// A heading row has a name but no qty/people/status and no coloured progress cells.
const isItemRow = (r) =>
  ['D', 'E', 'F', 'N', 'O'].some((c) => cell(r, c)) || Object.keys(r.fill).some((c) => 'GHIJKLM'.includes(c))
let groupNote = ''
let lastRow = 0

for (const r of rows) {
  if (r.r <= 5) continue
  // blank rows are not exported, so a jump in row number means a blank line
  if (r.r !== lastRow + 1) prevBlank = true
  lastRow = r.r
  const sec = cell(r, 'B')
  const nm = cell(r, 'C')
  if (/^to do$/i.test(sec) || cell(r, 'O') === 'Key') break
  if (sec) {
    section = { id: uid('s'), name: sec, groups: [] }
    sections.push(section)
    group = null
    prevBlank = true
  }
  if (!nm) {
    prevBlank = true // blank or subtotal row
    continue
  }
  if (!section) {
    section = { id: uid('s'), name: 'General', groups: [] }
    sections.push(section)
  }
  if (!isItemRow(r) && prevBlank) {
    group = { id: uid('g'), name: nm, items: [] }
    section.groups.push(group)
    groupNote = cell(r, 'P').replace(/^-\s*/, '')
    prevBlank = false
    continue
  }
  prevBlank = false
  if (!group) {
    group = { id: uid('g'), name: section.name, items: [] }
    section.groups.push(group)
  }
  const st = {}
  for (const [sid, [startCol, doneCol]] of Object.entries(STEP_COLS)) {
    if (doneCol && r.fill[doneCol]) st[sid] = { s: 'done', by: 'import', at: now }
    else if (startCol && r.fill[startCol]) st[sid] = { s: 'started', by: 'import', at: now }
  }
  const status = cell(r, 'O').toLowerCase().replace(/\s+/g, ' ')
  const flag = FLAGS[status] ?? null
  const ip = status.match(/^inpr(?:o)?g\s+(\w+)/)
  if (ip && STATUS_STEP[ip[1]] && !st[STATUS_STEP[ip[1]]]) st[STATUS_STEP[ip[1]]] = { s: 'started', by: 'import', at: now }
  const notes = cell(r, 'P').replace(/^-\s*/, '') || groupNote
  const dup = [cell(r, 'Q') && `${cell(r, 'Q')} total`, cell(r, 'R')].filter(Boolean).join(': ')
  group.items.push({
    id: uid('i'),
    name: nm,
    qty: cell(r, 'D'),
    lead: initials(cell(r, 'E')),
    drawBy: names(cell(r, 'F')),
    assyBy: names(cell(r, 'N')),
    steps: st,
    flag,
    notes,
    duplicates: dup,
    updatedAt: now,
    _sheetStatus: cell(r, 'O'),
    _row: r.r
  })
}

// A group with no items is really an item on its own (e.g. "Client Logo,s")
for (const s of sections) {
  const empties = s.groups.filter((g) => g.items.length === 0)
  if (!empties.length) continue
  s.groups = s.groups.filter((g) => g.items.length > 0)
  let home = s.groups.find((g) => g.name === s.name)
  if (!home) s.groups.push((home = { id: uid('g'), name: s.name, items: [] }))
  for (const g of empties)
    home.items.push({ id: uid('i'), name: g.name, qty: '', lead: [], drawBy: [], assyBy: [], steps: {}, flag: null, notes: '', duplicates: '', updatedAt: now })
}

// ---- report: compare sheet status with what the app will show ----
const report = []
for (const s of sections)
  for (const g of s.groups)
    for (const i of g.items) {
      report.push(`${String(i._row ?? '').padStart(3)}  ${s.name} / ${g.name} / ${i.name}  sheet="${i._sheetStatus ?? ''}"  steps=${Object.entries(i.steps).map(([k, v]) => k + ':' + v.s).join(',')}${i.flag ? '  flag=' + i.flag : ''}`)
      delete i._sheetStatus
      delete i._row
    }

const slug = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const updated = Date.parse(head.updated) ? new Date(head.updated).toISOString() : now
const project = {
  id: slug(name),
  kind: 'project',
  name,
  code,
  scale: head.scale || '',
  client: '',
  due: '',
  status: 'active',
  steps,
  sections,
  createdAt: updated,
  updatedAt: now,
  rev: 0
}

fs.mkdirSync(path.join(dataDir, 'projects'), { recursive: true })
fs.mkdirSync(path.join(dataDir, 'templates'), { recursive: true })
fs.mkdirSync(path.join(dataDir, 'activity'), { recursive: true })
const pf = path.join(dataDir, 'projects', project.id + '.json')
if (fs.existsSync(pf)) {
  console.error('Refusing to overwrite existing ' + pf)
  process.exit(2)
}
fs.writeFileSync(pf, JSON.stringify(project, null, 1))
fs.appendFileSync(
  path.join(dataDir, 'activity', project.id + '.log'),
  JSON.stringify({ at: now, by: 'import', projectId: project.id, text: `imported from ${path.basename(rawPath)}` }) + '\n'
)

if (templateName) {
  const tpl = structuredClone(project)
  tpl.id = slug(templateName)
  tpl.kind = 'template'
  tpl.name = templateName
  tpl.code = ''
  for (const s of tpl.sections)
    for (const g of s.groups)
      for (const i of g.items) Object.assign(i, { steps: {}, flag: null, notes: '', lead: [], drawBy: [], assyBy: [] })
  fs.writeFileSync(path.join(dataDir, 'templates', tpl.id + '.json'), JSON.stringify(tpl, null, 1))
}


const count = sections.reduce((a, s) => a + s.groups.reduce((b, g) => b + g.items.length, 0), 0)
console.log(`Project "${project.name}" (${project.code}, ${project.scale}): ${sections.length} sections, ${count} items -> ${pf}`)
if (unknown.size) console.log('Names not matched to a person:', [...unknown].join(', '))
fs.writeFileSync(path.join(dataDir, 'import-report.txt'), report.join('\n'))
