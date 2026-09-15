// Websuche über Tavily: News je Eintrag und die Hackathon-Suche unter
// Reach out. Limits, damit der Free-Tier (1000 Credits im Monat) reicht:
// je Eintrag ein Refresh pro zehn Minuten, insgesamt 30 Aufrufe pro Stunde.

import { HttpError, Window } from './http.mjs'

const TIMEOUT_MS = 12_000
const perEntry = new Window(1, 10 * 60 * 1000)
const perIp = new Window(10, 60 * 1000)
const global = new Window(30, 60 * 60 * 1000)

export function checkNewsLimit(entryId) {
  if (perEntry.count(entryId) >= 1) throw new HttpError(429, 'rate_limited', 'Refreshed a moment ago. Try again in 10 minutes.', { retryAfter: 600 })
  if (global.count('all') >= 30) throw new HttpError(429, 'rate_limited', 'Search limit for this hour reached.', { retryAfter: 1800 })
  perEntry.hit(entryId)
  global.hit('all')
}

export function checkSearchLimit(ip) {
  if (global.count('all') >= 30) throw new HttpError(429, 'rate_limited', 'Search limit for this hour reached.', { retryAfter: 1800 })
  if (perIp.hit(ip)) throw new HttpError(429, 'rate_limited', 'Slow down.', { retryAfter: 60 })
  global.hit('all')
}

function normalise(results, max) {
  const out = []
  const seen = new Set()
  for (const r of results || []) {
    const url = String(r.url || '')
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({
      title: String(r.title || url).slice(0, 200),
      url: url.slice(0, 2048),
      date: r.published_date ? String(r.published_date).slice(0, 10) : null,
      snippet: String(r.content || '').replace(/\s+/g, ' ').slice(0, 300),
    })
    if (out.length >= max) break
  }
  return out
}

export async function tavily(query, { topic = 'general', days, max = 8 } = {}) {
  const key = (process.env.TAVILY_API_KEY || '').trim()
  if (!key) throw new HttpError(503, 'search_unconfigured', 'Search is not configured')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query,
        max_results: max,
        topic,
        ...(topic === 'news' && days ? { days } : {}),
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new HttpError(502, 'search_error', `Search answered ${res.status}`)
    const data = await res.json()
    return normalise(data.results, max)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, 'search_error', err.name === 'AbortError' ? 'Search timed out' : 'Search failed')
  } finally {
    clearTimeout(t)
  }
}

export function defaultQuery(e) {
  if (e.kind === 'hackathon') {
    const y = (e.dates.start || e.deadline || new Date().toISOString()).slice(0, 4)
    return `"${e.name}" hackathon ${y}${e.location ? ` ${e.location}` : ''}`
  }
  return `"${e.name}"`
}

export async function newsFor(e) {
  const query = e.news.query || defaultQuery(e)
  let items = await tavily(query, { topic: 'news', days: 90, max: 8 })
  if (items.length < 3) items = await tavily(query, { topic: 'general', max: 8 })
  return { query, items }
}
