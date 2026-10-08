import { useState } from 'react'
import { storageApi, type StorageInput } from '../../adminApi'
import { useJobs } from '../../components/jobsContext'
import { PasswordField } from '../../components/password'
import { Badge, Button, Card, EmptyState, Field, inputClass, Notice, Spinner, Stat } from '../../components/ui'
import { num } from '../../lib/format'
import { usePolling } from '../../lib/hooks'
import { SettingsLayout } from './SettingsLayout'

const LABEL = { local: 'Local', azure: 'Azure Blob Storage', s3: 'S3' } as const
const gb = (b: number) => `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`

export function StoragePage() {
  const { toast } = useJobs()
  const info = usePolling(storageApi.get, 0, [])
  const [form, setForm] = useState<StorageInput>({ kind: 'local', root: './storage' })
  const [tested, setTested] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<StorageInput>) => {
    setForm((f) => ({ ...f, ...patch }))
    setTested(null)
  }
  const test = async () => {
    setBusy(true)
    try {
      const r = await storageApi.test(form)
      setTested(`Conexão OK: arquivo de teste gravado, lido e apagado em ${r.ms} ms.`)
    } catch (err) {
      setTested(null)
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    setBusy(true)
    try {
      await storageApi.save(form)
      toast('done', 'Armazenamento salvo.')
      void info.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const d = info.data
  const sameKind = d?.active.kind === form.kind
  const hasFiles = (d?.stats.files ?? 0) > 0

  return (
    <SettingsLayout active="storage">
      <div>
        <h1 className="text-2xl font-semibold">Armazenamento</h1>
        <p className="text-sm text-slate-500">Todas as imagens ficam num único lugar. Para trocar, configure o novo, teste e migre.</p>
      </div>
      {info.error && <Notice tone="failed">{info.error}</Notice>}
      {!d ? (
        <EmptyState><Spinner /> Carregando…</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Ativo" value={LABEL[d.active.kind]} sub={d.active.kind === 'local' ? d.active.root : d.active.kind === 'azure' ? d.active.container : d.active.bucket} />
          <Stat label="Arquivos" value={num(d.stats.files)} sub={`configurado pelo ${d.source === 'tela' ? 'sistema (tela)' : 'arquivo .env'}`} />
          <Stat label="Espaço" value={gb(d.stats.bytes)} />
        </div>
      )}
      {d?.migration && (
        <Notice tone={d.migration.status === 'failed' ? 'failed' : 'neutral'}>
          Migração para {LABEL[d.migration.to as keyof typeof LABEL] ?? d.migration.to}: {d.migration.status === 'done' ? 'concluída' : d.migration.status === 'failed' ? 'com falhas' : 'em andamento'} · {num(d.migration.done)} de {num(d.migration.total)} arquivos
          {d.migration.failed ? ` · ${d.migration.failed} falharam` : ''}
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Provider">
        {(['local', 'azure', 's3'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={form.kind === k}
            onClick={() => set({ kind: k })}
            className={`rounded-xl border-2 p-3 text-left ${form.kind === k ? 'border-brand' : 'border-slate-200 dark:border-slate-800'}`}
          >
            <b>{LABEL[k]}</b>
            <div className="text-xs text-slate-500">{k === 'local' ? 'Pasta no servidor' : k === 'azure' ? 'Container na sua conta Azure' : 'Bucket na AWS ou compatível (Railway, R2, MinIO)'}</div>
            {d?.active.kind === k && <Badge tone="done">ativo</Badge>}
          </button>
        ))}
      </div>
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Configurar {LABEL[form.kind]}</h2>
        {form.kind === 'local' && <Field label="Pasta"><input className={inputClass} value={form.root ?? ''} onChange={(e) => set({ root: e.target.value })} /></Field>}
        {form.kind === 'azure' && (
          <>
            <div className="space-y-1">
              <label htmlFor="az-cs" className="text-sm font-medium">Connection string {d?.active.connectionString && <span className="text-xs text-slate-500">(salva: {d.active.connectionString}; deixe em branco para manter)</span>}</label>
              <PasswordField id="az-cs" value={form.connectionString ?? ''} onChange={(v) => set({ connectionString: v })} placeholder="DefaultEndpointsProtocol=https;AccountName=…" />
            </div>
            <Field label="Container"><input className={inputClass} value={form.container ?? ''} onChange={(e) => set({ container: e.target.value })} placeholder="manhwa-translate" /></Field>
          </>
        )}
        {form.kind === 's3' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Região"><input className={inputClass} value={form.region ?? ''} onChange={(e) => set({ region: e.target.value })} placeholder="us-east-1 ou auto" /></Field>
            <Field label="Bucket"><input className={inputClass} value={form.bucket ?? ''} onChange={(e) => set({ bucket: e.target.value })} /></Field>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="s3-ep" className="text-sm font-medium">Endpoint {d?.active.endpoint && <span className="text-xs text-slate-500">(salvo: {d.active.endpoint}; deixe em branco para manter)</span>}</label>
              <input id="s3-ep" className={inputClass} value={form.endpoint ?? ''} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://t3.storageapi.dev" />
              <p className="text-xs text-slate-500">Deixe em branco na AWS. Preencha nos serviços compatíveis com S3, como Railway, Cloudflare R2 e MinIO; nesses a região costuma ser auto.</p>
            </div>
            <div className="space-y-1"><label htmlFor="s3-ak" className="text-sm font-medium">Access key</label><PasswordField id="s3-ak" value={form.accessKeyId ?? ''} onChange={(v) => set({ accessKeyId: v })} /></div>
            <div className="space-y-1"><label htmlFor="s3-sk" className="text-sm font-medium">Secret key</label><PasswordField id="s3-sk" value={form.secretAccessKey ?? ''} onChange={(v) => set({ secretAccessKey: v })} /></div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={test} disabled={busy}>{busy ? <Spinner /> : 'Testar conexão'}</Button>
          <Button variant="primary" onClick={save} disabled={busy || !tested || (!sameKind && hasFiles)} title={!sameKind && hasFiles ? 'Já há arquivos: para trocar de provider, migre' : ''}>Salvar</Button>
          {tested && <span className="text-sm text-done">{tested}</span>}
        </div>
        <p className="text-xs text-slate-500">As credenciais ficam criptografadas com o SETTINGS_SECRET do .env e não aparecem de novo nesta tela.</p>
      </Card>
      {!sameKind && hasFiles && (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">Migrar para {LABEL[form.kind]}</h2>
          <p className="text-sm">Copia os {num(d?.stats.files ?? 0)} arquivos e confere cada um. O sistema continua lendo do provider atual até a cópia terminar; só então o novo vira o ativo. Os arquivos atuais não são apagados.</p>
          <p className="text-sm text-slate-500">
            Por enquanto a migração roda pelo comando <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run storage:migrate -- --to {form.kind}</code> no servidor; o botão pela fila chega com os workflows.
          </p>
        </Card>
      )}
    </SettingsLayout>
  )
}
