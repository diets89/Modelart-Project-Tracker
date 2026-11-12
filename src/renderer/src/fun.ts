// Little rewards: confetti and soft sounds. Both can be switched off in Settings.
import confetti from 'canvas-confetti'
import { itemStatus } from '../../shared/status'
import type { Item, Project } from '../../shared/types'

const COLORS = ['#d72a33', '#2f8f46', '#f5b301', '#2563eb', '#ffffff', '#3f3f46']

// Bursts start where you clicked, so the confetti comes out of the cell you just ticked.
let last = { x: 0.5, y: 0.5 }
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', (e) => (last = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }), true)

export type Moment = 'tick' | 'item' | 'day' | 'group' | 'project'

export interface FunSettings {
  celebrations: boolean
  sounds: boolean
}

// Our own canvas, drawn on the main thread: the app's security policy doesn't allow the
// library's default background worker.
let fire: confetti.CreateTypes | null = null
function confettiOn(): confetti.CreateTypes {
  if (fire) return fire
  const c = document.createElement('canvas')
  Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '60' })
  document.body.appendChild(c)
  fire = confetti.create(c, { resize: true, useWorker: false, disableForReducedMotion: true })
  return fire
}

export function celebrate(kind: Moment, s: FunSettings): void {
  if (s.sounds) play(kind)
  if (!s.celebrations || kind === 'tick') return
  const confetti = confettiOn()
  const base = { colors: COLORS }
  if (kind === 'item') confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 32, origin: last, scalar: 0.9 })
  else if (kind === 'day') confetti({ ...base, particleCount: 36, spread: 55, startVelocity: 26, origin: last, scalar: 0.8 })
  else if (kind === 'group') {
    confetti({ ...base, particleCount: 90, angle: 60, spread: 65, origin: { x: 0, y: 0.75 } })
    confetti({ ...base, particleCount: 90, angle: 120, spread: 65, origin: { x: 1, y: 0.75 } })
  } else {
    // The whole model is finished: a few seconds of fireworks.
    const end = Date.now() + 3000
    const frame = (): void => {
      confetti({ ...base, particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 } })
      confetti({ ...base, particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 } })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
    confetti({ ...base, particleCount: 160, spread: 120, startVelocity: 45, origin: { x: 0.5, y: 0.35 } })
  }
}

// ---------- sounds, made on the fly (no audio files) ----------
let ctx: AudioContext | null = null
function note(freq: number, at: number, len: number, type: OscillatorType, vol: number): void {
  ctx ??= new AudioContext()
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  const t = ctx.currentTime + at
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + len)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + len + 0.02)
}

const C6 = 1046.5
const E6 = 1318.5
const G6 = 1568
const C7 = 2093

export function play(kind: Moment): void {
  try {
    if (kind === 'tick') note(1400, 0, 0.05, 'sine', 0.05)
    else if (kind === 'item' || kind === 'day') {
      note(C6, 0, 0.18, 'triangle', 0.08)
      note(E6, 0.08, 0.26, 'triangle', 0.08)
    } else {
      const seq = kind === 'project' ? [C6, E6, G6, C7, G6, C7] : [C6, E6, G6, C7]
      seq.forEach((f, i) => note(f, i * 0.09, 0.32, 'triangle', 0.08))
    }
  } catch {
    /* no audio device */
  }
}

// ---------- what just finished ----------
export interface Finished {
  items: Item[]
  groups: { id: string; name: string; section: string }[]
  project: boolean
}

const done = (i: Item, p: Project): boolean => itemStatus(i, p.steps).kind === 'done'

/** Items, groups and the project that went from unfinished to complete between two copies. */
export function finished(before: Project | undefined, after: Project | undefined): Finished {
  const out: Finished = { items: [], groups: [], project: false }
  if (!before || !after || after.kind !== 'project') return out
  const was = new Map<string, boolean>()
  for (const s of before.sections) for (const g of s.groups) for (const i of g.items) was.set(i.id, done(i, before))
  const wasGroup = new Map<string, boolean>()
  for (const s of before.sections) for (const g of s.groups) wasGroup.set(g.id, g.items.length > 0 && g.items.every((i) => done(i, before)))
  let all = true
  let allBefore = true
  for (const s of before.sections) for (const g of s.groups) for (const i of g.items) if (!done(i, before)) allBefore = false
  for (const s of after.sections)
    for (const g of s.groups) {
      for (const i of g.items) {
        const d = done(i, after)
        if (d && was.get(i.id) === false) out.items.push(i)
        if (!d) all = false
      }
      const gd = g.items.length > 0 && g.items.every((i) => done(i, after))
      if (gd && wasGroup.get(g.id) === false && g.items.length > 1) out.groups.push({ id: g.id, name: g.name, section: s.name })
    }
  out.project = all && !allBefore && out.items.length > 0
  return out
}

/** Who ticked the last step in a group, for the team banner. */
export function lastBy(p: Project, groupId?: string): string | undefined {
  let best: { at: string; by: string } | undefined
  for (const s of p.sections)
    for (const g of s.groups) {
      if (groupId && g.id !== groupId) continue
      for (const i of g.items) for (const st of Object.values(i.steps)) if (st.by !== 'import' && (!best || st.at > best.at)) best = { at: st.at, by: st.by }
    }
  return best?.by
}
