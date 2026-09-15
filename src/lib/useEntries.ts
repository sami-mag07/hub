import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Entry, EntrySummary } from './types'

// Startseite: Liste alle 30 s neu, dazu sofort beim Zurückkehren in den Tab.
export function useEntries() {
  const [entries, setEntries] = useState<EntrySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setEntries(await api.entries())
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'unauthorized' : 'No connection.')
    }
  }, [])
  useEffect(() => {
    void load()
    const t = setInterval(() => !document.hidden && void load(), 30_000)
    const onVis = () => !document.hidden && void load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])
  return { entries, error, reload: load, setEntries }
}

// Board: ein Eintrag, alle 5 s nachgefragt mit der bekannten Version. Der
// Server antwortet 304, solange sich nichts geändert hat.
export function useEntry(id: string) {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const versionRef = useRef(0)

  const apply = useCallback((e: Entry | undefined) => {
    if (!e) return
    if (e.version < versionRef.current) return
    versionRef.current = e.version
    setEntry(e)
  }, [])

  const load = useCallback(async () => {
    try {
      apply(await api.entry(id, versionRef.current || undefined))
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError('not-found')
      else if (e instanceof ApiError && e.status === 401) setError('unauthorized')
      else setError('No connection.')
    }
  }, [id, apply])

  useEffect(() => {
    versionRef.current = 0
    setEntry(null)
    void load()
    const t = setInterval(() => !document.hidden && void load(), 5_000)
    const onVis = () => !document.hidden && void load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  // Eine Operation mit der aktuellen Version schicken. Bei 409 einmal mit der
  // frischen Version wiederholen, wenn `retry` das erlaubt (Listen-Ops immer,
  // Textfelder nur, wenn der alte Wert noch stimmt).
  const op = useCallback(
    async (name: string, body: Record<string, unknown>, retry: (fresh: Entry) => boolean = () => true) => {
      const send = (version: number) => api.op(id, name, { ...body, version })
      try {
        apply(await send(versionRef.current))
        return { ok: true as const }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.entry) {
          apply(e.entry)
          if (retry(e.entry)) {
            try {
              apply(await send(e.entry.version))
              return { ok: true as const }
            } catch (e2) {
              return { ok: false as const, message: e2 instanceof Error ? e2.message : 'Failed' }
            }
          }
          return { ok: false as const, message: 'Changed by someone else. Check and try again.' }
        }
        return { ok: false as const, message: e instanceof Error ? e.message : 'Failed' }
      }
    },
    [id, apply],
  )

  return { entry, error, reload: load, op, apply }
}
