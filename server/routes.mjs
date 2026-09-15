// Alle /api-Routen. Reihenfolge je Anfrage: Rate-Limit, Origin-Prüfung bei
// allem außer GET, Session, dann der Handler.

import { HttpError, Window, bad, clientIp, isoDate, oneOf, readJson, readRaw, sameOrigin, sendError, sendJson, text, url } from './http.mjs'
import { LIMITS, emptyEntry, newId, now } from './store.mjs'
import { OPS, applyOp } from './ops.mjs'
import { MAX_LOGO, saveLogo, serveLogo } from './logos.mjs'
import { checkNewsLimit, checkSearchLimit, newsFor, tavily } from './news.mjs'

const general = new Window(120, 60 * 1000)

function partnerFields(body, current = {}) {
  return {
    name: body.name !== undefined ? text(body.name, 120, { required: true, name: 'name' }) : current.name,
    company: body.company !== undefined ? text(body.company, 120, { name: 'company' }) : (current.company ?? ''),
    role: body.role !== undefined ? text(body.role, 120, { name: 'role' }) : (current.role ?? ''),
    type: body.type !== undefined ? oneOf(body.type, ['sponsor', 'mentor', 'partner'], { name: 'type' }) : (current.type ?? 'mentor'),
    linkedin: body.linkedin !== undefined ? url(body.linkedin, { name: 'linkedin' }) : (current.linkedin ?? ''),
    entryId: body.entryId !== undefined ? (body.entryId ? text(body.entryId, 32, { name: 'entryId' }) : null) : (current.entryId ?? null),
    status: body.status !== undefined ? oneOf(body.status, ['open', 'contacted', 'replied'], { name: 'status' }) : (current.status ?? 'open'),
    note: body.note !== undefined ? text(body.note, 2000, { name: 'note' }) : (current.note ?? ''),
  }
}

export function createRouter({ auth, store, tracker }) {
  const routes = []
  const on = (method, pattern, handler, { open = false } = {}) => routes.push({ method, pattern, handler, open })

  // Session
  on('POST', /^\/api\/login$/, async (req, res) => {
    const body = await readJson(req)
    const id = await auth.login(req, body.password)
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(req, id) })
  }, { open: true })
  on('GET', /^\/api\/session$/, async (req, res) => {
    const { session } = auth.require(req)
    sendJson(res, 200, { name: session.name })
  }, { open: true })
  on('POST', /^\/api\/session\/name$/, async (req, res) => {
    const body = await readJson(req)
    const s = await auth.setName(req, body.name)
    sendJson(res, 200, { name: s.name })
  }, { open: true })
  on('POST', /^\/api\/logout$/, async (req, res) => {
    await auth.logout(req)
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(req, '', true) })
  }, { open: true })

  // Einträge
  on('GET', /^\/api\/entries$/, async (_req, res) => sendJson(res, 200, store.list()))
  on('POST', /^\/api\/entries$/, async (req, res, user) => {
    const body = await readJson(req)
    if (body.kind !== 'project') throw bad('Only projects can be created here. Hackathons come from the tracker.')
    const e = emptyEntry({
      id: newId(),
      kind: 'project',
      name: text(body.name, 160, { required: true, name: 'name' }),
      link: url(body.link, { name: 'link' }),
      createdBy: user,
    })
    sendJson(res, 201, await store.create(e))
  })
  on('GET', /^\/api\/entries\/([A-Za-z0-9_-]{6,32})$/, async (req, res, _user, [id]) => {
    const e = store.get(id)
    const since = Number(new URL(req.url, 'http://x').searchParams.get('since') || 0)
    if (since && since === e.version) {
      res.writeHead(304).end()
      return
    }
    sendJson(res, 200, e)
  })
  on('POST', /^\/api\/entries\/([A-Za-z0-9_-]{6,32})\/logo$/, async (req, res, _user, [id]) => {
    store.get(id)
    const buf = await readRaw(req, MAX_LOGO)
    const file = await saveLogo(store, id, buf)
    const e = await store.mutate(id, undefined, (draft) => {
      draft.logo = { kind: 'upload', file }
    })
    sendJson(res, 200, e)
  })
  on('GET', /^\/api\/logos\/([A-Za-z0-9_-]{6,32})$/, async (_req, res, _user, [id]) => serveLogo(store, res, store.get(id)))
  on('POST', /^\/api\/entries\/([A-Za-z0-9_-]{6,32})\/signup$/, async (req, res, _user, [id]) => {
    const body = await readJson(req)
    const status = body.status === 'offen' ? 'offen' : 'beworben'
    sendJson(res, 200, await tracker.setStatus(id, status))
  })
  on('POST', /^\/api\/entries\/([A-Za-z0-9_-]{6,32})\/news\/refresh$/, async (req, res, _user, [id]) => {
    await readJson(req)
    const e = store.get(id)
    checkNewsLimit(id)
    const { query, items } = await newsFor(e)
    sendJson(
      res,
      200,
      await store.mutate(id, undefined, (draft) => {
        draft.news = { fetchedAt: now(), query, items: items.slice(0, LIMITS.news) }
      }),
    )
  })
  on('POST', /^\/api\/entries\/([A-Za-z0-9_-]{6,32})\/([a-z]+(?:\/[a-z]+)?)$/, async (req, res, user, [id, op]) => {
    if (!OPS.includes(op)) throw new HttpError(404, 'not_found', `Unknown operation ${op}`)
    const body = await readJson(req)
    const version = body.version === undefined ? undefined : Number(body.version)
    if (version !== undefined && !Number.isInteger(version)) throw bad('version must be an integer')
    sendJson(res, 200, await store.mutate(id, version, (draft) => applyOp(draft, op, body, user)))
  })

  // Tracker
  on('GET', /^\/api\/tracker$/, async (_req, res) => sendJson(res, 200, tracker.state))
  on('POST', /^\/api\/tracker\/sync$/, async (_req, res) => sendJson(res, 200, await tracker.sync()))
  on('POST', /^\/api\/tracker\/add$/, async (req, res) => {
    const body = await readJson(req)
    const fields = {
      name: text(body.name, 160, { required: true, name: 'name' }),
      link: url(body.link, { name: 'link' }),
      ort: text(body.ort, 160, { name: 'ort' }),
      datum: text(body.datum, 120, { name: 'datum' }),
      frist: isoDate(body.frist, { name: 'frist' }),
    }
    sendJson(res, 200, await tracker.addHackathon(fields))
  })
  on('POST', /^\/api\/search\/hackathons$/, async (req, res) => {
    const body = await readJson(req)
    const q = text(body.query, 200, { required: true, name: 'query' })
    checkSearchLimit(clientIp(req))
    const items = await tavily(`${q} hackathon`, { topic: 'general', max: 10 })
    sendJson(res, 200, { items })
  })

  // Partner
  on('GET', /^\/api\/partners$/, async (_req, res) => sendJson(res, 200, store.partners))
  on('POST', /^\/api\/partners\/add$/, async (req, res) => {
    const body = await readJson(req)
    if (store.partners.length >= LIMITS.partners) throw bad(`At most ${LIMITS.partners} people`)
    const list = [...store.partners, { id: newId(), ...partnerFields(body), updatedAt: now() }]
    sendJson(res, 200, await store.savePartners(list))
  })
  on('POST', /^\/api\/partners\/update$/, async (req, res) => {
    const body = await readJson(req)
    const i = store.partners.findIndex((p) => p.id === body.id)
    if (i < 0) throw new HttpError(404, 'not_found', 'Not found')
    const list = [...store.partners]
    list[i] = { ...list[i], ...partnerFields(body, list[i]), updatedAt: now() }
    sendJson(res, 200, await store.savePartners(list))
  })
  on('POST', /^\/api\/partners\/remove$/, async (req, res) => {
    const body = await readJson(req)
    sendJson(res, 200, await store.savePartners(store.partners.filter((p) => p.id !== body.id)))
  })

  return async function handle(req, res) {
    const path = (req.url || '/').split('?')[0]
    if (!path.startsWith('/api/')) return false
    try {
      if (general.hit(clientIp(req))) throw new HttpError(429, 'rate_limited', 'Too many requests', { retryAfter: 60 })
      const method = req.method === 'HEAD' ? 'GET' : req.method
      for (const r of routes) {
        if (r.method !== method) continue
        const m = path.match(r.pattern)
        if (!m) continue
        if (method !== 'GET' && !sameOrigin(req)) throw new HttpError(403, 'forbidden', 'Cross-site request blocked')
        let user = ''
        if (!r.open) {
          const { session } = auth.require(req)
          user = session.name || 'someone'
        }
        await r.handler(req, res, user, m.slice(1))
        return true
      }
      throw new HttpError(404, 'not_found', 'No such route')
    } catch (err) {
      if (!res.headersSent) sendError(res, err)
      return true
    }
  }
}
