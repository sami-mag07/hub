// Logo-Upload: Typ nur aus den ersten Bytes, nie aus dem Dateinamen oder dem
// Content-Type des Clients. SVG ist ausführbar und wird deshalb gefiltert
// und mit eigener CSP ausgeliefert.

import fsp from 'node:fs/promises'
import { HttpError, bad } from './http.mjs'

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

export async function serveLogo(store, res, e) {
  if (e.logo.kind !== 'upload' || !e.logo.file) throw new HttpError(404, 'not_found', 'No logo')
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
