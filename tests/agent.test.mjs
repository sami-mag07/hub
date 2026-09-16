import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testServer } from './helpers.mjs'
import { isPrivateIp, assertPublic, parseHtml } from '../server/fetch.mjs'
import { applyEnrichment, parseJson } from '../server/enrich.mjs'
import { emptyEntry } from '../server/store.mjs'

test('agent token: unknown token 401, known token writes under its name, no Origin needed', async () => {
  process.env.HUB_AGENT_TOKENS = 'malek:tok-malek-1234567890,sami:tok-sami-1234567890'
  const s = await testServer()
  try {
    const bad = await s.client.get('/api/agent/status', { headers: { Authorization: 'Bearer nope' }, noCookie: true })
    assert.equal(bad.status, 401)
    const who = await s.client.get('/api/agent/whoami', { headers: { Authorization: 'Bearer tok-malek-1234567890' }, noCookie: true })
    assert.equal(who.status, 200)
    assert.equal(who.data.user, 'malek (agent)')
    const created = await s.client.post(
      '/api/entries',
      { kind: 'project', name: 'Visier', link: 'https://github.com/Malek1414/visier' },
      { headers: { Authorization: 'Bearer tok-malek-1234567890' }, noCookie: true, noOrigin: true },
    )
    assert.equal(created.status, 201)
    assert.equal(created.data.createdBy, 'malek (agent)')
    const task = await s.client.post(
      `/api/entries/${created.data.id}/tasks/add`,
      { title: 'Order the camera' },
      { headers: { Authorization: 'Bearer tok-malek-1234567890' }, noCookie: true, noOrigin: true },
    )
    assert.equal(task.status, 200)
    const status = await s.client.get('/api/agent/status', { headers: { Authorization: 'Bearer tok-sami-1234567890' }, noCookie: true })
    assert.equal(status.data.entries.length, 1)
    assert.equal(status.data.entries[0].openTasks[0].title, 'Order the camera')
    assert.deepEqual(status.data.entries[0].missing, [])
  } finally {
    delete process.env.HUB_AGENT_TOKENS
    await s.close()
  }
})

test('agent token: empty HUB_AGENT_TOKENS means no token works', async () => {
  delete process.env.HUB_AGENT_TOKENS
  const s = await testServer()
  try {
    const r = await s.client.get('/api/agent/status', { headers: { Authorization: 'Bearer anything' }, noCookie: true })
    assert.equal(r.status, 401)
  } finally {
    await s.close()
  }
})

test('tracks: add, update notes, remove', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    const e = (await s.client.post('/api/entries', { kind: 'project', name: 'X' })).data
    let r = await s.client.post(`/api/entries/${e.id}/tracks/add`, { name: 'Health', description: 'Care robots' })
    assert.equal(r.status, 200)
    const t = r.data.tracks[0]
    r = await s.client.post(`/api/entries/${e.id}/tracks/update`, { trackId: t.id, notes: 'We could pitch Visier here' })
    assert.equal(r.data.tracks[0].notes, 'We could pitch Visier here')
    assert.equal(r.data.tracks[0].description, 'Care robots')
    r = await s.client.post(`/api/entries/${e.id}/tracks/remove`, { trackId: t.id })
    assert.equal(r.data.tracks.length, 0)
    r = await s.client.post(`/api/entries/${e.id}/tracks/add`, { name: '' })
    assert.equal(r.status, 400)
  } finally {
    await s.close()
  }
})

test('fetch guard: private and local targets are rejected before any request', async () => {
  assert.equal(isPrivateIp('127.0.0.1'), true)
  assert.equal(isPrivateIp('10.1.2.3'), true)
  assert.equal(isPrivateIp('172.17.0.1'), true)
  assert.equal(isPrivateIp('192.168.1.1'), true)
  assert.equal(isPrivateIp('169.254.169.254'), true)
  assert.equal(isPrivateIp('::1'), true)
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true)
  assert.equal(isPrivateIp('8.8.8.8'), false)
  for (const u of ['http://127.0.0.1:8080/', 'http://localhost/x', 'http://169.254.169.254/latest', 'ftp://example.com/', 'http://user:pw@example.com/', 'http://[::1]/']) {
    await assert.rejects(() => assertPublic(u), (err) => err.status === 400, u)
  }
})

test('parseHtml: text without scripts, icons sorted by size, title decoded', () => {
  const html = `<html><head><title>Hack &amp; Build</title>
    <link rel="icon" sizes="32x32" href="/f32.png"><link rel="apple-touch-icon" href="/apple.png"><link rel="icon" sizes="192x192" href="/f192.png">
    <script>var x = 1</script><style>.a{}</style></head><body><h1>Tracks</h1><p>Health<br>Energy</p></body></html>`
  const p = parseHtml(html, 'https://example.com/event')
  assert.equal(p.title, 'Hack & Build')
  assert.deepEqual(
    p.icons.map((i) => i.url),
    ['https://example.com/f192.png', 'https://example.com/apple.png', 'https://example.com/f32.png'],
  )
  assert.doesNotMatch(p.text, /var x/)
  assert.match(p.text, /Tracks\s*\n\s*Health\s*\n\s*Energy/)
})

test('enrichment fills only empty fields, dedupes tracks and links, tolerates fences', () => {
  const e = emptyEntry({ id: 'entry0000001', kind: 'hackathon', name: 'X', createdBy: 't', link: 'https://x.org' })
  e.info.prizes = 'Keep me'
  e.tracks.push({ id: 't1', name: 'Health', description: '', notes: 'mine', updatedAt: 'x' })
  const data = parseJson('```json\n{"description":"A thing.","prizes":"Overwrite?","tracks":[{"name":"health","description":"dup"},{"name":"Energy","description":"E"}],"links":[{"label":"Apply","url":"https://x.org/apply","type":"registration"},{"label":"Same","url":"https://x.org"}]}\n```')
  const changed = applyEnrichment(e, data, 'https://x.org')
  assert.equal(e.info.description, 'A thing.')
  assert.equal(e.info.prizes, 'Keep me')
  assert.equal(e.tracks.length, 2)
  assert.equal(e.tracks[0].notes, 'mine')
  assert.equal(e.links.length, 1)
  assert.equal(e.links[0].type, 'registration')
  assert.deepEqual(changed, ['description', 'track:Energy', 'link:Apply'])
  assert.equal(e.enriched.changed, 3)
})
