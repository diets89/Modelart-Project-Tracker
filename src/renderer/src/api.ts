import type { Op } from '@shared/ops'
import type { ActivityEntry, Collection, Job, Notice, NoticeLink, Person, Project } from '@shared/types'
import type { Cell, Timesheet } from '@shared/timesheet'

export interface AppConfig {
  dataDir: string
  userId: string
  theme: 'system' | 'light' | 'dark'
  agentEdits: boolean
  reminders: boolean
  reminderTime: string
  celebrations: boolean
  sounds: boolean
  noticeAlerts: boolean
  defaultDir: string
  version: string
}

export type UpdateState =
  | { state: 'idle' | 'dev' | 'latest' | 'checking' }
  | { state: 'downloading'; version?: string; percent?: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface McpInfo {
  launch: { command: string; args: string[]; env: Record<string, string> }
  claude: boolean
}

interface Api {
  getConfig(): Promise<AppConfig>
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  pickFolder(): Promise<string | null>
  load(): Promise<{ online: boolean; projects: Project[]; templates: Project[]; people: Person[]; jobs: Job[] }>
  apply(c: Collection, id: string, ops: Op[]): Promise<{ project: Project; errors: string[] }>
  create(c: Collection, p: Project): Promise<Project>
  remove(c: Collection, id: string): Promise<void>
  activity(projectId: string): Promise<ActivityEntry[]>
  savePerson(p: Person): Promise<Person[]>
  saveJob(j: Job): Promise<Job[]>
  avatars(): Promise<Record<string, string>>
  loadNotices(): Promise<Notice[]>
  postNotice(n: Notice): Promise<Notice>
  markNotice(id: string, action: 'read' | 'done' | 'undone'): Promise<Notice>
  removeNotice(id: string): Promise<void>
  pickPath(kind: 'file' | 'folder', from?: string): Promise<string[]>
  checkPath(p: string): Promise<NoticeLink & { exists: boolean }>
  revealPath(p: string): Promise<void>
  pathForFile(f: File): string
  onNotice(cb: (n: Notice) => void): () => void
  onNoticeRemoved(cb: (id: string) => void): () => void
  onJobs(cb: (x: Job[]) => void): () => void
  exportXlsx(projectId: string): Promise<string | null>
  loadSheets(): Promise<Timesheet[]>
  applySheet(person: string, week: string, cells: Record<string, Cell | null>): Promise<Timesheet>
  exportTimesheets(week: string): Promise<string | null>
  onSheet(cb: (x: Timesheet) => void): () => void
  onNavigate(cb: (x: { page: string }) => void): () => void
  mcpInfo(): Promise<McpInfo>
  connectClaude(): Promise<boolean>
  checkUpdate(): Promise<UpdateState>
  installUpdate(): Promise<void>
  onChanged(cb: (x: { collection: Collection; project: Project }) => void): () => void
  onRemoved(cb: (x: { collection: Collection; id: string }) => void): () => void
  onPeople(cb: (x: Person[]) => void): () => void
  onOnline(cb: (x: boolean) => void): () => void
  onUpdate(cb: (x: UpdateState) => void): () => void
}

declare global {
  interface Window {
    api: Api
  }
}

export const api = (): Api => window.api

/** Electron wraps errors thrown in the main process; keep only the message. */
export function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
