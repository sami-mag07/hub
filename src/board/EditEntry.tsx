import { useRef, useState, type FormEvent } from 'react'
import type { Entry } from '../lib/types'
import type { OpFn } from '../views/Board'
import { api, ApiError } from '../lib/api'
import { navigate } from '../lib/router'
import { ErrorLine, Field, Input, Modal, useConfirm } from '../components/ui'

// Bearbeiten des Eintrags: Stammdaten nur bei Projekten und verwaisten
// Hackathons (die anderen kommen aus dem Tracker), Logo für alle, Archiv.
export function EditEntry({
  entry,
  op,
  apply,
  onClose,
  onChanged,
}: {
  entry: Entry
  op: OpFn
  apply: (e: Entry) => void
  onClose: () => void
  onChanged: () => void
}) {
  const trackerOwned = entry.trackerId !== null && !!entry.tracker && !entry.tracker.missingSince
  const [f, setF] = useState({
    name: entry.name,
    link: entry.link,
    dates: entry.dates.text,
    location: entry.location,
    deadline: entry.deadline ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const changes: [string, string, string][] = [
      ['name', f.name, entry.name],
      ['link', f.link, entry.link],
      ['dates.text', f.dates, entry.dates.text],
      ['location', f.location, entry.location],
      ['deadline', f.deadline, entry.deadline ?? ''],
    ]
    for (const [field, value, before] of changes) {
      if (trackerOwned || value === before) continue
      const r = await op('field', { field, value })
      if (!r.ok) {
        setError(r.message)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    onChanged()
    onClose()
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 1024 * 1024) {
      setError('Logo must be 1 MB or smaller.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBusy(true)
    setError(null)
    try {
      apply(await api.uploadLogo(entry.id, file))
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const logoMode = async (kind: 'favicon' | 'initials') => {
    const r = await op('logo/mode', { kind })
    if (!r.ok) setError(r.message)
    else onChanged()
  }

  const archive = async () => {
    if (!(await confirm(`Archive ${entry.name}? It disappears from the home screen.`, 'Archive'))) return
    const r = await op('archive', { archived: true })
    if (r.ok) {
      onChanged()
      navigate('/')
    } else setError(r.message)
  }

  return (
    <Modal
      title="Edit"
      onClose={onClose}
      footer={
        <>
          {!entry.archived ? (
            <button type="button" className="btn btn-ghost mr-auto" onClick={archive} disabled={busy}>
              Archive
            </button>
          ) : (
            <button type="button" className="btn btn-ghost mr-auto" onClick={() => op('archive', { archived: false }).then(onChanged)} disabled={busy}>
              Unarchive
            </button>
          )}
          <button type="submit" form="edit-form" className="btn btn-primary" disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <form id="edit-form" onSubmit={submit}>
        {trackerOwned && (
          <p className="text-[13px] text-[var(--text-muted)] mb-3">Name, dates, place, deadline and website come from the tracker in Emil.</p>
        )}
        <Field label="Name">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={160} disabled={trackerOwned} />
        </Field>
        <Field label="Website or repo">
          <Input type="url" value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://" disabled={trackerOwned} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dates">
            <Input value={f.dates} onChange={(e) => set('dates', e.target.value)} maxLength={120} disabled={trackerOwned} />
          </Field>
          <Field label="Place">
            <Input value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={160} disabled={trackerOwned} />
          </Field>
        </div>
        <Field label="Deadline">
          <Input type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} disabled={trackerOwned} />
        </Field>

        <p className="text-[13px] font-medium text-[var(--text-muted)] mb-1 mt-2">Logo</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            id="logo-file"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <label htmlFor="logo-file" className="btn cursor-pointer">
            Upload
          </label>
          <button type="button" className="btn" aria-pressed={entry.logo.kind === 'favicon'} onClick={() => logoMode('favicon')}>
            From website
          </button>
          <button type="button" className="btn" aria-pressed={entry.logo.kind === 'initials'} onClick={() => logoMode('initials')}>
            Initials
          </button>
        </div>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
      {dialog}
    </Modal>
  )
}
