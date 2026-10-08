import { useState } from 'react'
import { adminApi, type EffectiveRow, type FeatureRow, type TeamRow, type UserRow } from '../../adminApi'
import { useJobs } from '../../components/jobsContext'
import { Badge, Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { usePolling } from '../../lib/hooks'
import { useScanChoice } from './scanChoice'
import { ScanPicker, SettingsLayout } from './SettingsLayout'

const yes = (v: boolean) => (v ? <Badge tone="done">sim</Badge> : <Badge>não</Badge>)

export function FeaturesPage() {
  const { toast } = useJobs()
  const choice = useScanChoice()
  const features = usePolling(() => (choice.scanId ? adminApi.features(choice.scanId) : Promise.resolve([] as FeatureRow[])), 0, [choice.scanId])
  const teams = usePolling(() => (choice.scanId ? adminApi.teams(choice.scanId) : Promise.resolve([] as TeamRow[])), 0, [choice.scanId])
  const users = usePolling(() => (choice.scanId ? adminApi.users(choice.needsChoice ? choice.scanId : undefined) : Promise.resolve([] as UserRow[])), 0, [choice.scanId])
  const [adding, setAdding] = useState<FeatureRow | null>(null)
  const [seeAs, setSeeAs] = useState('')
  const [effective, setEffective] = useState<EffectiveRow[] | null>(null)
  const scanName = choice.needsChoice ? choice.scans.find((s) => s.id === choice.scanId)?.name : undefined
  const scanUsers = (users.data ?? []).filter((u) => u.role !== 'system_admin')

  const removeRule = async (id: string) => {
    try {
      await adminApi.removeRule(id)
      void features.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  const loadEffective = async (uid: string) => {
    setSeeAs(uid)
    setEffective(uid ? await adminApi.effective(uid) : null)
  }

  return (
    <SettingsLayout active="features">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold">Funcionalidades{scanName ? ` da ${scanName}` : ''}</h1>
          <p className="text-sm text-slate-500">O que cada perfil pode usar é definido pelo Admin do sistema e não muda aqui. Libere ou bloqueie para times e usuários desta scan, dentro do teto. Regra do usuário vence a do time; entre times, bloquear vence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanPicker choice={choice} />
          <select aria-label="Ver como" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950" value={seeAs} onChange={(e) => loadEffective(e.target.value)}>
            <option value="">Ver como…</option>
            {scanUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>
      {effective && (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">{scanUsers.find((u) => u.id === seeAs)?.name} pode usar</h2>
          <div className="flex flex-wrap gap-1.5">
            {effective.map((e) => <Badge key={e.key} tone={e.allowed ? 'done' : 'failed'}>{e.name} · {e.reason}</Badge>)}
          </div>
        </Card>
      )}
      {features.error && <Notice tone="failed">{features.error}</Notice>}
      <Card className="overflow-hidden">
        {!features.data ? (
          <EmptyState><Spinner /> Carregando…</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr><th className="px-4 py-2">Funcionalidade</th><th className="px-4 py-2">Teto da scan</th><th className="px-4 py-2">Perfil Admin da scan</th><th className="px-4 py-2">Perfil Redator</th><th className="px-4 py-2">Exceções (time ou usuário)</th></tr>
              </thead>
              <tbody>
                {features.data.map((f) => (
                  <tr key={f.key} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="px-4 py-2"><b>{f.name}</b><div className="text-xs text-slate-500">{f.description}</div></td>
                    <td className="px-4 py-2">{f.ceiling ? <Badge tone="done">permitido</Badge> : <Badge tone="failed">bloqueado</Badge>}</td>
                    <td className="px-4 py-2" title="Definido pelo Admin do sistema">{yes(f.scan_admin)}</td>
                    <td className="px-4 py-2" title="Definido pelo Admin do sistema">{f.key === 'glossary_edit' && !f.redator ? <Badge tone="queued">só sugerir</Badge> : yes(f.redator)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {f.rules.map((r) => (
                          <span key={r.id} className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-xs ${r.effect === 'allow' ? 'border-done/50' : 'border-failed/50'}`}>
                            <span className={`size-1.5 rounded-full ${r.effect === 'allow' ? 'bg-done' : 'bg-failed'}`} />
                            {r.subjectType === 'team' ? 'time' : 'usuário'} <b>{r.subjectName}</b>: {r.effect === 'allow' ? 'liberar' : 'bloquear'}
                            <button type="button" aria-label="Remover exceção" className="px-1 text-slate-500 hover:text-failed" onClick={() => removeRule(r.id)}>×</button>
                          </span>
                        ))}
                        <Button size="sm" variant="ghost" disabled={!f.ceiling} title={f.ceiling ? '' : 'Bloqueado no teto da scan pelo Admin do sistema'} onClick={() => setAdding(f)}>+ exceção</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">As colunas de perfil só o Admin do sistema muda, na página Perfis. Para ajustar uma pessoa, use também Usuários → Funcionalidades.</p>
      <RuleDialog feature={adding} scanId={choice.needsChoice ? choice.scanId : undefined} teams={teams.data ?? []} users={scanUsers} onClose={() => setAdding(null)} onDone={() => { setAdding(null); void features.reload() }} />
    </SettingsLayout>
  )
}

function RuleDialog({ feature, scanId, teams, users, onClose, onDone }: { feature: FeatureRow | null; scanId?: string; teams: TeamRow[]; users: UserRow[]; onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState('')
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow')
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!feature || !subject) return
    const [type, id] = subject.split(':') as ['team' | 'user', string]
    try {
      await adminApi.addRule({ scanId, featureKey: feature.key, subjectType: type, subjectId: id, effect })
      setSubject('')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Dialog open={!!feature} onClose={onClose} title={`Exceção · ${feature?.name ?? ''}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} disabled={!subject}>Salvar exceção</Button></>}>
      <div className="space-y-3">
        <Field label="Para quem">
          <select className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Escolha um time ou usuário…</option>
            {teams.length > 0 && <optgroup label="Times">{teams.map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}</optgroup>}
            <optgroup label="Usuários">{users.filter((u) => u.active).map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}</optgroup>
          </select>
        </Field>
        <Field label="O que fazer">
          <select className={inputClass} value={effect} onChange={(e) => setEffect(e.target.value as 'allow' | 'deny')}>
            <option value="allow">Liberar</option>
            <option value="deny">Bloquear</option>
          </select>
        </Field>
        {error && <p className="text-sm text-failed">{error}</p>}
      </div>
    </Dialog>
  )
}
