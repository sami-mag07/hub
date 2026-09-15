const DAY = 86_400_000

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso}T00:00:00`)
  if (Number.isNaN(t)) return null
  const now = Date.parse(`${todayIso()}T00:00:00`)
  return Math.round((t - now) / DAY)
}

export function formatDays(days: number | null): string {
  if (days === null) return ''
  if (days < 0) return `${-days} d ago`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `${days} d`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(`${iso}T00:00:00`)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
