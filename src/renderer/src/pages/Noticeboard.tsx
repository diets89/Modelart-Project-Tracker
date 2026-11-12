import { useEffect, useMemo, useState } from 'react'
import { Check, File, Folder, FolderOpen, LinkSimple, Megaphone, Plus, PushPin, Trash, Tray, X } from '@phosphor-icons/react'
import type { Notice, NoticeLink } from '@shared/types'
import { uid } from '@shared/factory'
import { api, errText } from '../api'
import { useStore } from '../store'
import { Avatar, Button, Dialog, Empty, PeoplePicker, cx, fmtWhen } from '../ui'

type Tab = 'mine' | 'all' | 'sent'

export function Noticeboard() {
  const notices = useStore((s) => s.notices)
  const me = useStore((s) => s.config?.userId ?? '')
  const markNotice = useStore((s) => s.markNotice)
  const [tab, setTab] = useState<Tab>('mine')
  const [showDone, setShowDone] = useState(false)

  const list = Object.values(notices).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const mine = list.filter((n) => n.to.includes(me))
  const pub = list.filter((n) => n.to.length === 0)
  const sent = list.filter((n) => n.from === me)
  const unread = (ns: Notice[]): number => ns.filter((n) => n.from !== me && !n.readBy.includes(me)).length

  // Notices count as seen once you've had a moment to look at them.
  const shown = tab === 'mine' ? mine : tab === 'all' ? pub : []
  useEffect(() => {
    const ids = shown.filter((n) => n.from !== me && !n.readBy.includes(me)).map((n) => n.id)
    if (!ids.length) return
    const t = setTimeout(() => ids.forEach((id) => markNotice(id, 'read')), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, shown.map((n) => n.id + n.readBy.length).join()])

  const open = mine.filter((n) => !n.doneBy)
  const done = mine.filter((n) => n.doneBy)

  return (
    <div className="mx-auto max-w-[900px] px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Noticeboard</h1>
          <p className="mt-0.5 text-muted">Hand work over with a link to the file, or post something for everyone.</p>
        </div>
        <Button tone="primary" icon={<Plus size={15} weight="bold" />} onClick={() => useStore.getState().composeNotice({ to: tab === 'all' ? [] : undefined })}>
          New notice
        </Button>
      </div>

      <div className="mt-6 flex gap-1 border-b border-line">
        {(
          [
            ['mine', 'For me', unread(mine)],
            ['all', 'Everyone', unread(pub)],
            ['sent', 'Sent', 0]
          ] as [Tab, string, number][]
        ).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx('-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px]', tab === id ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {label}
            {n > 0 && <span className="rounded-full bg-accent px-1.5 font-mono text-[11px] leading-[17px] font-semibold text-white">{n}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5 pb-16">
        {tab === 'mine' &&
          (open.length === 0 && done.length === 0 ? (
            <Empty icon={<Tray size={22} />} title="Nothing for you yet">
              When someone hands you work, like a drawing ready to machine, it shows up here.
            </Empty>
          ) : (
            <>
              {open.length === 0 && <p className="py-6 text-center text-muted">All caught up.</p>}
              {open.map((n) => (
                <NoticeCard key={n.id} n={n} me={me} />
              ))}
              {done.length > 0 && (
                <button onClick={() => setShowDone(!showDone)} className="press pt-3 text-[12.5px] text-muted hover:text-ink">
                  {showDone ? 'Hide' : 'Show'} {done.length} done
                </button>
              )}
              {showDone && done.map((n) => <NoticeCard key={n.id} n={n} me={me} />)}
            </>
          ))}
        {tab === 'all' &&
          (pub.length === 0 ? (
            <Empty icon={<Megaphone size={22} />} title="No announcements">
              Anyone can post here for the whole team: deliveries, studio news, reminders.
            </Empty>
          ) : (
            pub.map((n) => <NoticeCard key={n.id} n={n} me={me} />)
          ))}
        {tab === 'sent' &&
          (sent.length === 0 ? (
            <Empty icon={<PushPin size={22} />} title="Nothing sent yet">
              Notices you send show here, with whether they've been seen and done.
            </Empty>
          ) : (
            sent.map((n) => <NoticeCard key={n.id} n={n} me={me} sentView />)
          ))}
      </div>

    </div>
  )
}

function NoticeCard({ n, me, sentView }: { n: Notice; me: string; sentView?: boolean }) {
  const people = useStore((s) => s.people)
  const projects = useStore((s) => s.docs.projects)
  const markNotice = useStore((s) => s.markNotice)
  const removeNotice = useStore((s) => s.removeNotice)
  const go = useStore((s) => s.go)
  const setOpenItem = useStore((s) => s.setOpenItem)
  const from = people.find((p) => p.id === n.from)
  const name = (id: string): string => people.find((p) => p.id === id)?.name ?? id
  const unread = n.from !== me && !n.readBy.includes(me)
  const forMe = n.to.includes(me)
  const project = n.projectId ? projects[n.projectId] : undefined
  const item = project?.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((i) => i.id === n.itemId)

  return (
    <article className={cx('rounded-xl border bg-panel px-4 py-3.5', unread ? 'border-accent/50' : 'border-line', n.doneBy && !sentView && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <Avatar person={from} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{from?.name ?? n.from}</span>
            <span>{n.to.length === 0 ? 'to everyone' : `to ${n.to.map((id) => (id === me ? 'you' : name(id))).join(', ')}`}</span>
            <span className="text-faint">{fmtWhen(n.createdAt)}</span>
            {unread && <span className="rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-white">New</span>}
          </div>
          <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight">{n.title}</h3>
          {n.message && <p className="mt-1 text-[13.5px] whitespace-pre-wrap text-ink/90">{n.message}</p>}
          {(n.links.length > 0 || item) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {n.links.map((l) => (
                <LinkChip key={l.path} link={l} />
              ))}
              {item && project && (
                <button
                  onClick={() => {
                    go({ page: 'board', collection: 'projects', id: project.id })
                    setTimeout(() => setOpenItem(item.id), 50)
                  }}
                  className="press flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1 text-[12.5px] hover:border-line-strong"
                  title="Open in the tracker"
                >
                  <LinkSimple size={14} className="text-muted" />
                  {item.name} <span className="text-faint">{project.code || project.name}</span>
                </button>
              )}
            </div>
          )}
          {sentView && n.to.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              {n.to.map((id) => (
                <span key={id} className={cx('flex items-center gap-1', n.doneBy === id ? 'text-done' : n.readBy.includes(id) ? 'text-ink' : 'text-faint')}>
                  {n.doneBy === id ? <Check size={12} weight="bold" /> : null}
                  {name(id)}: {n.doneBy === id ? `done ${fmtWhen(n.doneAt!)}` : n.readBy.includes(id) ? 'seen' : 'not seen yet'}
                </span>
              ))}
            </div>
          )}
          {!sentView && n.doneBy && <p className="mt-2 text-[12px] text-done">Done by {name(n.doneBy)}, {fmtWhen(n.doneAt!)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {forMe && !sentView && (
            <Button size="sm" tone={n.doneBy ? 'quiet' : 'ghost'} icon={n.doneBy ? undefined : <Check size={13} weight="bold" />} onClick={() => markNotice(n.id, n.doneBy ? 'undone' : 'done')}>
              {n.doneBy ? 'Undo' : 'Done'}
            </Button>
          )}
          {n.from === me && (
            <button
              aria-label="Remove notice"
              title="Remove notice"
              onClick={() => confirm(`Remove "${n.title}"?`) && removeNotice(n.id)}
              className="press rounded-md p-1.5 text-faint hover:bg-hover hover:text-accent"
            >
              <Trash size={14} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function LinkChip({ link }: { link: NoticeLink }) {
  const toast = useStore((s) => s.toast)
  const parts = link.path.split(/[\\/]/).filter(Boolean)
  const base = parts[parts.length - 1] ?? link.path
  const dir = parts.slice(0, -1).join('\\')
  return (
    <button
      onClick={() => api().revealPath(link.path).catch((e) => toast(errText(e), 'error'))}
      title={`Open in Explorer: ${link.path}`}
      className="press flex max-w-full items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1 text-left hover:border-accent hover:bg-accent-soft/30"
    >
      {link.kind === 'folder' ? <Folder size={16} weight="fill" className="shrink-0 text-wait" /> : <File size={16} className="shrink-0 text-muted" />}
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium">{base}</span>
        {dir && <span className="block truncate font-mono text-[10.5px] text-faint">{dir}</span>}
      </span>
      <FolderOpen size={14} className="shrink-0 text-faint" />
    </button>
  )
}

export function Composer({ draft, onClose }: { draft: Partial<Notice>; onClose: () => void }) {
  const me = useStore((s) => s.config?.userId ?? '')
  const projects = useStore((s) => s.docs.projects)
  const postNotice = useStore((s) => s.postNotice)
  const toast = useStore((s) => s.toast)
  const [everyone, setEveryone] = useState(draft.to?.length === 0)
  const [to, setTo] = useState<string[]>(draft.to?.filter((x) => x !== me) ?? [])
  const [title, setTitle] = useState(draft.title ?? '')
  const [message, setMessage] = useState(draft.message ?? '')
  const [links, setLinks] = useState<NoticeLink[]>(draft.links ?? [])
  const [typed, setTyped] = useState('')
  const [itemRef, setItemRef] = useState(draft.projectId && draft.itemId ? { p: draft.projectId, i: draft.itemId } : null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const item = useMemo(() => {
    const p = itemRef ? projects[itemRef.p] : undefined
    return p ? { p, i: p.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((x) => x.id === itemRef!.i) } : undefined
  }, [itemRef, projects])

  const addPaths = async (paths: string[]): Promise<void> => {
    for (const p of paths) {
      try {
        const l = await api().checkPath(p)
        if (!l.exists) toast(`Couldn't find ${l.path} right now. Added it anyway, check the spelling.`, 'error')
        setLinks((cur) => (cur.some((x) => x.path.toLowerCase() === l.path.toLowerCase()) ? cur : [...cur, { path: l.path, kind: l.kind }]))
      } catch (e) {
        toast(errText(e), 'error')
      }
    }
  }
  const pick = async (kind: 'file' | 'folder'): Promise<void> => {
    const last = links[links.length - 1]?.path
    addPaths(await api().pickPath(kind, last))
  }

  const canSend = title.trim() && (everyone || to.length > 0)
  const send = async (): Promise<void> => {
    if (!canSend) return
    setBusy(true)
    const n: Notice = {
      id: uid('n'),
      from: me,
      to: everyone ? [] : to,
      title: title.trim(),
      message: message.trim(),
      links,
      ...(item?.i ? { projectId: item.p.id, itemId: item.i.id } : {}),
      createdAt: '',
      readBy: []
    }
    if (await postNotice(n)) {
      toast(everyone ? 'Posted on the public board' : `Sent to ${to.length === 1 ? useStore.getState().people.find((p) => p.id === to[0])?.name : `${to.length} people`}`)
      onClose()
    }
    setBusy(false)
  }

  return (
    <Dialog
      title="New notice"
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSend || busy} onClick={send}>
            {everyone ? 'Post for everyone' : 'Send'}
          </Button>
        </>
      }
    >
      <div
        className={cx('space-y-4', dragging && 'rounded-xl outline-2 outline-offset-8 outline-accent outline-dashed')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addPaths([...e.dataTransfer.files].map((f) => api().pathForFile(f)).filter(Boolean))
        }}
      >
        <div className="space-y-1.5">
          <div className="flex rounded-lg border border-line bg-bg p-0.5 text-[13px]" role="radiogroup" aria-label="Who it's for">
            {[
              [false, 'Send to people'],
              [true, 'Post for everyone']
            ].map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={everyone === v}
                onClick={() => setEveryone(v as boolean)}
                className={cx('press h-7 flex-1 rounded-md', everyone === v ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted hover:text-ink')}
              >
                {label as string}
              </button>
            ))}
          </div>
          {everyone ? (
            <p className="text-[12.5px] text-muted">Shows on the public board for the whole team.</p>
          ) : (
            <>
              <p className="text-[12.5px] text-muted">Only the people you pick see it.</p>
              <PeoplePicker value={to} exclude={me} onChange={setTo} />
            </>
          )}
        </div>

        <label className="block space-y-1.5">
          <span className="text-[12.5px] font-medium text-muted">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={everyone ? 'e.g. Acrylic delivery arriving Thursday' : 'e.g. Gate House ready to machine'}
            className="h-9 w-full rounded-lg border border-line bg-panel px-3 text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12.5px] font-medium text-muted">Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Anything they need to know: material, thickness, deadline..."
            className="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-[12.5px] font-medium text-muted">Files and folders</span>
          {links.length > 0 && (
            <div className="space-y-1">
              {links.map((l) => (
                <div key={l.path} className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5">
                  {l.kind === 'folder' ? <Folder size={16} weight="fill" className="text-wait" /> : <File size={16} className="text-muted" />}
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{l.path}</span>
                  <button type="button" aria-label="Remove link" onClick={() => setLinks(links.filter((x) => x !== l))} className="press rounded p-0.5 text-faint hover:text-ink">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<File size={14} />} onClick={() => pick('file')}>
              Add file
            </Button>
            <Button size="sm" icon={<Folder size={14} />} onClick={() => pick('folder')}>
              Add folder
            </Button>
            <form
              className="flex min-w-[220px] flex-1 gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (typed.trim()) addPaths([typed]).then(() => setTyped(''))
              }}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="or paste a path, e.g. Z:\Jobs\P34\Gate House.dxf"
                aria-label="Paste a path"
                className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 font-mono text-[11.5px] outline-none focus:border-accent"
              />
              <Button size="sm" type="submit" disabled={!typed.trim()}>
                Add
              </Button>
            </form>
          </div>
          <p className="text-[11.5px] text-faint">You can also drag files or folders here from Explorer.</p>
        </div>

        {item?.i && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken/60 px-2.5 py-1.5 text-[12.5px]">
            <LinkSimple size={14} className="text-muted" />
            <span className="flex-1">
              Linked to <b className="font-medium">{item.i.name}</b> <span className="text-muted">{item.p.code || item.p.name}</span>
            </span>
            <button type="button" aria-label="Unlink item" onClick={() => setItemRef(null)} className="press rounded p-0.5 text-faint hover:text-ink">
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
