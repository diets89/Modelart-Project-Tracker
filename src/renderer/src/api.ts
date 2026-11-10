import type { Op } from '@shared/ops'
import type { ActivityEntry, Collection, Person, Project } from '@shared/types'

export interface AppConfig {
  dataDir: string
  userId: string
  theme: 'system' | 'light' | 'dark'
  defaultDir: string
  version: string
}

export type UpdateState =
  | { state: 'idle' | 'dev' | 'latest' | 'checking' }
  | { state: 'downloading'; version?: string; percent?: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

interface Api {
  getConfig(): Promise<AppConfig>
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  pickFolder(): Promise<string | null>
  load(): Promise<{ online: boolean; projects: Project[]; templates: Project[]; people: Person[] }>
  apply(c: Collection, id: string, ops: Op[]): Promise<{ project: Project; errors: string[] }>
  create(c: Collection, p: Project): Promise<Project>
  remove(c: Collection, id: string): Promise<void>
  activity(projectId: string): Promise<ActivityEntry[]>
  savePerson(p: Person): Promise<Person[]>
  exportXlsx(projectId: string): Promise<string | null>
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
