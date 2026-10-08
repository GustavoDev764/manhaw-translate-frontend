import { useState } from 'react'
import { adminApi, type FeatureKey, type ProfileRow, type ScanRow } from '../../adminApi'
import { useJobs } from '../../components/jobsContext'
import { RenameScanDialog } from '../../components/RenameScanDialog'
import { PasswordField, PasswordGenerator } from '../../components/password'
import { generatePassword } from '../../lib/password'
import { Badge, Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { Pagination } from '../../components/Pagination'
import { useDebounced, usePolling } from '../../lib/hooks'
import { SettingsLayout } from './SettingsLayout'

export function ScansPage() {
  const { toast } = useJobs()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebounced(query.trim())
  const scans = usePolling(() => adminApi.scanPage(page, search), 0, [page, search])
  const catalog = usePolling(adminApi.profiles, 0, [])
  const [creating, setCreating] = useState(false)
  const [ceilingOf, setCeilingOf] = useState<ScanRow | null>(null)
  const [renaming, setRenaming] = useState<ScanRow | null>(null)

  const toggle = async (s: ScanRow) => {
    try {
      await adminApi.updateScan(s.id, { active: !s.active })
      toast('done', s.active ? `${s.name} desativada: os usuários dela não entram mais.` : `${s.name} reativada.`)
      void scans.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  const name = (k: FeatureKey) => catalog.data?.find((f) => f.key === k)?.name ?? k

  return (
    <SettingsLayout active="scans">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scans</h1>
          <p className="text-sm text-slate-500">Cada scan é um cliente, com os próprios usuários, séries e custos. Uma scan não vê nada de outra.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>+ Scan</Button>
      </div>
      <input className={`${inputClass} max-w-sm`} type="search" aria-label="Buscar scan pelo nome" placeholder="Buscar scan pelo nome…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
      {scans.error && <Notice tone="failed">{scans.error}</Notice>}
      <Card className="overflow-hidden">
        {!scans.data ? (
          <EmptyState><Spinner /> Carregando…</EmptyState>
        ) : !scans.data.rows.length ? (
          <EmptyState>{search ? `Nenhuma scan encontrada para “${search}”.` : 'Nenhuma scan ainda. Crie a primeira com “+ Scan”.'}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr><th className="px-4 py-2">Scan</th><th className="px-4 py-2">Admins da scan</th><th className="px-4 py-2">Usuários</th><th className="px-4 py-2">Séries</th><th className="px-4 py-2">Teto</th><th className="px-4 py-2">Situação</th><th /></tr>
              </thead>
              <tbody>
                {scans.data.rows.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2"><b>{s.name}</b><div className="text-xs text-slate-500">{s.slug}</div></td>
                    <td className="px-4 py-2">{s.admins.join(', ') || '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{s.users}</td>
                    <td className="px-4 py-2 tabular-nums">{s.series}</td>
                    <td className="px-4 py-2 text-xs">{s.blockedFeatures.length ? `tudo menos ${s.blockedFeatures.map(name).join(', ')}` : 'tudo'}</td>
                    <td className="px-4 py-2">{s.active ? <Badge tone="done">ativa</Badge> : <Badge tone="failed">desativada</Badge>}</td>
                    <td className="px-4 py-2"><div className="flex justify-end gap-1"><Button size="sm" onClick={() => setRenaming(s)}>Renomear</Button><Button size="sm" onClick={() => setCeilingOf(s)}>Funcionalidades</Button><Button size="sm" onClick={() => toggle(s)}>{s.active ? 'Desativar' : 'Reativar'}</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={scans.data.page} pages={scans.data.pages} total={scans.data.total} noun={['scan', 'scans']} onChange={setPage} />
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">Desativar uma scan bloqueia o login de todos os usuários dela. Nada é apagado.</p>
      <CreateScanDialog open={creating} catalog={catalog.data ?? []} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void scans.reload() }} />
      <RenameScanDialog key={renaming?.id} scan={renaming} onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); void scans.reload() }} />
      <CeilingDialog scan={ceilingOf} catalog={catalog.data ?? []} onClose={() => setCeilingOf(null)} onSaved={() => { setCeilingOf(null); void scans.reload() }} />
    </SettingsLayout>
  )
}

function CreateScanDialog({ open, catalog, onClose, onCreated }: { open: boolean; catalog: ProfileRow[]; onClose: () => void; onCreated: () => void }) {
  const { toast } = useJobs()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState(() => generatePassword(16))
  const [show, setShow] = useState(true)
  const [blocked, setBlocked] = useState<FeatureKey[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.createScan({ name, contactEmail: contact || undefined, admin: { name: adminName, email: adminEmail, password }, blockedFeatures: blocked })
      toast('done', `${name} criada. Passe a senha inicial para ${adminName}.`)
      setName(''); setContact(''); setAdminName(''); setAdminEmail(''); setPassword(generatePassword(16)); setBlocked([])
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog wide open={open} onClose={onClose} title="Nova scan" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} disabled={busy || !name.trim() || !adminName.trim() || !adminEmail.trim() || password.length < 5}>{busy ? <Spinner /> : 'Criar scan e Admin da scan'}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome da scan"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lua Nova Scan" /></Field>
          <Field label="E-mail de contato (opcional)"><input className={inputClass} type="email" value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        </div>
        <div>
          <h3 className="font-semibold">Primeiro Admin da scan</h3>
          <p className="text-xs text-slate-500">É ele quem vai cadastrar os outros usuários da scan.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><input className={inputClass} value={adminName} onChange={(e) => setAdminName(e.target.value)} /></Field>
          <Field label="E-mail (login)"><input className={inputClass} type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></Field>
        </div>
        <div className="space-y-1">
          <label htmlFor="scan-admin-pass" className="text-sm font-medium">Senha inicial (5 a 50 caracteres)</label>
          <PasswordField id="scan-admin-pass" value={password} onChange={setPassword} visible={show} onVisibleChange={setShow} />
        </div>
        <PasswordGenerator value={password} onGenerate={(pw) => { setPassword(pw); setShow(true) }} />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Funcionalidades que a scan pode usar (teto)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {catalog.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={!blocked.includes(f.key)} onChange={(e) => setBlocked((b) => (e.target.checked ? b.filter((x) => x !== f.key) : [...b, f.key]))} /> {f.name}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-failed">{error}</p>}
      </div>
    </Dialog>
  )
}

function CeilingDialog({ scan, catalog, onClose, onSaved }: { scan: ScanRow | null; catalog: ProfileRow[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useJobs()
  const [blocked, setBlocked] = useState<FeatureKey[]>([])
  const [key, setKey] = useState<string | null>(null)
  if ((scan?.id ?? null) !== key) {
    setKey(scan?.id ?? null)
    setBlocked(scan?.blockedFeatures ?? [])
  }
  const save = async () => {
    if (!scan) return
    try {
      await adminApi.setCeiling(scan.id, Object.fromEntries(catalog.map((f) => [f.key, !blocked.includes(f.key)])))
      onSaved()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Dialog open={!!scan} onClose={onClose} title={`Teto · ${scan?.name ?? ''}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <p className="mb-3 text-sm text-slate-500">Desmarcado = ninguém da scan pode usar, nem com exceção.</p>
      <div className="space-y-1.5">
        {catalog.map((f) => (
          <label key={f.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!blocked.includes(f.key)} onChange={(e) => setBlocked((b) => (e.target.checked ? b.filter((x) => x !== f.key) : [...b, f.key]))} /> {f.name}
          </label>
        ))}
      </div>
    </Dialog>
  )
}
