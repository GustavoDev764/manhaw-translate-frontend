import { del, patch, post, request } from './api'
import type { WorkflowType } from './workflowsApi'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type CommentAction = 'none' | 'reread' | 'erase'
export type CommentStatus = 'open' | 'processing' | 'resolved' | 'discarded'
export type VersionChange = 'import' | 'render' | 'fix_area' | 'edit_text' | 'erase' | 'restore'

export interface ReviewVersion {
  id: string
  number: number
  assetId: string
  change: VersionChange
  note: string | null
  by: string
  at: string
  restoredFrom: string | null
  commentId: string | null
  current: boolean
}

export interface ReviewComment {
  id: string
  region: Rect
  comment: string
  action: CommentAction
  status: CommentStatus
  workflowId: number | null
  resultVersionId: string | null
  by: string
  at: string
  resolvedBy: string | null
  resolvedAt: string | null
}

export interface TextLayer {
  id: string
  region: Rect & { rotation?: number; erase?: boolean }
  boxShape: 'rect' | 'square'
  text: string
  fontId: string | null
  fontSize: number
  color: string
  strokeColor: string | null
  strokeWidth: number
  align: 'left' | 'center' | 'right'
  lineHeight: number
}

export interface NeighborPage {
  id: string
  position: number
  assetId: string
}

export interface ReviewPage {
  id: string
  file: string
  position: number
  total: number
  prev: NeighborPage | null
  next: NeighborPage | null
  prevId: string | null
  nextId: string | null
  status: string
  chapter: { id: string; number: number }
  series: { id: string; slug: string; title: string }
  originalAssetId: string | null
  cleanAssetId: string | null
  size: { width: number; height: number } | null
  currentVersionId: string | null
  editable: boolean
  unpublished: boolean
  editLock: { userId: string; name: string; expiresAt: string } | null
  approved: { by: string; at: string } | null
  lock: { workflowId: number; stage: WorkflowType; label: string } | null
  versions: ReviewVersion[]
  comments: ReviewComment[]
  layers: TextLayer[]
}

export interface FontRules {
  rule: string
  extensions: string[]
  maxBytes: number
}

export type FontNameCheck = { name: string; ok: true; family: string; style: string; format: string } | { name: string; ok: false; error: string }

export interface FontRow {
  id: string
  family: string
  style: string
  format: string
  assetId: string
  url: string
  uploadedAt: string
}

export interface GlossaryTerm {
  id: string
  term: string
  translation: string
  note: string | null
  category: string | null
  origin: 'auto' | 'manual'
  status: 'new' | 'approved'
  locked: boolean
  firstChapter: number | null
  updatedAt: string
}

export type LayerInput = Partial<Omit<TextLayer, 'id'>>

export const CHANGE_LABEL: Record<VersionChange, string> = {
  import: 'Importada',
  render: 'Tradução desenhada',
  fix_area: 'Área corrigida',
  edit_text: 'Texto editado',
  erase: 'Área apagada',
  restore: 'Restaurada',
}

export const reviewApi = {
  page: (id: string) => request<ReviewPage>(`/review/pages/${id}`),
  comment: (pageId: string, input: { region: Rect; comment: string; action: CommentAction }) => post<{ id: string; workflowId?: number }>(`/review/pages/${pageId}/comments`, input),
  setComment: (id: string, status: 'open' | 'resolved' | 'discarded') => patch<{ ok: true }>(`/review/comments/${id}`, { status }),
  addLayer: (pageId: string, input: LayerInput) => post<{ id: string }>(`/review/pages/${pageId}/layers`, input),
  updateLayer: (id: string, input: LayerInput) => patch<{ ok: true; twins?: { pageId: string; position: number }[] }>(`/review/layers/${id}`, input),
  removeLayer: (id: string) => del<{ ok: true }>(`/review/layers/${id}`),
  applyText: (pageId: string) => post<{ id: number }>(`/review/pages/${pageId}/apply-text`),
  takeEditLock: (pageId: string) => post<{ expiresAt: string }>(`/review/pages/${pageId}/edit-lock`),
  releaseEditLock: (pageId: string) => del<{ ok: true }>(`/review/pages/${pageId}/edit-lock`),
  restore: (pageId: string, versionId: string) => post<{ id: string; number: number }>(`/review/pages/${pageId}/restore`, { versionId }),
  approve: (pageId: string, approved: boolean) => post<{ ok: true }>(`/review/pages/${pageId}/approve`, { approved }),
  fonts: () => request<FontRow[]>('/fonts'),
  fontRules: () => request<FontRules>('/fonts/rules'),
  checkFontNames: (names: string[]) => post<FontNameCheck[]>('/fonts/check-names', { names }),
  uploadFont: (input: { fileName: string; data: string }) => post<{ id: string }>('/fonts', input),
  removeFont: (id: string) => del<{ ok: true }>(`/fonts/${id}`),
}

export const glossaryApi = {
  list: (seriesId: string, q: { q?: string; status?: string; skip?: number; take?: number } = {}) =>
    request<{ total: number; counts: Partial<Record<'new' | 'approved', number>>; rows: GlossaryTerm[] }>(
      `/glossary/series/${seriesId}?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`,
    ),
  create: (seriesId: string, input: { term: string; translation: string; note?: string }) => post<{ id: string }>(`/glossary/series/${seriesId}`, input),
  update: (id: string, input: Partial<Pick<GlossaryTerm, 'term' | 'translation' | 'note' | 'status' | 'locked'>>) => patch<{ ok: true }>(`/glossary/${id}`, input),
  approveAll: (seriesId: string, ids?: string[]) => post<{ approved: number }>(`/glossary/series/${seriesId}/approve`, { ids }),
  remove: (id: string) => del<{ ok: true }>(`/glossary/${id}`),
}

const loaded = new Map<string, Promise<void>>()
export function loadFont(font: FontRow): Promise<void> {
  if (!loaded.has(font.id)) {
    const face = new FontFace(`mt-${font.id}`, `url(${font.url})`)
    loaded.set(
      font.id,
      face.load().then((f) => {
        document.fonts.add(f)
      }, () => undefined),
    )
  }
  return loaded.get(font.id)!
}

let defaultFont: Promise<void> | null = null

export function loadDefaultFont(family: string): Promise<void> {
  defaultFont ??= new FontFace(family, "url(/api/fonts/default/file)").load().then((f) => {
    document.fonts.add(f)
  }, () => undefined)
  return defaultFont
}
