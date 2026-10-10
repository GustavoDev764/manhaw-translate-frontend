
export type JobKind = 'download' | 'list' | 'scan' | 'translate' | 'queue' | 'preview' | 'rerender'
export type JobStatus = 'running' | 'succeeded' | 'failed' | 'canceled'

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

  jobs: () => request<Job[]>('/jobs'),
  job: (id: string, after: number) => request<JobWithLines>(`/jobs/${enc(id)}?after=${after}`),
  cancelJob: (id: string) => post<Job>(`/jobs/${enc(id)}/cancel`),
}
