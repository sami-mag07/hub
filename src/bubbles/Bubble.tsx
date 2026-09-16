import { useState } from 'react'
import type { EntrySummary } from '../lib/types'
import { domainOf } from '../lib/api'
import { daysUntil, formatDays, initials } from '../lib/format'

// Reihenfolge der Logo-Quellen: Upload, sonst Favicon der Link-Domain (Google,
// dann DuckDuckGo), sonst Initialen. Der Server holt nie fremde Bilder.
export function logoSources(e: Pick<EntrySummary, 'id' | 'logo' | 'link' | 'version'>): string[] {
  if (e.logo.kind === 'upload' && e.logo.file) return [`/api/logos/${e.id}?v=${e.version}`]
  if (e.logo.kind === 'initials') return []
  const host = domainOf(e.link)
  if (!host) return []
  return [`https://www.google.com/s2/favicons?domain=${host}&sz=256`, `https://icons.duckduckgo.com/ip3/${host}.ico`]
}

export function Logo({ entry, className, transition }: { entry: EntrySummary; className?: string; transition?: boolean }) {
  const sources = logoSources(entry)
  const [i, setI] = useState(0)
  const style = transition ? { viewTransitionName: `logo-${entry.id}` } : undefined
  if (i >= sources.length) {
    return (
      <span className={`initials ${className ?? ''}`} style={style} aria-hidden="true">
        {initials(entry.name)}
      </span>
    )
  }
  return (
    <img
      src={sources[i]}
      alt=""
      className={className}
      style={style}
      draggable={false}
      onError={() => setI((n) => n + 1)}
    />
  )
}

const SIGNED = new Set(['beworben', 'warteliste', 'angenommen'])

// Welches Datum zählt: die Frist, solange sie nicht vorbei ist und noch keine
// Bewerbung läuft, sonst der Termin.
export function relevantDays(e: EntrySummary): { days: number | null; what: 'deadline' | 'event' | null } {
  const applied = !!e.tracker && SIGNED.has(e.tracker.status)
  const dl = daysUntil(e.deadline)
  if (!applied && dl !== null && dl >= 0) return { days: dl, what: 'deadline' }
  const ev = daysUntil(e.dates.start)
  if (ev !== null && ev >= 0) return { days: ev, what: 'event' }
  return { days: null, what: null }
}

export function Bubble({ entry, onOpen, size }: { entry: EntrySummary; onOpen: (id: string) => void; size?: number }) {
  const { days, what } = relevantDays(entry)
  const urgent = days !== null && days <= 3
  return (
    <div className="bubble-wrap" data-id={entry.id}>
      <button
        type="button"
        className="bubble glass"
        aria-label={`Open ${entry.name}`}
        style={size ? { width: size, height: size } : undefined}
        onClick={() => onOpen(entry.id)}
      >
        <span className="bubble-plate">
          <Logo entry={entry} transition />
        </span>
      </button>
      <span className="bubble-name" aria-hidden="true">
        {entry.name}
        {days !== null && (
          <span className={`days ${urgent ? 'urgent' : ''}`}>
            {' '}
            · {what === 'deadline' ? 'apply' : ''} {formatDays(days)}
          </span>
        )}
      </span>
    </div>
  )
}
