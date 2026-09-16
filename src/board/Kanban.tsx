import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import { LABELS, TASK_STATUS, type Entry, type Label, type Priority, type Task, type TaskStatus } from '../lib/types'
import type { OpFn } from '../views/Board'
import { ErrorLine, Field, Input, Modal, SectionTitle, Select, Textarea, useConfirm } from '../components/ui'
import { daysUntil, formatDate } from '../lib/format'

const PRIORITIES: { key: Priority; title: string }[] = [
  { key: 'high', title: 'High' },
  { key: 'medium', title: 'Medium' },
  { key: 'low', title: 'Low' },
]

function byOrder(a: Task, b: Task) {
  return a.order - b.order
}

export function Kanban({ entry, op, userName }: { entry: Entry; op: OpFn; userName: string }) {
  const [tasks, setTasks] = useState<Task[]>(entry.tasks)
  const [active, setActive] = useState<Task | null>(null)
  const [editing, setEditing] = useState<Task | TaskStatus | null>(null)
  const [label, setLabel] = useState<Label | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [error, setError] = useState<string | null>(null)

  // Server ist die Wahrheit: sobald ein neuer Stand kommt, gewinnt er.
  useEffect(() => setTasks(entry.tasks), [entry.tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const visible = useMemo(
    () => tasks.filter((t) => (!label || t.label === label) && (!priority || t.priority === priority)),
    [tasks, label, priority],
  )
  const columns = useMemo(
    () => TASK_STATUS.map((c) => ({ ...c, items: visible.filter((t) => t.status === c.key).sort(byOrder) })),
    [visible],
  )

  const onDragStart = (ev: DragStartEvent) => setActive(tasks.find((t) => t.id === ev.active.id) ?? null)

  const onDragEnd = async (ev: DragEndEvent) => {
    setActive(null)
    const { active: a, over } = ev
    if (!over) return
    const task = tasks.find((t) => t.id === a.id)
    if (!task) return
    const overTask = tasks.find((t) => t.id === over.id)
    const status = (overTask ? overTask.status : String(over.id)) as TaskStatus
    if (!TASK_STATUS.some((c) => c.key === status)) return
    let beforeId: string | null = null
    if (overTask && overTask.id !== task.id) {
      const col = tasks.filter((t) => t.status === status && t.id !== task.id).sort(byOrder)
      const idx = col.findIndex((t) => t.id === overTask.id)
      // Von oben kommend fällt die Karte hinter den Nachbarn, von unten davor.
      const movingDown = task.status === status && task.order < overTask.order
      const target = movingDown ? col[idx + 1] : col[idx]
      beforeId = target?.id ?? null
    } else if (overTask && overTask.id === task.id) {
      return
    }
    if (task.status === status && beforeId === null) {
      const col = tasks.filter((t) => t.status === status).sort(byOrder)
      if (col[col.length - 1]?.id === task.id) return
    }
    // Optimistisch anordnen, der Server bestätigt oder korrigiert.
    setTasks((prev) => {
      const rest = prev.filter((t) => t.id !== task.id)
      const col = rest.filter((t) => t.status === status).sort(byOrder)
      const at = beforeId ? col.findIndex((t) => t.id === beforeId) : col.length
      col.splice(at < 0 ? col.length : at, 0, { ...task, status })
      col.forEach((t, i) => (t.order = i))
      return [...rest.filter((t) => t.status !== status), ...col]
    })
    const r = await op('tasks/move', { taskId: task.id, status, beforeId })
    if (!r.ok) setError(r.message)
  }

  return (
    <div>
      <SectionTitle
        action={
          <>
            <label className="sr-only" htmlFor="f-label">
          Filter by label
        </label>
            <select id="f-label" className="input !w-auto !py-1.5 !text-[13px]" value={label} onChange={(e) => setLabel(e.target.value as Label | '')}>
              <option value="">All labels</option>
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="f-prio">
              Filter by priority
            </label>
            <select id="f-prio" className="input !w-auto !py-1.5 !text-[13px]" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.title}
                </option>
              ))}
            </select>
          </>
        }
      >
        Board
      </SectionTitle>
      {error && <ErrorLine>{error}</ErrorLine>}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="kanban">
          {columns.map((c) => (
            <Column key={c.key} id={c.key} title={c.title} items={c.items} onAdd={() => setEditing(c.key)} onOpen={(t) => setEditing(t)} />
          ))}
        </div>
        <DragOverlay>{active ? <Card task={active} overlay /> : null}</DragOverlay>
      </DndContext>

      {editing && (
        <TaskForm
          task={typeof editing === 'string' ? null : editing}
          status={typeof editing === 'string' ? editing : editing.status}
          userName={userName}
          op={op}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Column({
  id,
  title,
  items,
  onAdd,
  onOpen,
}: {
  id: TaskStatus
  title: string
  items: Task[]
  onAdd: () => void
  onOpen: (t: Task) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className={`kanban-col ${isOver ? 'over' : ''}`} aria-labelledby={`col-${id}`}>
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 id={`col-${id}`} className="text-[13px] font-semibold text-[var(--text-muted)]">
          {title}
        </h2>
        <button type="button" className="btn btn-ghost btn-icon !w-7 !h-7" aria-label={`Add task to ${title}`} onClick={onAdd}>
          <Plus size={15} />
        </button>
      </div>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="grid gap-2 min-h-[48px]">
          {items.map((t) => (
            <SortableCard key={t.id} task={t} onOpen={() => onOpen(t)} />
          ))}
        </div>
      </SortableContext>
    </section>
  )
}

function SortableCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  // Der sortierbare Wrapper ist das eine bedienbare Element: Klick oder Enter
  // öffnet die Karte, Leertaste hebt sie zum Verschieben an (dnd-kit).
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={task.title}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <Card task={task} dragging={isDragging} />
    </div>
  )
}

function Card({ task, dragging, overlay }: { task: Task; dragging?: boolean; overlay?: boolean }) {
  const due = daysUntil(task.due)
  const meta = [task.label, task.priority === 'high' ? 'High' : task.priority === 'low' ? 'Low' : null, task.assignee].filter(Boolean)
  return (
    <div className={`task-card ${dragging ? 'dragging' : ''} ${overlay ? 'shadow-lg rotate-[1.5deg]' : ''}`}>
      <p className="text-[14px] font-medium leading-snug">{task.title}</p>
      {(meta.length > 0 || task.due) && (
        <p className="text-[12px] text-[var(--text-muted)] mt-1 flex flex-wrap gap-x-2">
          {meta.map((m) => (
            <span key={m as string} className={m === 'High' ? 'font-semibold text-[var(--text)]' : ''}>
              {m}
            </span>
          ))}
          {task.due && (
            <span className={`tnum ${due !== null && due < 0 && task.status !== 'done' ? 'text-[var(--danger)] font-semibold' : ''}`}>
              {formatDate(task.due)}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function TaskForm({
  task,
  status,
  userName,
  op,
  onClose,
}: {
  task: Task | null
  status: TaskStatus
  userName: string
  op: OpFn
  onClose: () => void
}) {
  const [f, setF] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? status,
    assignee: task?.assignee ?? userName,
    due: task?.due ?? '',
    label: task?.label ?? '',
    priority: task?.priority ?? 'medium',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return
    setBusy(true)
    const body = { ...f, due: f.due || null, label: f.label || null }
    const r = task ? await op('tasks/update', { taskId: task.id, ...body }) : await op('tasks/add', body)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.message)
  }
  const remove = async () => {
    if (!task || !(await confirm(`Delete "${task.title}"?`))) return
    const r = await op('tasks/remove', { taskId: task.id })
    if (r.ok) onClose()
    else setError(r.message)
  }
  return (
    <Modal
      title={task ? 'Task' : 'New task'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <button type="button" className="btn btn-ghost mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          <button type="submit" form="task-form" className="btn btn-primary" disabled={busy || !f.title.trim()}>
            Save
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit}>
        <Field label="Title">
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={4000} rows={4} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set('status', e.target.value)}>
              {TASK_STATUS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who">
            <Input value={f.assignee} onChange={(e) => set('assignee', e.target.value)} maxLength={40} list="people" />
          </Field>
          <Field label="Due">
            <Input type="date" value={f.due} onChange={(e) => set('due', e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Label">
            <Select value={f.label} onChange={(e) => set('label', e.target.value)}>
              <option value="">None</option>
              {LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <datalist id="people">
          <option value="Sami" />
          <option value="Malek" />
        </datalist>
        {error && <ErrorLine>{error}</ErrorLine>}
      </form>
      {dialog}
    </Modal>
  )
}
