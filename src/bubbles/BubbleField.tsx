import { useEffect, useMemo, useRef, useState } from 'react'
import type { EntrySummary } from '../lib/types'
import { computeLayout, type Tier } from './layout'
import { useDrift } from './useDrift'
import { Bubble, relevantDays } from './Bubble'

function tierOf(e: EntrySummary): Tier {
  if (e.kind === 'project') return e.pinned ? 'L' : 'M'
  if (e.tracker?.status === 'angenommen' || e.pinned) return 'L'
  const { days } = relevantDays(e)
  if (days !== null && days <= 7) return 'L'
  if (days !== null && days <= 30) return 'M'
  return 'S'
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let t = 0
    const ro = new ResizeObserver(([entry]) => {
      clearTimeout(t)
      const { width, height } = entry.contentRect
      t = window.setTimeout(() => setSize({ w: Math.round(width), h: Math.round(height) }), 150)
    })
    ro.observe(el)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [ref])
  return size
}

export function useMedia(query: string) {
  const [m, setM] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}

export function BubbleField({ entries, onOpen }: { entries: EntrySummary[]; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(ref)
  const narrow = useMedia('(max-width: 639px)')
  const reduced = useMedia('(prefers-reduced-motion: reduce)')

  // DOM-Reihenfolge = Dringlichkeit, unabhängig von der Position auf dem Feld,
  // damit die Tastatur in sinnvoller Reihenfolge durch die Blasen läuft.
  const ordered = useMemo(() => {
    return [...entries].sort((a, b) => {
      const da = relevantDays(a).days ?? 9999
      const db = relevantDays(b).days ?? 9999
      return da - db || a.name.localeCompare(b.name)
    })
  }, [entries])

  const placed = useMemo(
    () => (narrow ? [] : computeLayout(ordered.map((e) => ({ id: e.id, tier: tierOf(e) })), w, h)),
    [ordered, w, h, narrow],
  )
  useDrift(ref, placed, !reduced && !narrow)

  if (narrow) {
    return (
      <div className="bubble-grid" role="list" aria-label="Bubbles">
        {ordered.map((e) => (
          <div key={e.id} role="listitem" className="contents">
            <Bubble entry={e} onOpen={onOpen} size={104} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div ref={ref} className="absolute inset-0" role="list" aria-label="Bubbles">
      {ordered.map((e) => (
        <div key={e.id} role="listitem" className="contents">
          <Bubble entry={e} onOpen={onOpen} />
        </div>
      ))}
    </div>
  )
}
