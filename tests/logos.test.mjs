import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniff, svgSafe } from '../server/logos.mjs'
import { testServer } from './helpers.mjs'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1')
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')
const BAD_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>1</script></svg>')

test('sniff: type comes from bytes, never from the name', () => {
  assert.equal(sniff(PNG), 'png')
  assert.equal(sniff(JPG), 'jpg')
  assert.equal(sniff(SVG), 'svg')
  assert.equal(sniff(EXE), null)
  assert.equal(sniff(Buffer.alloc(0)), null)
  assert.equal(svgSafe(SVG), true)
  assert.equal(svgSafe(BAD_SVG), false)
})

test('upload: png accepted and served with the right type, exe rejected, script svg rejected, oversized rejected', async () => {
  const s = await testServer()
  try {
    await s.client.login()
    const e = (await s.client.post('/api/entries', { kind: 'project', name: 'Visier' })).data
    const up = (buf) => s.client.post(`/api/entries/${e.id}/logo`, new Uint8Array(buf), { headers: { 'Content-Type': 'application/octet-stream' } })

    let r = await up(PNG)
    assert.equal(r.status, 200)
    assert.equal(r.data.logo.kind, 'upload')
    assert.equal(r.data.logo.file, `${e.id}.png`)
    const served = await fetch(`${s.base}/api/logos/${e.id}`, { headers: { Cookie: (await s.client.get('/api/session')).headers && '' } })
    assert.equal(served.status, 401)

    const img = await s.client.get(`/api/logos/${e.id}`)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff')

    r = await up(EXE)
    assert.equal(r.status, 400)
    r = await up(BAD_SVG)
    assert.equal(r.status, 400)
    r = await up(Buffer.alloc(1024 * 1024 + 1, 1))
    assert.equal(r.status, 413)

    r = await s.client.post(`/api/entries/${e.id}/logo/mode`, { kind: 'initials' })
    assert.equal(r.status, 200)
    assert.equal((await s.client.get(`/api/logos/${e.id}`)).status, 404)
  } finally {
    await s.close()
  }
})
