import { useState, type FormEvent } from 'react'
import { Pencil, RefreshCw } from 'lucide-react'
import type { Entry } from '../lib/types'
import type { OpFn } from '../views/Board'
import { api, ApiError, domainOf } from '../lib/api'
import { Empty, ErrorLine, Field, Input, Modal, SectionTitle, Skeleton } from '../components/ui'
import { formatTime } from '../lib/format'

export function News({ entry, op, apply }: { entry: Entry; op: OpFn; apply: (e: Entry) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editQuery, setEditQuery] = useState(false)

  const refresh = async () => {
    setBusy(true)
    setError(null)
    try {
      apply(await api.op(entry.id, 'news/refresh', {}))
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setError(e.message)
      else if (e instanceof ApiError && e.status === 503) setError('Search is not configured on the server.')
      else setError('Could not fetch news.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <SectionTitle
        action={
          <>
            <span className="text-[13px] text-[var(--text-muted)] tnum hidden sm:inline">
              {entry.news.fetchedAt ? `Fetched ${formatTime(entry.news.fetchedAt)}` : ''}
            </span>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Search terms" onClick={() => setEditQuery(true)}>
              <Pencil size={15} />
            </button>
            <button type="button" className="btn" onClick={refresh} disabled={busy}>
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        }
      >
        News
      </SectionTitle>
      {error && <ErrorLine>{error}</ErrorLine>}
      {busy && (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} h={72} />
          ))}
        </div>
      )}
      {!busy && entry.news.items.length === 0 && <Empty>No news fetched yet.</Empty>}
      {!busy && entry.news.items.length > 0 && (
        <ul className="grid gap-3">
          {entry.news.items.map((n) => (
            <li key={n.url} className="card p-4">
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold leading-snug hover:underline">
                {n.title}
              </a>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 tnum">
                {domainOf(n.url)}
                {n.date ? ` · ${n.date}` : ''}
              </p>
              {n.snippet && <p className="text-[13px] text-[var(--text-muted)] mt-2 line-clamp-3">{n.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
      {editQuery && <QueryForm value={entry.news.query} op={op} onClose={() => setEditQuery(false)} />}
    </div>
  )
}

function QueryForm({ value, op, onClose }: { value: string; op: OpFn; onClose: () => void }) {
  const [q, setQ] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await op('field', { field: 'news.query', value: q }, (fresh) => fresh.news.query === value)
    if (r.ok) onClose()
    else setError(r.message)
  }
  return (
    <Modal
      title="Search terms"
      onClose={onClose}
      footer={
        <button type="submit" form="query-form" className="btn btn-primary">
          Save
        </button>
      }
    >
      <form id="query-form" onSubmit={submit}>
        <Field label="Search terms" hint="Empty means name plus year and place.">
          <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} autoFocus />
        </Field>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
    </Modal>
  )
}
