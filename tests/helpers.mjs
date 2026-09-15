import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { Auth } from '../server/auth.mjs'
import { Store } from '../server/store.mjs'
import { Tracker } from '../server/tracker.mjs'
import { createRouter } from '../server/routes.mjs'

export async function tmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'hub-test-'))
}

// Echter HTTP-Server auf einem freien Port, echte Ablage in einem Temp-Ordner.
export async function testServer({ password = 'secret' } = {}) {
  process.env.HUB_PASSWORD = password
  process.env.VERTRAUE_PROXY = '0'
  delete process.env.EMIL_EXPORT_URL
  delete process.env.HUB_TOKEN
  const dir = await tmpDir()
  const store = new Store(dir)
  const auth = new Auth(dir)
  const tracker = new Tracker(store)
  await store.load()
  await auth.load()
  const api = createRouter({ auth, store, tracker })
  const server = http.createServer(async (req, res) => {
    if (await api(req, res)) return
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const client = makeClient(base)
  return {
    base,
    store,
    auth,
    tracker,
    client,
    close: async () => {
      await new Promise((r) => server.close(r))
      await fsp.rm(dir, { recursive: true, force: true })
    },
  }
}

function makeClient(base) {
  let cookie = ''
  const call = async (method, path, body, opts = {}) => {
    const headers = { ...(opts.headers || {}) }
    if (cookie && !opts.noCookie) headers.Cookie = cookie
    if (body !== undefined && !(body instanceof Uint8Array)) headers['Content-Type'] = 'application/json'
    if (method !== 'GET' && !opts.noOrigin && !headers.Origin) headers.Origin = base
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { status: res.status, data, headers: res.headers, setCookie: set }
  }
  return {
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b ?? {}, o),
    login: async (pw = 'secret', name = 'Sami') => {
      await call('POST', '/api/login', { password: pw })
      await call('POST', '/api/session/name', { name })
    },
    reset: () => (cookie = ''),
  }
}
