// Shared data model. Everything stored on the network drive follows these shapes.

export type StepMark = 'started' | 'done' | 'na'

export interface StepStamp {
  s: StepMark
  by: string // person id
  at: string // ISO time
}

export interface Step {
  id: string
  label: string // "Machining"
  short: string // "Mach"
}

/** Manual flags override the automatic status. */
export type Flag = 'hold' | 'aw-info' | 'aw-mp' | 'aw-del'

export const FLAG_LABELS: Record<Flag, string> = {
  hold: 'On hold',
  'aw-info': 'Awaiting info',
  'aw-mp': 'Awaiting material',
  'aw-del': 'Awaiting delivery'
}

export interface Item {
  id: string
  name: string
  qty: string
  lead: string[] // person ids
  drawBy: string[]
  assyBy: string[]
  steps: Record<string, StepStamp> // keyed by step id; missing = not started
  flag: Flag | null
  notes: string
  duplicates: string // e.g. "Prec A Stage 01 (x1), Prec B Stage 07 (x1)"
  updatedAt: string
}

export interface Group {
  id: string
  name: string
  items: Item[]
}

export interface Section {
  id: string
  name: string
  groups: Group[]
}

export type ProjectStatus = 'active' | 'hold' | 'delivered'

export interface Project {
  id: string
  kind: 'project' | 'template'
  name: string
  code: string
  scale: string
  client: string
  due: string // yyyy-mm-dd or ''
  status: ProjectStatus
  steps: Step[]
  sections: Section[]
  createdAt: string
  updatedAt: string
  rev: number
}

/** A job number with no tracker project, so time can still be logged to it. */
export interface Job {
  id: string
  code: string // "P34/26"
  name: string
  archived?: boolean
}

/** A file or folder on the server, opened in Explorer from a notice. */
export interface NoticeLink {
  path: string
  kind: 'file' | 'folder'
}

/**
 * A notice on the noticeboard. Personal notices go to the people in `to`;
 * public ones (to is empty) are for everyone.
 */
export interface Notice {
  id: string
  from: string
  to: string[]
  title: string
  message: string
  links: NoticeLink[]
  /** Optional link to a tracker item */
  projectId?: string
  itemId?: string
  createdAt: string
  readBy: string[]
  doneBy?: string
  doneAt?: string
}

export interface Person {
  id: string
  name: string
  initials: string
  color: string
  /** File name of a picture in the data folder's avatars/ folder */
  avatar?: string
  archived?: boolean
}

export interface ActivityEntry {
  at: string
  by: string
  projectId: string
  itemId?: string
  text: string
  /** Set when the change came from an AI agent through the MCP server. */
  via?: 'ai'
}

export type Collection = 'projects' | 'templates'
