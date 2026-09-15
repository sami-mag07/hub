import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { ErrorLine } from '../components/ui'

// Zwei Schritte auf einer weißen Seite: Passwort, dann Name. Kein Onboarding.
export function Login({ onDone }: { onDone: (name: string) => void }) {
  const [step, setStep] = useState<'password' | 'name'>('password')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(password)
      setStep('name')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('Wrong password.')
      else if (err instanceof ApiError && err.status === 429) setError('Too many attempts. Try again in 15 minutes.')
      else setError('No connection.')
    } finally {
      setBusy(false)
    }
  }

  const submitName = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    setError(null)
    try {
      await api.setName(n)
      onDone(n)
    } catch {
      setError('Could not save your name.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-full grid place-items-center px-4">
      <div className="w-full max-w-[340px]">
        <h1 className="text-[28px] font-semibold tracking-tight text-center mb-8">The Hub</h1>
        {step === 'password' ? (
          <form onSubmit={submitPassword}>
            <label className="sr-only" htmlFor="pw">
              Password
            </label>
            <input
              id="pw"
              type="password"
              className="input"
              placeholder="Password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <ErrorLine>{error}</ErrorLine>}
            <button type="submit" className="btn btn-primary w-full mt-3" disabled={busy || !password}>
              Enter
            </button>
          </form>
        ) : (
          <form onSubmit={submitName}>
            <label className="sr-only" htmlFor="nm">
              Your name
            </label>
            <input
              id="nm"
              type="text"
              className="input"
              placeholder="Your name"
              autoComplete="nickname"
              autoFocus
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              {['Sami', 'Malek'].map((n) => (
                <button key={n} type="button" className="btn" onClick={() => setName(n)}>
                  {n}
                </button>
              ))}
            </div>
            {error && <ErrorLine>{error}</ErrorLine>}
            <button type="submit" className="btn btn-primary w-full mt-3" disabled={busy || !name.trim()}>
              Continue
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
