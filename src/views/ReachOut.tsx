import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, Pencil, Plus, Search } from 'lucide-react'
import { api, ApiError, domainOf } from '../lib/api'
import { CONTACT_STATUS as STATUS, type EntrySummary, type Partner, type PartnerType, type SearchHit } from '../lib/types'
import { Empty, ErrorLine, Field, Input, Modal, Select, Skeleton, Textarea, useConfirm } from '../components/ui'

type Tab = 'find' | 'people'

export function ReachOut({ entries, onTrackerChanged }: { entries: EntrySummary[]; onTrackerChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('find')
  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 pt-2 pb-32">
      <div className="tabs inline-flex mb-5" role="tablist" aria-label="Reach out">
        <button type="button" role="tab" aria-selected={tab === 'find'} onClick={() => setTab('find')}>
          Find hackathons
        </button>
        <button type="button" role="tab" aria-selected={tab === 'people'} onClick={() => setTab('people')}>
          Sponsors, mentors, partners
        </button>
      </div>
      {tab === 'find' ? <FindHackathons onTrackerChanged={onTrackerChanged} /> : <People entries={entries} />}
    </div>
  )
}

type HitState = 'idle' | 'adding' | 'added' | 'duplicate' | 'failed'

function FindHackathons({ onTrackerChanged }: { onTrackerChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<Record<string, HitState>>({})

  const search = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.searchHackathons(q)
      setHits(r.items)
      setState({})
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError('Search limit reached. Try again later.')
      else if (err instanceof ApiError && err.status === 503) setError('Search is not configured on the server.')
      else setError('Search failed.')
    } finally {
      setBusy(false)
    }
  }

  const add = async (hit: SearchHit) => {
    setState((s) => ({ ...s, [hit.url]: 'adding' }))
    try {
      const r = await api.trackerAdd({ name: hit.title.slice(0, 160), link: hit.url })
      setState((s) => ({ ...s, [hit.url]: r.duplikat ? 'duplicate' : 'added' }))
      onTrackerChanged()
    } catch {
      setState((s) => ({ ...s, [hit.url]: 'failed' }))
    }
  }

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <label className="sr-only" htmlFor="q">
          Search hackathons
        </label>
        <input
          id="q"
          className="input"
          placeholder="hackathon Berlin November 2026"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !query.trim()} aria-label="Search">
          <Search size={16} />
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>
      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="mt-5 grid gap-3">
        {busy && [1, 2, 3].map((i) => <Skeleton key={i} h={84} />)}
        {!busy && hits && hits.length === 0 && <Empty>No results for that. Try another wording or a city.</Empty>}
        {!busy &&
          hits?.map((h) => {
            const st = state[h.url] ?? 'idle'
            return (
              <article key={h.url} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold leading-snug">
                      <a href={h.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {h.title}
                      </a>
                    </h3>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5 tnum">
                      {domainOf(h.url)}
                      {h.date ? ` · ${h.date.slice(0, 10)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`btn shrink-0 ${st === 'idle' ? 'btn-primary' : ''}`}
                    disabled={st !== 'idle'}
                    onClick={() => add(h)}
                  >
                    {st === 'idle' && 'Add to tracker'}
                    {st === 'adding' && 'Adding'}
                    {st === 'added' && 'Added'}
                    {st === 'duplicate' && 'Already there'}
                    {st === 'failed' && 'Failed'}
                  </button>
                </div>
                {h.snippet && <p className="text-[13px] text-[var(--text-muted)] mt-2 line-clamp-3">{h.snippet}</p>}
              </article>
            )
          })}
      </div>
    </div>
  )
}

const TYPES: { key: PartnerType; title: string }[] = [
  { key: 'sponsor', title: 'Sponsor' },
  { key: 'mentor', title: 'Mentor' },
  { key: 'partner', title: 'Partner' },
]

function People({ entries }: { entries: EntrySummary[] }) {
  const [list, setList] = useState<Partner[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partner | 'new' | null>(null)

  useEffect(() => {
    api
      .partners()
      .then(setList)
      .catch(() => setError('Could not load the list.'))
  }, [])

  const nameOf = (id: string | null) => entries.find((e) => e.id === id)?.name ?? ''

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          Add
        </button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {list === null && !error && (
        <div className="grid gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} h={56} />
          ))}
        </div>
      )}
      {list && list.length === 0 && <Empty>No one here yet.</Empty>}
      {list && list.length > 0 && (
        <ul className="card divide-y divide-[var(--border)]">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold truncate">
                  {p.name}
                  {p.company && <span className="font-normal text-[var(--text-muted)]"> · {p.company}</span>}
                </p>
                <p className="text-[13px] text-[var(--text-muted)] truncate">
                  {TYPES.find((t) => t.key === p.type)?.title}
                  {p.role ? ` · ${p.role}` : ''}
                  {p.entryId ? ` · ${nameOf(p.entryId)}` : ''}
                </p>
              </div>
              <span className="text-[13px] text-[var(--text-muted)] shrink-0">{STATUS.find((s) => s.key === p.status)?.title}</span>
              {p.linkedin && (
                <a
                  href={p.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Open profile of ${p.name}`}
                >
                  <ExternalLink size={16} />
                </a>
              )}
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                <Pencil size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <PartnerForm
          partner={editing === 'new' ? null : editing}
          entries={entries}
          onClose={() => setEditing(null)}
          onSaved={(l) => {
            setList(l)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function PartnerForm({
  partner,
  entries,
  onClose,
  onSaved,
}: {
  partner: Partner | null
  entries: EntrySummary[]
  onClose: () => void
  onSaved: (list: Partner[]) => void
}) {
  const [f, setF] = useState<Partial<Partner>>(
    partner ?? { name: '', company: '', role: '', type: 'mentor', linkedin: '', entryId: null, status: 'open', note: '' },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const set = (k: keyof Partner, v: string | null) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name?.trim()) return
    setBusy(true)
    try {
      onSaved(partner ? await api.partnerUpdate(partner.id, f) : await api.partnerAdd(f))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!partner || !(await confirm(`Remove ${partner.name}?`, 'Remove'))) return
    setBusy(true)
    try {
      onSaved(await api.partnerRemove(partner.id))
    } catch {
      setError('Failed')
      setBusy(false)
    }
  }
  return (
    <Modal
      title={partner ? 'Edit' : 'Add'}
      onClose={onClose}
      footer={
        <>
          {partner && (
            <button type="button" className="btn btn-ghost mr-auto" onClick={remove} disabled={busy}>
              Remove
            </button>
          )}
          <button type="submit" form="partner-form" className="btn btn-primary" disabled={busy || !f.name?.trim()}>
            Save
          </button>
        </>
      }
    >
      <form id="partner-form" onSubmit={submit}>
        <Field label="Name">
          <Input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input value={f.company ?? ''} onChange={(e) => set('company', e.target.value)} maxLength={120} />
          </Field>
          <Field label="Role">
            <Input value={f.role ?? ''} onChange={(e) => set('role', e.target.value)} maxLength={120} />
          </Field>
          <Field label="Type">
            <Select value={f.type ?? 'mentor'} onChange={(e) => set('type', e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status ?? 'open'} onChange={(e) => set('status', e.target.value)}>
              {STATUS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="LinkedIn or website">
          <Input type="url" value={f.linkedin ?? ''} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Related to">
          <Select value={f.entryId ?? ''} onChange={(e) => set('entryId', e.target.value || null)}>
            <option value="">None</option>
            {entries
              .filter((e) => !e.archived)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} maxLength={2000} />
        </Field>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
      {dialog}
    </Modal>
  )
}
