import { useEffect } from 'react'
import { CheckSquareOffset, CircleNotch, Clock, Confetti, X, CloudSlash, GearSix, SquaresFour, Stack, WarningCircle } from '@phosphor-icons/react'
import { allItems, summarize } from '@shared/status'
import { streak } from '@shared/timesheet'
import { api } from './api'
import { useStore, type Route } from './store'
import { Avatar, Button, StreakChip, cx } from './ui'
import { Board } from './board/Board'
import { Projects } from './pages/Projects'
import { MyTasks } from './pages/MyTasks'
import { Templates } from './pages/Templates'
import { Settings } from './pages/Settings'
import { TimesheetPage } from './pages/Timesheet'
import { Setup } from './pages/Setup'
import mark from '../../../resources/mark.png'

export function App() {
  const s = useStore()
  useEffect(() => {
    s.init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!s.ready)
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <CircleNotch size={22} className="animate-spin" />
      </div>
    )
  const me = s.people.find((p) => p.id === s.config?.userId)
  if (!s.config?.dataDir || (!s.online && Object.keys(s.docs.projects).length === 0) || !me) return <Setup />

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {!s.online && (
        <div className="flex items-center gap-2 border-b border-line bg-wait-soft px-4 py-1.5 text-[12.5px] text-wait">
          <CloudSlash size={15} /> Can't reach the network folder. You're seeing the last copy and changes are paused.
        </div>
      )}
      {s.update.state === 'ready' && (
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-1.5 text-[12.5px]">
          <span>Version {s.update.version} is ready.</span>
          <Button size="sm" tone="primary" onClick={() => api().installUpdate()}>
            Restart to update
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto bg-bg">
          <Page route={s.route} />
        </main>
      </div>
      <Toasts />
      <MilestoneBanner />
    </div>
  )
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'board':
      return <Board key={route.collection + route.id} collection={route.collection} id={route.id} />
    case 'mine':
      return <MyTasks />
    case 'templates':
      return <Templates />
    case 'settings':
      return <Settings />
    case 'timesheet':
      return <TimesheetPage />
    default:
      return <Projects />
  }
}

function TitleBar() {
  const saving = useStore((s) => s.saving)
  return (
    <div className="drag flex h-10 shrink-0 items-center gap-2.5 border-b border-line bg-bg pr-[150px] pl-4">
      <img src={mark} alt="" className="h-[14px] w-auto dark:[filter:invert(1)_hue-rotate(180deg)]" />
      <span className="text-[13px] font-semibold tracking-tight">Modelart Tracker</span>
      <span className="ml-auto flex items-center gap-1.5 text-[12px] text-faint" aria-live="polite">
        {saving > 0 ? (
          <>
            <CircleNotch size={13} className="animate-spin" /> Saving
          </>
        ) : (
          'All changes saved'
        )}
      </span>
    </div>
  )
}

function Sidebar() {
  const route = useStore((s) => s.route)
  const go = useStore((s) => s.go)
  const openTimesheet = useStore((s) => s.openTimesheet)
  const projects = Object.values(useStore((s) => s.docs.projects))
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name))
  const me = useStore((s) => s.people.find((p) => p.id === s.config?.userId))
  const sheets = useStore((s) => s.sheets)
  const days = me ? streak(sheets, me.id) : 0

  const Nav = ({ to, icon, label, extra }: { to: Route; icon: React.ReactNode; label: string; extra?: React.ReactNode }) => {
    const on = route.page === to.page && (to.page !== 'board' || (route.page === 'board' && route.id === (to as { id: string }).id))
    return (
      <button
        onClick={() => (to.page === 'timesheet' ? openTimesheet() : go(to))}
        aria-current={on ? 'page' : undefined}
        className={cx('press flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]', on ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted hover:bg-hover hover:text-ink')}
      >
        {icon}
        <span className="truncate">{label}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </button>
    )
  }

  return (
    <nav className="flex w-[232px] shrink-0 flex-col border-r border-line bg-sunken/60 px-3 py-3">
      <div className="space-y-0.5">
        <Nav to={{ page: 'projects' }} icon={<SquaresFour size={17} />} label="Projects" />
        <Nav to={{ page: 'mine' }} icon={<CheckSquareOffset size={17} />} label="My tasks" />
        <Nav to={{ page: 'timesheet' }} icon={<Clock size={17} />} label="Timesheet" extra={days >= 2 ? <StreakChip days={days} /> : null} />
        <Nav to={{ page: 'templates' }} icon={<Stack size={17} />} label="Templates" />
      </div>

      <div className="mt-6 mb-1.5 px-2.5 text-[11.5px] font-medium text-faint">Active projects</div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {projects.length === 0 && <p className="px-2.5 text-[12.5px] text-faint">None yet</p>}
        {projects.map((p) => {
          const sum = summarize(allItems(p), p.steps)
          const on = route.page === 'board' && route.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => go({ page: 'board', collection: 'projects', id: p.id })}
              className={cx('press flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]', on ? 'bg-panel font-medium shadow-sm' : 'text-muted hover:bg-hover hover:text-ink')}
            >
              <ProgressRing value={sum.progress} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {sum.waiting + sum.hold > 0 && (
                <span title={`${sum.waiting + sum.hold} waiting or on hold`} className="flex items-center text-wait">
                  <WarningCircle size={14} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 space-y-0.5 border-t border-line pt-3">
        <Nav to={{ page: 'settings' }} icon={<GearSix size={17} />} label="Settings" />
        <div className="flex items-center gap-2.5 px-2.5 pt-2 text-[13px]">
          <Avatar person={me} size={22} />
          <span className="truncate font-medium">{me?.name}</span>
        </div>
      </div>
    </nav>
  )
}

function MilestoneBanner() {
  const m = useStore((s) => s.milestone)
  useEffect(() => {
    if (!m) return
    const t = setTimeout(() => useStore.setState({ milestone: null }), m.big ? 10000 : 7000)
    return () => clearTimeout(t)
  }, [m])
  if (!m) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center" role="status" aria-live="polite">
      <div key={m.id} className="pop-in pointer-events-auto flex items-center gap-3 rounded-2xl border border-line bg-panel py-3 pr-3 pl-4" style={{ boxShadow: 'var(--shadow)' }}>
        <span className={cx('flex size-10 items-center justify-center rounded-xl', m.big ? 'bg-accent text-white' : 'bg-done-soft text-done')}>
          <Confetti size={22} weight="fill" />
        </span>
        <span className="pr-2">
          <span className="block text-[15px] font-semibold tracking-tight">{m.title}</span>
          <span className="block text-[12.5px] text-muted">{m.sub}</span>
        </span>
        <button onClick={() => useStore.setState({ milestone: null })} aria-label="Close" className="press rounded-md p-1 text-muted hover:bg-hover hover:text-ink">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function ProgressRing({ value }: { value: number }) {
  const r = 6
  const c = 2 * Math.PI * r
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="8" cy="8" r={r} fill="none" stroke="var(--done)" strokeWidth="2" strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" />
    </svg>
  )
}

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pop-in pointer-events-auto max-w-[560px] rounded-lg border px-4 py-2.5 text-[13px]',
            t.tone === 'error' ? 'border-accent/40 bg-panel text-accent' : 'border-line bg-ink text-bg'
          )}
          style={{ boxShadow: 'var(--shadow)' }}
        >
          {t.text}
          {t.action && (
            <button
              onClick={() => {
                t.action!.run()
                useStore.setState({ toasts: useStore.getState().toasts.filter((x) => x.id !== t.id) })
              }}
              className="press ml-3 rounded-md px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:no-underline"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
