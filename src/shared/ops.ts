// Every edit is a small "op". The main process re-reads the latest file from the
// network drive, applies the op, and writes it back, so two people editing
// different things never overwrite each other.
import type { Flag, Group, Item, Project, Section, Step, StepMark } from './types'

export type Op =
  | { type: 'project.update'; patch: Partial<Pick<Project, 'name' | 'code' | 'scale' | 'client' | 'due' | 'status'>> }
  | { type: 'item.step'; itemId: string; stepId: string; mark: StepMark | null }
  | { type: 'item.update'; itemId: string; patch: Partial<Omit<Item, 'id' | 'steps' | 'updatedAt'>> }
  | { type: 'item.add'; groupId: string; item: Item; index?: number }
  | { type: 'item.delete'; itemId: string }
  | { type: 'item.move'; itemId: string; dir: -1 | 1 }
  | { type: 'group.add'; sectionId: string; group: Group }
  | { type: 'group.update'; groupId: string; name: string }
  | { type: 'group.delete'; groupId: string }
  | { type: 'group.move'; groupId: string; dir: -1 | 1 }
  | { type: 'section.add'; section: Section }
  | { type: 'section.update'; sectionId: string; name: string }
  | { type: 'section.delete'; sectionId: string }
  | { type: 'section.move'; sectionId: string; dir: -1 | 1 }
  | { type: 'step.add'; step: Step }
  | { type: 'step.update'; stepId: string; label: string; short: string }
  | { type: 'step.delete'; stepId: string }
  | { type: 'step.move'; stepId: string; dir: -1 | 1 }

export interface Stamp {
  by: string
  at: string
}

export class OpError extends Error {}

function findItem(p: Project, itemId: string): { group: Group; item: Item; index: number } {
  for (const s of p.sections)
    for (const g of s.groups) {
      const index = g.items.findIndex((i) => i.id === itemId)
      if (index >= 0) return { group: g, item: g.items[index], index }
    }
  throw new OpError('That item was removed by someone else.')
}

function findGroup(p: Project, groupId: string): { section: Section; group: Group; index: number } {
  for (const s of p.sections) {
    const index = s.groups.findIndex((g) => g.id === groupId)
    if (index >= 0) return { section: s, group: s.groups[index], index }
  }
  throw new OpError('That group was removed by someone else.')
}

function findSection(p: Project, sectionId: string): { section: Section; index: number } {
  const index = p.sections.findIndex((s) => s.id === sectionId)
  if (index < 0) throw new OpError('That section was removed by someone else.')
  return { section: p.sections[index], index }
}

function move<T>(arr: T[], index: number, dir: -1 | 1): void {
  const to = index + dir
  if (to < 0 || to >= arr.length) return
  const [x] = arr.splice(index, 1)
  arr.splice(to, 0, x)
}

/** Applies an op in place. Throws OpError when the target no longer exists. */
export function applyOp(p: Project, op: Op, stamp: Stamp): void {
  switch (op.type) {
    case 'project.update':
      Object.assign(p, op.patch)
      break
    case 'item.step': {
      const { item } = findItem(p, op.itemId)
      if (op.mark === null) delete item.steps[op.stepId]
      else item.steps[op.stepId] = { s: op.mark, by: stamp.by, at: stamp.at }
      item.updatedAt = stamp.at
      break
    }
    case 'item.update': {
      const { item } = findItem(p, op.itemId)
      Object.assign(item, op.patch)
      item.updatedAt = stamp.at
      break
    }
    case 'item.add': {
      const { group } = findGroup(p, op.groupId)
      const at = op.index ?? group.items.length
      group.items.splice(at, 0, op.item)
      break
    }
    case 'item.delete': {
      const { group, index } = findItem(p, op.itemId)
      group.items.splice(index, 1)
      break
    }
    case 'item.move': {
      const { group, index } = findItem(p, op.itemId)
      move(group.items, index, op.dir)
      break
    }
    case 'group.add':
      findSection(p, op.sectionId).section.groups.push(op.group)
      break
    case 'group.update':
      findGroup(p, op.groupId).group.name = op.name
      break
    case 'group.delete': {
      const { section, index } = findGroup(p, op.groupId)
      section.groups.splice(index, 1)
      break
    }
    case 'group.move': {
      const { section, index } = findGroup(p, op.groupId)
      move(section.groups, index, op.dir)
      break
    }
    case 'section.add':
      p.sections.push(op.section)
      break
    case 'section.update':
      findSection(p, op.sectionId).section.name = op.name
      break
    case 'section.delete':
      p.sections.splice(findSection(p, op.sectionId).index, 1)
      break
    case 'section.move':
      move(p.sections, findSection(p, op.sectionId).index, op.dir)
      break
    case 'step.add':
      if (!p.steps.some((s) => s.id === op.step.id)) p.steps.push(op.step)
      break
    case 'step.update': {
      const s = p.steps.find((x) => x.id === op.stepId)
      if (!s) throw new OpError('That step was removed by someone else.')
      s.label = op.label
      s.short = op.short
      break
    }
    case 'step.delete':
      p.steps = p.steps.filter((s) => s.id !== op.stepId)
      for (const sec of p.sections) for (const g of sec.groups) for (const i of g.items) delete i.steps[op.stepId]
      break
    case 'step.move': {
      const index = p.steps.findIndex((s) => s.id === op.stepId)
      if (index >= 0) move(p.steps, index, op.dir)
      break
    }
  }
  p.updatedAt = stamp.at
  p.rev = (p.rev ?? 0) + 1
}

/** Plain-language description for the activity log. */
export function describeOp(p: Project, op: Op): { text: string; itemId?: string } {
  const itemName = (id: string): string => {
    try {
      return findItem(p, id).item.name
    } catch {
      return 'an item'
    }
  }
  const stepName = (id: string): string => p.steps.find((s) => s.id === id)?.label ?? 'a step'
  switch (op.type) {
    case 'item.step': {
      const verb = op.mark === 'done' ? 'finished' : op.mark === 'started' ? 'started' : op.mark === 'na' ? 'marked N/A' : 'cleared'
      return { text: `${verb} ${stepName(op.stepId)} on ${itemName(op.itemId)}`, itemId: op.itemId }
    }
    case 'item.update': {
      const keys = Object.keys(op.patch)
      if (keys.includes('flag')) {
        const f = op.patch.flag as Flag | null
        return { text: f ? `flagged ${itemName(op.itemId)}: ${f}` : `cleared the flag on ${itemName(op.itemId)}`, itemId: op.itemId }
      }
      return { text: `edited ${keys.join(', ')} on ${itemName(op.itemId)}`, itemId: op.itemId }
    }
    case 'item.add':
      return { text: `added item ${op.item.name}`, itemId: op.item.id }
    case 'item.delete':
      return { text: `deleted item ${itemName(op.itemId)}` }
    case 'project.update':
      return { text: `edited project details (${Object.keys(op.patch).join(', ')})` }
    default:
      return { text: `changed structure (${op.type})` }
  }
}
