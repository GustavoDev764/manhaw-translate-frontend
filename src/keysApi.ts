import { del, patch, post, put, request } from './api'

export type ModelPreset = string

export interface ModelConfig {
  preset: ModelPreset | 'custom'
  ocr?: string
  translation?: string
}

export interface PresetRow {
  key: ModelPreset
  label: string
  ocr: string
  translation: string
  economyMode: boolean
}

export type KeyRule = 'inherit' | 'allow' | 'block'

export interface ResolvedModels {
  preset: ModelConfig['preset']
  label: string
  ocr: string
  translation: string
  economyMode: boolean
}

export interface AdminKey {
  id: string
  name: string
  last4: string
  active: boolean
  isDefault: boolean
  monthlyAlertUsd: number | null
  scans: number
  spentUsd: number
  spentMonthUsd: number
  models: ResolvedModels
  modelConfig: ModelConfig
  createdAt: string
}

export interface SharingRow {
  scanId: string
  name: string
  active: boolean
  rule: KeyRule
  keyId: string | null
  ownKey: string | null
  choice: 'own' | 'admin'
  effective: { source: 'own' | 'admin' | 'env' | 'none'; keyName: string | null }
}

export interface Sharing {
  allowAll: boolean
  defaultKeyId: string | null
  scans: SharingRow[]
}

export interface SpendReport {
  from: string
  to: string
  keys: { key: string; costUsd: number; inputTokens: number; outputTokens: number; items: number; scans: { scan: string; costUsd: number; items: number }[] }[]
}

export interface ScanKeyInfo {
  choice: 'own' | 'admin'
  ownLast4: string | null
  adminAllowed: boolean
  effective: 'own' | 'admin' | 'none'
  ownConfig: ModelConfig
  ownModels: ResolvedModels
  adminModels: ResolvedModels
  adminKeyName: string | null
  models: ResolvedModels
  modelsFrom: 'scan' | 'admin'
  presets: { key: ModelPreset; label: string; ocr: string; translation: string }[]
}

export interface KeyStatus {
  ok: boolean
  source: 'own' | 'admin' | 'none'
  pausedItems?: number
}

export interface SmtpInfo {
  source: 'tela' | 'env' | null
  host: string
  port: number
  secure: boolean
  user: string
  from: string
  hasPassword: boolean
  outbox: Partial<Record<'pending' | 'sent' | 'failed', number>>
  lastFailure: { last_error: string; to_email: string; created_at: string } | null
}

export interface SmtpInput {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
}

export interface EmailTemplate {
  key: string
  name: string
  subject: string
  html: string
  text: string
  active: boolean
  variables: string[]
  customized: boolean
  updatedAt: string | null
}

export interface RecoveryRules {
  default: 'allow' | 'block'
  smtp: boolean
  scans: { scanId: string; name: string; rule: KeyRule }[]
}

const withScan = (scanId?: string) => (scanId ? `?scanId=${encodeURIComponent(scanId)}` : '')

export const keysApi = {
  presets: () => request<PresetRow[]>('/models/presets'),
  list: () => request<AdminKey[]>('/admin/api-keys'),
  create: (input: { name: string; key: string; monthlyAlertUsd?: number | null; modelConfig: ModelConfig }) => post<{ id: string }>('/admin/api-keys', input),
  update: (id: string, input: Partial<{ name: string; active: boolean; monthlyAlertUsd: number | null; modelConfig: ModelConfig }>) => patch<{ ok: true }>(`/admin/api-keys/${id}`, input),
  value: (id: string) => request<{ key: string }>(`/admin/api-keys/${id}/value`),
  test: (id: string) => post<{ ok: true; ms: number }>(`/admin/api-keys/${id}/test`),
  sharing: () => request<Sharing>('/admin/api-keys/sharing'),
  setDefaults: (input: { allowAll?: boolean; defaultKeyId?: string | null }) => put<{ ok: true }>('/admin/api-keys/sharing/defaults', input),
  setSharing: (input: { scanIds: string[]; rule?: KeyRule; keyId?: string | null }) => put<{ updated: number }>('/admin/api-keys/sharing', input),
  spend: (from?: string, to?: string) => request<SpendReport>(`/admin/api-keys/spend?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`),
  status: (scanId?: string) => request<KeyStatus>(`/api-key/status${withScan(scanId)}`),
  scanInfo: (scanId?: string) => request<ScanKeyInfo>(`/api-key${withScan(scanId)}`),
  setOwn: (key: string, scanId?: string) => put<{ ok: true; last4: string }>('/api-key/own', { key, scanId }),
  removeOwn: (scanId?: string) => del<{ ok: true }>(`/api-key/own${withScan(scanId)}`),
  setChoice: (choice: 'own' | 'admin', scanId?: string) => put<{ ok: true }>('/api-key/choice', { choice, scanId }),
  setModels: (config: ModelConfig, scanId?: string) => put<{ ok: true }>('/api-key/preset', { ...config, scanId }),
}

export const emailApi = {
  smtp: () => request<SmtpInfo>('/settings/email'),
  saveSmtp: (input: SmtpInput) => put<{ ok: true }>('/settings/email', input),
  testSmtp: (input: SmtpInput & { to?: string }) => post<{ ok: true; to: string }>('/settings/email/test', input),
  templates: () => request<EmailTemplate[]>('/admin/email-templates'),
  saveTemplate: (key: string, input: { subject: string; html: string; text: string; active: boolean }) => put<{ ok: true }>(`/admin/email-templates/${key}`, input),
  restoreTemplate: (key: string) => post<{ ok: true }>(`/admin/email-templates/${key}/restore`),
  preview: (input: { subject: string; html: string; text: string }) => post<{ subject: string; html: string; text: string }>('/admin/email-templates/preview', input),
  recovery: () => request<RecoveryRules>('/admin/password-recovery'),
  setRecovery: (input: { default?: 'allow' | 'block'; scanIds?: string[]; rule?: KeyRule }) => put<{ ok: true }>('/admin/password-recovery', input),
  forgot: (email: string) => post<{ ok: true; message: string }>('/auth/forgot', { email }),
  reset: (token: string, password: string) => post<{ ok: true }>('/auth/reset', { token, password }),
}
