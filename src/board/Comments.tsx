import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import type { Entry } from '../lib/types'
import type { OpFn } from '../views/Board'
import { Empty, ErrorLine } from '../components/ui'
import { formatTime } from '../lib/format'

export function Comments({ entry, op, userName }: { entry: Entry; op: OpFn; userName: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    const r = await op('comments/add', { text })
    setBusy(false)
    if (r.ok) setText('')
    else setError(r.message)
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this comment?')) return
    const r = await op('comments/remove', { commentId: id })
    if (!r.ok) setError(r.message)
  }
  const list = [...entry.comments].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <div className="max-w-[640px]">
      {list.length === 0 ? (
        <Empty>No comments yet.</Empty>
      ) : (
        <ol className="grid gap-4 mb-6">
          {list.map((c) => (
            <li key={c.id} className="group">
              <p className="text-[13px] text-[var(--text-muted)] flex items-center gap-2">
                <span className="font-semibold text-[var(--text)]">{c.author}</span>
                <span className="tnum">{formatTime(c.at)}</span>
                {c.author === userName && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon !w-7 !h-7 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label="Delete comment"
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </p>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap mt-0.5">{c.text}</p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="comment">
          Comment
        </label>
        <textarea
          id="comment"
          className="input"
          rows={3}
          maxLength={2000}
          placeholder="Write a comment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e)
          }}
        />
        {error && <ErrorLine>{error}</ErrorLine>}
        <div className="flex justify-end mt-2">
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
            Post
          </button>
        </div>
      </form>
    </div>
  )
}
