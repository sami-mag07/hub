// Die Blase liest ihre eigene Webseite: Seite holen, in Text verwandeln,
// Claude (über die claude-code-api auf dem VPS, OpenAI-kompatibel) zieht
// Übersicht, Tracks, Preise, Fenster, Kosten und Links als JSON heraus. Es
// werden nur leere Felder gefüllt; was Menschen geschrieben haben, bleibt.

import { HttpError, Window } from './http.mjs'
import { fetchSafe, parseHtml } from './fetch.mjs'
import { newId, now } from './store.mjs'

const perEntry = new Window(1, 10 * 60 * 1000)
const global = new Window(20, 60 * 60 * 1000)
const LLM_TIMEOUT_MS = 180_000
const MAX_TEXT = 40_000

export function checkEnrichLimit(entryId) {
  if (perEntry.count(entryId) >= 1) throw new HttpError(429, 'rate_limited', 'Read a moment ago. Try again in 10 minutes.', { retryAfter: 600 })
  if (global.count('all') >= 20) throw new HttpError(429, 'rate_limited', 'Reading limit for this hour reached.', { retryAfter: 1800 })
  perEntry.hit(entryId)
  global.hit('all')
}

export const llmConfigured = () => !!(process.env.CLAUDE_API_URL && process.env.CLAUDE_API_TOKEN)

const SYSTEM = `You extract facts about a hackathon or tech event from a web page for a small team's planning board.
Answer with ONE JSON object and nothing else, no code fences, no commentary. Schema:
{
  "description": string,           // 2 to 4 plain sentences: what it is, who runs it, format (on site / online / hybrid), team size, what gets built. Empty string if unknown.
  "tracks": [{"name": string, "description": string}],   // challenge tracks, themes or categories. Empty array if the page names none.
  "prizes": string,                // prizes and awards as short lines, empty if unknown
  "windows": string,               // registration / application windows, deadlines, event dates and schedule as short lines with dates, empty if unknown
  "cost": string,                  // participation cost, travel support, empty if unknown
  "links": [{"label": string, "url": string, "type": "registration" | "other"}]   // at most 5 important links: registration/application, rules, schedule, Discord/Slack. Only absolute http(s) URLs that appear on the page.
}
Rules: write in English. Do not invent anything; leave fields empty when the page does not say. Keep every string under 600 characters. Dates as they appear on the page.`

const MIN_TEXT = 200

// Seite holen und in Text verwandeln. Reine JavaScript-Seiten (Luma, Google
// RSVP) liefern kaum HTML-Text; dann rendert der Jina-Reader die Seite und
// gibt Text zurück. Die Zieladresse ist vorher schon gegen privates Netz
// geprüft, Jina bekommt nur öffentliche Adressen.
export async function readSite(url) {
  const page = await fetchSafe(url, {
    maxBytes: 3 * 1024 * 1024,
    timeoutMs: 15_000,
    accept: (t) => t.startsWith('text/html') || t === 'application/xhtml+xml',
  })
  const parsed = parseHtml(page.body.toString('utf8'), page.url)
  if (parsed.text.length >= MIN_TEXT) return parsed
  try {
    const rendered = await fetchSafe(`https://r.jina.ai/${page.url}`, {
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 40_000,
      accept: (t) => t.startsWith('text/plain') || t.startsWith('text/markdown'),
    })
    const text = rendered.body.toString('utf8').replace(/\r/g, '').trim()
    if (text.length >= MIN_TEXT) {
      console.log(JSON.stringify({ event: 'read_via_jina', url: page.url, chars: text.length }))
      return { ...parsed, text, rendered: true }
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'jina_failed', url: page.url, message: err.message }))
  }
  return parsed
}

export async function extract(entry, page) {
  if (!llmConfigured()) throw new HttpError(503, 'llm_unconfigured', 'Reading is not configured on the server')
  const base = process.env.CLAUDE_API_URL.replace(/\/+$/, '')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS)
  const user = `Event name: ${entry.name}\nKnown dates: ${entry.dates.text || 'unknown'}\nKnown place: ${entry.location || 'unknown'}\nPage title: ${page.title}\nPage URL: ${entry.link}\n\nPAGE TEXT:\n${page.text.slice(0, MAX_TEXT)}`
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CLAUDE_API_TOKEN}` },
      body: JSON.stringify({
        model: process.env.CLAUDE_API_MODEL || 'sonnet',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        stream: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new HttpError(502, 'llm_error', `Reader answered ${res.status}`)
    const data = await res.json()
    const raw = String(data?.choices?.[0]?.message?.content || '')
    return parseJson(raw)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, 'llm_error', err.name === 'AbortError' ? 'Reader timed out' : 'Reader failed')
  } finally {
    clearTimeout(t)
  }
}

export function parseJson(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) throw new HttpError(502, 'llm_error', 'Reader gave no JSON')
  try {
    const d = JSON.parse(cleaned.slice(start, end + 1))
    return d && typeof d === 'object' ? d : {}
  } catch {
    throw new HttpError(502, 'llm_error', 'Reader gave broken JSON')
  }
}

const str = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Füllt nur Leeres. Gibt zurück, was sich geändert hat.
export function applyEnrichment(draft, data, source) {
  const changed = []
  for (const key of ['description', 'prizes', 'windows', 'cost']) {
    const v = str(data[key])
    if (v && !draft.info[key]) {
      draft.info[key] = v
      changed.push(key)
    }
  }
  draft.tracks ??= []
  const have = new Set(draft.tracks.map((t) => t.name.toLowerCase()))
  for (const t of Array.isArray(data.tracks) ? data.tracks.slice(0, 20) : []) {
    const name = str(t?.name, 120)
    if (!name || have.has(name.toLowerCase())) continue
    have.add(name.toLowerCase())
    draft.tracks.push({ id: newId(), name, description: str(t?.description, 1000), notes: '', updatedAt: now() })
    changed.push(`track:${name}`)
  }
  const urls = new Set([draft.link, ...draft.links.map((l) => l.url)])
  for (const l of Array.isArray(data.links) ? data.links.slice(0, 5) : []) {
    const url = str(l?.url, 2048)
    const label = str(l?.label, 80) || 'Link'
    if (!/^https?:\/\/\S+$/i.test(url) || urls.has(url) || draft.links.length >= 30) continue
    urls.add(url)
    draft.links.push({ id: newId(), label, url, type: l?.type === 'registration' ? 'registration' : 'other' })
    changed.push(`link:${label}`)
  }
  draft.enriched = { at: now(), source, changed: changed.length }
  return changed
}

// url: optional eine andere Seite als der Eintrags-Link (z.B. die Agenda
// statt des Anmeldeformulars).
export async function enrichEntry(store, id, url) {
  const entry = store.get(id)
  const target = url || entry.link
  if (!target) throw new HttpError(400, 'no_link', 'This entry has no website')
  const page = await readSite(target)
  if (page.text.length < MIN_TEXT) throw new HttpError(502, 'fetch_failed', 'The page has almost no readable text')
  const data = await extract(entry, page)
  let changed = []
  const e = await store.mutate(id, undefined, (draft) => {
    changed = applyEnrichment(draft, data, page.url)
  })
  console.log(JSON.stringify({ event: 'enriched', id, changed: changed.length }))
  return { entry: e, changed, page }
}
