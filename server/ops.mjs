// Operationen auf einem Eintrag. Reine Funktionen: bekommen den Entwurf und
// den Body, prüfen an der Grenze, ändern den Entwurf, werfen bei Unsinn.
// Der Store kümmert sich um Version und Schreiben.

import { HttpError, bad, isoDate, oneOf, text, url } from './http.mjs'
import { LIMITS, newId, now } from './store.mjs'

const TASK_STATUS = ['todo', 'doing', 'done']
const PRIORITY = ['high', 'medium', 'low']
const LABELS = ['Tech', 'Pitch', 'Orga', 'Outreach', 'Admin']
const CONTACT_STATUS = ['open', 'contacted', 'replied']
const LINK_TYPES = ['registration', 'github', 'pitch', 'miro', 'other']

// Felder, die der Tracker besitzt, solange der Eintrag dort noch existiert.
const TRACKER_OWNED = new Set(['name', 'link', 'dates.text', 'location', 'deadline', 'deadlineNote'])
const EDITABLE = new Set([
  ...TRACKER_OWNED,
  'info.description',
  'info.tracks',
  'info.prizes',
  'info.windows',
  'info.cost',
  'news.query',
])

function trackerOwns(e) {
  return e.trackerId !== null && e.tracker && !e.tracker.missingSince
}

function find(list, id, what) {
  const i = list.findIndex((x) => x.id === id)
  if (i < 0) throw new HttpError(404, 'not_found', `${what} not found`)
  return i
}

function setField(e, field, value) {
  if (!EDITABLE.has(field)) throw bad(`Field ${field} is not editable`)
  if (TRACKER_OWNED.has(field) && trackerOwns(e)) throw bad(`${field} comes from the tracker. Change it in Emil.`)
  switch (field) {
    case 'name':
      e.name = text(value, 160, { required: true, name: 'name' })
      break
    case 'link':
      e.link = url(value, { name: 'link' })
      break
    case 'dates.text':
      e.dates.text = text(value, 120, { name: 'dates' })
      break
    case 'location':
      e.location = text(value, 160, { name: 'location' })
      break
    case 'deadline':
      e.deadline = isoDate(value, { name: 'deadline' })
      break
    case 'deadlineNote':
      e.deadlineNote = text(value, 200, { name: 'deadline note' })
      break
    case 'news.query':
      e.news.query = text(value, 200, { name: 'news query' })
      break
    default: {
      const key = field.slice('info.'.length)
      e.info[key] = text(value, 4000, { name: key })
    }
  }
}

function taskFields(body, current = {}) {
  return {
    title: body.title !== undefined ? text(body.title, 160, { required: true, name: 'title' }) : current.title,
    description: body.description !== undefined ? text(body.description, 4000, { name: 'description' }) : (current.description ?? ''),
    status: body.status !== undefined ? oneOf(body.status, TASK_STATUS, { name: 'status' }) : (current.status ?? 'todo'),
    assignee: body.assignee !== undefined ? text(body.assignee, 40, { name: 'assignee' }) : (current.assignee ?? ''),
    due: body.due !== undefined ? isoDate(body.due, { name: 'due' }) : (current.due ?? null),
    label: body.label !== undefined ? (body.label ? oneOf(body.label, LABELS, { name: 'label' }) : null) : (current.label ?? null),
    priority: body.priority !== undefined ? oneOf(body.priority, PRIORITY, { name: 'priority' }) : (current.priority ?? 'medium'),
  }
}

function renumber(tasks, status) {
  let i = 0
  for (const t of tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order)) t.order = i++
}

function contactFields(body, current = {}) {
  return {
    name: body.name !== undefined ? text(body.name, 120, { required: true, name: 'name' }) : current.name,
    role: body.role !== undefined ? text(body.role, 120, { name: 'role' }) : (current.role ?? ''),
    channel: body.channel !== undefined ? text(body.channel, 120, { name: 'channel' }) : (current.channel ?? ''),
    status: body.status !== undefined ? oneOf(body.status, CONTACT_STATUS, { name: 'status' }) : (current.status ?? 'open'),
    note: body.note !== undefined ? text(body.note, 2000, { name: 'note' }) : (current.note ?? ''),
  }
}

function linkFields(body, current = {}) {
  return {
    label: body.label !== undefined ? text(body.label, 80, { required: true, name: 'label' }) : current.label,
    url: body.url !== undefined ? url(body.url, { required: true, name: 'url' }) : current.url,
    type: body.type !== undefined ? oneOf(body.type, LINK_TYPES, { name: 'type' }) : (current.type ?? 'other'),
  }
}

export function applyOp(e, op, body, user) {
  const t = now()
  switch (op) {
    case 'field':
      setField(e, text(body.field, 40, { required: true, name: 'field' }), body.value)
      return

    case 'links/add': {
      if (e.links.length >= LIMITS.links) throw bad(`At most ${LIMITS.links} links`)
      e.links.push({ id: newId(), ...linkFields(body) })
      return
    }
    case 'links/update': {
      const i = find(e.links, body.linkId, 'Link')
      e.links[i] = { ...e.links[i], ...linkFields(body, e.links[i]) }
      return
    }
    case 'links/remove':
      e.links.splice(find(e.links, body.linkId, 'Link'), 1)
      return

    case 'tasks/add': {
      if (e.tasks.length >= LIMITS.tasks) throw bad(`At most ${LIMITS.tasks} tasks`)
      const f = taskFields(body)
      const order = e.tasks.filter((x) => x.status === f.status).length
      e.tasks.push({ id: newId(), ...f, order, createdAt: t, updatedAt: t })
      return
    }
    case 'tasks/update': {
      const i = find(e.tasks, body.taskId, 'Task')
      const before = e.tasks[i]
      const f = taskFields(body, before)
      e.tasks[i] = { ...before, ...f, updatedAt: t }
      if (f.status !== before.status) {
        e.tasks[i].order = e.tasks.filter((x) => x.status === f.status).length
        renumber(e.tasks, before.status)
        renumber(e.tasks, f.status)
      }
      return
    }
    case 'tasks/move': {
      const i = find(e.tasks, body.taskId, 'Task')
      const task = e.tasks[i]
      const status = oneOf(body.status, TASK_STATUS, { name: 'status' })
      const from = task.status
      const column = e.tasks.filter((x) => x.status === status && x.id !== task.id).sort((a, b) => a.order - b.order)
      // Ist der Nachbar inzwischen weg, landet die Karte am Ende der Spalte.
      let at = column.length
      if (body.beforeId) {
        const j = column.findIndex((x) => x.id === body.beforeId)
        if (j >= 0) at = j
      }
      column.splice(at, 0, task)
      task.status = status
      task.updatedAt = t
      column.forEach((x, k) => (x.order = k))
      if (from !== status) renumber(e.tasks, from)
      return
    }
    case 'tasks/remove':
      {
        const i = find(e.tasks, body.taskId, 'Task')
        const status = e.tasks[i].status
        e.tasks.splice(i, 1)
        renumber(e.tasks, status)
      }
      return

    case 'contacts/add': {
      if (e.contacts.length >= LIMITS.contacts) throw bad(`At most ${LIMITS.contacts} contacts`)
      e.contacts.push({ id: newId(), ...contactFields(body), updatedAt: t })
      return
    }
    case 'contacts/update': {
      const i = find(e.contacts, body.contactId, 'Contact')
      e.contacts[i] = { ...e.contacts[i], ...contactFields(body, e.contacts[i]), updatedAt: t }
      return
    }
    case 'contacts/remove':
      e.contacts.splice(find(e.contacts, body.contactId, 'Contact'), 1)
      return

    case 'comments/add': {
      if (e.comments.length >= LIMITS.comments) throw bad(`At most ${LIMITS.comments} comments`)
      e.comments.push({ id: newId(), author: user, text: text(body.text, 2000, { required: true, name: 'text' }), at: t })
      return
    }
    case 'comments/remove':
      e.comments.splice(find(e.comments, body.commentId, 'Comment'), 1)
      return

    case 'pin':
      e.pinned = body.pinned === true
      return
    case 'archive':
      e.archived = body.archived === true
      return
    case 'logo/mode':
      e.logo = { kind: oneOf(body.kind, ['favicon', 'initials'], { name: 'kind' }), file: null }
      return

    default:
      throw new HttpError(404, 'not_found', `Unknown operation ${op}`)
  }
}

export const OPS = [
  'field',
  'links/add',
  'links/update',
  'links/remove',
  'tasks/add',
  'tasks/update',
  'tasks/move',
  'tasks/remove',
  'contacts/add',
  'contacts/update',
  'contacts/remove',
  'comments/add',
  'comments/remove',
  'pin',
  'archive',
  'logo/mode',
]
