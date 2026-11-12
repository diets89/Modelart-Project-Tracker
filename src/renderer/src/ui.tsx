import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { Check, Fire, X } from '@phosphor-icons/react'
import type { Person } from '@shared/types'
import type { Status } from '@shared/status'
import { useStore } from './store'

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

// ---------- buttons ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'quiet' | 'danger'; size?: 'sm' | 'md'; icon?: ReactNode }
export function Button({ tone = 'ghost', size = 'md', icon, className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        'press inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
        tone === 'primary' && 'bg-accent text-accent-ink hover:brightness-110 shadow-sm',
        tone === 'ghost' && 'border border-line bg-panel hover:bg-hover text-ink',
        tone === 'quiet' && 'text-muted hover:text-ink hover:bg-hover',
        tone === 'danger' && 'border border-line bg-panel text-accent hover:bg-accent-soft',
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx('press inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-40', className)}
    >
      {children}
    </button>
  )
}

// ---------- inputs ----------
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </label>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'h-9 rounded-lg border border-line bg-panel px-3 text-[13.5px] text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
        className
      )}
    />
  )
}

/** Text that saves when you leave the field or press Enter. */
export function InlineEdit({
  value,
  onCommit,
  className,
  placeholder,
  multiline,
  autoFocus
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
  autoFocus?: boolean
}) {
  const [v, setV] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setV(value)
  }, [value])
  const commit = (): void => {
    focused.current = false
    if (v.trim() !== value) onCommit(v.trim())
  }
  // Full width unless the caller sets a width, so two fields can share a row.
  const sized = /(^|\s)(w-|flex-1)/.test(className ?? '')
  const cls = cx(
    'rounded-md border border-transparent bg-transparent px-2 py-1 text-ink placeholder:text-faint outline-none hover:border-line focus:border-accent focus:bg-panel',
    sized ? 'min-w-0' : 'w-full',
    className
  )
  if (multiline)
    return (
      <textarea
        value={v}
        autoFocus={autoFocus}
        placeholder={placeholder}
        rows={4}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        className={cx(cls, 'resize-y leading-relaxed')}
      />
    )
  return (
    <input
      value={v}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value)
          focused.current = false
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={cls}
    />
  )
}

// ---------- people ----------
export function Avatar({ person, size = 22, ring }: { person?: Person; size?: number; ring?: boolean }) {
  const label = person?.initials ?? '?'
  const img = useStore((s) => (person?.avatar ? s.avatars[person.avatar] : undefined))
  if (img)
    return (
      <span
        title={person?.name}
        className={cx('inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full', ring && 'ring-2 ring-panel')}
        style={{ width: size, height: size, background: person?.color ?? '#8a8a93' }}
      >
        <img src={img} alt="" draggable={false} className="h-[92%] w-[92%] object-contain object-bottom" />
      </span>
    )
  return (
    <span
      title={person?.name}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', ring && 'ring-2 ring-panel')}
      style={{ width: size, height: size, fontSize: size * (label.length > 1 ? 0.4 : 0.46), background: person?.color ?? '#8a8a93' }}
    >
      {label}
    </span>
  )
}

export function AvatarStack({ ids, max = 3 }: { ids: string[]; max?: number }) {
  const people = useStore((s) => s.people)
  const shown = ids.slice(0, max)
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((id) => (
        <Avatar key={id} person={people.find((p) => p.id === id)} ring />
      ))}
      {ids.length > max && <span className="ml-2.5 text-[11.5px] text-faint tnum">+{ids.length - max}</span>}
    </span>
  )
}

export function PeoplePicker({ value, onChange, exclude }: { value: string[]; onChange: (v: string[]) => void; exclude?: string }) {
  const people = useStore((s) => s.people).filter((p) => p.id !== exclude && (!p.archived || value.includes(p.id)))
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => {
        const on = value.includes(p.id)
        return (
          <button
            key={p.id}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
            className={cx(
              'press flex h-7 items-center gap-1.5 rounded-full border pl-0.5 pr-2.5 text-[12.5px]',
              on ? 'border-transparent bg-sunken text-ink' : 'border-dashed border-line text-faint hover:text-muted'
            )}
          >
            <span className={cx(!on && 'opacity-40 grayscale')}>
              <Avatar person={p} size={22} />
            </span>
            {p.name}
          </button>
        )
      })}
    </div>
  )
}

// ---------- status ----------
export function StatusChip({ status }: { status: Status }) {
  const tone = {
    done: 'bg-done-soft text-done',
    progress: 'bg-sunken text-ink ring-1 ring-inset ring-line',
    waiting: 'bg-wait-soft text-wait',
    hold: 'bg-hold-soft text-hold',
    idle: 'text-muted'
  }[status.kind]
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium whitespace-nowrap', tone)}>
      {status.kind === 'done' && <Check size={12} weight="bold" />}
      {status.kind === 'progress' && <span aria-hidden className="step-started inline-block size-2.5 rounded-[3px]" />}
      {status.label}
    </span>
  )
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('relative block h-1.5 overflow-hidden rounded-full bg-line', className)}>
      <span className="absolute inset-y-0 left-0 rounded-full bg-done transition-[width] duration-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  )
}

// ---------- dialog ----------
export function Dialog({ title, onClose, children, width = 520, footer }: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fade-in fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-6 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="pop-in flex max-h-[80vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-panel"
        style={{ maxWidth: width, boxShadow: 'var(--shadow)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function confirmDelete(what: string): boolean {
  return window.confirm(`Delete ${what}? This can't be undone from the app.`)
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-sunken text-muted">{icon}</span>
      <div className="text-[15px] font-semibold">{title}</div>
      {children && <div className="max-w-sm text-muted leading-relaxed">{children}</div>}
    </div>
  )
}

export function fmtDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

export function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const mins = (Date.now() - d.getTime()) / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)} min ago`
  if (mins < 60 * 24 && d.getDate() === new Date().getDate()) return 'today ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
}

export function StreakChip({ days }: { days: number }) {
  return (
    <span title={`${days} weekdays in a row with your timesheet filled in`} className="inline-flex items-center gap-0.5 font-mono text-[11.5px] font-semibold text-wait">
      <Fire size={13} weight="fill" />
      {days}
    </span>
  )
}
