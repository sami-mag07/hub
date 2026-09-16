// Hintergrund-Arbeit, eine Sache nach der anderen: neue Einträge lesen ihre
// Webseite und suchen ihr Logo. Beim Start werden die sichtbaren Hackathons
// nachgeholt, die noch nie gelesen wurden. Langsam und leise, damit die
// Claude-CLI auf dem VPS nie doppelt läuft.

import { enrichEntry, llmConfigured } from './enrich.mjs'
import { huntLogo } from './logos.mjs'
import { isActive } from './routes.mjs'
import { isNearLocation } from '../shared/near.mjs'

const PAUSE_MS = 4000

export class Background {
  constructor(store) {
    this.store = store
    this.queue = []
    this.running = false
    this.done = new Set()
  }

  enqueue(id) {
    if (this.queue.includes(id)) return
    this.queue.push(id)
    void this.run()
  }

  // Nachholen: alles, was unter Signed up oder Sign up sichtbar ist, einen
  // Link hat und noch nie gelesen wurde.
  backfill() {
    const today = new Date().toISOString().slice(0, 10)
    for (const e of this.store.entries.values()) {
      if (e.kind !== 'hackathon' || !e.link || e.enriched || e.archived) continue
      const visible = isActive(e) || (e.tracker?.status === 'offen' && !e.tracker.missingSince && (!e.deadline || e.deadline >= today) && isNearLocation(e.location))
      if (visible) this.enqueue(e.id)
    }
    console.log(JSON.stringify({ event: 'backfill_queued', count: this.queue.length }))
  }

  async run() {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        const id = this.queue.shift()
        try {
          const e = this.store.get(id)
          if (!e.link) continue
          if (llmConfigured() && !e.enriched) {
            const { page } = await enrichEntry(this.store, id)
            await huntLogo(this.store, id, page).catch(() => null)
          } else {
            await huntLogo(this.store, id).catch(() => null)
          }
        } catch (err) {
          console.error(JSON.stringify({ event: 'background_failed', id, message: err.message }))
          // Nicht ewig wiederholen: als gelesen markieren, mit Fehler.
          await this.store
            .mutate(id, undefined, (draft) => {
              draft.enriched = { at: new Date().toISOString(), source: null, changed: 0, error: err.message }
            })
            .catch(() => null)
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS))
      }
    } finally {
      this.running = false
    }
  }
}
