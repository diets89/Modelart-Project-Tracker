import { useState } from 'react'
import { ArrowsClockwise, FolderOpen, Plus } from '@phosphor-icons/react'
import type { Person } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Avatar, Button, InlineEdit, TextInput, cx } from '../ui'

export const COLORS = ['#0f766e', '#b45309', '#4338ca', '#be123c', '#0369a1', '#7c3aed', '#c2410c', '#15803d', '#a21caf', '#4d7c0f', '#52525b', '#9f1239']

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}

export function Settings() {
  const config = useStore((s) => s.config)!
  const people = useStore((s) => s.people)
  const setConfig = useStore((s) => s.setConfig)
  const savePerson = useStore((s) => s.savePerson)
  const update = useStore((s) => s.update)
  const [newName, setNewName] = useState('')

  const changeFolder = async (): Promise<void> => {
    const dir = await api().pickFolder()
    if (dir) await setConfig({ dataDir: dir })
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-10 px-8 py-7">
      <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>

      <Section title="You" text="Changes you make are recorded under this name.">
        <select
          value={config.userId}
          onChange={(e) => setConfig({ userId: e.target.value })}
          aria-label="Your name"
          className="h-9 w-64 rounded-lg border border-line bg-panel px-2 outline-none focus:border-accent"
        >
          {people
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Section>

      <Section title="Team" text="Everyone who can be assigned to items. Initials and colour show on the board.">
        <div className="divide-y divide-line rounded-xl border border-line bg-panel">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} onSave={savePerson} />
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const name = newName.trim()
            if (!name) return
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (people.some((x) => x.id === name.toLowerCase()) ? '-' + Date.now().toString(36).slice(-3) : '')
            savePerson({ id, name, initials: initialsOf(name), color: COLORS[people.length % COLORS.length] })
            setNewName('')
          }}
        >
          <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a person" aria-label="New person name" className="w-64" />
          <Button type="submit" icon={<Plus size={14} />}>
            Add
          </Button>
        </form>
      </Section>

      <Section title="Shared data folder" text="Every PC must point at the same folder on the network drive.">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[12.5px]">{config.dataDir}</code>
          <Button icon={<FolderOpen size={15} />} onClick={changeFolder}>
            Change
          </Button>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="flex rounded-lg border border-line bg-panel p-0.5" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={config.theme === t}
              onClick={() => setConfig({ theme: t })}
              className={cx('press h-7 flex-1 rounded-md text-[13px] capitalize', config.theme === t ? 'bg-sunken font-medium text-ink' : 'text-muted hover:text-ink')}
            >
              {t === 'system' ? 'Match Windows' : t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Updates" text={`You are on version ${config.version}. New versions download in the background and install when you restart.`}>
        <div className="flex items-center gap-3">
          <Button icon={<ArrowsClockwise size={15} />} onClick={() => api().checkUpdate().then((u) => useStore.setState({ update: u }))}>
            Check for updates
          </Button>
          <span className="text-[13px] text-muted">
            {update.state === 'dev' && 'Updates only run in the installed app.'}
            {update.state === 'checking' && 'Checking...'}
            {update.state === 'latest' && 'You have the latest version.'}
            {update.state === 'downloading' && `Downloading${'percent' in update && update.percent ? ` ${update.percent}%` : ''}...`}
            {update.state === 'ready' && `Version ${update.version} is ready.`}
            {update.state === 'error' && `Couldn't check: ${update.message}`}
          </span>
          {update.state === 'ready' && (
            <Button tone="primary" onClick={() => api().installUpdate()}>
              Restart now
            </Button>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {text && <p className="mt-0.5 mb-3 text-muted">{text}</p>}
      {!text && <div className="mb-3" />}
      {children}
    </section>
  )
}

function PersonRow({ person, onSave }: { person: Person; onSave: (p: Person) => void }) {
  const [picking, setPicking] = useState(false)
  return (
    <div className={cx('flex items-center gap-3 px-3 py-2', person.archived && 'opacity-50')}>
      <button onClick={() => setPicking(!picking)} aria-label={`Change colour for ${person.name}`} className="press rounded-full">
        <Avatar person={person} size={28} />
      </button>
      {picking ? (
        <div className="flex flex-1 flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              aria-label={`Colour ${c}`}
              onClick={() => {
                onSave({ ...person, color: c })
                setPicking(false)
              }}
              className={cx('press size-6 rounded-full', c === person.color && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
              style={{ background: c }}
            />
          ))}
        </div>
      ) : (
        <>
          <InlineEdit value={person.name} onCommit={(name) => name && onSave({ ...person, name })} className="flex-1" />
          <InlineEdit value={person.initials} onCommit={(initials) => initials && onSave({ ...person, initials: initials.slice(0, 2) })} className="w-14 text-center font-mono" />
          <Button tone="quiet" size="sm" onClick={() => onSave({ ...person, archived: !person.archived })}>
            {person.archived ? 'Restore' : 'Hide'}
          </Button>
        </>
      )}
    </div>
  )
}
