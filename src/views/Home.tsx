import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import type { EntrySummary, TrackerState, View } from '../lib/types'
import { navigate } from '../lib/router'
import { daysUntil, formatTime, todayIso } from '../lib/format'
import { useEntries } from '../lib/useEntries'
import { BubbleField } from '../bubbles/BubbleField'
import { relevantDays } from '../bubbles/Bubble'
import { Empty, Field, Input, Modal, Skeleton } from '../components/ui'
import { ReachOut } from './ReachOut'

const VIEWS: { key: View; path: string; title: string }[] = [
  { key: 'sign-up', path: '/sign-up', title: 'Sign up' },
  { key: 'signed-up', path: '/', title: 'Signed up' },
  { key: 'reach-out', path: '/reach-out', title: 'Reach out' },
]

const SIGNED = new Set(['beworben', 'warteliste', 'angenommen'])

// Mehr als zwei Dutzend Blasen werden zu klein und zu teuer (Blur). Unter
// Sign up zählen die nächsten Fristen, der Rest bleibt im Tracker.
const MAX_BUBBLES = 24

// Wir sitzen in Berlin: unter Sign up nur, was hier oder remote stattfindet.
// Alles andere bleibt im Tracker in Emil, bis es jemand bewusst anpinnt.
const NEAR = /berlin|potsdam|brandenburg|online|remote|hybrid|virtuell|virtual/i
export const isNear = (e: EntrySummary) => !e.location || NEAR.test(e.location) || NEAR.test(e.dates.text)

export function filterForView(entries: EntrySummary[], view: View): EntrySummary[] {
  const today = todayIso()
  const list = entries.filter((e) => {
    if (e.archived) return false
    if (view === 'signed-up') {
      if (e.kind === 'project' || e.pinned) return true
      return !!e.tracker && SIGNED.has(e.tracker.status)
    }
    if (view === 'sign-up') {
      if (e.kind !== 'hackathon' || e.pinned || !e.tracker) return false
      if (e.tracker.status !== 'offen' || e.tracker.missingSince) return false
      if (e.deadline && e.deadline < today) return false
      return isNear(e)
    }
    return false
  })
  if (list.length <= MAX_BUBBLES) return list
  return [...list].sort((a, b) => (relevantDays(a).days ?? 9999) - (relevantDays(b).days ?? 9999)).slice(0, MAX_BUBBLES)
}

export function Home({ view, userName, onLogout }: { view: View; userName: string; onLogout: () => void }) {
  const { entries, error, reload } = useEntries()
  const [creating, setCreating] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [tracker, setTracker] = useState<TrackerState | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  useEffect(() => {
    let alive = true
    const load = () => api.tracker().then((t) => alive && setTracker(t)).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const shown = useMemo(() => (entries ? filterForView(entries, view) : []), [entries, view])
  const staleTracker =
    tracker && tracker.lastError && (!tracker.lastOk || Date.now() - Date.parse(tracker.lastOk) > 3_600_000)

  return (
    <div className="fixed inset-0 overflow-hidden">
      <div className="field-bg" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <header className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 sm:px-6 z-10">
        <h1 className="wordmark text-[24px] leading-none">The Hub</h1>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-icon" aria-label="New project" onClick={() => setCreating(true)}>
            <Plus size={20} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="btn btn-ghost"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              {userName}
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 mt-1 glass-card p-1 min-w-[140px]">
                <button type="button" role="menuitem" className="btn btn-ghost w-full justify-start" onClick={onLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="absolute inset-0 top-14 bottom-0 overflow-y-auto sm:overflow-hidden">
        {view === 'reach-out' ? (
          <ReachOut entries={entries ?? []} onTrackerChanged={reload} />
        ) : entries === null && !error ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex gap-8">
              {[116, 92, 148].map((d, i) => (
                <Skeleton key={i} h={d} w={d} className="!rounded-full" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
              <button type="button" className="btn mt-3" onClick={reload}>
                Retry
              </button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center px-6">
            <Empty>
              {view === 'signed-up'
                ? 'Nothing signed up yet. Pick one under Sign up or add a project.'
                : 'No open hackathons in the tracker. Find new ones under Reach out.'}
            </Empty>
          </div>
        ) : (
          <BubbleField entries={shown} onOpen={(id) => navigate(`/e/${id}`)} />
        )}
      </main>

      {staleTracker && view !== 'reach-out' && (
        <p className="fixed left-1/2 -translate-x-1/2 bottom-[76px] text-[12px] text-[var(--text-muted)] z-10 whitespace-nowrap">
          Tracker not reachable{tracker?.lastOk ? ` since ${formatTime(tracker.lastOk)}` : ''}
        </p>
      )}

      <nav className="pill glass" aria-label="View">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => navigate(v.path)}>
            {v.title}
          </button>
        ))}
      </nav>

      {creating && <NewProject onClose={() => setCreating(false)} onCreated={reload} />}
    </div>
  )
}

function NewProject({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const entry = await api.createProject(name.trim(), link.trim())
      onCreated()
      onClose()
      navigate(`/e/${entry.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setBusy(false)
    }
  }
  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <button type="submit" form="new-project" className="btn btn-primary" disabled={busy || !name.trim()}>
          Create
        </button>
      }
    >
      <form id="new-project" onSubmit={submit}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus />
        </Field>
        <Field label="Website or repo" hint="Used for the logo when nothing is uploaded.">
          <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        </Field>
        {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}
      </form>
    </Modal>
  )
}

export { daysUntil }
