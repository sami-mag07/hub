import { test } from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import { parseDates, Tracker } from '../server/tracker.mjs'
import { Store } from '../server/store.mjs'
import { tmpDir } from './helpers.mjs'

test('parseDates: ranges, single dates, two-digit years, no year', () => {
  assert.deepEqual(parseDates('14./15.11.26'), { start: '2026-11-14', end: '2026-11-15' })
  assert.deepEqual(parseDates('27.–29.11.2026'), { start: '2026-11-27', end: '2026-11-29' })
  assert.deepEqual(parseDates('23.09.26'), { start: '2026-09-23', end: '2026-09-23' })
  assert.deepEqual(parseDates('Quali 01.03.–01.05.27'), { start: '2027-03-01', end: '2027-05-01' })
  assert.deepEqual(parseDates('Finale 15./16.10.'), { start: null, end: null })
  assert.deepEqual(parseDates('laufend'), { start: null, end: null })
})

function row(over = {}) {
  return {
    id: 42,
    name: 'NASA Space Apps Berlin',
    ort: 'Berlin',
    datum: '14./15.11.26',
    frist: '2026-11-13',
    frist_hinweis: 'Anmeldung offen',
    kosten: 'kostenlos',
    link: 'https://www.spaceappschallenge.org/2026/local-events/berlin',
    kategorie: 'Hackathon',
    status: 'offen',
    beworben_am: null,
    notiz: '',
    ...over,
  }
}

test('merge: creates hackathon entries, refreshes tracker fields, keeps hub data, marks vanished rows', async () => {
  const dir = await tmpDir()
  try {
    const store = new Store(dir)
    await store.load()
    const tracker = new Tracker(store)

    let changed = await tracker.merge([row(), row({ id: 43, kategorie: 'Konferenz', name: 'TINCON' })], '2026-09-15T10:00:00Z', { markMissing: true })
    assert.equal(changed, 1)
    let e = store.byTrackerId(42)
    assert.equal(e.kind, 'hackathon')
    assert.equal(e.deadline, '2026-11-13')
    assert.deepEqual(e.dates, { text: '14./15.11.26', start: '2026-11-14', end: '2026-11-15' })
    assert.equal(e.tracker.status, 'offen')
    assert.equal(store.byTrackerId(43), null)

    await store.mutate(e.id, undefined, (d) => {
      d.tasks.push({ id: 'taskaaaaaaaa', title: 'Build the visor', status: 'todo', order: 0 })
    })
    changed = await tracker.merge([row()], '2026-09-15T10:10:00Z', { markMissing: true })
    assert.equal(changed, 0, 'unchanged rows do not bump the version')

    changed = await tracker.merge([row({ status: 'beworben', beworben_am: '2026-09-16' })], '2026-09-16T10:00:00Z', { markMissing: true })
    assert.equal(changed, 1)
    e = store.byTrackerId(42)
    assert.equal(e.tracker.status, 'beworben')
    assert.equal(e.tasks.length, 1, 'hub data survives tracker updates')

    changed = await tracker.merge([], '2026-11-16T10:00:00Z', { markMissing: true })
    assert.equal(changed, 1)
    e = store.byTrackerId(42)
    assert.equal(e.tracker.missingSince, '2026-11-16T10:00:00Z')
    assert.equal(e.tasks.length, 1, 'vanished rows never delete the entry')

    const store2 = new Store(dir)
    await store2.load()
    assert.equal(store2.byTrackerId(42).tasks.length, 1, 'persisted to disk')
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('setStatus without configuration answers 503, addHackathon too', async () => {
  const dir = await tmpDir()
  try {
    delete process.env.EMIL_EXPORT_URL
    delete process.env.HUB_TOKEN
    const store = new Store(dir)
    await store.load()
    const tracker = new Tracker(store)
    await tracker.merge([row()], '2026-09-15T10:00:00Z', { markMissing: false })
    const e = store.byTrackerId(42)
    await assert.rejects(() => tracker.setStatus(e.id, 'beworben'), (err) => err.status === 503)
    await assert.rejects(() => tracker.addHackathon({ name: 'X' }), (err) => err.status === 503)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})
