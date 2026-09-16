import { useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { Entry, Track } from '../lib/types'
import type { OpFn } from '../views/Board'
import { Empty, ErrorLine, Field, Input, Modal, SectionTitle, Textarea, useConfirm } from '../components/ui'

// Jeder Track als eigene Karte: was die Veranstalter sagen, darunter unsere
// Notizen. Notizen sind das, was wir hier wirklich brauchen.
export function Tracks({ entry, op }: { entry: Entry; op: OpFn }) {
  const [editing, setEditing] = useState<Track | 'new' | null>(null)
  return (
    <div>
      <SectionTitle
        action={
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Add track" onClick={() => setEditing('new')}>
            <Plus size={16} />
          </button>
        }
      >
        Tracks
      </SectionTitle>
      {entry.tracks.length === 0 ? (
        <Empty>{entry.link ? 'No tracks yet. Read the website or add one.' : 'No tracks yet.'}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entry.tracks.map((t) => (
            <article key={t.id} className="rounded-2xl bg-white/60 px-4 py-3">
              <div className="flex items-start gap-1">
                <h3 className="text-[15px] font-semibold leading-snug flex-1">{t.name}</h3>
                <button type="button" className="btn btn-ghost btn-icon !w-7 !h-7 shrink-0" aria-label={`Edit track ${t.name}`} onClick={() => setEditing(t)}>
                  <Pencil size={13} />
                </button>
              </div>
              {t.description && <p className="text-[14px] text-[var(--text-muted)] leading-relaxed mt-1 whitespace-pre-wrap">{t.description}</p>}
              {t.notes ? (
                <p className="text-[14px] leading-relaxed mt-2 whitespace-pre-wrap border-l-2 border-[var(--border-strong)] pl-3">{t.notes}</p>
              ) : (
                <button type="button" className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)] mt-2" onClick={() => setEditing(t)}>
                  Add notes
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {editing && <TrackForm track={editing === 'new' ? null : editing} op={op} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TrackForm({ track, op, onClose }: { track: Track | null; op: OpFn; onClose: () => void }) {
  const [f, setF] = useState({ name: track?.name ?? '', description: track?.description ?? '', notes: track?.notes ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    const r = track
      ? await op('tracks/update', { trackId: track.id, ...f }, (fresh) => {
          const cur = fresh.tracks.find((t) => t.id === track.id)
          return !!cur && cur.notes === track.notes && cur.description === track.description
        })
      : await op('tracks/add', f)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }
  const remove = async () => {
    if (!track || !(await confirm(`Remove track ${track.name}?`, 'Remove'))) return
    const r = await op('tracks/remove', { trackId: track.id })
    if (r.ok) onClose()
    else setError(r.message)
  }
  return (
    <Modal
      title={track ? 'Track' : 'New track'}
      onClose={onClose}
      footer={
        <>
          {track && (
            <button type="button" className="btn btn-ghost mr-auto" onClick={remove}>
              Remove
            </button>
          )}
          <button type="submit" form="track-form" className="btn btn-primary" disabled={busy || !f.name.trim()}>
            Save
          </button>
        </>
      }
    >
      <form id="track-form" onSubmit={submit}>
        <Field label="Name">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus={!track} />
        </Field>
        <Field label="What the organisers say">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} rows={3} />
        </Field>
        <Field label="Our notes">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={4000} rows={6} autoFocus={!!track} />
        </Field>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
      {dialog}
    </Modal>
  )
}
