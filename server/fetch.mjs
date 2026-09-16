// Fremde Seiten holen, ohne dass der Server zum Sprungbrett wird: nur http(s),
// keine privaten oder lokalen Adressen (auch nicht nach Redirect oder über
// DNS), harte Limits für Größe und Zeit, nur erwartete Inhaltstypen.

import dns from 'node:dns/promises'
import net from 'node:net'
import { HttpError } from './http.mjs'

const MAX_REDIRECTS = 3

function privateV4(ip) {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

function privateV6(ip) {
  const s = ip.toLowerCase()
  if (s === '::' || s === '::1') return true
  if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return m ? privateV4(m[1]) : false
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return privateV4(ip)
  if (net.isIPv6(ip)) return privateV6(ip)
  return true
}

export async function assertPublic(urlStr) {
  let u
  try {
    u = new URL(urlStr)
  } catch {
    throw new HttpError(400, 'bad_url', 'Invalid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'bad_url', 'Only http and https')
  if (u.username || u.password) throw new HttpError(400, 'bad_url', 'Credentials in URL are not allowed')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new HttpError(400, 'bad_url', 'Local hosts are not allowed')
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new HttpError(400, 'bad_url', 'Private addresses are not allowed')
    return u
  }
  let addrs
  try {
    addrs = await dns.lookup(host, { all: true })
  } catch {
    throw new HttpError(400, 'bad_url', 'Host not found')
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new HttpError(400, 'bad_url', 'Private addresses are not allowed')
  return u
}

// Holt eine Ressource mit Größen- und Zeitlimit. accept: Funktion über den
// Content-Type. Gibt {url, type, body: Buffer} zurück.
export async function fetchSafe(urlStr, { maxBytes = 1024 * 1024, timeoutMs = 10_000, accept = () => true } = {}) {
  let url = String(urlStr)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublic(url)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    let res
    try {
      res = await fetch(u, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'TheHub/1.0 (+hackathon portal)', Accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5' },
      })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), u).toString()
        continue
      }
      if (!res.ok) throw new HttpError(502, 'fetch_failed', `Site answered ${res.status}`)
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!accept(type)) throw new HttpError(415, 'fetch_failed', `Unexpected content type ${type || 'unknown'}`)
      const declared = Number(res.headers.get('content-length') || 0)
      if (declared > maxBytes) throw new HttpError(413, 'fetch_failed', 'Resource too large')
      const chunks = []
      let size = 0
      for await (const chunk of res.body) {
        size += chunk.length
        if (size > maxBytes) {
          ctrl.abort()
          throw new HttpError(413, 'fetch_failed', 'Resource too large')
        }
        chunks.push(chunk)
      }
      return { url: u.toString(), type, body: Buffer.concat(chunks) }
    } catch (err) {
      if (err instanceof HttpError) throw err
      throw new HttpError(502, 'fetch_failed', err.name === 'AbortError' ? 'Site timed out' : 'Site not reachable')
    } finally {
      clearTimeout(t)
    }
  }
  throw new HttpError(502, 'fetch_failed', 'Too many redirects')
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

// HTML zu Text plus die Metadaten, die wir brauchen (Titel, Icons).
export function parseHtml(html, baseUrl) {
  const head = html.slice(0, 200_000)
  const title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim())
  const icons = []
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1] || '').toLowerCase()
    const href = tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i)?.[1]
    if (!href) continue
    if (/apple-touch-icon/.test(rel)) icons.push({ href, size: 180, kind: 'apple' })
    else if (/\bicon\b/.test(rel)) {
      const sizes = tag.match(/\bsizes\s*=\s*["']?(\d+)x/i)
      icons.push({ href, size: sizes ? Number(sizes[1]) : 16, kind: 'icon' })
    }
  }
  const resolve = (href) => {
    try {
      return new URL(decode(href), baseUrl).toString()
    } catch {
      return null
    }
  }
  const text = decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article|header|footer)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return {
    title,
    text,
    icons: icons
      .map((i) => ({ ...i, url: resolve(i.href) }))
      .filter((i) => i.url && /^https?:/.test(i.url))
      .sort((a, b) => b.size - a.size),
  }
}
