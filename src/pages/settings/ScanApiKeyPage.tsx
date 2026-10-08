import { useState } from 'react'
import { api } from '../../api'
import { ModelConfigPicker, ModelSummary } from '../../components/ModelConfigPicker'
import { useJobs } from '../../components/jobsContext'
import { PasswordField } from '../../components/password'
import { Badge, Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { usePolling } from '../../lib/hooks'
import { keysApi, type ModelConfig } from '../../keysApi'
import { API_KEY_EVENT } from '../../lib/workflowEvents'
import { useScanChoice } from './scanChoice'
import { ScanPicker, SettingsLayout } from './SettingsLayout'

export function ScanApiKeyPage() {
  const choice = useScanChoice()
  const { toast } = useJobs()
  const info = usePolling(() => (choice.scanId ? keysApi.scanInfo(choice.scanId) : Promise.resolve(null)), 0, [choice.scanId])
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const d = info.data
  const available = usePolling(api.models, 0, [])
  const [draft, setDraft] = useState<ModelConfig | null>(null)
  const config = draft ?? d?.ownConfig ?? null
  const changed = !!draft && !!d && JSON.stringify(draft) !== JSON.stringify(d.ownConfig)

  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name)
    try {
      await fn()
      toast('done', ok)
      setKey('')
      await info.reload()
      window.dispatchEvent(new Event(API_KEY_EVENT))
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsLayout active="api-key">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">API key da Claude</h1>
          <p className="text-sm text-slate-500">Usada no OCR, na tradução e nas correções com o Claude. Os custos ficam na conta da chave usada.</p>
        </div>
        <ScanPicker choice={choice} />
      </div>
      {info.error && <Notice tone="failed">{info.error}</Notice>}
      {!d ? (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      ) : (
        <>
          {d.effective === 'none' && <Notice tone="failed">A scan está sem chave: OCR e tradução estão pausados. Cadastre uma chave própria{d.adminAllowed ? ' ou use a do administrador' : ''}.</Notice>}
          <div className="grid gap-3 md:grid-cols-2">
            <Card className={`space-y-3 p-4 ${d.effective === 'admin' ? 'border-brand' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Chave do administrador</h2>
                {d.effective === 'admin' && <Badge tone="done">em uso</Badge>}
              </div>
              <p className="text-sm text-slate-500">
                {d.adminAllowed ? 'O administrador do sistema liberou a chave dele para a sua scan. Você não vê a chave; os custos ficam com ele.' : 'O administrador do sistema não liberou a chave dele para a sua scan.'}
              </p>
              {d.adminAllowed && d.choice !== 'admin' && (
                <Button size="sm" disabled={!!busy} onClick={() => run('admin', () => keysApi.setChoice('admin', choice.scanId), 'Usando a chave do administrador.')}>
                  Usar a chave do administrador
                </Button>
              )}
            </Card>
            <Card className={`space-y-3 p-4 ${d.effective === 'own' ? 'border-brand' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Chave própria</h2>
                {d.effective === 'own' && <Badge tone="done">em uso</Badge>}
              </div>
              {d.ownLast4 ? (
                <p className="text-sm">
                  Cadastrada: <span className="font-mono">sk-ant-…{d.ownLast4}</span>
                </p>
              ) : (
                <p className="text-sm text-slate-500">Crie em console.anthropic.com › API keys. A scan tem no máximo uma chave própria.</p>
              )}
              <div className="space-y-1">
                <label htmlFor="own-key" className="text-sm font-medium">
                  {d.ownLast4 ? 'Trocar chave' : 'Colar chave'}
                </label>
                <PasswordField id="own-key" value={key} onChange={setKey} placeholder="sk-ant-..." autoComplete="off" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={!key.trim() || !!busy} onClick={() => run('own', () => keysApi.setOwn(key.trim(), choice.scanId), 'Chave conferida com a Anthropic e salva.')}>
                  {busy === 'own' ? <Spinner /> : 'Testar e salvar'}
                </Button>
                {d.ownLast4 && d.choice !== 'own' && (
                  <Button size="sm" disabled={!!busy} onClick={() => run('use', () => keysApi.setChoice('own', choice.scanId), 'Usando a chave própria.')}>
                    Usar a chave própria
                  </Button>
                )}
                {d.ownLast4 && (
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => confirm('Remover a chave própria da scan?') && run('rm', () => keysApi.removeOwn(choice.scanId), 'Chave própria removida.')}>
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">A chave fica criptografada e não aparece de novo, só os 4 últimos caracteres.</p>
            </Card>
          </div>

          <Card className="space-y-3 p-4" data-testid="models-card">
            <h2 className="font-semibold">Modelos de OCR e tradução</h2>
            {d.modelsFrom === 'admin' ? (
              <>
                <p className="text-sm">
                  A scan usa a chave do administrador{d.adminKeyName ? ` (${d.adminKeyName})` : ''}, então os modelos são os que ele configurou nela:
                </p>
                <ModelSummary models={d.adminModels} />
                <p className="text-xs text-slate-500">Para escolher os modelos, cadastre e use uma chave própria.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">A scan usa a chave própria, então escolhe os modelos. Vale para os próximos workflows de tradução.</p>
                {config && <ModelConfigPicker value={config} onChange={setDraft} models={(available.data?.models ?? []).map((m) => m.id)} disabled={!!busy} />}
                <Button variant="primary" size="sm" disabled={!changed || !!busy} onClick={() => config && run('models', async () => { await keysApi.setModels(config, choice.scanId); setDraft(null) }, 'Modelos salvos.')}>
                  {busy === 'models' ? <Spinner /> : 'Salvar modelos'}
                </Button>
              </>
            )}
          </Card>
        </>
      )}
    </SettingsLayout>
  )
}
