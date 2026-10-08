import type { ReactNode } from 'react'
import { useAuth } from '../../auth/authCtx'
import { cx } from '../../lib/cx'
import { href } from '../../lib/hooks'
import type { ScanChoice } from './scanChoice'

const MINE = [
  { key: 'users', label: 'Usuários' },
  { key: 'teams', label: 'Times' },
  { key: 'features', label: 'Funcionalidades' },
  { key: 'api-key', label: 'API key' },
]

const SYSTEM = [
  { key: 'scans', label: 'Scans' },
  { key: 'profiles', label: 'Perfis' },
  { key: 'storage', label: 'Armazenamento' },
  { key: 'processing', label: 'Processamento' },
  { key: 'api-keys', label: 'API keys' },
  { key: 'email', label: 'E-mail' },
  { key: 'fonts', label: 'Fontes' },
  { key: 'audit', label: 'Auditoria' },
  { key: 'deletions', label: 'Exclusões' },
]

export function SettingsLayout({ active, children }: { active: string; children: ReactNode }) {
  const { me } = useAuth()
  const sys = me?.role === 'system_admin'
  const link = (k: string, label: string) => (
    <a
      key={k}
      href={href('settings', k)}
      className={cx(
        'rounded-md px-3 py-1.5 text-sm font-medium',
        active === k ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {label}
    </a>
  )
  return (
    <div className="grid items-start gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto md:sticky md:top-20 md:flex-col" aria-label="Configurações">
        <span className="hidden px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:block">{sys ? 'Scans' : 'Minha scan'}</span>
        {MINE.map((m) => link(m.key, m.label))}
        {!sys && link('scan', 'Minha scan')}
        {sys && <span className="hidden px-3 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:block">Sistema</span>}
        {sys && SYSTEM.map((m) => link(m.key, m.label))}
      </nav>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  )
}

export function ScanPicker({ choice }: { choice: ScanChoice }) {
  if (!choice.needsChoice) return null
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Scan</span>
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
        value={choice.scanId ?? ''}
        onChange={(e) => choice.setScanId(e.target.value)}
      >
        {!choice.scans.length && <option value="">Nenhuma scan criada</option>}
        {choice.scans.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (desativada)'}</option>
        ))}
      </select>
    </label>
  )
}
