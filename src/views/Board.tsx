import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Pin, PinOff } from 'lucide-react'
import { navigate } from '../lib/router'
import { useEntry } from '../lib/useEntries'
import { api, ApiError } from '../lib/api'
import type { Entry } from '../lib/types'
import { Logo, relevantDays } from '../bubbles/Bubble'
import { formatDate, formatDays } from '../lib/format'
import { Empty, Skeleton } from '../components/ui'
import { Overview } from '../board/Overview'
import { Kanban } from '../board/Kanban'
import { Contacts } from '../board/Contacts'
import { Comments } from '../board/Comments'
import { News } from '../board/News'
import { EditEntry } from '../board/EditEntry'

type Tab = 'overview' | 'board' | 'outreach' | 'comments' | 'news'
const TABS: { key: Tab; title: string }[] = [
  { key: 'overview', title: 'Overview' },
  { key: 'board', title: 'Board' },
  { key: 'outreach', title: 'Outreach' },
  { key: 'comments', title: 'Comments' },
  { key: 'news', title: 'News' },
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
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [signupBusy, setSignupBusy] = useState(false)
  const [signupError, setSignupError] = useState<string | null>(null)

  useEffect(() => {
    if (error === 'unauthorized') onUnauthorized()
  }, [error, onUnauthorized])

  const back = () => navigate('/')

  if (error === 'not-found') {
    return (
      <Shell onBack={back}>
        <Empty>This entry does not exist anymore.</Empty>
      </Shell>
    )
  }
  if (!entry) {
    return (
      <Shell onBack={back}>
        <div className="flex items-center gap-4 mb-6">
          <Skeleton h={72} w={72} className="!rounded-full" />
          <div className="flex-1">
            <Skeleton h={22} w="40%" />
            <Skeleton h={14} w="60%" className="mt-2" />
          </div>
        </div>
        <Skeleton h={38} w={360} className="!rounded-full" />
        <Skeleton h={160} className="mt-6" />
        {error && <p className="text-[13px] text-[var(--text-muted)] mt-4">{error}</p>}
      </Shell>
    )
  }

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
    <Shell onBack={back}>
      <Header
        entry={entry}
        onEdit={() => setEditing(true)}
        onPin={() => void op('pin', { pinned: !entry.pinned })}
        onSignup={signup}
        signupBusy={signupBusy}
        signupError={signupError}
      />

      <div className="tabs inline-flex max-w-full mt-6 mb-6" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.title}
            {t.key === 'board' && entry.tasks.some((x) => x.status !== 'done') && (
              <span className="text-[var(--text-faint)] font-medium ml-1 tnum"> {entry.tasks.filter((x) => x.status !== 'done').length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview entry={entry} op={op} />}
      {tab === 'board' && <Kanban entry={entry} op={op} userName={userName} />}
      {tab === 'outreach' && <Contacts entry={entry} op={op} />}
      {tab === 'comments' && <Comments entry={entry} op={op} userName={userName} />}
      {tab === 'news' && <News entry={entry} op={op} apply={apply} />}

      {editing && <EditEntry entry={entry} op={op} apply={apply} onClose={() => setEditing(false)} onChanged={reload} />}
    </Shell>
  )
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="min-h-full">
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 pt-3 pb-24">
        <button type="button" className="btn btn-ghost -ml-2 mb-3" onClick={onBack}>
          <ArrowLeft size={18} />
          Hub
        </button>
        {children}
      </div>
    </div>
  )
}

function Header({
  entry,
  onEdit,
  onPin,
  onSignup,
  signupBusy,
  signupError,
}: {
  entry: Entry
  onEdit: () => void
  onPin: () => void
  onSignup: (status: 'beworben' | 'offen') => void
  signupBusy: boolean
  signupError: string | null
}) {
  const { days, what } = relevantDays(entry)
  const status = entry.tracker?.status
  const missing = !!entry.tracker?.missingSince
  const meta = [entry.dates.text, entry.location].filter(Boolean).join(' · ')
  return (
    <header className="flex flex-col sm:flex-row sm:items-start gap-4">
      <div className="bubble-plate !w-[76px] !h-[76px] shrink-0 border border-[var(--border)] text-[22px]">
        <Logo entry={entry} transition />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight leading-tight">{entry.name}</h1>
          <button type="button" className="btn btn-ghost btn-icon shrink-0" aria-label="Edit entry" onClick={onEdit}>
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon shrink-0"
            aria-label={entry.pinned ? 'Unpin from home' : 'Pin to home'}
            aria-pressed={entry.pinned}
            onClick={onPin}
          >
            {entry.pinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
        </div>
        {meta && <p className="text-[14px] text-[var(--text-muted)] mt-0.5">{meta}</p>}
        <p className="text-[14px] mt-1 flex flex-wrap gap-x-3 gap-y-1">
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
        <div className="shrink-0 sm:pt-1">
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
