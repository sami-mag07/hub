import type { Entry, EntrySummary, Partner, SearchHit, Session, TrackerState } from './types'

export class ApiError extends Error {
  status: number
  code: string
  entry?: Entry
  retryAfter?: number
  constructor(status: number, code: string, message: string, extra?: { entry?: Entry; retryAfter?: number }) {
    super(message)
    this.status = status
    this.code = code
    this.entry = extra?.entry
    this.retryAfter = extra?.retryAfter
  }
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    ...init,
  })
  if (res.status === 304) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; entry?: Entry; retryAfter?: number }
    throw new ApiError(res.status, d.code ?? 'error', d.message ?? res.statusText, { entry: d.entry, retryAfter: d.retryAfter })
  }
  return data as T
}

const get = <T>(path: string, init?: RequestInit) => request<T>('GET', path, undefined, init)
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {})

export const api = {
  session: () => get<Session>('/api/session'),
  login: (password: string) => post<{ ok: true }>('/api/login', { password }),
  setName: (name: string) => post<Session>('/api/session/name', { name }),
  logout: () => post<{ ok: true }>('/api/logout'),

  entries: () => get<EntrySummary[]>('/api/entries'),
  entry: (id: string, since?: number) =>
    get<Entry | undefined>(`/api/entries/${id}${since ? `?since=${since}` : ''}`),
  createProject: (name: string, link: string) => post<Entry>('/api/entries', { kind: 'project', name, link }),
  op: (id: string, op: string, body: Record<string, unknown>) => post<Entry>(`/api/entries/${id}/${op}`, body),
  uploadLogo: (id: string, file: Blob) => request<Entry>('POST', `/api/entries/${id}/logo`, file),
  fetchLogo: (id: string) => post<Entry>(`/api/entries/${id}/logo/fetch`),
  enrich: (id: string) => post<{ entry: Entry; changed: string[] }>(`/api/entries/${id}/enrich`),

  tracker: () => get<TrackerState>('/api/tracker'),
  trackerSync: () => post<TrackerState>('/api/tracker/sync'),
  trackerAdd: (hit: { name: string; link: string; ort?: string; datum?: string; frist?: string }) =>
    post<{ id: number; duplikat: boolean }>('/api/tracker/add', hit),
  searchHackathons: (query: string) => post<{ items: SearchHit[] }>('/api/search/hackathons', { query }),

  partners: () => get<Partner[]>('/api/partners'),
  partnerAdd: (p: Partial<Partner>) => post<Partner[]>('/api/partners/add', p),
  partnerUpdate: (id: string, p: Partial<Partner>) => post<Partner[]>('/api/partners/update', { id, ...p }),
  partnerRemove: (id: string) => post<Partner[]>('/api/partners/remove', { id }),
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
