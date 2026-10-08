import { useState } from 'react'
import { authApi, ROLE_LABEL } from '../adminApi'
import { useAuth } from '../auth/authCtx'
import { useJobs } from '../components/jobsContext'
import { PasswordField, PasswordGenerator } from '../components/password'
import { Badge, Button, Card, Field, inputClass, Notice } from '../components/ui'
import { ago } from '../lib/format'
import { usePolling } from '../lib/hooks'

export function ProfilePage() {
  const { me, refresh } = useAuth()
  const { toast } = useJobs()
  const [name, setName] = useState(me?.name ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [show, setShow] = useState(false)
  const sessions = usePolling(authApi.sessions, 0, [])
  if (!me) return null

  const saveName = async () => {
    try {
      await authApi.updateMe(name)
      await refresh()
      toast('done', 'Nome salvo.')
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  const savePassword = async () => {
    if (next !== repeat) return toast('failed', 'As senhas não são iguais.')
    try {
      await authApi.changePassword(current, next)
      setCurrent('')
      setNext('')
      setRepeat('')
      await refresh()
      toast('done', 'Senha trocada. As outras sessões foram encerradas.')
      void sessions.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  const end = async (id: string | 'others') => {
    await authApi.endSession(id)
    void sessions.reload()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Meu perfil</h1>
      {me.mustChangePassword && <Notice tone="queued">Sua senha foi criada por um administrador. Troque por uma sua antes de continuar.</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Dados</h2>
          <Field label="Nome">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input className={inputClass} value={me.email} disabled />
          </Field>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Perfil e scan:</span>
            <Badge tone="brand">{ROLE_LABEL[me.role]}</Badge>
            <Badge>{me.scan?.name ?? 'Todas as scans'}</Badge>
          </div>
          <Button variant="primary" onClick={saveName} disabled={!name.trim() || name === me.name}>Salvar</Button>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Trocar senha</h2>
          <div className="space-y-1">
            <label htmlFor="pw-cur" className="text-sm font-medium">Senha atual</label>
            <PasswordField id="pw-cur" value={current} onChange={setCurrent} autoComplete="current-password" />
          </div>
          <div className="space-y-1">
            <label htmlFor="pw-new" className="text-sm font-medium">Nova senha (5 a 50 caracteres)</label>
            <PasswordField id="pw-new" value={next} onChange={setNext} visible={show} onVisibleChange={setShow} />
          </div>
          <PasswordGenerator value={next} onGenerate={(pw) => { setNext(pw); setRepeat(pw); setShow(true) }} />
          <div className="space-y-1">
            <label htmlFor="pw-rep" className="text-sm font-medium">Repita a nova senha</label>
            <PasswordField id="pw-rep" value={repeat} onChange={setRepeat} visible={show} onVisibleChange={setShow} />
            {repeat && <p className={next === repeat ? 'text-xs text-done' : 'text-xs text-failed'}>{next === repeat ? 'As senhas são iguais.' : 'As senhas não são iguais.'}</p>}
          </div>
          <Button variant="primary" onClick={savePassword} disabled={!current || next.length < 5 || next !== repeat}>Trocar senha</Button>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">Sessões abertas</h2>
          <Button size="sm" onClick={() => end('others')}>Encerrar as outras</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              <tr><th className="px-4 py-2">Navegador</th><th className="px-4 py-2">IP</th><th className="px-4 py-2">Último acesso</th><th /></tr>
            </thead>
            <tbody>
              {(sessions.data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">{(s.userAgent ?? 'desconhecido').slice(0, 60)} {s.current && <Badge tone="done">esta sessão</Badge>}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.ip ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{ago(s.lastSeenAt)}</td>
                  <td className="px-4 py-2 text-right">{!s.current && <Button size="sm" onClick={() => end(s.id)}>Encerrar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
