import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './lib/api'
import { matchEntry, navigate, useRoute } from './lib/router'
import type { View } from './lib/types'
import { Login } from './views/Login'
import { Home } from './views/Home'
import { Board } from './views/Board'

type SessionState = { status: 'loading' } | { status: 'out' } | { status: 'in'; name: string }

export function App() {
  const path = useRoute()
  const [session, setSession] = useState<SessionState>({ status: 'loading' })

  const check = useCallback(async () => {
    try {
      const s = await api.session()
      setSession(s.name ? { status: 'in', name: s.name } : { status: 'out' })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession({ status: 'out' })
      else setSession({ status: 'out' })
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  const logout = async () => {
    await api.logout().catch(() => {})
    setSession({ status: 'out' })
    navigate('/', { replace: true })
  }

  if (session.status === 'loading') return null
  if (session.status === 'out') return <Login onDone={(name) => setSession({ status: 'in', name })} />

  const entryId = matchEntry(path)
  if (entryId) return <Board id={entryId} userName={session.name} onUnauthorized={() => setSession({ status: 'out' })} />

  const view: View = path === '/sign-up' ? 'sign-up' : path === '/reach-out' ? 'reach-out' : 'signed-up'
  return <Home view={view} userName={session.name} onLogout={logout} />
}
