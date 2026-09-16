// Logo-Upload: Typ nur aus den ersten Bytes, nie aus dem Dateinamen oder dem
// Content-Type des Clients. SVG ist ausführbar und wird deshalb gefiltert
// und mit eigener CSP ausgeliefert.

import fsp from 'node:fs/promises'
import { HttpError, bad } from './http.mjs'
import { fetchSafe } from './fetch.mjs'
import { readSite } from './enrich.mjs'

export const MAX_LOGO = 1024 * 1024

const TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export function sniff(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  const head = buf.subarray(0, 512).toString('utf8')
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg'
  return null
}

export function svgSafe(buf) {
  const s = buf.toString('utf8')
  return !/<script|on[a-z]+\s*=|<foreignObject|javascript:|<iframe|<embed|<object|<use[^>]+href\s*=\s*["']?\s*(https?:)?\/\//i.test(s)
}

export async function saveLogo(store, id, buf) {
  if (!buf.length) throw bad('Empty file')
  if (buf.length > MAX_LOGO) throw new HttpError(413, 'too_large', 'Logo must be 1 MB or smaller')
  const ext = sniff(buf)
  if (!ext) throw bad('Only PNG, JPEG, WebP or SVG')
  if (ext === 'svg' && !svgSafe(buf)) throw bad('SVG contains scripts or external references')
  for (const other of Object.keys(TYPES)) if (other !== ext) await fsp.rm(store.logoFile(id, other), { force: true })
  await fsp.writeFile(store.logoFile(id, ext), buf)
  return `${id}.${ext}`
}

// Sucht ein echtes Logo auf der Webseite des Eintrags: apple-touch-icon
// (180px) vor großen Icons vor dem Standardpfad. Ein Upload von Hand bleibt
// immer stehen. Gibt den Dateinamen zurück oder null.
export async function huntLogo(store, id, page) {
  const e = store.get(id)
  if (e.logo.kind === 'upload' || !e.link) return null
  const site = page || (await readSite(e.link).catch(() => null))
  let origin
  try {
    origin = new URL(e.link).origin
  } catch {
    return null
  }
  const candidates = [
    ...(site?.icons || []).filter((i) => i.size >= 64).map((i) => i.url),
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
  ]
  const seen = new Set()
  for (const url of candidates) {
    if (seen.has(url)) continue
    seen.add(url)
    try {
      const img = await fetchSafe(url, { maxBytes: MAX_LOGO, timeoutMs: 8000, accept: (t) => t.startsWith('image/') || t === 'application/octet-stream' })
      const ext = sniff(img.body)
      if (!ext || (ext === 'svg' && !svgSafe(img.body))) continue
      if (img.body.length < 400) continue
      const file = await saveLogo(store, id, img.body)
      await store.mutate(id, undefined, (draft) => {
        if (draft.logo.kind === 'upload') return false
        draft.logo = { kind: 'auto', file }
      })
      console.log(JSON.stringify({ event: 'logo_found', id, url }))
      return file
    } catch {
      continue
    }
  }
  return null
}

export async function serveLogo(store, res, e) {
  if ((e.logo.kind !== 'upload' && e.logo.kind !== 'auto') || !e.logo.file) throw new HttpError(404, 'not_found', 'No logo')
  const ext = e.logo.file.split('.').pop()
  const type = TYPES[ext]
  if (!type) throw new HttpError(404, 'not_found', 'No logo')
  const file = store.logoFile(e.id, ext)
  let buf
  try {
    buf = await fsp.readFile(file)
  } catch {
    throw new HttpError(404, 'not_found', 'No logo')
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Content-Disposition': 'inline',
  })
  res.end(buf)
}
