import { useState, type FormEvent } from 'react'
import { ExternalLink, Globe, Pencil, Plus } from 'lucide-react'
import type { Entry, Link, LinkType } from '../lib/types'
import type { OpFn } from '../views/Board'
import { ErrorLine, Field, Input, Modal, SectionTitle, Select, Textarea, useConfirm } from '../components/ui'
import { api, ApiError, domainOf } from '../lib/api'
import { formatTime } from '../lib/format'

const LINK_TYPES: { key: LinkType; title: string }[] = [
  { key: 'registration', title: 'Registration' },
  { key: 'github', title: 'GitHub' },
  { key: 'pitch', title: 'Pitch deck' },
  { key: 'miro', title: 'Miro board' },
  { key: 'other', title: 'Other' },
]

const INFO: { key: keyof Entry['info']; title: string }[] = [
  { key: 'description', title: 'About' },
  { key: 'tracks', title: 'Tracks' },
  { key: 'prizes', title: 'Prizes' },
  { key: 'windows', title: 'Application windows' },
  { key: 'cost', title: 'Cost' },
]

// Gefüllte Abschnitte stehen als Text mit Stift, leere als eine Zeile
// gestrichelter Knöpfe. Fünfmal "Add" untereinander wäre Slop.
export function About({ entry, op, apply }: { entry: Entry; op: OpFn; apply: (e: Entry) => void }) {
  const [editInfo, setEditInfo] = useState<keyof Entry['info'] | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [readResult, setReadResult] = useState<string | null>(null)
  const filled = INFO.filter(({ key }) => entry.info[key])
  const empty = INFO.filter(({ key }) => !entry.info[key])

  // Die Blase liest ihre Webseite: füllt nur, was leer ist.
  const read = async () => {
    setReading(true)
    setReadError(null)
    setReadResult(null)
    try {
      const r = await api.enrich(entry.id)
      apply(r.entry)
      setReadResult(r.changed.length ? `Filled ${r.changed.length} things.` : 'Nothing new on the website.')
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) setReadError(e.message)
      else if (e instanceof ApiError && e.status === 503) setReadError('Reading is not configured on the server.')
      else setReadError(e instanceof ApiError ? e.message : 'Could not read the website.')
    } finally {
      setReading(false)
    }
  }

  return (
    <div>
      <SectionTitle
        action={
          entry.link ? (
            <>
              {entry.enriched?.at && !reading && (
                <span className="text-[13px] text-[var(--text-muted)] tnum hidden sm:inline">
                  {readResult ?? `Read ${formatTime(entry.enriched.at)}`}
                </span>
              )}
              <button type="button" className="btn" onClick={read} disabled={reading}>
                <Globe size={15} className={reading ? 'animate-pulse' : ''} />
                {reading ? 'Reading' : 'Read website'}
              </button>
            </>
          ) : undefined
        }
      >
        About
      </SectionTitle>
      {readError && <ErrorLine>{readError}</ErrorLine>}
      <div className="grid gap-5">
        {filled.map(({ key, title }) => (
          <div key={key}>
            <div className="flex items-center gap-1 mb-0.5">
              <h3 className="text-[14px] font-semibold">{title}</h3>
              <button type="button" className="btn btn-ghost btn-icon !w-7 !h-7" aria-label={`Edit ${title}`} onClick={() => setEditInfo(key)}>
                <Pencil size={13} />
              </button>
            </div>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{entry.info[key]}</p>
          </div>
        ))}
        {entry.tracker && (entry.tracker.notiz || entry.tracker.kosten) && (
          <div>
            <h3 className="text-[14px] font-semibold mb-0.5">From the tracker</h3>
            {entry.tracker.kosten && <p className="text-[15px] leading-relaxed">{entry.tracker.kosten}</p>}
            {entry.tracker.notiz && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{entry.tracker.notiz}</p>}
          </div>
        )}
        {empty.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {empty.map(({ key, title }) => (
              <button
                key={key}
                type="button"
                className="btn btn-ghost !border !border-dashed !border-[var(--border-strong)] !bg-transparent"
                onClick={() => setEditInfo(key)}
              >
                <Plus size={14} />
                {title}
              </button>
            ))}
          </div>
        )}
      </div>
      {editInfo && (
        <InfoForm
          title={INFO.find((i) => i.key === editInfo)!.title}
          field={editInfo}
          value={entry.info[editInfo]}
          op={op}
          onClose={() => setEditInfo(null)}
        />
      )}
    </div>
  )
}

export function Links({ entry, op }: { entry: Entry; op: OpFn }) {
  const [editLink, setEditLink] = useState<Link | 'new' | null>(null)
  return (
    <div>
      <SectionTitle
        action={
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Add link" onClick={() => setEditLink('new')}>
            <Plus size={16} />
          </button>
        }
      >
        Links
      </SectionTitle>
      <ul className="grid gap-1">
        {entry.link && (
          <li>
            <a
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-2 -mx-3 hover:bg-white/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium truncate">Website</span>
                <span className="block text-[12px] text-[var(--text-muted)] truncate">{domainOf(entry.link)}</span>
              </span>
              <ExternalLink size={14} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
            </a>
          </li>
        )}
        {entry.links.map((l) => (
          <li key={l.id} className="flex items-center gap-1 -mx-3">
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-2 min-w-0 flex-1 hover:bg-white/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium truncate">{l.label}</span>
                <span className="block text-[12px] text-[var(--text-muted)] truncate">{domainOf(l.url)}</span>
              </span>
              <ExternalLink size={14} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />
            </a>
            <button type="button" className="btn btn-ghost btn-icon !w-8 !h-8 shrink-0" aria-label={`Edit link ${l.label}`} onClick={() => setEditLink(l)}>
              <Pencil size={13} />
            </button>
          </li>
        ))}
        {!entry.link && entry.links.length === 0 && <li className="text-[14px] text-[var(--text-muted)]">No links yet.</li>}
      </ul>
      {editLink && <LinkForm link={editLink === 'new' ? null : editLink} op={op} onClose={() => setEditLink(null)} />}
    </div>
  )
}

function LinkForm({ link, op, onClose }: { link: Link | null; op: OpFn; onClose: () => void }) {
  const [label, setLabel] = useState(link?.label ?? '')
  const [url, setUrl] = useState(link?.url ?? '')
  const [type, setType] = useState<LinkType>(link?.type ?? 'other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const pickType = (t: LinkType) => {
    setType(t)
    if (!label || LINK_TYPES.some((x) => x.title === label)) setLabel(t === 'other' ? '' : LINK_TYPES.find((x) => x.key === t)!.title)
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = link ? await op('links/update', { linkId: link.id, label, url, type }) : await op('links/add', { label, url, type })
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }
  const remove = async () => {
    if (!link || !(await confirm(`Remove link ${link.label}?`, 'Remove'))) return
    const r = await op('links/remove', { linkId: link.id })
    if (r.ok) onClose()
    else setError(r.message)
  }
  return (
    <Modal
      title={link ? 'Edit link' : 'Add link'}
      onClose={onClose}
      footer={
        <>
          {link && (
            <button type="button" className="btn btn-ghost mr-auto" onClick={remove}>
              Remove
            </button>
          )}
          <button type="submit" form="link-form" className="btn btn-primary" disabled={busy || !label.trim() || !url.trim()}>
            Save
          </button>
        </>
      }
    >
      <form id="link-form" onSubmit={submit}>
        <Field label="Type">
          <Select value={type} onChange={(e) => pickType(e.target.value as LinkType)}>
            {LINK_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
        </Field>
        <Field label="URL">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoFocus={!link} />
        </Field>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
      {dialog}
    </Modal>
  )
}

function InfoForm({
  title,
  field,
  value,
  op,
  onClose,
}: {
  title: string
  field: keyof Entry['info']
  value: string
  op: OpFn
  onClose: () => void
}) {
  const [text, setText] = useState(value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    // Textfeld: bei 409 nur wiederholen, wenn der alte Wert noch stimmt.
    const r = await op('field', { field: `info.${field}`, value: text }, (fresh) => fresh.info[field] === value)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button type="submit" form="info-form" className="btn btn-primary" disabled={busy}>
          Save
        </button>
      }
    >
      <form id="info-form" onSubmit={submit}>
        <Field label={title}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={8} autoFocus />
        </Field>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
    </Modal>
  )
}
