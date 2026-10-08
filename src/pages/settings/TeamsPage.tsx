import { useState } from 'react'
import { adminApi, ROLE_LABEL, type TeamRow, type UserRow } from '../../adminApi'
import { useJobs } from '../../components/jobsContext'
import { UserCombobox } from '../../components/UserCombobox'
import { Badge, Button, Card, Dialog, EmptyState, inputClass, Notice, Spinner } from '../../components/ui'
import { usePolling } from '../../lib/hooks'
import { useScanChoice } from './scanChoice'
import { ScanPicker, SettingsLayout } from './SettingsLayout'

export function TeamsPage() {
  const { toast } = useJobs()
  const choice = useScanChoice()
  const teams = usePolling(() => (choice.scanId ? adminApi.teams(choice.scanId) : Promise.resolve([] as TeamRow[])), 0, [choice.scanId])
  const users = usePolling(() => (choice.scanId ? adminApi.users(choice.needsChoice ? choice.scanId : undefined) : Promise.resolve([] as UserRow[])), 0, [choice.scanId])
  const [modal, setModal] = useState<{ team: TeamRow | null } | null>(null)
  const scanName = choice.needsChoice ? choice.scans.find((s) => s.id === choice.scanId)?.name : undefined
  const scanUsers = (users.data ?? []).filter((u) => u.role !== 'system_admin')

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await teams.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <SettingsLayout active="teams">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Times{scanName ? ` da ${scanName}` : ''}</h1>
          <p className="text-sm text-slate-500">Times agrupam pessoas da mesma scan para liberar ou bloquear funcionalidades de uma vez. Só aparecem pessoas desta scan.</p>
        </div>
        <div className="flex items-center gap-2">
          <ScanPicker choice={choice} />
          <Button variant="primary" onClick={() => setModal({ team: null })} disabled={!choice.scanId}>+ Time</Button>
        </div>
      </div>
      {teams.error && <Notice tone="failed">{teams.error}</Notice>}
      {!teams.data ? (
        <EmptyState><Spinner /> Carregando…</EmptyState>
      ) : !teams.data.length ? (
        <Card><EmptyState>Nenhum time. Crie o primeiro com “+ Time”.</EmptyState></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.data.map((t) => (
            <Card key={t.id} className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{t.name}</h2>
                  <Badge>{t.members.length} {t.members.length === 1 ? 'membro' : 'membros'}</Badge>
                </div>
                <Button size="sm" onClick={() => setModal({ team: t })}>Renomear</Button>
              </div>
              {t.description && <p className="text-sm text-slate-500">{t.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {t.members.length ? (
                  t.members.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 py-0.5 pl-2.5 pr-1 text-xs dark:border-slate-700">
                      <b>{m.name}</b> {ROLE_LABEL[m.role]}
                      <button type="button" aria-label={`Remover ${m.name}`} className="px-1 text-slate-500 hover:text-failed" onClick={() => run(() => adminApi.removeMember(t.id, m.id))}>×</button>
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Sem membros ainda.</span>
                )}
              </div>
              <UserCombobox users={scanUsers} exclude={t.members.map((m) => m.id)} onPick={(uid) => run(() => adminApi.addMember(t.id, uid))} />
              <p className="text-xs text-slate-500">
                Exceções: {t.rules.length ? t.rules.map((r) => `${r.feature}: ${r.effect === 'allow' ? 'liberar' : 'bloquear'}`).join(' · ') : 'nenhuma (crie em Funcionalidades)'}
              </p>
            </Card>
          ))}
        </div>
      )}
      <TeamDialog
        state={modal}
        scanId={choice.needsChoice ? choice.scanId : undefined}
        scanName={scanName}
        users={scanUsers}
        existing={teams.data ?? []}
        onClose={() => setModal(null)}
        onDone={() => { setModal(null); void teams.reload() }}
      />
    </SettingsLayout>
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function TeamDialog({ state, scanId, scanName, users, existing, onClose, onDone }: { state: { team: TeamRow | null } | null; scanId?: string; scanName?: string; users: UserRow[]; existing: TeamRow[]; onClose: () => void; onDone: () => void }) {
  const team = state?.team ?? null
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const openKey = state ? team?.id ?? 'new' : null
  if (openKey !== key) {
    setKey(openKey)
    setName(team?.name ?? '')
    setDesc(team?.description ?? '')
    setMembers([])
    setError(null)
    setConfirmDelete(false)
  }
  const save = async () => {
    const n = name.trim()
    if (!n) return setError('Dê um nome para o time.')
    if (existing.some((t) => t.id !== team?.id && norm(t.name) === norm(n))) return setError(`Já existe um time com esse nome${scanName ? ` na ${scanName}` : ''}.`)
    try {
      if (team) await adminApi.updateTeam(team.id, { name: n, description: desc })
      else await adminApi.createTeam({ name: n, description: desc, memberIds: members, scanId })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const remove = async () => {
    if (!team) return
    try {
      await adminApi.deleteTeam(team.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      title={team ? 'Renomear time' : 'Novo time'}
      footer={
        <>
          {team && <Button variant="ghost" className="mr-auto text-failed" onClick={() => setConfirmDelete(true)}>Excluir time</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>{team ? 'Salvar' : 'Criar time'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{team ? `Os membros e as exceções do time continuam.` : 'Só pessoas desta scan podem entrar.'}</p>
        <div className="space-y-1">
          <div className="flex justify-between"><label htmlFor="team-name" className="text-sm font-medium">Nome do time</label><span className="text-xs tabular-nums text-slate-500">{name.length}/40</span></div>
          <input id="team-name" className={inputClass} maxLength={40} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="Ex.: Revisão, Tradução noturna" autoComplete="off" />
          {error && <p className="text-sm text-failed">{error}</p>}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Descrição (opcional)</span>
          <textarea className={inputClass} maxLength={160} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Para que serve este time" />
        </label>
        {!team && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Membros <Badge>{members.length}</Badge></div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((id) => {
                const u = users.find((x) => x.id === id)
                return (
                  <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 py-0.5 pl-2.5 pr-1 text-xs dark:border-slate-700">
                    <b>{u?.name}</b>
                    <button type="button" aria-label={`Remover ${u?.name}`} className="px-1 text-slate-500" onClick={() => setMembers((m) => m.filter((x) => x !== id))}>×</button>
                  </span>
                )
              })}
            </div>
            <UserCombobox inline users={users} exclude={members} onPick={(id) => setMembers((m) => [...m, id])} />
            <p className="text-xs text-slate-500">Opcional. Também dá para adicionar depois, no cartão do time.</p>
          </div>
        )}
        {confirmDelete && team && (
          <Notice tone="queued">
            <p className="mb-2"><b>Excluir o time “{team.name}”?</b> As pessoas continuam na scan; só saem do time. As exceções ligadas a ele deixam de valer: {team.rules.length ? team.rules.map((r) => r.feature).join(', ') : 'nenhuma'}.</p>
            <div className="flex gap-2"><Button size="sm" variant="danger" onClick={remove}>Excluir time</Button><Button size="sm" onClick={() => setConfirmDelete(false)}>Manter</Button></div>
          </Notice>
        )}
      </div>
    </Dialog>
  )
}
