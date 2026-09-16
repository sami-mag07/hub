import { useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { CONTACT_STATUS as STATUS, type Contact, type Entry } from '../lib/types'
import type { OpFn } from '../views/Board'
import { Empty, ErrorLine, Field, Input, Modal, SectionTitle, Select, Textarea, useConfirm } from '../components/ui'

export function Contacts({ entry, op }: { entry: Entry; op: OpFn }) {
  const [editing, setEditing] = useState<Contact | 'new' | null>(null)
  const list = [...entry.contacts].sort((a, b) => STATUS.findIndex((s) => s.key === a.status) - STATUS.findIndex((s) => s.key === b.status))
  return (
    <div>
      <SectionTitle
        action={
          <button type="button" className="btn" onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add
          </button>
        }
      >
        Outreach
      </SectionTitle>
      {list.length === 0 ? (
        <Empty>Nobody to reach out to yet.</Empty>
      ) : (
        <ul className="card divide-y divide-[var(--border)]">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold truncate">{c.name}</p>
                <p className="text-[13px] text-[var(--text-muted)] truncate">{[c.role, c.channel].filter(Boolean).join(' · ')}</p>
                {c.note && <p className="text-[13px] mt-1 whitespace-pre-wrap">{c.note}</p>}
              </div>
              <span className="text-[13px] text-[var(--text-muted)] shrink-0">{STATUS.find((s) => s.key === c.status)?.title}</span>
              <button type="button" className="btn btn-ghost btn-icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ContactForm contact={editing === 'new' ? null : editing} op={op} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ContactForm({ contact, op, onClose }: { contact: Contact | null; op: OpFn; onClose: () => void }) {
  const [f, setF] = useState({
    name: contact?.name ?? '',
    role: contact?.role ?? '',
    channel: contact?.channel ?? '',
    status: contact?.status ?? 'open',
    note: contact?.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    const r = contact ? await op('contacts/update', { contactId: contact.id, ...f }) : await op('contacts/add', f)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }
  const remove = async () => {
    if (!contact || !(await confirm(`Remove ${contact.name}?`, 'Remove'))) return
    const r = await op('contacts/remove', { contactId: contact.id })
    if (r.ok) onClose()
    else setError(r.message)
  }
  return (
    <Modal
      title={contact ? 'Contact' : 'New contact'}
      onClose={onClose}
      footer={
        <>
          {contact && (
            <button type="button" className="btn btn-ghost mr-auto" onClick={remove}>
              Remove
            </button>
          )}
          <button type="submit" form="contact-form" className="btn btn-primary" disabled={busy || !f.name.trim()}>
            Save
          </button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit}>
        <Field label="Name">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Input value={f.role} onChange={(e) => set('role', e.target.value)} maxLength={120} placeholder="Organiser, mentor, jury" />
          </Field>
          <Field label="Channel">
            <Input value={f.channel} onChange={(e) => set('channel', e.target.value)} maxLength={120} placeholder="Mail, LinkedIn, in person" />
          </Field>
        </div>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set('status', e.target.value)}>
            {STATUS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={2000} rows={3} />
        </Field>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
      {dialog}
    </Modal>
  )
}
