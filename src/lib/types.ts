// Gemeinsamer Vertrag mit server/. Änderungen nur additiv (neue Felder optional).

export type Kind = 'hackathon' | 'project'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type ContactStatus = 'open' | 'contacted' | 'replied'
export type LinkType = 'registration' | 'github' | 'pitch' | 'miro' | 'other'
export type LogoKind = 'upload' | 'favicon' | 'initials'
export type TrackerStatus = 'offen' | 'beworben' | 'warteliste' | 'angenommen' | 'abgelehnt' | 'verworfen'
export type PartnerType = 'sponsor' | 'mentor' | 'partner'

export const LABELS = ['Tech', 'Pitch', 'Orga', 'Outreach', 'Admin'] as const
export type Label = (typeof LABELS)[number]

export const TASK_STATUS: { key: TaskStatus; title: string }[] = [
  { key: 'todo', title: 'To do' },
  { key: 'doing', title: 'In progress' },
  { key: 'done', title: 'Done' },
]

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  assignee: string
  due: string | null
  label: Label | null
  priority: Priority
  order: number
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  name: string
  role: string
  channel: string
  status: ContactStatus
  note: string
  updatedAt: string
}

export interface Comment {
  id: string
  author: string
  text: string
  at: string
}

export interface Link {
  id: string
  label: string
  url: string
  type: LinkType
}

export interface NewsItem {
  title: string
  url: string
  date: string | null
  snippet: string
}

export interface TrackerInfo {
  status: TrackerStatus
  kategorie: string
  kosten: string
  notiz: string
  beworbenAm: string | null
  syncedAt: string
  missingSince: string | null
}

export interface Logo {
  kind: LogoKind
  file: string | null
}

export interface Info {
  description: string
  tracks: string
  prizes: string
  windows: string
  cost: string
}

export interface Entry {
  id: string
  kind: Kind
  trackerId: number | null
  version: number
  name: string
  logo: Logo
  dates: { text: string; start: string | null; end: string | null }
  location: string
  deadline: string | null
  deadlineNote: string
  link: string
  links: Link[]
  info: Info
  tasks: Task[]
  contacts: Contact[]
  comments: Comment[]
  news: { fetchedAt: string | null; query: string; items: NewsItem[] }
  tracker: TrackerInfo | null
  pinned: boolean
  archived: boolean
  createdAt: string
  createdBy: string
  updatedAt: string
}

export type EntrySummary = Pick<
  Entry,
  'id' | 'kind' | 'version' | 'name' | 'logo' | 'dates' | 'location' | 'deadline' | 'link' | 'tracker' | 'pinned' | 'archived'
>

export interface Partner {
  id: string
  name: string
  company: string
  role: string
  type: PartnerType
  linkedin: string
  entryId: string | null
  status: ContactStatus
  note: string
  updatedAt: string
}

export interface Session {
  name: string
}

export interface TrackerState {
  lastOk: string | null
  lastError: string | null
  lastTry: string | null
}

export interface SearchHit {
  title: string
  url: string
  date: string | null
  snippet: string
}

export type View = 'signed-up' | 'sign-up' | 'reach-out'
