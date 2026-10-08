import { useEffect, useState } from 'react'
import { useJobs } from '../../components/jobsContext'
import { PasswordField } from '../../components/password'
import { Badge, Button, Card, EmptyState, Field, inputClass, Notice, Spinner, Tabs } from '../../components/ui'
import { usePolling } from '../../lib/hooks'
import { emailApi, type EmailTemplate, type KeyRule, type SmtpInput } from '../../keysApi'
import { SettingsLayout } from './SettingsLayout'

type Tab = 'smtp' | 'templates' | 'recovery'

export function EmailPage() {
  const [tab, setTab] = useState<Tab>('smtp')
  return (
    <SettingsLayout active="email">
      <div>
        <h1 className="text-2xl font-semibold">E-mail</h1>
        <p className="text-sm text-slate-500">Servidor de envio, modelos das mensagens e recuperação de senha.</p>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'smtp', label: 'Servidor (SMTP)' },
          { value: 'templates', label: 'Modelos' },
          { value: 'recovery', label: 'Recuperação de senha' },
        ]}
      />
      {tab === 'smtp' && <SmtpTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'recovery' && <RecoveryTab />}
    </SettingsLayout>
  )
}

function SmtpTab() {
  const { toast } = useJobs()
  const info = usePolling(emailApi.smtp, 0, [])
  const [form, setForm] = useState<SmtpInput | null>(null)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const d = info.data
  const f: SmtpInput = form ?? { host: d?.host ?? '', port: d?.port ?? 587, secure: d?.secure ?? false, user: d?.user ?? '', password: '', from: d?.from ?? '' }
  const set = (patch: Partial<SmtpInput>) => setForm({ ...f, ...patch })
  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name)
    try {
      await fn()
      toast('done', ok)
      await info.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }
  if (!d) return <EmptyState><Spinner /> Carregando…</EmptyState>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone={d.source ? 'done' : 'failed'}>{d.source === 'tela' ? 'configurado por esta tela' : d.source === 'env' ? 'usando o .env' : 'sem SMTP: e-mails ficam na fila'}</Badge>
        <Badge tone="neutral">{d.outbox.pending ?? 0} na fila</Badge>
        <Badge tone="neutral">{d.outbox.sent ?? 0} enviados</Badge>
        {!!d.outbox.failed && <Badge tone="failed">{d.outbox.failed} falharam</Badge>}
      </div>
      {d.lastFailure && <Notice tone="queued">Última falha ({d.lastFailure.to_email}): {d.lastFailure.last_error}</Notice>}
      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Servidor"><input className={inputClass} value={f.host} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.seudominio.com" /></Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Porta"><input className={inputClass} inputMode="numeric" value={f.port} onChange={(e) => set({ port: Number(e.target.value) || 0, secure: Number(e.target.value) === 465 })} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="accent-brand" checked={f.secure} onChange={(e) => set({ secure: e.target.checked })} /> SSL/TLS</label>
        </div>
        <Field label="Usuário"><input className={inputClass} value={f.user} onChange={(e) => set({ user: e.target.value })} autoComplete="off" /></Field>
        <div className="space-y-1">
          <label htmlFor="smtp-pass" className="text-sm font-medium">Senha {d.hasPassword && <span className="text-xs text-slate-500">(salva; em branco mantém)</span>}</label>
          <PasswordField id="smtp-pass" value={f.password} onChange={(v) => set({ password: v })} autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <Field label="Remetente"><input className={inputClass} value={f.from} onChange={(e) => set({ from: e.target.value })} placeholder="Manhwa Translate <nao-responda@seudominio.com>" /></Field>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <Field label="Enviar teste para"><input className={inputClass} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="seu e-mail" /></Field>
          <Button disabled={!!busy || !f.host} onClick={() => run('test', () => emailApi.testSmtp({ ...f, to }), 'Conexão OK: e-mail de teste enviado.')}>{busy === 'test' ? <Spinner /> : 'Testar'}</Button>
          <Button variant="primary" disabled={!!busy || !f.host || !f.from} onClick={() => run('save', () => emailApi.saveSmtp(f), 'SMTP salvo.')}>Salvar</Button>
        </div>
        <p className="text-xs text-slate-500 sm:col-span-2">A senha fica criptografada com o SETTINGS_SECRET do .env.</p>
      </Card>
    </div>
  )
}

function TemplatesTab() {
  const { toast } = useJobs()
  const list = usePolling(emailApi.templates, 0, [])
  const [key, setKey] = useState<string | null>(null)
  const current = list.data?.find((t) => t.key === (key ?? list.data?.[0]?.key))
  if (!list.data) return <EmptyState><Spinner /> Carregando…</EmptyState>
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex gap-1 overflow-x-auto lg:flex-col">
        {list.data.map((t) => (
          <button key={t.key} type="button" onClick={() => setKey(t.key)} className={`rounded-md px-3 py-2 text-left text-sm ${current?.key === t.key ? 'bg-brand/10 font-medium text-brand' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t.name}
            <span className="block text-xs text-slate-500">{!t.active ? 'desativado' : t.customized ? 'personalizado' : 'padrão'}</span>
          </button>
        ))}
      </div>
      {current && <TemplateEditor key={current.key} tpl={current} onSaved={() => list.reload()} toast={toast} />}
    </div>
  )
}

function TemplateEditor({ tpl, onSaved, toast }: { tpl: EmailTemplate; onSaved: () => Promise<void>; toast: (tone: 'done' | 'failed', text: string) => void }) {
  const [subject, setSubject] = useState(tpl.subject)
  const [html, setHtml] = useState(tpl.html)
  const [text, setText] = useState(tpl.text)
  const [active, setActive] = useState(tpl.active)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => emailApi.preview({ subject, html, text }).then(setPreview, () => undefined), 300)
    return () => clearTimeout(t)
  }, [subject, html, text])
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast('done', ok)
      await onSaved()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="space-y-3 p-4">
        <Field label="Assunto"><input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="HTML"><textarea className={`${inputClass} h-64 font-mono text-xs`} value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} /></Field>
        <Field label="Texto simples" hint="Para leitores de e-mail sem HTML."><textarea className={`${inputClass} h-24 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="text-xs text-slate-500">
          Variáveis: {tpl.variables.map((v) => <code key={v} className="mr-1 rounded bg-slate-100 px-1 dark:bg-slate-800">{`{{${v}}}`}</code>)}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} /> Enviar este e-mail</label>
        <div className="flex gap-2">
          <Button variant="primary" disabled={busy} onClick={() => run(() => emailApi.saveTemplate(tpl.key, { subject, html, text, active }), 'Modelo salvo.')}>Salvar</Button>
          <Button variant="ghost" disabled={busy} onClick={() => confirm('Voltar ao texto padrão deste modelo?') && run(() => emailApi.restoreTemplate(tpl.key), 'Modelo restaurado.')}>Restaurar padrão</Button>
        </div>
      </Card>
      <Card className="space-y-2 p-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">Prévia (valores de exemplo)</div>
        <div className="text-sm"><b>Assunto:</b> {preview?.subject}</div>
        <iframe title="Prévia do e-mail" sandbox="" srcDoc={preview?.html ?? ''} className="h-[480px] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800" />
      </Card>
    </div>
  )
}

function RecoveryTab() {
  const { toast } = useJobs()
  const info = usePolling(emailApi.recovery, 0, [])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const d = info.data
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('done', ok)
      setPicked(new Set())
      await info.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  if (!d) return <EmptyState><Spinner /> Carregando…</EmptyState>
  const label: Record<KeyRule, string> = { inherit: `Padrão (${d.default === 'allow' ? 'liberada' : 'bloqueada'})`, allow: 'Liberada', block: 'Bloqueada' }
  return (
    <div className="space-y-3">
      {!d.smtp && <Notice tone="queued">Sem SMTP configurado, ninguém recebe o link de recuperação.</Notice>}
      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <span>Padrão para as scans:</span>
        {(['allow', 'block'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5"><input type="radio" className="accent-brand" checked={d.default === v} onChange={() => run(() => emailApi.setRecovery({ default: v }), 'Padrão salvo.')} /> {v === 'allow' ? 'Liberada' : 'Bloqueada'}</label>
        ))}
        <span className="text-xs text-slate-500">Cada e-mail enviado usa o seu SMTP.</span>
      </Card>
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm text-slate-500">{picked.size ? `${picked.size} selecionadas:` : 'Selecione scans para mudar:'}</span>
        {(['inherit', 'allow', 'block'] as const).map((r) => (
          <Button key={r} size="sm" disabled={!picked.size} onClick={() => run(() => emailApi.setRecovery({ scanIds: [...picked], rule: r }), 'Regras salvas.')}>{r === 'inherit' ? 'Usar padrão' : r === 'allow' ? 'Liberar' : 'Bloquear'}</Button>
        ))}
      </Card>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {d.scans.map((s) => (
          <label key={s.scanId} className="flex items-center gap-3 px-4 py-2 text-sm">
            <input type="checkbox" className="accent-brand" checked={picked.has(s.scanId)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(s.scanId)) n.delete(s.scanId); else n.add(s.scanId); return n })} />
            <span className="flex-1">{s.name}</span>
            <Badge tone={s.rule === 'block' || (s.rule === 'inherit' && d.default === 'block') ? 'pending' : 'done'}>{label[s.rule]}</Badge>
          </label>
        ))}
      </Card>
    </div>
  )
}
