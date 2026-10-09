import { useState } from 'react'
import { authApi } from '../adminApi'
import { emailApi } from '../keysApi'
import { useAuth } from '../auth/authCtx'
import { Logo } from '../components/Logo'
import { PasswordField } from '../components/password'
import { Button, Field, inputClass, Notice, Spinner } from '../components/ui'

export function LoginPage() {
  const { refresh, offline } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (forgot) {
        setSent((await emailApi.forgot(email)).message)
        return
      }
      await authApi.login(email, password)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
        <h1>
          <Logo className="h-9" />
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Entre com o e-mail e a senha que o administrador criou para você.</p>
        {offline && <Notice tone="failed">{offline}</Notice>}
        <Field label="E-mail">
          <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {!forgot && (
          <div className="space-y-1">
            <label htmlFor="login-pass" className="text-sm font-medium">Senha</label>
            <PasswordField id="login-pass" value={password} onChange={setPassword} autoComplete="current-password" />
          </div>
        )}
        {sent && <Notice tone="neutral">{sent}</Notice>}
        {error && <p className="text-sm text-failed">{error}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !email || (!forgot && !password)}>
          {busy ? <Spinner /> : forgot ? 'Enviar link' : 'Entrar'}
        </Button>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-brand"
          onClick={() => {
            setForgot((v) => !v)
            setSent(null)
            setError(null)
          }}
        >
          {forgot ? '← Voltar para entrar' : 'Esqueci minha senha'}
        </button>
        {forgot && <p className="text-xs text-slate-500">Se a recuperação por e-mail não estiver liberada para a sua scan, peça ao admin da scan para redefinir.</p>}
      </form>
    </div>
  )
}
