import ExcelJS from 'exceljs'
import { itemStatus, summarize, allItems } from '../shared/status'
import { FLAG_LABELS, type Person, type Project } from '../shared/types'

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
