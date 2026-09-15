// Beispiel-Einträge für die lokale Entwicklung ohne Emil-Anbindung.
// Legt nichts doppelt an. Aufruf: node scripts/seed-dev.mjs
// Nie auf dem Server ausführen: dort kommen die Hackathons aus dem Tracker.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store, emptyEntry, newId } from '../server/store.mjs'
import { applyRow } from '../server/tracker.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const store = new Store(path.resolve(process.env.HUB_DATA_DIR || path.join(here, '..', 'data')))
await store.load()

const today = new Date()
const plus = (d) => new Date(today.getTime() + d * 86400000)
const de = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`
const iso = (d) => d.toISOString().slice(0, 10)

const rows = [
  { id: 9001, name: 'NASA Space Apps Berlin', ort: 'Berlin', datum: `${de(plus(60)).slice(0, 3)}/${de(plus(61))}`, frist: iso(plus(58)), frist_hinweis: 'Registration open', kosten: 'free', link: 'https://www.spaceappschallenge.org/', kategorie: 'Hackathon', status: 'beworben', beworben_am: iso(today), notiz: '' },
  { id: 9002, name: 'Google Accessibility Hackathon', ort: 'Google AI Center Berlin', datum: `${de(plus(8)).slice(0, 3)}/${de(plus(9))}`, frist: iso(plus(2)), frist_hinweis: '', kosten: 'free', link: 'https://rsvp.withgoogle.com/', kategorie: 'Hackathon', status: 'angenommen', beworben_am: iso(plus(-10)), notiz: 'Team of two, agentic accessibility' },
  { id: 9003, name: 'Jugend hackt Congress', ort: 'Berlin', datum: `${de(plus(32)).slice(0, 3)}/${de(plus(33))}`, frist: null, frist_hinweis: 'rolling', kosten: 'free', link: 'https://jugendhackt.org/', kategorie: 'Hackathon', status: 'beworben', beworben_am: iso(plus(-3)), notiz: '' },
  { id: 9004, name: 'hackaTUM', ort: 'Garching', datum: `${de(plus(72)).slice(0, 3)}–${de(plus(74))}`, frist: iso(plus(40)), frist_hinweis: 'applications open in October', kosten: 'free', link: 'https://hack.tum.de/', kategorie: 'Hackathon', status: 'offen', beworben_am: null, notiz: '' },
  { id: 9005, name: 'CASSINI Hackathon', ort: 'Darmstadt', datum: `${de(plus(72)).slice(0, 3)}–${de(plus(74))}`, frist: iso(plus(65)), frist_hinweis: '', kosten: 'free', link: 'https://www.cassini.eu/hackathons', kategorie: 'Hackathon', status: 'offen', beworben_am: null, notiz: '' },
  { id: 9006, name: 'Junction Helsinki', ort: 'Helsinki', datum: `${de(plus(58)).slice(0, 3)}–${de(plus(60))}`, frist: iso(plus(20)), frist_hinweis: 'travel grant closed', kosten: 'travel', link: 'https://www.hackjunction.com/', kategorie: 'Hackathon', status: 'offen', beworben_am: null, notiz: '' },
  { id: 9007, name: 'ElevenLabs Worldwide Hackathon', ort: 'Berlin', datum: de(plus(86)), frist: iso(plus(70)), frist_hinweis: 'curated', kosten: 'free', link: 'https://elevenlabs.io/', kategorie: 'Hackathon', status: 'offen', beworben_am: null, notiz: '' },
  { id: 9008, name: 'EDTH Berlin', ort: 'Berlin', datum: `${de(plus(72)).slice(0, 3)}–${de(plus(74))}`, frist: iso(plus(50)), frist_hinweis: '', kosten: 'free', link: 'https://www.edth.eu/', kategorie: 'Hackathon', status: 'offen', beworben_am: null, notiz: '' },
]

let made = 0
for (const row of rows) {
  if (store.byTrackerId(row.id)) continue
  const e = emptyEntry({ id: newId(), kind: 'hackathon', name: row.name, createdBy: 'seed', trackerId: row.id })
  applyRow(e, row, new Date().toISOString())
  await store.create(e)
  made++
}
const projects = [
  { name: 'FollowCam', link: 'https://github.com/Malek1414/code-hackathon-project' },
  { name: 'Visier', link: '' },
  { name: 'NTA', link: 'https://nachteilsausgleich.app' },
]
for (const p of projects) {
  if (store.list().some((e) => e.kind === 'project' && e.name === p.name)) continue
  const e = emptyEntry({ id: newId(), kind: 'project', name: p.name, link: p.link, createdBy: 'seed' })
  if (!p.link) e.logo = { kind: 'initials', file: null }
  await store.create(e)
  made++
}
console.log(`seeded ${made} entries, ${store.entries.size} total`)
