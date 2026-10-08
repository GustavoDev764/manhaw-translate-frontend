
export type TranslationState = 'done' | 'queued' | 'partial' | 'pending' | 'no-text'
export type PageState = 'no-text' | 'done' | 'queued' | 'error' | 'pending'
export type JobKind = 'download' | 'list' | 'scan' | 'translate' | 'queue' | 'preview' | 'rerender'
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled'
export type TranslateMode = 'direct' | 'queue' | 'preview' | 'rerender'

export interface SeriesSummary {
  slug: string
  url: string | null
  site: { chapters: number; downloaded: number; listedAt: string } | null
  local: {
    chapters: number
    scanned: number
    translated: number
    queued: number
    pagesWithText: number
  }
}

export interface SiteChapter {
  number: number
  group: string | null
  groups: string[]
  downloaded: boolean
  downloadedGroup: string | null
}

export interface LocalChapter {
  name: string
  number: number
  total: number
  done: number
  queued: number
  error: number
  pending: number
  pages: number
  pagesWithText: number
  scanned: boolean
  translation: TranslationState
}

export interface QueueEntry {
  id: string
  model: string
  kind?: 'read' | 'translate'
  createdAt: string
  status: 'in_progress' | 'canceling' | 'ended'
  counts: { processing: number; succeeded: number; errored: number; canceled: number; expired: number }
  checkedAt?: string
  endedAt?: string
  collectedAt?: string
  total: number
  chapters: string[]
}

export interface SeriesDetail extends SeriesSummary {
  siteChapters: SiteChapter[]
  chapters: LocalChapter[]
  entries: QueueEntry[]
  cost: { total: number; viaQueue: number }
}

export interface PageInfo {
  file: string
  status: PageState
  translated: boolean
  preview: boolean
  error?: string
  queueId?: string
}

export interface Job {
  id: string
  kind: JobKind
  series: string
  title: string
  command: string
  status: JobStatus
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  lineCount: number
}

export interface JobWithLines extends Job {
  lines: string[]
  firstLine: number
}

export interface ModelInfo {
  id: string
  name: string
  createdAt: string | null
  price: { input: number; output: number } | null
}

export interface ModelsResponse {
  models: ModelInfo[]
  defaultModel: string
  tokensPerPage: { input: number; output: number }
  economy: {
    readModel: string
    readPrice: { input: number; output: number }
    tokensPerPage: {
      readInput: number
      readOutput: number
      input: number
      cacheWrite: number
      cacheRead: number
      output: number
    }
  }
  error: string | null
}

export interface Pace {
  key: string
  chapterDelayMs: number
  restEvery: number
  restMs: number
}

export interface Config {
  hasApiKey: boolean
  preferredGroups: string[]
  paces: Pace[]
}

export interface QueueStatus {
  lastSync: string | null
  nextSync: string
  syncing: boolean
  error: string | null
  log: string[]
}

export type NoteKind = 'illegible' | 'english' | 'meaning' | 'other'

export interface Note {
  id: string
  chapter: string
  page: string
  x: number
  y: number
  kind: NoteKind
  comment: string
  createdAt: string
  resolvedAt?: string
}

export type NoteInput = Partial<Pick<Note, 'page' | 'x' | 'y' | 'kind' | 'comment'>> & { resolved?: boolean }

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const OFFLINE_MESSAGE = 'Não foi possível conectar ao servidor. Tente novamente em instantes.'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    })
  } catch {
    throw new ApiError(0, OFFLINE_MESSAGE)
  }
  const text = await res.text()
  let body: { message?: string | string[]; code?: string } | null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('mt:unauthorized'))
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new ApiError(
      res.status,
      res.status >= 502 && res.status <= 504
        ? OFFLINE_MESSAGE
        : (message ?? `Erro ${res.status}`),
      body?.code,
    )
  }
  return body as T
}

export const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const put = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T>(path: string, body?: unknown) =>
  request<T>(path, body === undefined ? { method: 'DELETE' } : { method: 'DELETE', body: JSON.stringify(body) })
const enc = encodeURIComponent

export const api = {
  config: () => request<Config>('/config'),
  models: () => request<ModelsResponse>('/models'),

  series: () => request<SeriesSummary[]>('/series'),
  addSeries: (url: string) => post<SeriesSummary>('/series', { url }),
  seriesDetail: (slug: string) => request<SeriesDetail>(`/series/${enc(slug)}`),
  pages: (slug: string, chapter: string) =>
    request<PageInfo[]>(`/series/${enc(slug)}/chapters/${enc(chapter)}/pages`),

  refreshList: (slug: string) => post<Job>(`/series/${enc(slug)}/refresh-list`),
  download: (
    slug: string,
    body: { chapters: number[]; group: string | null; pace: string; redownload: boolean },
  ) => post<Job>(`/series/${enc(slug)}/download`, body),
  deleteChapters: (slug: string, chapters: number[]) =>
    post<{ deleted: number[] }>(`/series/${enc(slug)}/delete`, { chapters }),
  scan: (slug: string, chapters: number[], force: boolean) =>
    post<Job>(`/series/${enc(slug)}/scan`, { chapters, force }),
  translate: (
    slug: string,
    body: {
      chapters: number[]
      mode: TranslateMode
      model?: string
      retryErrors?: boolean
      economy?: boolean
    },
  ) => post<Job>(`/series/${enc(slug)}/translate`, body),

  jobs: () => request<Job[]>('/jobs'),
  job: (id: string, after: number) => request<JobWithLines>(`/jobs/${enc(id)}?after=${after}`),
  cancelJob: (id: string) => post<Job>(`/jobs/${enc(id)}/cancel`),

  notes: (slug: string) => request<Note[]>(`/series/${enc(slug)}/notes`),
  chapterNotes: (slug: string, chapter: string) =>
    request<Note[]>(`/series/${enc(slug)}/chapters/${enc(chapter)}/notes`),
  addNote: (slug: string, chapter: string, body: NoteInput) =>
    post<Note>(`/series/${enc(slug)}/chapters/${enc(chapter)}/notes`, body),
  editNote: (slug: string, chapter: string, id: string, body: NoteInput) =>
    request<Note>(`/series/${enc(slug)}/chapters/${enc(chapter)}/notes/${enc(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteNote: (slug: string, chapter: string, id: string) =>
    request<{ deleted: string }>(`/series/${enc(slug)}/chapters/${enc(chapter)}/notes/${enc(id)}`, {
      method: 'DELETE',
    }),

  queue: () => request<QueueStatus>('/queue'),
  syncQueue: () => post<object>('/queue/sync'),
}

export function imageUrl(
  root: 'downloads' | 'translated' | 'preview',
  slug: string,
  chapter: string,
  file: string,
  v?: string,
): string {
  return `/api/images/${root}/${enc(slug)}/${enc(chapter)}/${enc(file)}${v ? `?v=${enc(v)}` : ''}`
}
