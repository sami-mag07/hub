// Kleine HTTP-Helfer ohne Framework: Body lesen mit Limit, JSON senden, ein
// Fehlerformat (code, message, details), Client-IP hinter dem Proxy,
// Origin-Prüfung gegen CSRF und ein Zähler je IP für Limits.

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const bad = (message, details) => new HttpError(400, 'bad_request', message, details)

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(body)
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    const data = { code: err.code, message: err.message }
    if (err.details !== undefined) Object.assign(data, err.details)
    const headers = err.details?.retryAfter ? { 'Retry-After': String(err.details.retryAfter) } : {}
    return sendJson(res, err.status, data, headers)
  }
  console.error(JSON.stringify({ event: 'unhandled_error', message: err?.message, stack: err?.stack }))
  return sendJson(res, 500, { code: 'internal', message: 'Server error' })
}

export function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > limit) {
      // Zu groß laut Ankündigung: Rest verwerfen, damit die Antwort noch
      // durch dieselbe Verbindung kommt, statt sie zu kappen.
      req.resume()
      reject(new HttpError(413, 'too_large', `Body larger than ${limit} bytes`))
      return
    }
    const chunks = []
    let size = 0
    let failed = false
    req.on('data', (c) => {
      size += c.length
      if (failed) {
        if (size > limit * 2 + 65536) req.destroy()
        return
      }
      if (size > limit) {
        failed = true
        chunks.length = 0
        reject(new HttpError(413, 'too_large', `Body larger than ${limit} bytes`))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => !failed && resolve(Buffer.concat(chunks)))
    req.on('error', (e) => !failed && reject(e))
  })
}

export async function readJson(req, limit = 256 * 1024) {
  const type = String(req.headers['content-type'] || '')
  if (!type.startsWith('application/json')) throw new HttpError(415, 'unsupported', 'Content-Type must be application/json')
  const raw = await readRaw(req, limit)
  if (!raw.length) return {}
  try {
    const data = JSON.parse(raw.toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data
  } catch {
    throw bad('Invalid JSON')
  }
}

export function clientIp(req) {
  // Nur hinter dem eigenen Proxy (Caddy, Port auf 127.0.0.1 gebunden) ist der
  // letzte Eintrag echt. Direkt erreichbar kann jeder den Header setzen.
  if (process.env.VERTRAUE_PROXY === '1') {
    const chain = req.headers['x-forwarded-for']
    if (typeof chain === 'string' && chain.trim()) {
      const parts = chain.split(',')
      return parts[parts.length - 1].trim()
    }
  }
  return req.socket?.remoteAddress || 'unknown'
}

export function isHttps(req) {
  if (process.env.VERTRAUE_PROXY === '1') return req.headers['x-forwarded-proto'] === 'https'
  return !!req.socket?.encrypted
}

// CSRF: Cookie-Auth plus JSON-API heißt, jede schreibende Anfrage muss vom
// eigenen Ursprung kommen. Ohne Origin und ohne Referer wird abgelehnt.
export function sameOrigin(req) {
  const host = String(req.headers.host || '')
  if (!host) return false
  let origin = req.headers.origin
  if (!origin && req.headers.referer) {
    try {
      origin = new URL(req.headers.referer).origin
    } catch {
      return false
    }
  }
  if (!origin) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie
  if (!raw) return out
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

// Zähler je Schlüssel in einem gleitenden Fenster. Klein und im Speicher,
// mehr braucht ein Server für zwei Nutzer nicht.
export class Window {
  constructor(limit, ms) {
    this.limit = limit
    this.ms = ms
    this.map = new Map()
  }
  hit(key, now = Date.now()) {
    const list = (this.map.get(key) || []).filter((t) => now - t < this.ms)
    list.push(now)
    this.map.set(key, list)
    if (this.map.size > 2000) {
      for (const [k, v] of this.map) if (!v.some((t) => now - t < this.ms)) this.map.delete(k)
    }
    return list.length > this.limit
  }
  count(key, now = Date.now()) {
    return (this.map.get(key) || []).filter((t) => now - t < this.ms).length
  }
  clear(key) {
    this.map.delete(key)
  }
}

export const ID_RE = /^[A-Za-z0-9_-]{6,32}$/
export function assertId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id) || id === '__proto__' || id === 'constructor' || id === 'prototype') {
    throw bad('Invalid id')
  }
  return id
}

export function text(value, max, { required = false, name = 'field' } = {}) {
  if (value === undefined || value === null) {
    if (required) throw bad(`${name} is required`)
    return ''
  }
  if (typeof value !== 'string') throw bad(`${name} must be text`)
  const t = value.replace(/\r\n?/g, '\n').trim()
  if (required && !t) throw bad(`${name} is required`)
  if (t.length > max) throw bad(`${name} is longer than ${max} characters`)
  return t
}

export function url(value, { required = false, name = 'url' } = {}) {
  const t = text(value, 2048, { required, name })
  if (!t) return ''
  if (!/^https?:\/\/\S+$/i.test(t)) throw bad(`${name} must start with http:// or https://`)
  return t
}

export function isoDate(value, { name = 'date' } = {}) {
  const t = text(value, 10, { name })
  if (!t) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) throw bad(`${name} must be YYYY-MM-DD`)
  return t
}

export function oneOf(value, allowed, { name = 'value', fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback
  if (!allowed.includes(value)) throw bad(`${name} must be one of ${allowed.join(', ')}`)
  return value
}
