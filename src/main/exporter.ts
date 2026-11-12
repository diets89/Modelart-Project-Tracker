import ExcelJS from 'exceljs'
import { itemStatus, summarize, allItems } from '../shared/status'
import { FLAG_LABELS, type Job, type Person, type Project } from '../shared/types'
import { activity, cellGroup, DAYS, dayDate, groupOf, SLOTS, slotTime, weekNo, type Timesheet } from '../shared/timesheet'

const DONE = 'FF92D050' // the same green the team uses in the sheet
const STARTED = 'FFE2F0CB'
const NA = 'FFE4E4E7'

export async function exportXlsx(p: Project, people: Person[], file: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Modelart Tracker'
  const ws = wb.addWorksheet('Workflow', { views: [{ state: 'frozen', ySplit: 6, xSplit: 2 }] })
  const who = (ids: string[]): string => ids.map((id) => people.find((x) => x.id === id)?.name ?? id).join(', ')
  const sum = summarize(allItems(p), p.steps)

  ws.getCell('A1').value = 'Model:'
  ws.getCell('B1').value = [p.code, p.name].filter(Boolean).join(' ')
  ws.getCell('B1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = 'Scale:'
  ws.getCell('B2').value = p.scale
  ws.getCell('A3').value = 'Updated'
  ws.getCell('B3').value = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
  ws.getCell('A4').value = 'Progress'
  ws.getCell('B4').value = `${Math.round(sum.progress * 100)}%  (${sum.done} of ${sum.total} items complete)`

  const header = ['Section', 'Item', 'QTY', 'Lead', 'Drawing', ...p.steps.map((s) => s.short), 'Assembly', 'Status', 'Notes', 'Duplicates']
  const hr = ws.getRow(6)
  hr.values = header
  hr.font = { bold: true }
  hr.border = { bottom: { style: 'thin' } }

  const stepCol0 = 6
  let r = 7
  for (const s of p.sections) {
    for (const g of s.groups) {
      const gr = ws.getRow(r++)
      gr.getCell(1).value = s.name
      gr.getCell(2).value = g.name
      gr.font = { bold: true }
      gr.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } }
      for (const i of g.items) {
        const row = ws.getRow(r++)
        const st = itemStatus(i, p.steps)
        row.getCell(2).value = i.name
        row.getCell(3).value = i.qty
        row.getCell(4).value = who(i.lead)
        row.getCell(5).value = who(i.drawBy)
        p.steps.forEach((step, k) => {
          const c = row.getCell(stepCol0 + k)
          const m = i.steps[step.id]?.s
          const color = m === 'done' ? DONE : m === 'started' ? STARTED : m === 'na' ? NA : null
          if (color) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
          c.value = m === 'started' ? 'started' : m === 'na' ? 'n/a' : ''
          c.alignment = { horizontal: 'center' }
          c.border = { left: { style: 'hair' }, right: { style: 'hair' } }
        })
        const after = stepCol0 + p.steps.length
        row.getCell(after).value = who(i.assyBy)
        row.getCell(after + 1).value = i.flag ? FLAG_LABELS[i.flag] : st.label
        row.getCell(after + 2).value = i.notes
        row.getCell(after + 3).value = i.duplicates
      }
    }
    r++
  }
  ws.columns.forEach((col, idx) => {
    col.width = idx === 1 ? 42 : idx >= stepCol0 - 1 && idx < stepCol0 - 1 + p.steps.length ? 8 : idx === 0 ? 14 : 18
  })
  ws.getColumn(stepCol0 + p.steps.length + 2).width = 40
  await wb.xlsx.writeFile(file)
}

// ---------- timesheets ----------
const GENERAL = 'FFF1F1F3'
const WORK = 'FFE8F1FB'

/** One sheet per person in the familiar slot layout, plus a summary of hours. */
export async function exportTimesheets(week: string, sheets: Timesheet[], people: Person[], projects: Project[], jobs: Job[], file: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Modelart Tracker'
  const name = (id: string): string => people.find((p) => p.id === id)?.name ?? id
  const proj = (id?: string): Project | undefined => projects.find((p) => p.id === id)
  const itemName = (p: Project | undefined, id?: string): string => {
    if (!p || !id) return ''
    for (const s of p.sections) for (const g of s.groups) for (const i of g.items) if (i.id === id) return i.name
    return ''
  }
  const fmt = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const range = `${fmt(dayDate(week, 0))} - ${fmt(dayDate(week, 6))} ${dayDate(week, 6).getFullYear()}`

  // Summary first, so it opens on the totals.
  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] })
  sum.getCell('A1').value = `Timesheets, week ${weekNo(week)} (${range})`
  sum.getCell('A1').font = { bold: true, size: 14 }
  const hr = sum.getRow(3)
  hr.values = ['Person', 'Job no.', 'Project', 'Part of the model', 'Activity', 'Hours']
  hr.font = { bold: true }
  hr.border = { bottom: { style: 'thin' } }
  let r = 4
  for (const t of sheets) {
    const totals = new Map<string, { job: string; project: string; item: string; act: string; n: number }>()
    for (const c of Object.values(t.cells)) {
      const p = proj(c.p)
      const j = jobs.find((x) => x.id === c.j)
      const gid = cellGroup(p, c)
      const k = [c.p, c.j, gid, c.a].join('|')
      const cur = totals.get(k) ?? { job: p?.code ?? j?.code ?? '', project: p?.name ?? j?.name ?? '', item: groupOf(p, gid)?.name ?? '', act: `${c.a} ${activity(c.a)?.label ?? ''}`.trim(), n: 0 }
      cur.n++
      totals.set(k, cur)
    }
    const rows = [...totals.values()].sort((a, b) => (a.project || '~').localeCompare(b.project || '~') || a.item.localeCompare(b.item))
    for (const x of rows) sum.getRow(r++).values = [name(t.person), x.job, x.project, x.item, x.act, x.n / 2]
    const tot = sum.getRow(r++)
    tot.values = [`${name(t.person)} total`, '', '', '', '', Object.keys(t.cells).length / 2]
    tot.font = { bold: true }
    r++
  }
  sum.columns = [{ width: 18 }, { width: 10 }, { width: 26 }, { width: 34 }, { width: 30 }, { width: 8 }]

  for (const t of sheets) {
    const ws = wb.addWorksheet(name(t.person).slice(0, 31), { views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }] })
    ws.getCell('A1').value = `${name(t.person)}, week ${weekNo(week)}`
    ws.getCell('A1').font = { bold: true, size: 13 }
    ws.getCell('E1').value = range
    const days = DAYS.map((_, d) => d).filter((d) => d < 5 || Object.keys(t.cells).some((k) => k.startsWith(d + ':')))
    days.forEach((d, n) => {
      const col = 2 + n * 3
      ws.mergeCells(3, col, 3, col + 2)
      const c = ws.getCell(3, col)
      c.value = `${DAYS[d]} ${fmt(dayDate(week, d))}`
      c.font = { bold: true }
      c.alignment = { horizontal: 'center' }
      ;['Activity', 'Job No.', 'Part'].forEach((h, k) => {
        const hc = ws.getCell(4, col + k)
        hc.value = h
        hc.font = { bold: true, size: 9 }
        hc.border = { bottom: { style: 'thin' } }
      })
      ws.getColumn(col).width = 8
      ws.getColumn(col + 1).width = 9
      ws.getColumn(col + 2).width = 22
    })
    ws.getCell(4, 1).value = 'Time'
    ws.getCell(4, 1).font = { bold: true, size: 9 }
    ws.getColumn(1).width = 12
    for (let s = 0; s < SLOTS; s++) {
      const row = ws.getRow(5 + s)
      row.getCell(1).value = `${slotTime(s)} - ${slotTime(s + 1)}`
      days.forEach((d, n) => {
        const c = t.cells[`${d}:${s}`]
        if (!c) return
        const p = proj(c.p)
        const col = 2 + n * 3
        row.getCell(col).value = c.a
        row.getCell(col + 1).value = p?.code ?? jobs.find((x) => x.id === c.j)?.code ?? ''
        row.getCell(col + 2).value = groupOf(p, cellGroup(p, c))?.name ?? ''
        const fill = activity(c.a)?.general ? GENERAL : WORK
        for (let k = 0; k < 3; k++) row.getCell(col + k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      })
    }
    const tr = ws.getRow(6 + SLOTS)
    tr.getCell(1).value = 'Hours'
    tr.font = { bold: true }
    days.forEach((d, n) => {
      tr.getCell(2 + n * 3).value = Object.keys(t.cells).filter((k) => k.startsWith(d + ':')).length / 2
    })
  }
  await wb.xlsx.writeFile(file)
}
