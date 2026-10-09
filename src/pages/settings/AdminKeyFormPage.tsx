import { useState } from 'react'
import { api } from '../../api'
import { useJobs } from '../../components/jobsContext'
import { ModelConfigPicker } from '../../components/ModelConfigPicker'
import { PasswordField } from '../../components/password'
import { Button, Card, EmptyState, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { href, navigate, usePolling } from '../../lib/hooks'
import { keysApi, type AdminKey, type ModelConfig } from '../../keysApi'
import { SettingsLayout } from './SettingsLayout'

const backToList = () => {
  navigate(href('settings', 'api-keys'))
}

export function AdminKeyFormPage({ keyId }: { keyId: string }) {
  const isNew = keyId === 'new'
  const list = usePolling(() => (isNew ? Promise.resolve([] as AdminKey[]) : keysApi.list()), 0, [keyId])
  const keyRow = isNew ? null : (list.data?.find((k) => k.id === keyId) ?? null)

  return (
    <SettingsLayout active="api-keys">
      <div>
        <a href={href('settings', 'api-keys')} className="text-sm text-slate-500 hover:text-brand">← API keys</a>
        <h1 className="text-2xl font-semibold">{isNew ? 'Adicionar chave' : keyRow ? `Editar "${keyRow.name}"` : 'Editar chave'}</h1>
      </div>
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      {!isNew && !list.data && !list.error && <EmptyState><Spinner /> Carregando…</EmptyState>}
      {!isNew && list.data && !keyRow && <Notice tone="failed">Chave não encontrada.</Notice>}
      {(isNew || keyRow) && <KeyForm key={keyRow?.id ?? 'new'} keyRow={keyRow} />}
    </SettingsLayout>
  )
}

function KeyForm({ keyRow }: { keyRow: AdminKey | null }) {
  const { toast } = useJobs()
  const [name, setName] = useState(keyRow?.name ?? '')
  const [key, setKey] = useState('')
  const [alert, setAlert] = useState(keyRow?.monthlyAlertUsd ? String(keyRow.monthlyAlertUsd) : '')
  const [modelConfig, setModelConfig] = useState<ModelConfig>(keyRow?.modelConfig ?? { preset: 'balanced' })
  const available = usePolling(api.models, 0, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const monthlyAlertUsd = alert.trim() ? Number(alert.replace(',', '.')) : null
      if (keyRow) await keysApi.update(keyRow.id, { name, monthlyAlertUsd, modelConfig })
      else await keysApi.create({ name, key: key.trim(), monthlyAlertUsd, modelConfig })
      toast('done', keyRow ? 'Chave atualizada.' : 'Chave conferida com a Anthropic e cadastrada.')
      backToList()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="grid gap-4 p-4 md:grid-cols-2">
        <Field label="Nome" hint="Para você reconhecer no relatório (ex.: Conta principal).">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {keyRow ? (
          <div className="space-y-1 text-sm">
            <div className="font-medium">Chave</div>
            <div className="font-mono">sk-ant-…{keyRow.last4}</div>
            <p className="text-xs text-slate-500">O valor não pode ser alterado depois de cadastrado. Para usar outro valor, cadastre uma chave nova.</p>
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="adm-key" className="text-sm font-medium">Chave</label>
            <PasswordField id="adm-key" value={key} onChange={setKey} placeholder="sk-ant-..." autoComplete="off" />
            <p className="text-xs text-slate-500">Antes de salvar, a chave é conferida com a Anthropic.</p>
          </div>
        )}
        <Field label="Alerta de gasto no mês (US$)" hint="Opcional. Ao passar, você recebe um aviso e um e-mail (uma vez por mês).">
          <input className={inputClass} inputMode="decimal" value={alert} onChange={(e) => setAlert(e.target.value)} placeholder="ex.: 50" />
        </Field>
      </Card>
      <Card className="space-y-3 p-4">
        <div>
          <h2 className="font-semibold">Modelos de OCR e tradução</h2>
          <p className="text-sm text-slate-500">Valem para todas as scans que usam esta chave. Quem usa chave própria escolhe os modelos na tela da scan.</p>
        </div>
        <ModelConfigPicker value={modelConfig} onChange={setModelConfig} models={(available.data?.models ?? []).map((m) => m.id)} />
      </Card>
      {error && <Notice tone="failed">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={backToList}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || (!keyRow && !key.trim())}>
          {busy ? <Spinner /> : keyRow ? 'Salvar' : 'Testar e salvar'}
        </Button>
      </div>
    </form>
  )
}
