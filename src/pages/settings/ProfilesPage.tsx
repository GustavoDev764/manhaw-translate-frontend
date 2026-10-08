import { useState } from 'react'
import { adminApi, type ProfileRow } from '../../adminApi'
import { useJobs } from '../../components/jobsContext'
import { Badge, Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { usePolling } from '../../lib/hooks'
import { SettingsLayout } from './SettingsLayout'

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-block h-5 w-9 rounded-full transition ${checked ? 'bg-done' : 'bg-slate-300 dark:bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export function ProfilesPage() {
  const { toast } = useJobs()
  const data = usePolling(adminApi.profiles, 0, [])
  const [rows, setRows] = useState<ProfileRow[] | null>(null)
  const current = rows ?? data.data
  const set = (key: string, role: 'scan_admin' | 'redator', v: boolean) =>
    setRows((current ?? []).map((r) => (r.key === key ? { ...r, [role]: v } : r)))
  const save = async () => {
    if (!current) return
    try {
      await adminApi.saveProfiles(current.map((r) => ({ key: r.key, scan_admin: r.scan_admin, redator: r.redator })))
      toast('done', 'Perfis salvos. Valem no próximo pedido de cada usuário, em todas as scans.')
      setRows(null)
      void data.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <SettingsLayout active="profiles">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold">Perfis</h1>
          <p className="text-sm text-slate-500">Defina o que cada perfil pode usar em todas as scans. Admin da scan e Redator podem ter as mesmas funcionalidades ou não. Depois vêm o teto de cada scan e as exceções que o Admin da scan faz.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setRows((current ?? []).map((r) => ({ ...r, redator: r.scan_admin })))}>Igualar Redator ao Admin da scan</Button>
          <Button variant="primary" onClick={save} disabled={!rows}>Salvar</Button>
        </div>
      </div>
      {data.error && <Notice tone="failed">{data.error}</Notice>}
      <Card className="overflow-hidden">
        {!current ? (
          <EmptyState><Spinner /> Carregando…</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              <tr><th className="px-4 py-2">Funcionalidade</th><th className="px-4 py-2">Admin da scan</th><th className="px-4 py-2">Redator</th></tr>
            </thead>
            <tbody>
              {current.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2"><b>{r.name}</b>{r.key === 'glossary_edit' && <span className="ml-2 text-xs text-slate-500">desligado = só sugerir</span>}</td>
                  <td className="px-4 py-2"><Switch checked={r.scan_admin} onChange={(v) => set(r.key, 'scan_admin', v)} label={`${r.name}: Admin da scan`} /></td>
                  <td className="px-4 py-2"><Switch checked={r.redator} onChange={(v) => set(r.key, 'redator', v)} label={`${r.name}: Redator`} /></td>
                </tr>
              ))}
              <tr className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-2"><b>Gerenciar usuários, times e exceções da própria scan</b></td><td className="px-4 py-2"><Badge tone="done">sempre</Badge></td><td className="px-4 py-2"><Badge>nunca</Badge></td></tr>
            </tbody>
          </table>
        )}
      </Card>
      {rows && <Notice tone="queued">Há mudanças não salvas.</Notice>}
    </SettingsLayout>
  )
}
