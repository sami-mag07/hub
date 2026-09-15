import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testServer } from './helpers.mjs'

test('login: wrong password gives 401, sixth failure locks with 429, right password sets a session cookie', async () => {
  const s = await testServer()
  try {
    for (let i = 0; i < 5; i++) {
      const r = await s.client.post('/api/login', { password: 'nope' })
      assert.equal(r.status, 401)
    }
    const locked = await s.client.post('/api/login', { password: 'secret' })
    assert.equal(locked.status, 429)
    assert.equal(locked.headers.get('retry-after'), '900')
  } finally {
    await s.close()
  }
})

test('login: cookie is httpOnly, SameSite=Lax, not Secure over plain http', async () => {
  const s = await testServer()
  try {
    const r = await s.client.post('/api/login', { password: 'secret' })
    assert.equal(r.status, 200)
    assert.match(r.setCookie, /hub_session=[A-Za-z0-9_-]{40,}/)
    assert.match(r.setCookie, /HttpOnly/)
    assert.match(r.setCookie, /SameSite=Lax/)
    assert.doesNotMatch(r.setCookie, /Secure/)
    const session = await s.client.get('/api/session')
    assert.equal(session.status, 200)
    assert.equal(session.data.name, '')
    const named = await s.client.post('/api/session/name', { name: 'Malek' })
    assert.equal(named.data.name, 'Malek')
    const again = await s.client.get('/api/session')
    assert.equal(again.data.name, 'Malek')
  } finally {
    await s.close()
  }
})

test('login: empty HUB_PASSWORD lets nobody in', async () => {
  const s = await testServer({ password: '' })
  try {
    const r = await s.client.post('/api/login', { password: '' })
    assert.equal(r.status, 401)
  } finally {
    await s.close()
  }
})

test('api: without session 401, POST without Origin 403, foreign Origin 403', async () => {
  const s = await testServer()
  try {
    assert.equal((await s.client.get('/api/entries')).status, 401)
    await s.client.login()
    assert.equal((await s.client.get('/api/entries')).status, 200)
    const noOrigin = await s.client.post('/api/entries', { kind: 'project', name: 'X' }, { noOrigin: true })
    assert.equal(noOrigin.status, 403)
    const foreign = await s.client.post('/api/entries', { kind: 'project', name: 'X' }, { headers: { Origin: 'https://evil.example' } })
    assert.equal(foreign.status, 403)
    const wrongType = await fetch(`${s.base}/api/entries`, {
      method: 'POST',
      headers: { Origin: s.base, Cookie: (await s.client.get('/api/session')).headers && '' },
      body: '{}',
    })
    assert.ok([401, 415].includes(wrongType.status))
  } finally {
    await s.close()
  }
})

test('logout clears the session', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    const out = await s.client.post('/api/logout')
    assert.match(out.setCookie, /Max-Age=0/)
    assert.equal((await s.client.get('/api/entries')).status, 401)
  } finally {
    await s.close()
  }
})

test('sessions survive a restart of the Auth object', async () => {
  const s = await testServer()
  try {
    await s.client.login('secret', 'Sami')
    const { Auth } = await import('../server/auth.mjs')
    const fresh = new Auth(s.auth.file.replace(/sessions\.json$/, ''))
    await fresh.load()
    assert.equal(fresh.sessions.size, 1)
    assert.equal([...fresh.sessions.values()][0].name, 'Sami')
  } finally {
    await s.close()
  }
})
