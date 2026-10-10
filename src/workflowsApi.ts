import { del, patch, post, put, request } from './api'

export type LaunchType = 'download' | 'scan' | 'translate' | 'cleanup' | 'render'
export type WorkflowType = LaunchType | 'import' | 'fix_area' | 'edit_text' | 'delete' | 'export'
export type WorkflowStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'partial' | 'canceled'
export type ItemStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'canceled' | 'waiting_key' | 'waiting_api'

export const STAGE_LABEL: Record<WorkflowType, string> = {
  download: 'Baixar',
  import: 'Importar',
  scan: 'Escanear',
  translate: 'Traduzir',
  cleanup: 'Limpar balões',
  render: 'Desenhar',
  fix_area: 'Corrigir área',
  edit_text: 'Editar texto',
  delete: 'Excluir arquivos',
  export: 'Gerar zip',
}

export const STAGE_HELP: Record<LaunchType, string> = {
  download: 'Baixa as páginas do site de origem. Os originais nunca são alterados.',
  scan: 'Encontra os balões e textos de cada página (sem custo de API). Trabalha no capítulo inteiro.',
  translate: 'Lê e traduz os textos com a Claude e desenha a tradução nas páginas. Cada página ganha uma versão nova.',
  cleanup: 'Apaga o texto de todos os balões, deixando as páginas limpas para edição.',
  render: 'Publica as páginas a partir das caixas de texto: cada uma ganha uma versão nova. Por padrão entram só as páginas com alterações não publicadas; “Fazer de novo” inclui todas.',
}

export interface LibrarySeries {
  id: string
  slug: string
  title: string
  sourceUrl: string
  scan: { id: string; name: string }
  chapters: number
  pages: number
  scanned: number
  translated: number
  rendered: number
  approved: number
}

export interface LibraryChapter {
  id: string
  number: number
  folder: string
  pages: number
  noText: number
  scanned: number
  translated: number
  cleaned: number
  rendered: number
  approved: number
  reported: number
  locked: number
  lock: { workflowId: number; stage: WorkflowType } | null
  import: { status: 'extracting'; workflowId: number } | { status: 'failed'; workflowId: number; message: string | null } | null
}

export interface LibrarySeriesDetail {
  id: string
  slug: string
  title: string
  sourceUrl: string
  chapters: LibraryChapter[]
}

export interface LibraryPage {
  id: string
  position: number
  file: string
  status: 'no_text' | 'pending' | 'queued' | 'done' | 'error'
  stages: { scanned: boolean; translated: boolean; cleaned: boolean; rendered: boolean; approved: boolean }
  originalAssetId: string | null
  current: { versionId: string; number: number; assetId: string; changeType: string; at: string } | null
  lock: { workflowId: number; stage: WorkflowType } | null
  unpublished: boolean
  reported: { by: string; at: string } | null
}

export interface SiteChapters {
  listedAt: string | null
  chapters: { number: number; group: string | null; downloaded: boolean }[]
}

export interface LaunchInput {
  type: LaunchType
  seriesId: string
  chapterIds?: string[]
  pageIds?: string[]
  chapterNumbers?: number[]
  force?: boolean
}

export interface PlanTotals {
  selected: number
  done: number
  willRun: number
  locked: number
  missing: number
  noText: number
}

export interface Plan {
  type: LaunchType
  force: boolean
  series: { id: string; slug: string; title: string }
  chapters: { chapterId: string | null; number: number; selected: number; done: number; willRun: number; locked: number; missing: number; chapterLocked: boolean }[]
  totals: PlanTotals
  needs: string | null
  keyMissing?: boolean
  unpublished?: number
}

export interface WorkflowRow {
  id: number
  type: WorkflowType
  label: string
  status: WorkflowStatus
  force: boolean
  series: { id: string; slug: string; title: string } | null
  scan: string
  createdBy: string
  createdAt: string
  finishedAt: string | null
  chapters: number[]
  items: number
  counts: Partial<Record<ItemStatus, number>>
  progress: { label: string; done: number; total: number }[]
  steps: { label: string; phase: Phase | null; phaseAt: string | null; lots: BatchLots | null; progress: { done: number; total: number } | null }[]
  pages: number
  costUsd: number
  title: string | null
  files: number | null
  attempts: number
  done: number | null
  total: number | null
}

export interface WorkflowItemRow {
  id: string
  label: string
  chapterId: string | null
  pages: number
  status: ItemStatus
  attempts: number
  hasError: boolean
  errorMessage: string | null
  ocrModel: string | null
  translationModel: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  progress: { done: number; total: number } | null
  phase: Phase | null
  phaseAt: string | null
  phaseProgress: { done: number; total: number } | null
  timings: { phase: string; seconds: number }[]
  batch: ItemBatch | null
  startedAt: string | null
  finishedAt: string | null
}

export interface WorkflowDetail extends Omit<WorkflowRow, 'scan' | 'items' | 'counts' | 'pages' | 'costUsd' | 'chapters' | 'progress' | 'steps'> {
  params: { chapters?: number[]; preset?: string | null; title?: string }
  items: WorkflowItemRow[]
}

export type Phase = 'preparing' | 'glossary' | 'series_wait' | 'submitting' | 'uploading' | 'rendering' | 'cleaning' | 'waiting_api' | 'collecting' | 'glossary_update' | 'saving'

export interface BatchLots {
  total: number
  done: number
  queued: number
  error: number
}

export interface AnthropicBatch {
  id: string
  kind: 'read' | 'translate'
  status: 'in_progress' | 'canceling' | 'ended'
  counts: { processing: number; succeeded: number; errored: number; canceled: number; expired: number }
  createdAt: string
  endedAt?: string | null
  expiresAt?: string | null
  error?: string
}

export interface ItemBatch {
  submittedAt: string
  checkedAt?: string
  lots: BatchLots
  batches: AnthropicBatch[]
}

export interface ItemError {
  id: string
  label: string
  status: ItemStatus
  attempts: number
  workflow_id: number
  error: { message: string; hint?: string | null; exitCode?: number | null; command?: string | null; tail?: string[]; pages?: string[]; attempt?: number; attempts?: number; at: string } | null
}

export interface Processing {
  workerConcurrency: number
  cleanOnScan: boolean
  min: number
  max: number
  queue: { waiting: number; active: number; delayed: number }
}

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  link: string | null
  read_at: string | null
  created_at: string
}

const qs = (q: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v === true ? 1 : v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export type ExportKind = 'current' | 'original'

export function chapterSpec(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const n of sorted.slice(1).concat(NaN)) {
    if (Number.isInteger(n) && Number.isInteger(prev) && n === prev + 1) {
      prev = n
      continue
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`)
    start = n
    prev = n
  }
  return parts.join(',')
}

export interface ChapterExport {
  id: string
  status: 'pending' | 'ready' | 'failed'
  fileName: string
  kind: ExportKind
  spec: string
  chapters: number
  series: { id: string; slug: string; title: string } | null
  sizeBytes: number | null
  pages: number | null
  missing: number | null
  error: string | null
  workflowId: number | null
  by: string
  createdAt: string
  readyAt: string | null
  expiresAt: string
  canDelete: boolean
}

export const DOWNLOADS_CHANGED = 'downloads:changed'

export const exportsApi = {
  create: (seriesId: string, numbers: number[], kind: ExportKind) => post<{ id: string; workflowId: number | null; reused?: boolean }>(`/library/series/${seriesId}/exports`, { chapters: chapterSpec(numbers), kind }),
  list: () => request<ChapterExport[]>('/exports'),
  remove: (id: string) => del<{ ok: true }>(`/exports/${id}`),
  downloadUrl: (id: string) => `/api/exports/${id}/download`,
}

export const libraryApi = {
  series: (filter: { q?: string; scanId?: string } = {}) => request<LibrarySeries[]>(`/library/series${qs(filter)}`),
  addSeries: (input: { url?: string; title?: string; scanId?: string }) => post<{ id: string; slug: string; title: string }>('/library/series', input),
  siteChapters: (seriesId: string) => request<SiteChapters>(`/library/series/${seriesId}/site-chapters`),
  refreshSiteChapters: (seriesId: string) => post<SiteChapters>(`/library/series/${seriesId}/site-chapters/refresh`),
  renameSeries: (id: string, title: string) => patch<{ id: string; slug: string; title: string }>(`/library/series/${id}`, { title }),
  deleteSeries: (id: string, confirmation: string) => del<{ deleted: true; chapters: number; pages: number }>(`/library/series/${id}`, { confirmation }),
  seriesDetail: (slug: string) => request<LibrarySeriesDetail>(`/library/series/${encodeURIComponent(slug)}`),
  pages: (chapterId: string) => request<{ chapter: { id: string; number: number; folder: string; series: { slug: string; title: string } }; pages: LibraryPage[] }>(`/library/chapters/${chapterId}/pages`),
}

export const workflowsApi = {
  plan: (input: LaunchInput) => post<Plan>('/workflows/plan', input),
  create: (input: LaunchInput) => post<{ id: number; items: number; totals: PlanTotals }>('/workflows', input),
  list: (q: { status?: string; type?: string; seriesId?: string; mine?: boolean; skip?: number; take?: number } = {}) =>
    request<{ total: number; rows: WorkflowRow[] }>(`/workflows${qs(q)}`),
  get: (id: number) => request<WorkflowDetail>(`/workflows/${id}`),
  cancel: (id: number) => post<{ canceled: number }>(`/workflows/${id}/cancel`),
  error: (itemId: string) => request<ItemError>(`/workflows/items/${itemId}/error`),
  retry: (itemId: string) => post<{ ok: true }>(`/workflows/items/${itemId}/retry`),
  skip: (itemId: string) => post<{ ok: true }>(`/workflows/items/${itemId}/skip`),
  checkBatch: (itemId: string) => post<{ status: ItemStatus; phase: Phase | null; phaseAt: string | null; batch: ItemBatch | null }>(`/workflows/items/${itemId}/check-batch`),
  processing: () => request<Processing>('/settings/processing'),
  setProcessing: (workerConcurrency: number) => put<{ workerConcurrency: number }>('/settings/processing', { workerConcurrency }),
  setCleanOnScan: (cleanOnScan: boolean) => put<{ cleanOnScan: boolean }>('/settings/processing', { cleanOnScan }),
  notifications: (unread = false) => request<AppNotification[]>(`/notifications${unread ? '?unread=1' : ''}`),
  readNotifications: (ids?: string[]) => post<{ updated: number }>('/notifications/read', { ids }),
}
