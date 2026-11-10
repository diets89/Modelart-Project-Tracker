import { useState } from 'react'
import { FolderOpen, Plus } from '@phosphor-icons/react'
import { api, errText } from '../api'
import { useStore } from '../store'
import { Avatar, Button, TextInput } from '../ui'
import { COLORS, initialsOf } from './Settings'
import logo from '../../../../resources/logo.png'

/** First run: pick the shared folder, then who you are. */
export function Setup() {
  const config = useStore((s) => s.config)!
  const people = useStore((s) => s.people)
  const online = useStore((s) => s.online)
  const setConfig = useStore((s) => s.setConfig)
  const savePerson = useStore((s) => s.savePerson)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')
  const needFolder = !config.dataDir || !online

  const useFolder = async (dir: string | null): Promise<void> => {
    if (!dir) return
    setErr('')
    try {
      await setConfig({ dataDir: dir })
      if (!useStore.getState().online) setErr(`Can't reach ${dir}. Check the network drive is connected.`)
    } catch (e) {
      setErr(errText(e))
    }
  }

  return (
    <div className="drag flex h-full items-center justify-center bg-bg p-8">
      <div className="no-drag w-full max-w-[460px]">
        <img src={logo} alt="Modelart" className="mb-8 h-14 w-auto dark:[filter:invert(1)_hue-rotate(180deg)]" />
        {needFolder ? (
          <>
            <h1 className="text-[22px] font-semibold tracking-tight">Connect to the shared folder</h1>
            <p className="mt-1.5 leading-relaxed text-muted">Projects live in one folder on the network drive, so everyone sees the same thing. Pick the team's folder (or create it the first time).</p>
            <div className="mt-6 space-y-2">
              <Button tone="primary" className="h-10 w-full justify-start px-4" icon={<FolderOpen size={17} />} onClick={() => useFolder(config.defaultDir)}>
                Use {config.defaultDir}
              </Button>
              <Button className="h-10 w-full justify-start px-4" onClick={async () => useFolder(await api().pickFolder())}>
                Choose a different folder...
              </Button>
            </div>
            {err && <p className="mt-3 text-[13px] text-accent">{err}</p>}
          </>
        ) : (
          <>
            <h1 className="text-[22px] font-semibold tracking-tight">Who are you?</h1>
            <p className="mt-1.5 text-muted">Your changes are recorded under this name. No password needed.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {people
                .filter((p) => !p.archived)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setConfig({ userId: p.id })}
                    className="press flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2.5 text-left font-medium hover:border-accent"
                  >
                    <Avatar person={p} size={28} />
                    {p.name}
                  </button>
                ))}
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                const n = name.trim()
                if (!n) return
                const id = n.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                await savePerson({ id, name: n, initials: initialsOf(n), color: COLORS[people.length % COLORS.length] })
                await setConfig({ userId: id })
              }}
            >
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Not listed? Type your name" aria-label="Your name" className="flex-1" />
              <Button type="submit" icon={<Plus size={14} />}>
                Add me
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
