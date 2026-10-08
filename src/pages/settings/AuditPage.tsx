import { useState } from 'react'
import { adminApi, type AuditRow } from '../../adminApi'
import { Button, Card, EmptyState, inputClass, Notice, Spinner } from '../../components/ui'
import { when } from '../../lib/format'
import { ROLE_LABEL, type Role } from '../../adminApi'

const filterClass = inputClass.replace('w-full', 'w-auto')
import { usePolling } from '../../lib/hooks'
import { SettingsLayout } from './SettingsLayout'

const ACTIONS: Record<string, string> = {
  'auth.login': 'Entrou',
  'auth.login_failed': 'Senha errada',
  'auth.locked': 'Conta bloqueada por tentativas',
  'auth.password_change': 'Trocou a senha',
  'scan.create': 'Scan criada',
  'scan.update': 'Scan alterada',
  'scan.features': 'Teto da scan alterado',
  'profiles.update': 'Perfis alterados',
  'user.create': 'Usuário criado',
  'user.update': 'Usuário alterado',
  'user.reset_password': 'Senha redefinida',
  'team.create': 'Time criado',
  'team.update': 'Time alterado',
  'team.delete': 'Time excluído',
  'team.member_add': 'Membro adicionado ao time',
  'team.member_remove': 'Membro removido do time',
  'feature.rule_set': 'Exceção de funcionalidade',
  'feature.rule_remove': 'Exceção removida',
  'feature.user_rules': 'Funcionalidades do usuário',
}

const short = (v: unknown) => {
  if (v == null) return ''
  const s = JSON.stringify(v)
  return s.length > 140 ? `${s.slice(0, 140)}…` : s
}

export function AuditPage() {
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [extra, setExtra] = useState<AuditRow[]>([])
  const data = usePolling(() => adminApi.audit({ action: action || undefined, q: q || undefined, from: from || undefined, to: to || undefined }), 0, [action, q, from, to])
  const rows = [...(data.data ?? []), ...extra]
  const more = async () => {
    const last = rows.at(-1)
    if (!last) return
    setExtra([...extra, ...(await adminApi.audit({ action: action || undefined, q: q || undefined, from: from || undefined, to: to || undefined, before: last.id }))])
  }
  return (
    <SettingsLayout active="audit">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-slate-500">Quem fez o quê e quando. Os registros não podem ser alterados nem apagados.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select className={filterClass} value={action} onChange={(e) => { setAction(e.target.value); setExtra([]) }} aria-label="Ação">
          <option value="">Todas as ações</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={`${filterClass} min-w-48`} type="search" placeholder="Buscar (id, ação)" value={q} onChange={(e) => { setQ(e.target.value); setExtra([]) }} />
        <input className={filterClass} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setExtra([]) }} aria-label="De" />
        <input className={filterClass} type="date" value={to} onChange={(e) => { setTo(e.target.value); setExtra([]) }} aria-label="Até" />
      </div>
      {data.error && <Notice tone="failed">{data.error}</Notice>}
      <Card className="overflow-hidden">
        {!data.data ? (
          <EmptyState><Spinner /> Carregando…</EmptyState>
        ) : !rows.length ? (
          <EmptyState>Nada encontrado.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr><th className="px-4 py-2">Quando</th><th className="px-4 py-2">Usuário</th><th className="px-4 py-2">Ação</th><th className="px-4 py-2">Antes → depois</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{when(r.at)}</td>
                    <td className="px-4 py-2">{r.user ? <>{r.user.name}{(r.user as { role?: Role }).role === 'system_admin' && <span className="block text-xs text-slate-500">{ROLE_LABEL.system_admin}</span>}</> : 'sistema'}</td>
                    <td className="px-4 py-2">{ACTIONS[r.action] ?? r.action}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {r.before != null && <div>antes: {short(r.before)}</div>}
                      {r.after != null && <div>depois: {short(r.after)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {(data.data?.length ?? 0) >= 100 && <Button onClick={more}>Carregar mais</Button>}
    </SettingsLayout>
  )
}
