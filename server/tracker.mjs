// Anbindung an den Programm-Tracker in Emil. Der Hub liest die Liste beim
// Start und alle zehn Minuten, legt für jede Hackathon-Zeile einen Eintrag
// an oder frischt die Tracker-Felder auf, und schreibt Status-Änderungen
// zurück. Der letzte gute Stand liegt als Cache auf Platte, damit die Blasen
// einen Emil-Neustart überleben.

import { HttpError, bad } from './http.mjs'
import { emptyEntry, newId, now } from './store.mjs'

const INTERVAL_MS = 10 * 60 * 1000
const TIMEOUT_MS = 12_000
const STATUS = ['offen', 'beworben', 'warteliste', 'angenommen', 'abgelehnt', 'verworfen']

function year(y) {
  return y.length === 2 ? `20${y}` : y
}
const iso = (d, m, y) => `${year(y)}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`

// Aus Freitext wie "14./15.11.26", "27.–29.11.2026", "23.09.26" oder
// "Finale 15./16.10." Start und Ende ziehen. Ohne Jahr bleibt es leer.
export function parseDates(textIn) {
  const t = String(textIn || '')
  const Y = String.raw`(\d{2,4})`
  const SEP = String.raw`\s*(?:\/|–|-|bis|\+|und)\s*`
  // "01.03.–01.05.27": Tag und Monat auf beiden Seiten, Jahr nur hinten
  let m = t.match(new RegExp(String.raw`(?<![\d.])(\d{1,2})\.(\d{1,2})\.?${SEP}(\d{1,2})\.(\d{1,2})\.${Y}`))
  if (m) return { start: iso(m[1], m[2], m[5]), end: iso(m[3], m[4], m[5]) }
  // "14./15.11.26" oder "27.–29.11.2026": nur Tage links
  m = t.match(new RegExp(String.raw`(?<![\d.])(\d{1,2})\.?${SEP}(\d{1,2})\.(\d{1,2})\.${Y}`))
  if (m) return { start: iso(m[1], m[3], m[4]), end: iso(m[2], m[3], m[4]) }
  const all = [...t.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g)]
  if (!all.length) return { start: null, end: null }
  const first = all[0]
  const last = all[all.length - 1]
  return { start: iso(first[1], first[2], first[3]), end: iso(last[1], last[2], last[3]) }
}

export function applyRow(e, row, syncedAt) {
  const { start, end } = parseDates(row.datum)
  const next = {
    name: String(row.name || '').trim() || e.name,
    dates: { text: String(row.datum || ''), start, end },
    location: String(row.ort || ''),
    deadline: row.frist || null,
    deadlineNote: String(row.frist_hinweis || ''),
    link: String(row.link || ''),
    tracker: {
      status: row.status,
      kategorie: String(row.kategorie || ''),
      kosten: String(row.kosten || ''),
      notiz: String(row.notiz || ''),
      beworbenAm: row.beworben_am || null,
      syncedAt,
      missingSince: null,
    },
  }
  const before = JSON.stringify({
    name: e.name,
    dates: e.dates,
    location: e.location,
    deadline: e.deadline,
    deadlineNote: e.deadlineNote,
    link: e.link,
    tracker: e.tracker && { ...e.tracker, syncedAt: undefined },
  })
  const after = JSON.stringify({ ...next, tracker: { ...next.tracker, syncedAt: undefined } })
  Object.assign(e, next)
  return before !== after
}

export class Tracker {
  constructor(store) {
    this.store = store
    this.state = { lastOk: null, lastError: null, lastTry: null }
    this.timer = null
    this.running = null
    // Wird für jeden neu angelegten Eintrag gerufen (Hintergrund-Anreicherung).
    this.onNew = () => {}
  }

  get configured() {
    return !!(process.env.EMIL_EXPORT_URL && process.env.HUB_TOKEN)
  }

  async call(path, body) {
    if (!this.configured) throw new HttpError(503, 'tracker_unconfigured', 'Tracker is not configured')
    const base = process.env.EMIL_EXPORT_URL.replace(/\/+$/, '')
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${base}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${process.env.HUB_TOKEN}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new HttpError(502, 'tracker_error', data.error || `Tracker answered ${res.status}`)
      return data
    } finally {
      clearTimeout(t)
    }
  }

  async start() {
    // Ohne Netz erst der Cache, damit die Startseite nicht leer ist.
    const cached = await this.store.readCache('tracker-cache.json')
    if (cached?.eintraege) await this.merge(cached.eintraege, cached.fetchedAt || now(), { markMissing: false })
    void this.sync()
    this.timer = setInterval(() => void this.sync(), INTERVAL_MS)
    this.timer.unref?.()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  sync() {
    if (this.running) return this.running
    this.running = this._sync().finally(() => (this.running = null))
    return this.running
  }

  async _sync() {
    this.state.lastTry = now()
    if (!this.configured) {
      this.state.lastError = 'not configured'
      return this.state
    }
    try {
      const data = await this.call('/api/programme/export')
      const fetchedAt = now()
      await this.store.writeCache('tracker-cache.json', { fetchedAt, eintraege: data.eintraege })
      const changed = await this.merge(data.eintraege, fetchedAt, { markMissing: true })
      this.state.lastOk = fetchedAt
      this.state.lastError = null
      console.log(JSON.stringify({ event: 'tracker_sync', rows: data.eintraege.length, changed }))
    } catch (err) {
      this.state.lastError = err.message
      console.error(JSON.stringify({ event: 'tracker_sync_failed', message: err.message }))
    }
    return this.state
  }

  async merge(rows, syncedAt, { markMissing }) {
    let changed = 0
    const seen = new Set()
    for (const row of rows) {
      if (row.kategorie !== 'Hackathon' || typeof row.id !== 'number') continue
      seen.add(row.id)
      const existing = this.store.byTrackerId(row.id)
      if (!existing) {
        const e = emptyEntry({ id: newId(), kind: 'hackathon', name: String(row.name || 'Untitled'), createdBy: 'tracker', trackerId: row.id })
        applyRow(e, row, syncedAt)
        await this.store.create(e)
        changed++
        this.onNew(e.id)
        continue
      }
      await this.store.mutate(existing.id, undefined, (draft) => applyRow(draft, row, syncedAt) || false).then(
        (e) => e.version !== existing.version && changed++,
      )
    }
    if (markMissing) {
      for (const e of this.store.list()) {
        if (e.kind !== 'hackathon' || e.tracker === null || seen.has(this.store.get(e.id).trackerId)) continue
        if (e.tracker.missingSince) continue
        await this.store.mutate(e.id, undefined, (draft) => {
          draft.tracker.missingSince = syncedAt
        })
        changed++
      }
    }
    return changed
  }

  // Status in Emil setzen und lokal spiegeln. Emil ist die Wahrheit, deshalb
  // erst dorthin, dann in den eigenen Eintrag.
  async setStatus(entryId, status) {
    const e = this.store.get(entryId)
    if (e.trackerId === null) throw bad('This entry is not in the tracker')
    if (!STATUS.includes(status)) throw bad('Unknown status')
    const data = await this.call('/api/programme/export/status', { id: e.trackerId, status })
    return this.store.mutate(entryId, undefined, (draft) => {
      applyRow(draft, data.eintrag, now())
    })
  }

  async addHackathon(fields) {
    const data = await this.call('/api/programme/export/neu', fields)
    void this.sync()
    return { id: data.id, duplikat: !!data.duplikat }
  }
}
