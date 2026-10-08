import { useState } from 'react'
import { adminApi, ROLE_LABEL, type Role, type ScanRow, type UserFeature, type UserRow } from '../../adminApi'
import { useAuth } from '../../auth/authCtx'
import { useJobs } from '../../components/jobsContext'
import { PasswordField, PasswordGenerator } from '../../components/password'
import { ScanSelect } from '../../components/ScanSelect'
import { generatePassword } from '../../lib/password'
import { Badge, Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { ago } from '../../lib/format'
import { Pagination } from '../../components/Pagination'
import { useDebounced, usePolling } from '../../lib/hooks'
import { useScanChoice } from './scanChoice'
import { ScanPicker, SettingsLayout } from './SettingsLayout'

const roleTone = (r: Role) => (r === 'system_admin' ? 'brand' : r === 'scan_admin' ? 'queued' : 'neutral') as 'brand' | 'queued' | 'neutral'

export function UsersPage() {
  const { me } = useAuth()
  const { toast } = useJobs()
  const choice = useScanChoice()
  const sys = me?.role === 'system_admin'
  const [filterAll, setFilterAll] = useState(true)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebounced(query.trim())
  const list = usePolling(() => adminApi.userPage(page, search, sys && !filterAll ? choice.scanId : undefined), 0, [choice.scanId, filterAll, page, search])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [featuresOf, setFeaturesOf] = useState<UserRow | null>(null)
  const [shownPassword, setShownPassword] = useState<{ name: string; password: string } | null>(null)

  const reset = async (u: UserRow) => {
    try {
      const { password } = await adminApi.resetPassword(u.id)
      setShownPassword({ name: u.name, password })
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  const toggleActive = async (u: UserRow) => {
    try {
      await adminApi.updateUser(u.id, { active: !u.active })
      void list.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <SettingsLayout active="users">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{sys ? 'Usuários' : `Usuários da ${me?.scan?.name ?? 'scan'}`}</h1>
          <p className="text-sm text-slate-500">{sys ? 'Você vê e gerencia os usuários de todas as scans.' : 'Você cadastra e gerencia só os usuários da sua scan.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sys && (
            <>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={filterAll} onChange={(e) => { setFilterAll(e.target.checked); setPage(1) }} /> Todas as scans</label>
              {!filterAll && <ScanPicker choice={{ ...choice, setScanId: (id: string) => { choice.setScanId(id); setPage(1) } }} />}
            </>
          )}
          <Button variant="primary" onClick={() => setCreating(true)}>+ Usuário</Button>
        </div>
      </div>
      <input className={`${inputClass} max-w-sm`} type="search" aria-label="Buscar usuário pelo nome" placeholder="Buscar usuário pelo nome ou e-mail…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      <Card className="overflow-hidden">
        {!list.data ? (
          <EmptyState><Spinner /> Carregando…</EmptyState>
        ) : !list.data.rows.length ? (
          <EmptyState>{search ? `Nenhum usuário encontrado para “${search}”.` : 'Nenhum usuário.'}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2">Nome</th><th className="px-4 py-2">E-mail</th>{sys && <th className="px-4 py-2">Scan</th>}
                  <th className="px-4 py-2">Perfil</th><th className="px-4 py-2">Times</th><th className="px-4 py-2">Último acesso</th><th className="px-4 py-2">Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-medium">{u.name}</td>
                    <td className="px-4 py-2">{u.email}</td>
                    {sys && <td className="px-4 py-2">{u.scan?.name ?? '—'}</td>}
                    <td className="px-4 py-2"><Badge tone={roleTone(u.role)}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className="px-4 py-2 text-xs">{u.teams.map((t) => t.name).join(', ') || '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{ago(u.lastLoginAt)}</td>
                    <td className="px-4 py-2">{!u.active ? <Badge tone="failed">desativado</Badge> : u.locked ? <Badge tone="queued">bloqueado</Badge> : <Badge tone="done">ativo</Badge>}</td>
                    <td className="px-4 py-2">
                      {u.role !== 'system_admin' && u.id !== me?.id && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" onClick={() => setEditing(u)}>Editar</Button>
                          <Button size="sm" onClick={() => setFeaturesOf(u)}>Funcionalidades</Button>
                          <Button size="sm" onClick={() => reset(u)}>Redefinir senha</Button>
                          <Button size="sm" onClick={() => toggleActive(u)}>{u.active ? 'Desativar' : 'Reativar'}</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} noun={['usuário', 'usuários']} onChange={setPage} />
          </div>
        )}
      </Card>
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} sys={sys} scans={choice.scans} defaultScanId={sys && !filterAll ? choice.scanId : undefined} scanName={me?.scan?.name} onCreated={() => { setCreating(false); void list.reload() }} />
      <EditUserDialog user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload() }} />
      <UserFeaturesDialog user={featuresOf} onClose={() => setFeaturesOf(null)} />
      <Dialog open={!!shownPassword} onClose={() => setShownPassword(null)} title="Senha redefinida" footer={<Button variant="primary" onClick={() => setShownPassword(null)}>Pronto</Button>}>
        <p className="text-sm">Nova senha de <b>{shownPassword?.name}</b>. Ela aparece só agora; passe para a pessoa, que vai trocá-la no próximo acesso. As sessões abertas dela foram encerradas.</p>
        <p className="mt-3 select-all rounded-md bg-slate-100 px-3 py-2 font-mono text-lg dark:bg-slate-800">{shownPassword?.password}</p>
      </Dialog>
    </SettingsLayout>
  )
}

function CreateUserDialog({ open, onClose, sys, scans, defaultScanId, scanName, onCreated }: { open: boolean; onClose: () => void; sys: boolean; scans: ScanRow[]; defaultScanId?: string; scanName?: string; onCreated: () => void }) {
  const { toast } = useJobs()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('redator')
  const [picked, setPicked] = useState<string | null>(null)
  const scanId = picked ?? defaultScanId ?? null
  const needsScan = sys && role !== 'system_admin'
  const missingScan = needsScan && !scanId
  const [password, setPassword] = useState(() => generatePassword(16))
  const [show, setShow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.createUser({ name, email, role, password, scanId: needsScan ? scanId! : undefined })
      toast('done', `${name} criado. Passe a senha inicial para a pessoa.`)
      setName(''); setEmail(''); setRole('redator'); setPicked(null); setPassword(generatePassword(16))
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={`Novo usuário${!sys && scanName ? ` · ${scanName}` : ''}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} disabled={busy || !name.trim() || !email.trim() || password.length < 5 || missingScan}>{busy ? <Spinner /> : 'Criar usuário'}</Button></>}>
      <div className="space-y-3">
        <Field label="Nome"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></Field>
        <Field label="E-mail (login)"><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" /></Field>
        <Field label="Perfil">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {sys && <option value="system_admin">{ROLE_LABEL.system_admin}</option>}
            <option value="scan_admin">{ROLE_LABEL.scan_admin}</option>
            <option value="redator">{ROLE_LABEL.redator}</option>
          </select>
        </Field>
        {role === 'system_admin' && <p className="text-xs text-slate-500">Acesso a todas as scans e às configurações do sistema; não pertence a nenhuma scan.</p>}
        {needsScan && (
          <div className="space-y-1">
            <label htmlFor="new-user-scan" className="text-sm font-medium">Scan</label>
            <ScanSelect id="new-user-scan" scans={scans} value={scanId} onChange={setPicked} invalid={missingScan} />
            {missingScan && <p className="text-xs text-failed">{ROLE_LABEL[role]} precisa pertencer a uma scan.</p>}
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="new-user-pass" className="text-sm font-medium">Senha inicial (5 a 50 caracteres)</label>
          <PasswordField id="new-user-pass" value={password} onChange={setPassword} visible={show} onVisibleChange={setShow} />
        </div>
        <PasswordGenerator value={password} onGenerate={(pw) => { setPassword(pw); setShow(true) }} />
        <p className="text-xs text-slate-500">Passe a senha inicial para a pessoa; ela troca no primeiro acesso.</p>
        {error && <p className="text-sm text-failed">{error}</p>}
      </div>
    </Dialog>
  )
}

function EditUserDialog({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('redator')
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  if (user && last !== user.id) {
    setLast(user.id)
    setName(user.name)
    setRole(user.role)
    setError(null)
  }
  const save = async () => {
    if (!user) return
    try {
      await adminApi.updateUser(user.id, { name, role })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Dialog open={!!user} onClose={() => { setLast(null); onClose() }} title={`Editar ${user?.name ?? ''}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} disabled={!name.trim()}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Perfil">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="redator">Redator</option>
            <option value="scan_admin">Admin da scan</option>
          </select>
        </Field>
        {error && <p className="text-sm text-failed">{error}</p>}
      </div>
    </Dialog>
  )
}

function UserFeaturesDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const { toast } = useJobs()
  const data = usePolling(() => (user ? adminApi.userFeatures(user.id) : Promise.resolve([] as UserFeature[])), 0, [user?.id])
  const change = async (f: UserFeature, rule: UserFeature['rule']) => {
    if (!user) return
    try {
      await adminApi.setUserFeatures(user.id, { [f.key]: rule })
      void data.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Dialog wide open={!!user} onClose={onClose} title={<>Funcionalidades de {user?.name} {user && <Badge tone={roleTone(user.role)}>{ROLE_LABEL[user.role]}</Badge>}</>} footer={<Button onClick={onClose}>Fechar</Button>}>
      <p className="mb-3 text-sm text-slate-500">Você libera ou bloqueia só dentro do teto da scan. O que o perfil pode usar é definido pelo Admin do sistema.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2">Funcionalidade</th><th className="py-2">Pelo perfil</th><th className="py-2">Para esta pessoa</th><th className="py-2">Resultado</th></tr></thead>
          <tbody>
            {(data.data ?? []).map((f) => (
              <tr key={f.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 font-medium">{f.name}</td>
                <td className="py-2">{f.byRole ? <Badge tone="done">sim</Badge> : <Badge>não</Badge>}</td>
                <td className="py-2">
                  <select disabled={!f.ceiling} title={f.ceiling ? '' : 'Bloqueado no teto da scan pelo Admin do sistema'} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950" value={f.rule} onChange={(e) => change(f, e.target.value as UserFeature['rule'])}>
                    <option value="inherit">Seguir o perfil</option>
                    <option value="allow">Liberar</option>
                    <option value="deny">Bloquear</option>
                  </select>
                </td>
                <td className="py-2">{f.allowed ? <Badge tone="done">sim · {f.reason}</Badge> : <Badge tone={f.ceiling ? 'neutral' : 'failed'}>não · {f.reason}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  )
}
