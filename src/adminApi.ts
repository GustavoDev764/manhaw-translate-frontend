import { del, patch, post, put, request } from './api'

export type Role = 'system_admin' | 'scan_admin' | 'redator'
export type FeatureKey =
  | 'download'
  | 'scan'
  | 'ocr'
  | 'translate'
  | 'cleanup_render'
  | 'approve'
  | 'fix_area_claude'
  | 'erase_area'
  | 'edit_text'
  | 'comment_area'
  | 'restore_version'
  | 'glossary_edit'

export const ROLE_LABEL: Record<Role, string> = {
  system_admin: 'Admin do sistema',
  scan_admin: 'Admin da scan',
  redator: 'Redator',
}

export interface Me {
  id: string
  name: string
  email: string
  role: Role
  mustChangePassword: boolean
  scan: { id: string; name: string; slug: string } | null
  features: Record<FeatureKey, boolean>
  featureReasons: Record<FeatureKey, string>
}

export interface SessionInfo {
  id: string
  ip: string | null
  userAgent: string | null
  lastSeenAt: string
  createdAt: string
  current: boolean
}

export interface Paged<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface ScanRow {
  id: string
  name: string
  slug: string
  active: boolean
  contactEmail: string | null
  admins: string[]
  users: number
  series: number
  blockedFeatures: FeatureKey[]
  createdAt: string
}

export interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  scan: { id: string; name: string } | null
  teams: { id: string; name: string }[]
  lastLoginAt: string | null
  locked: boolean
}

export interface UserFeature {
  key: FeatureKey
  name: string
  byRole: boolean
  ceiling: boolean
  rule: 'inherit' | 'allow' | 'deny'
  allowed: boolean
  reason: string
}

export interface TeamRow {
  id: string
  name: string
  description: string | null
  members: { id: string; name: string; email: string; role: Role; active: boolean }[]
  rules: { feature: string; effect: 'allow' | 'deny' }[]
}

export interface FeatureRow {
  key: FeatureKey
  name: string
  description: string
  ceiling: boolean
  scan_admin: boolean
  redator: boolean
  rules: { id: string; subjectType: 'team' | 'user'; subjectId: string; subjectName: string; effect: 'allow' | 'deny' }[]
}

export interface ProfileRow {
  key: FeatureKey
  name: string
  description: string
  scan_admin: boolean
  redator: boolean
}

export interface EffectiveRow {
  key: FeatureKey
  name: string
  allowed: boolean
  reason: string
}

export interface AuditRow {
  id: string
  at: string
  user: { id: string; name: string; email: string } | null
  action: string
  entityType: string | null
  entityId: string | null
  scanId: string | null
  before: unknown
  after: unknown
}

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()
  return s ? `?${s}` : ''
}

export const authApi = {
  login: (email: string, password: string) => post<{ ok: true }>('/auth/login', { email, password }),
  logout: () => post<{ ok: true }>('/auth/logout'),
  me: () => request<Me>('/auth/me'),
  updateMe: (name: string) => patch<{ ok: true }>('/auth/me', { name }),
  changePassword: (current: string, next: string) => post<{ ok: true }>('/auth/password', { current, next }),
  sessions: () => request<SessionInfo[]>('/auth/sessions'),
  endSession: (id: string | 'others') => del<{ ok: true }>(`/auth/sessions/${id}`),
}

export const adminApi = {
  scans: () => request<ScanRow[]>('/admin/scans'),
  scanPage: (page: number, search?: string) => request<Paged<ScanRow>>(`/admin/scans${q({ page: String(page), q: search || undefined })}`),
  createScan: (body: { name: string; contactEmail?: string; admin: { name: string; email: string; password: string }; blockedFeatures: FeatureKey[] }) =>
    post<{ id: string; slug: string }>('/admin/scans', body),
  renameScan: (id: string, name: string) => patch<{ id: string; name: string; slug: string }>(`/scans/${id}/name`, { name }),
  updateScan: (id: string, body: { name?: string; active?: boolean; contactEmail?: string | null }) => patch<{ ok: true }>(`/admin/scans/${id}`, body),
  setCeiling: (id: string, allowed: Partial<Record<FeatureKey, boolean>>) => put<{ ok: true }>(`/admin/scans/${id}/features`, { allowed }),

  profiles: () => request<ProfileRow[]>('/admin/profiles'),
  saveProfiles: (profiles: { key: FeatureKey; scan_admin: boolean; redator: boolean }[]) => put<{ ok: true }>('/admin/profiles', { profiles }),

  users: (scanId?: string) => request<UserRow[]>(`/users${q({ scanId })}`),
  userPage: (page: number, search?: string, scanId?: string) => request<Paged<UserRow>>(`/users${q({ page: String(page), q: search || undefined, scanId })}`),
  createUser: (body: { name: string; email: string; role: Role; password: string; scanId?: string; teamIds?: string[] }) => post<{ id: string }>('/users', body),
  updateUser: (id: string, body: { name?: string; role?: Role; active?: boolean }) => patch<{ ok: true }>(`/users/${id}`, body),
  resetPassword: (id: string, password?: string) => post<{ password: string }>(`/users/${id}/reset-password`, password ? { password } : {}),
  userFeatures: (id: string) => request<UserFeature[]>(`/users/${id}/features`),
  setUserFeatures: (id: string, rules: Partial<Record<FeatureKey, 'inherit' | 'allow' | 'deny'>>) => put<{ ok: true }>(`/users/${id}/features`, { rules }),

  teams: (scanId?: string) => request<TeamRow[]>(`/teams${q({ scanId })}`),
  createTeam: (body: { name: string; description?: string; memberIds?: string[]; scanId?: string }) => post<{ id: string }>('/teams', body),
  updateTeam: (id: string, body: { name?: string; description?: string }) => patch<{ ok: true }>(`/teams/${id}`, body),
  deleteTeam: (id: string) => del<{ ok: true }>(`/teams/${id}`),
  addMember: (id: string, userId: string) => post<{ ok: true }>(`/teams/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => del<{ ok: true }>(`/teams/${id}/members/${userId}`),

  features: (scanId?: string) => request<FeatureRow[]>(`/features${q({ scanId })}`),
  addRule: (body: { scanId?: string; featureKey: FeatureKey; subjectType: 'team' | 'user'; subjectId: string; effect: 'allow' | 'deny' }) => post<{ ok: true }>('/features/rules', body),
  removeRule: (id: string) => del<{ ok: true }>(`/features/rules/${id}`),
  effective: (userId: string) => request<EffectiveRow[]>(`/features/effective${q({ user: userId })}`),

  audit: (params: { userId?: string; action?: string; scanId?: string; from?: string; to?: string; q?: string; before?: string }) => request<AuditRow[]>(`/audit${q(params)}`),
}

export interface StorageInfo {
  active: { kind: 'local' | 'azure' | 's3'; root?: string; container?: string; connectionString?: string | null; region?: string; bucket?: string; endpoint?: string | null; accessKeyId?: string | null }
  source: 'tela' | '.env'
  stats: { files: number; bytes: number }
  migration: { status: 'running' | 'done' | 'failed'; to: string; total: number; done: number; failed?: number } | null
}

export interface StorageInput {
  kind: 'local' | 'azure' | 's3'
  root?: string
  connectionString?: string
  container?: string
  region?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  endpoint?: string
}

export const storageApi = {
  get: () => request<StorageInfo>('/settings/storage'),
  test: (body: StorageInput) => post<{ ok: true; ms: number }>('/settings/storage/test', body),
  save: (body: StorageInput) => put<{ ok: true }>('/settings/storage', body),
}
