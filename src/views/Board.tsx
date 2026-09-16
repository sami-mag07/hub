import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Pin, PinOff } from 'lucide-react'
import { navigate } from '../lib/router'
import { useEntry } from '../lib/useEntries'
import { api, ApiError } from '../lib/api'
import type { Entry } from '../lib/types'
import { Logo, relevantDays } from '../bubbles/Bubble'
import { formatDate, formatDays } from '../lib/format'
import { Empty, Skeleton } from '../components/ui'
import { About, Links } from '../board/Overview'
import { Kanban } from '../board/Kanban'
import { Contacts } from '../board/Contacts'
import { Comments } from '../board/Comments'
import { News } from '../board/News'
import { EditEntry } from '../board/EditEntry'

// Die Seite einer Blase: alles auf einmal, als Glas-Karten auf demselben
// Hintergrund wie die Startseite. Die Pille unten springt zu den Abschnitten.
const SECTIONS = [
  { id: 'about', title: 'About' },
  { id: 'board', title: 'Board' },
  { id: 'outreach', title: 'Outreach' },
  { id: 'comments', title: 'Comments' },
  { id: 'news', title: 'News' },
]

const STATUS_TITLE: Record<string, string> = {
  offen: 'Open',
  beworben: 'Signed up',
  warteliste: 'Waitlist',
  angenommen: 'Accepted',
  abgelehnt: 'Rejected',
  verworfen: 'Dropped',
}

export type OpFn = ReturnType<typeof useEntry>['op']

export function Board({ id, userName, onUnauthorized }: { id: string; userName: string; onUnauthorized: () => void }) {
  const { entry, error, op, apply, reload } = useEntry(id)
  const [editing, setEditing] = useState(false)
  const [signupBusy, setSignupBusy] = useState(false)
  const [signupError, setSignupError] = useState<string | null>(null)
  const [active, setActive] = useState('about')

  useEffect(() => {
    if (error === 'unauthorized') onUnauthorized()
  }, [error, onUnauthorized])

  // Welcher Abschnitt gerade oben im Bild ist, für die Pille.
  useEffect(() => {
    if (!entry) return
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (items) => {
        const hit = items.filter((i) => i.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (hit) setActive(hit.target.id)
      },
      { rootMargin: '-20% 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [entry])

  const back = () => navigate('/')
  const jump = (sid: string) => document.getElementById(sid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const signup = async (status: 'beworben' | 'offen') => {
    setSignupBusy(true)
    setSignupError(null)
    try {
      apply(await api.op(id, 'signup', { status }))
    } catch (e) {
      setSignupError(e instanceof ApiError ? e.message : 'Failed')
    } finally {
      setSignupBusy(false)
    }
  }

  return (
    <div className="relative min-h-full">
      <div className="field-bg" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>

      <div className="relative z-[1] max-w-[1040px] mx-auto px-4 sm:px-6 pb-32">
        <div className="h-14 flex items-center justify-between">
          <button type="button" className="btn btn-ghost -ml-2 gap-2" onClick={back} aria-label="Back to the hub">
            <ArrowLeft size={18} />
            <span className="wordmark text-[22px] leading-none">The Hub</span>
          </button>
          {entry && (
            <div className="flex items-center gap-1">
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Edit entry" onClick={() => setEditing(true)}>
                <Pencil size={17} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={entry.pinned ? 'Unpin from home' : 'Pin to home'}
                aria-pressed={entry.pinned}
                onClick={() => void op('pin', { pinned: !entry.pinned })}
              >
                {entry.pinned ? <PinOff size={17} /> : <Pin size={17} />}
              </button>
            </div>
          )}
        </div>

        {error === 'not-found' ? (
          <Empty>This entry does not exist anymore.</Empty>
        ) : !entry ? (
          <div className="mt-4">
            <div className="flex items-center gap-5">
              <Skeleton h={88} w={88} className="!rounded-full" />
              <div className="flex-1">
                <Skeleton h={26} w="40%" />
                <Skeleton h={14} w="60%" className="mt-2" />
              </div>
            </div>
            <Skeleton h={220} className="mt-8 !rounded-3xl" />
            {error && <p className="text-[13px] text-[var(--text-muted)] mt-4">{error}</p>}
          </div>
        ) : (
          <>
            <Header entry={entry} onSignup={signup} signupBusy={signupBusy} signupError={signupError} />

            <div className="grid gap-4 mt-8 md:grid-cols-[minmax(0,1fr)_320px]">
              <section id="about" className="glass-card glass p-5 sm:p-6 scroll-mt-4">
                <About entry={entry} op={op} />
              </section>
              <section className="glass-card glass p-5 sm:p-6 self-start">
                <Links entry={entry} op={op} />
              </section>
            </div>

            <section id="board" className="glass-card glass p-5 sm:p-6 mt-4 scroll-mt-4">
              <Kanban entry={entry} op={op} userName={userName} />
            </section>

            <div className="grid gap-4 mt-4 md:grid-cols-2">
              <section id="outreach" className="glass-card glass p-5 sm:p-6 scroll-mt-4">
                <Contacts entry={entry} op={op} />
              </section>
              <section id="comments" className="glass-card glass p-5 sm:p-6 scroll-mt-4">
                <Comments entry={entry} op={op} userName={userName} />
              </section>
            </div>

            <section id="news" className="glass-card glass p-5 sm:p-6 mt-4 scroll-mt-4">
              <News entry={entry} op={op} apply={apply} />
            </section>
          </>
        )}
      </div>

      {entry && (
        <nav className="pill glass" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-pressed={active === s.id} onClick={() => jump(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
      )}

      {editing && entry && <EditEntry entry={entry} op={op} apply={apply} onClose={() => setEditing(false)} onChanged={reload} />}
    </div>
  )
}

function Header({
  entry,
  onSignup,
  signupBusy,
  signupError,
}: {
  entry: Entry
  onSignup: (status: 'beworben' | 'offen') => void
  signupBusy: boolean
  signupError: string | null
}) {
  const { days, what } = relevantDays(entry)
  const status = entry.tracker?.status
  const missing = !!entry.tracker?.missingSince
  const meta = [entry.dates.text, entry.location].filter(Boolean).join(' · ')
  return (
    <header className="flex flex-col sm:flex-row sm:items-center gap-5 mt-4">
      <div className="bubble-plate !w-[88px] !h-[88px] shrink-0 text-[26px]">
        <Logo entry={entry} transition />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-[30px] font-semibold tracking-tight leading-tight">{entry.name}</h1>
        {meta && <p className="text-[15px] text-[var(--text-muted)] mt-0.5">{meta}</p>}
        <p className="text-[15px] mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {days !== null && (
            <span className={days <= 3 ? 'text-[var(--danger)] font-semibold' : ''}>
              {what === 'deadline' ? 'Apply by' : 'Starts'} {formatDate(what === 'deadline' ? entry.deadline : entry.dates.start)} ·{' '}
              {formatDays(days)}
            </span>
          )}
          {entry.deadlineNote && <span className="text-[var(--text-muted)]">{entry.deadlineNote}</span>}
          {status && (status !== 'offen' || missing) && (
            <span className="text-[var(--text-muted)]">
              {STATUS_TITLE[status] ?? status}
              {missing ? ' · gone from tracker' : ''}
            </span>
          )}
        </p>
      </div>
      {entry.kind === 'hackathon' && entry.trackerId !== null && !missing && (status === 'offen' || status === 'beworben') && (
        <div className="shrink-0">
          {status === 'offen' ? (
            <button type="button" className="btn btn-primary" disabled={signupBusy} onClick={() => onSignup('beworben')}>
              I signed up
            </button>
          ) : (
            <button type="button" className="btn" disabled={signupBusy} onClick={() => onSignup('offen')}>
              Undo sign-up
            </button>
          )}
          {signupError && <p className="text-[12px] text-[var(--danger)] mt-1">{signupError}</p>}
        </div>
      )}
    </header>
  )
}
