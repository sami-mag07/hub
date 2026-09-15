import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

// Ein Router in 40 Zeilen: history API, ein Store, View Transitions wenn der
// Browser sie kann. Mehr braucht die App mit drei Routen nicht.

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

window.addEventListener('popstate', () => transition(notify))

function transition(apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (doc.startViewTransition && !reduced) doc.startViewTransition(() => flushSync(apply))
  else apply()
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === location.pathname) return
  transition(() => {
    if (opts.replace) history.replaceState(null, '', to)
    else history.pushState(null, '', to)
    notify()
  })
}

export function useRoute() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => location.pathname,
  )
}

export function matchEntry(path: string): string | null {
  const m = path.match(/^\/e\/([A-Za-z0-9_-]{6,32})$/)
  return m ? m[1] : null
}
