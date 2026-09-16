// Fremde Seiten holen, ohne dass der Server zum Sprungbrett wird: nur http(s),
// keine privaten oder lokalen Adressen (auch nicht nach Redirect oder über
// DNS), harte Limits für Größe und Zeit, nur erwartete Inhaltstypen.

import dns from 'node:dns/promises'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
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
    return { url: u, address: host, family: net.isIPv6(host) ? 6 : 4 }
  }
  let addrs
  try {
    addrs = await dns.lookup(host, { all: true })
  } catch {
    throw new HttpError(400, 'bad_url', 'Host not found')
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new HttpError(400, 'bad_url', 'Private addresses are not allowed')
  // Genau diese Adresse wird nachher angesprochen (siehe requestPinned),
  // damit ein zweiter DNS-Blick nicht plötzlich ins private Netz zeigt.
  // IPv4 zuerst: der VPS hat keine verlässliche IPv6-Route.
  const pick = addrs.find((a) => a.family === 4) || addrs[0]
  return { url: u, address: pick.address, family: pick.family }
}

// Eine Anfrage an die vorher geprüfte Adresse: der lookup-Hook liefert die
// gepinnte IP, TLS bekommt den echten Hostnamen (SNI), der Host-Header auch.
function requestPinned({ url: u, address, family }, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        servername: net.isIP(u.hostname) ? undefined : u.hostname,
        // Node ruft lookup je nach Verbindungsart mit {all: true} (Liste)
        // oder ohne (einzelne Adresse) auf; beide Formen bedienen.
        lookup: (_host, opts, cb) => (opts?.all ? cb(null, [{ address, family }]) : cb(null, address, family)),
        headers: {
          'User-Agent': 'TheHub/1.0 (+hackathon portal)',
          Accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'identity',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const declared = Number(res.headers['content-length'] || 0)
        if (declared > maxBytes) {
          res.destroy()
          reject(new HttpError(413, 'fetch_failed', 'Resource too large'))
          return
        }
        const chunks = []
        let size = 0
        res.on('data', (c) => {
          size += c.length
          if (size > maxBytes) {
            res.destroy()
            reject(new HttpError(413, 'fetch_failed', 'Resource too large'))
            return
          }
          chunks.push(c)
        })
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { name: 'AbortError' })))
    req.on('error', reject)
    req.end()
  })
}

// Holt eine Ressource mit Größen- und Zeitlimit. accept: Funktion über den
// Content-Type. Gibt {url, type, body: Buffer} zurück.
export async function fetchSafe(urlStr, { maxBytes = 1024 * 1024, timeoutMs = 10_000, accept = () => true } = {}) {
  let url = String(urlStr)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await assertPublic(url)
    let res
    try {
      res = await requestPinned(target, { timeoutMs, maxBytes })
    } catch (err) {
      if (err instanceof HttpError) throw err
      throw new HttpError(502, 'fetch_failed', err.name === 'AbortError' ? 'Site timed out' : `Site not reachable${err.code ? ` (${err.code})` : ''}`)
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, target.url).toString()
      continue
    }
    if (res.status < 200 || res.status >= 300) throw new HttpError(502, 'fetch_failed', `Site answered ${res.status}`)
    const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (!accept(type)) throw new HttpError(415, 'fetch_failed', `Unexpected content type ${type || 'unknown'}`)
    return { url: target.url.toString(), type, body: res.body }
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
