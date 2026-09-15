// Ein gemeinsames Passwort aus der .env, danach eine Session mit Namen.
// Sessions liegen im Speicher und als JSON auf Platte, damit ein
// Container-Tausch niemanden ausloggt.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { HttpError, Window, clientIp, isHttps, parseCookies, text } from './http.mjs'

const COOKIE = 'hub_session'
const MAX_AGE = 30 * 24 * 3600
const LOGIN_MAX_FAILS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export class Auth {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'sessions.json')
    this.sessions = new Map()
    this.fails = new Window(LOGIN_MAX_FAILS, LOGIN_WINDOW_MS)
    this.saving = Promise.resolve()
  }

  async load() {
    try {
      const raw = JSON.parse(await fsp.readFile(this.file, 'utf8'))
      const now = Date.now()
      for (const [id, s] of Object.entries(raw)) {
        if (s && typeof s === 'object' && Date.parse(s.expires) > now) this.sessions.set(id, s)
      }
    } catch {
      // keine Datei: frischer Start
    }
  }

  save() {
    this.saving = this.saving.then(async () => {
      const out = Object.fromEntries(this.sessions)
      await fsp.mkdir(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      await fsp.writeFile(tmp, JSON.stringify(out), { mode: 0o600 })
      await fsp.rename(tmp, this.file)
    }).catch((e) => console.error(JSON.stringify({ event: 'sessions_save_failed', message: e.message })))
    return this.saving
  }

  passwordOk(given) {
    const expected = (process.env.HUB_PASSWORD || '').trim()
    if (!expected || typeof given !== 'string' || !given) return false
    const a = createHash('sha256').update(given).digest()
    const b = createHash('sha256').update(expected).digest()
    return timingSafeEqual(a, b)
  }

  async login(req, given) {
    const ip = clientIp(req)
    if (this.fails.count(ip) >= LOGIN_MAX_FAILS) {
      throw new HttpError(429, 'locked', 'Too many failed attempts. Try again later.', { retryAfter: 900 })
    }
    if (!this.passwordOk(given)) {
      this.fails.hit(ip)
      await new Promise((r) => setTimeout(r, 1500))
      throw new HttpError(401, 'wrong_password', 'Wrong password')
    }
    this.fails.clear(ip)
    const id = randomBytes(32).toString('base64url')
    const session = { name: '', created: new Date().toISOString(), expires: new Date(Date.now() + MAX_AGE * 1000).toISOString() }
    this.sessions.set(id, session)
    await this.save()
    return id
  }

  cookie(req, id, expire = false) {
    const parts = [`${COOKIE}=${expire ? '' : id}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${expire ? 0 : MAX_AGE}`]
    if (isHttps(req)) parts.push('Secure')
    return parts.join('; ')
  }

  // Liefert {id, session} oder null. Abgelaufene fliegen dabei raus.
  current(req) {
    const id = parseCookies(req)[COOKIE]
    if (!id) return null
    const s = this.sessions.get(id)
    if (!s) return null
    if (Date.parse(s.expires) < Date.now()) {
      this.sessions.delete(id)
      void this.save()
      return null
    }
    return { id, session: s }
  }

  require(req) {
    const c = this.current(req)
    if (!c) throw new HttpError(401, 'unauthorized', 'Not signed in')
    return c
  }

  async setName(req, name) {
    const c = this.require(req)
    c.session.name = text(name, 40, { required: true, name: 'name' })
    await this.save()
    return c.session
  }

  async logout(req) {
    const c = this.current(req)
    if (c) {
      this.sessions.delete(c.id)
      await this.save()
    }
  }
}
