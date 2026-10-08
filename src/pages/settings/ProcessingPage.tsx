import { useState } from 'react'
import { useAuth } from '../../auth/authCtx'
import { useJobs } from '../../components/jobsContext'
import { Button, Card, EmptyState, Notice, Spinner, Stat } from '../../components/ui'
import { num } from '../../lib/format'
import { usePolling } from '../../lib/hooks'
import { workflowsApi } from '../../workflowsApi'
import { SettingsLayout } from './SettingsLayout'

export function ProcessingPage() {
  const { me } = useAuth()
  const { toast } = useJobs()
  const info = usePolling(workflowsApi.processing, 0, [])
  const [value, setValue] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const sys = me?.role === 'system_admin'
  const d = info.data
  const current = value ?? d?.workerConcurrency ?? 5

  const save = async () => {
    setBusy(true)
    try {
      await workflowsApi.setProcessing(current)
      toast('done', `Workers simultâneos: ${current}. Vale na hora, sem reiniciar.`)
      setValue(null)
      await info.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsLayout active="processing">
      <div>
        <h1 className="text-2xl font-semibold">Processamento</h1>
        <p className="text-sm text-slate-500">Todos os workflows entram numa fila única. Correções de área e edições de texto passam na frente.</p>
      </div>
      {info.error && <Notice tone="failed">{info.error}</Notice>}
      {!d ? (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Rodando agora" value={num(d.queue.active)} />
            <Stat label="Na fila" value={num(d.queue.waiting)} />
            <Stat label="Esperando nova tentativa" value={num(d.queue.delayed)} />
          </div>
          <Card className="space-y-3 p-4">
            <label htmlFor="workers" className="flex items-center justify-between font-semibold">
              Workers simultâneos <span className="text-2xl tabular-nums text-brand">{current}</span>
            </label>
            <input
              id="workers"
              type="range"
              min={d.min}
              max={d.max}
              value={current}
              disabled={!sys}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>{d.min}</span>
              <span>padrão 5</span>
              <span>{d.max}</span>
            </div>
            <p className="text-sm text-slate-500">
              Cada worker processa um capítulo por vez. Mais workers terminam antes, mas usam mais CPU e memória do servidor (o detector e o LaMa rodam na CPU) e mais chamadas simultâneas à API.
            </p>
            {sys ? (
              <Button variant="primary" onClick={save} disabled={busy || value === null || value === d.workerConcurrency}>
                {busy ? <Spinner /> : 'Salvar'}
              </Button>
            ) : (
              <p className="text-xs text-slate-500">Só o Admin do sistema altera.</p>
            )}
          </Card>
        </>
      )}
    </SettingsLayout>
  )
}
