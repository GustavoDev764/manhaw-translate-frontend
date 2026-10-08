import { useState } from 'react'
import { PasswordField, PasswordGenerator } from '../components/password'
import { Button, Notice, Spinner } from '../components/ui'
import { emailApi } from '../keysApi'

export function ResetPasswordPage({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await emailApi.reset(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-8" />
          <h1 className="text-xl font-semibold">Nova senha</h1>
        </div>
        {done ? (
          <>
            <Notice tone="neutral">Senha alterada. As outras sessões foram encerradas.</Notice>
            <a href="#/">
              <Button variant="primary" className="w-full">Entrar</Button>
            </a>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="reset-pass" className="text-sm font-medium">Nova senha</label>
              <PasswordField id="reset-pass" value={password} onChange={setPassword} visible={visible} onVisibleChange={setVisible} />
            </div>
            <PasswordGenerator
              value={password}
              onGenerate={(p) => {
                setPassword(p)
                setVisible(true)
              }}
            />
            {error && <p className="text-sm text-failed">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy || password.length < 5}>
              {busy ? <Spinner /> : 'Salvar nova senha'}
            </Button>
          </>
        )}
      </form>
    </div>
  )
}
