import { useState, type FormEvent } from 'react'
import { ExternalLink, Pencil, Plus } from 'lucide-react'
import type { Entry, Link, LinkType } from '../lib/types'
import type { OpFn } from '../views/Board'
import { ErrorLine, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { domainOf } from '../lib/api'

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

export function Overview({ entry, op }: { entry: Entry; op: OpFn }) {
  const [editLink, setEditLink] = useState<Link | 'new' | null>(null)
  const [editInfo, setEditInfo] = useState<keyof Entry['info'] | null>(null)

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-6 min-w-0">
        {INFO.filter(({ key }) => entry.info[key]).map(({ key, title }) => (
          <section key={key}>
            <div className="flex items-center gap-1 mb-1">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <button type="button" className="btn btn-ghost btn-icon !w-8 !h-8" aria-label={`Edit ${title}`} onClick={() => setEditInfo(key)}>
                <Pencil size={14} />
              </button>
            </div>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{entry.info[key]}</p>
          </section>
        ))}
        {INFO.some(({ key }) => !entry.info[key]) && (
          <div className="flex flex-wrap gap-2">
            {INFO.filter(({ key }) => !entry.info[key]).map(({ key, title }) => (
              <button key={key} type="button" className="btn btn-ghost !border !border-dashed !border-[var(--border-strong)]" onClick={() => setEditInfo(key)}>
                <Plus size={14} />
                {title}
              </button>
            ))}
          </div>
        )}
        {entry.tracker && (entry.tracker.notiz || entry.tracker.kosten) && (
          <section>
            <h2 className="text-[15px] font-semibold mb-1">From the tracker</h2>
            {entry.tracker.kosten && <p className="text-[15px] leading-relaxed">{entry.tracker.kosten}</p>}
            {entry.tracker.notiz && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{entry.tracker.notiz}</p>}
          </section>
        )}
      </div>

      <aside>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[15px] font-semibold">Links</h2>
          <button type="button" className="btn btn-ghost btn-icon !w-8 !h-8" aria-label="Add link" onClick={() => setEditLink('new')}>
            <Plus size={16} />
          </button>
        </div>
        <ul className="card divide-y divide-[var(--border)]">
          {entry.link && (
            <li className="flex items-center gap-2 px-3 py-2.5">
              <a href={entry.link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                <span className="block text-[14px] font-medium truncate">{entry.kind === 'hackathon' ? 'Website' : 'Website or repo'}</span>
                <span className="block text-[12px] text-[var(--text-muted)] truncate">{domainOf(entry.link)}</span>
              </a>
              <ExternalLink size={14} className="text-[var(--text-faint)] shrink-0" aria-hidden="true" />
            </li>
          )}
          {entry.links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2.5">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                <span className="block text-[14px] font-medium truncate">{l.label}</span>
                <span className="block text-[12px] text-[var(--text-muted)] truncate">{domainOf(l.url)}</span>
              </a>
              <button type="button" className="btn btn-ghost btn-icon !w-8 !h-8 shrink-0" aria-label={`Edit link ${l.label}`} onClick={() => setEditLink(l)}>
                <Pencil size={14} />
              </button>
            </li>
          ))}
          {!entry.link && entry.links.length === 0 && (
            <li className="px-3 py-3 text-[14px] text-[var(--text-muted)]">No links yet.</li>
          )}
        </ul>
      </aside>

      {editLink && <LinkForm link={editLink === 'new' ? null : editLink} op={op} onClose={() => setEditLink(null)} />}
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

function LinkForm({ link, op, onClose }: { link: Link | null; op: OpFn; onClose: () => void }) {
  const [label, setLabel] = useState(link?.label ?? '')
  const [url, setUrl] = useState(link?.url ?? '')
  const [type, setType] = useState<LinkType>(link?.type ?? 'other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (!link || !confirm(`Remove link ${link.label}?`)) return
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
