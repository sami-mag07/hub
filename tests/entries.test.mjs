import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testServer } from './helpers.mjs'

async function project(s, name = 'FollowCam') {
  const r = await s.client.post('/api/entries', { kind: 'project', name, link: 'https://github.com/Malek1414/code-hackathon-project' })
  assert.equal(r.status, 201)
  return r.data
}

test('entries: create project, list summary, 304 with known version', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    const e = await project(s)
    assert.equal(e.kind, 'project')
    assert.equal(e.version, 1)
    assert.equal(e.createdBy, 'Sami')
    const list = await s.client.get('/api/entries')
    assert.equal(list.data.length, 1)
    assert.equal(list.data[0].tasks, undefined)
    const same = await s.client.get(`/api/entries/${e.id}?since=1`)
    assert.equal(same.status, 304)
    const older = await s.client.get(`/api/entries/${e.id}?since=0`)
    assert.equal(older.status, 200)
  } finally {
    await s.close()
  }
})

test('entries: stale version gives 409 with the fresh entry, two racing writes yield exactly one 409', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    const e = await project(s)
    const [a, b] = await Promise.all([
      s.client.post(`/api/entries/${e.id}/comments/add`, { version: 1, text: 'first' }),
      s.client.post(`/api/entries/${e.id}/comments/add`, { version: 1, text: 'second' }),
    ])
    const statuses = [a.status, b.status].sort()
    assert.deepEqual(statuses, [200, 409])
    const conflict = a.status === 409 ? a : b
    assert.equal(conflict.data.code, 'conflict')
    assert.equal(conflict.data.entry.version, 2)
    assert.equal(conflict.data.entry.comments.length, 1)
    assert.equal(conflict.data.entry.comments[0].author, 'Sami')
  } finally {
    await s.close()
  }
})

test('tasks: add, move across columns before a neighbour, renumber, vanished neighbour appends', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    let e = await project(s)
    const add = async (title, status = 'todo') => {
      const r = await s.client.post(`/api/entries/${e.id}/tasks/add`, { title, status, priority: 'high', label: 'Tech' })
      assert.equal(r.status, 200, JSON.stringify(r.data))
      e = r.data
    }
    await add('A')
    await add('B')
    await add('C', 'doing')
    const [A, B, C] = e.tasks
    assert.deepEqual(e.tasks.map((t) => t.order), [0, 1, 0])

    let r = await s.client.post(`/api/entries/${e.id}/tasks/move`, { version: e.version, taskId: A.id, status: 'doing', beforeId: C.id })
    assert.equal(r.status, 200)
    e = r.data
    const doing = e.tasks.filter((t) => t.status === 'doing').sort((x, y) => x.order - y.order)
    assert.deepEqual(doing.map((t) => t.title), ['A', 'C'])
    assert.equal(e.tasks.find((t) => t.id === B.id).order, 0)

    r = await s.client.post(`/api/entries/${e.id}/tasks/move`, { version: e.version, taskId: B.id, status: 'done', beforeId: 'gone-neighbour' })
    assert.equal(r.status, 200)
    e = r.data
    assert.equal(e.tasks.find((t) => t.id === B.id).status, 'done')

    r = await s.client.post(`/api/entries/${e.id}/tasks/update`, { version: e.version, taskId: A.id, priority: 'nope' })
    assert.equal(r.status, 400)
    r = await s.client.post(`/api/entries/${e.id}/tasks/remove`, { version: e.version, taskId: C.id })
    assert.equal(r.status, 200)
    assert.equal(r.data.tasks.length, 2)
  } finally {
    await s.close()
  }
})

test('fields: project fields editable, tracker-owned fields locked while the tracker row exists', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    const e = await project(s)
    let r = await s.client.post(`/api/entries/${e.id}/field`, { version: 1, field: 'info.tracks', value: 'AI, Health' })
    assert.equal(r.status, 200)
    assert.equal(r.data.info.tracks, 'AI, Health')
    r = await s.client.post(`/api/entries/${e.id}/field`, { version: 2, field: 'deadline', value: '2026-11-14' })
    assert.equal(r.status, 200)
    r = await s.client.post(`/api/entries/${e.id}/field`, { version: 3, field: 'deadline', value: '14.11.2026' })
    assert.equal(r.status, 400)
    r = await s.client.post(`/api/entries/${e.id}/field`, { version: 3, field: 'version', value: 99 })
    assert.equal(r.status, 400)

    const { emptyEntry } = await import('../server/store.mjs')
    const h = emptyEntry({ id: 'hack00000001', kind: 'hackathon', name: 'NASA', createdBy: 'tracker', trackerId: 7 })
    h.tracker = { status: 'offen', kategorie: 'Hackathon', kosten: '', notiz: '', beworbenAm: null, syncedAt: 'x', missingSince: null }
    await s.store.create(h)
    r = await s.client.post(`/api/entries/${h.id}/field`, { version: 1, field: 'name', value: 'Renamed' })
    assert.equal(r.status, 400)
    r = await s.client.post(`/api/entries/${h.id}/field`, { version: 1, field: 'info.prizes', value: '10k' })
    assert.equal(r.status, 200)
  } finally {
    await s.close()
  }
})

test('ids: path traversal and prototype keys are rejected', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    assert.equal((await s.client.get('/api/entries/..%2F..%2Fetc')).status, 404)
    assert.equal((await s.client.get('/api/entries/__proto__')).status, 400)
    assert.equal((await s.client.get('/api/logos/constructor')).status, 400)
  } finally {
    await s.close()
  }
})
