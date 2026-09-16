// Ablage: eine JSON-Datei je Eintrag unter data/entries/, ein Index im
// Speicher, Schreibzugriffe je ID nacheinander, jede Datei atomar per
// tmp+rename. Jede Änderung erhöht version; wer mit alter Version schreibt,
// bekommt 409 samt frischem Eintrag.

import { randomBytes } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { HttpError, assertId } from './http.mjs'

export const LIMITS = { tasks: 300, contacts: 200, links: 30, comments: 500, news: 12, partners: 500 }

export function newId() {
  return randomBytes(9).toString('base64url')
}

export const now = () => new Date().toISOString()

export function emptyEntry({ id, kind, name, createdBy, link = '', trackerId = null }) {
  const t = now()
  return {
    id,
    kind,
    trackerId,
    version: 1,
    name,
    logo: { kind: 'favicon', file: null },
    dates: { text: '', start: null, end: null },
    location: '',
    deadline: null,
    deadlineNote: '',
    link,
    links: [],
    info: { description: '', tracks: '', prizes: '', windows: '', cost: '' },
    tracks: [],
    tasks: [],
    contacts: [],
    comments: [],
    news: { fetchedAt: null, query: '', items: [] },
    enriched: null,
    tracker: null,
    pinned: false,
    archived: false,
    createdAt: t,
    createdBy,
    updatedAt: t,
  }
}

export function summary(e) {
  const { id, kind, version, name, logo, dates, location, deadline, link, tracker, pinned, archived } = e
  return { id, kind, version, name, logo, dates, location, deadline, link, tracker, pinned, archived }
}

async function writeAtomic(file, data, mode) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(tmp, data, mode ? { mode } : undefined)
  await fsp.rename(tmp, file)
}

export class Store {
  constructor(dataDir) {
    this.dir = dataDir
    this.entriesDir = path.join(dataDir, 'entries')
    this.logosDir = path.join(dataDir, 'logos')
    this.entries = new Map()
    this.queues = new Map()
    this.partners = []
  }

  file(id) {
    const f = path.join(this.entriesDir, `${assertId(id)}.json`)
    if (!f.startsWith(this.entriesDir + path.sep)) throw new HttpError(400, 'bad_request', 'Invalid id')
    return f
  }

  async load() {
    await fsp.mkdir(this.entriesDir, { recursive: true })
    await fsp.mkdir(this.logosDir, { recursive: true })
    for (const name of await fsp.readdir(this.entriesDir)) {
      if (!name.endsWith('.json')) continue
      try {
        const e = JSON.parse(await fsp.readFile(path.join(this.entriesDir, name), 'utf8'))
        if (e && typeof e.id === 'string') {
          // Additive Felder für ältere Dateien
          e.tracks ??= []
          e.enriched ??= null
          this.entries.set(e.id, e)
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'entry_unreadable', file: name, message: err.message }))
      }
    }
    try {
      const p = JSON.parse(await fsp.readFile(path.join(this.dir, 'partners.json'), 'utf8'))
      if (Array.isArray(p)) this.partners = p
    } catch {
      this.partners = []
    }
  }

  // Arbeit je ID nacheinander, damit zwei Schreibzugriffe sich nie kreuzen.
  serial(key, work) {
    const prev = this.queues.get(key) || Promise.resolve()
    const run = prev.then(work, work)
    const done = run.catch(() => {}).then(() => {
      if (this.queues.get(key) === done) this.queues.delete(key)
    })
    this.queues.set(key, done)
    return run
  }

  get(id) {
    const e = this.entries.get(assertId(id))
    if (!e) throw new HttpError(404, 'not_found', 'Entry not found')
    return e
  }

  list() {
    return [...this.entries.values()].map(summary)
  }

  byTrackerId(trackerId) {
    for (const e of this.entries.values()) if (e.trackerId === trackerId) return e
    return null
  }

  async persist(e) {
    e.updatedAt = now()
    await writeAtomic(this.file(e.id), JSON.stringify(e, null, 1))
    this.entries.set(e.id, e)
    return e
  }

  async create(entry) {
    return this.serial(entry.id, async () => {
      if (this.entries.has(entry.id)) throw new HttpError(409, 'exists', 'Entry exists')
      return this.persist(entry)
    })
  }

  // mutate: fn bekommt eine Kopie, ändert sie, der Store bumpt version und
  // schreibt. Mit expectedVersion prüft der Aufrufer, dass er den aktuellen
  // Stand kannte; sonst 409 mit dem frischen Eintrag.
  async mutate(id, expectedVersion, fn) {
    return this.serial(id, async () => {
      const current = this.get(id)
      if (expectedVersion !== undefined && expectedVersion !== current.version) {
        throw new HttpError(409, 'conflict', 'Entry changed', { entry: current })
      }
      const draft = structuredClone(current)
      const result = await fn(draft)
      if (result === false) return current
      draft.version = current.version + 1
      return this.persist(draft)
    })
  }

  async remove(id) {
    return this.serial(id, async () => {
      this.get(id)
      await fsp.rm(this.file(id), { force: true })
      this.entries.delete(id)
    })
  }

  async savePartners(list) {
    return this.serial('partners', async () => {
      await writeAtomic(path.join(this.dir, 'partners.json'), JSON.stringify(list, null, 1))
      this.partners = list
      return list
    })
  }

  async readCache(name) {
    try {
      return JSON.parse(await fsp.readFile(path.join(this.dir, name), 'utf8'))
    } catch {
      return null
    }
  }

  async writeCache(name, data) {
    await writeAtomic(path.join(this.dir, name), JSON.stringify(data))
  }

  logoFile(id, ext) {
    const f = path.join(this.logosDir, `${assertId(id)}.${ext}`)
    if (!f.startsWith(this.logosDir + path.sep)) throw new HttpError(400, 'bad_request', 'Invalid id')
    return f
  }
}
