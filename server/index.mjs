// Produktions-Server: liefert dist/ aus und beantwortet /api. Keine
// Laufzeit-Pakete, node:http reicht.
//
//   npm run build && npm run server

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotEnv } from './env.mjs'
import { Auth } from './auth.mjs'
import { Store } from './store.mjs'
import { Tracker } from './tracker.mjs'
import { createRouter } from './routes.mjs'

loadDotEnv()

const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(here, '..', 'dist')
const DATA = path.resolve(process.env.HUB_DATA_DIR || path.join(here, '..', 'data'))
const PORT = Number(process.env.PORT) || 8340

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://www.google.com https://*.gstatic.com https://icons.duckduckgo.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', CSP)
}

function sendFile(res, file) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
  const cache = file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache })
  fs.createReadStream(file).pipe(res)
}

export async function createServer() {
  const store = new Store(DATA)
  const auth = new Auth(DATA)
  const tracker = new Tracker(store)
  await store.load()
  await auth.load()
  const api = createRouter({ auth, store, tracker })

  const server = http.createServer(async (req, res) => {
    securityHeaders(res)
    if (await api(req, res)) return

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    let p
    try {
      p = decodeURIComponent((req.url || '/').split('?')[0])
    } catch {
      res.writeHead(400).end()
      return
    }
    const target = path.join(DIST, p)
    if (target !== DIST && !target.startsWith(DIST + path.sep)) {
      res.writeHead(403).end()
      return
    }
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return sendFile(res, target)
    const index = path.join(DIST, 'index.html')
    if (fs.existsSync(index)) return sendFile(res, index)
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('No build found. Run npm run build first.')
  })

  return { server, store, auth, tracker }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, tracker } = await createServer()
  server.listen(PORT, '127.0.0.1', () => {
    console.log(JSON.stringify({ event: 'listening', port: PORT, data: DATA }))
    if (!process.env.HUB_PASSWORD) console.warn('HUB_PASSWORD is empty: nobody can log in.')
    if (!process.env.HUB_TOKEN || !process.env.EMIL_EXPORT_URL) console.warn('HUB_TOKEN or EMIL_EXPORT_URL missing: tracker sync is off.')
    if (!process.env.TAVILY_API_KEY) console.warn('TAVILY_API_KEY missing: news and search are off.')
    void tracker.start()
  })
}
