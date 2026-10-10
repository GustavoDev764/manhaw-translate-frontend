import { useState } from 'react'
import { useJobs } from '../../components/jobsContext'
import { Button, Card, inputClass, Spinner } from '../../components/ui'
import { num } from '../../lib/format'
import { usePolling } from '../../lib/hooks'
import { workflowsApi, type GpuStatus } from '../../workflowsApi'

const PLACEHOLDER = 'http://117.18.102.52:20001'

function gb(mb: number | null) {
  return mb === null ? '—' : (mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function StatusLine({ s }: { s: GpuStatus }) {
  if (s.error) return <p className="text-sm text-failed">{s.error}</p>
  const h = s.health
  if (!h) return null
  const w = h.worker
  const waiting = Object.values(h.queues ?? {}).reduce((n, q) => n + q.waiting + q.active, 0)
  const tone = h.status === 'ready' ? 'text-done' : 'text-queued'
  const label = h.status === 'ready' ? 'Conectado' : h.status === 'starting' ? 'Carregando os modelos' : 'Worker fora do ar'
  return (
    <p className="text-sm text-slate-500" data-testid="gpu-status">
      <b className={tone}>● {label}</b>
      {w?.gpu ? ` · ${w.gpu}` : w ? ` · ${w.device}` : ''}
      {w?.vramTotalMb ? ` · ${gb(w.vramUsedMb)} de ${gb(w.vramTotalMb)} GB de VRAM` : ''}
      {` · ${num(waiting)} ${waiting === 1 ? 'job' : 'jobs'} na fila`}
    </p>
  )
}

export function GpuCard({ sys }: { sys: boolean }) {
  const { toast } = useJobs()
  const status = usePolling(workflowsApi.gpu, 10_000, [])
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const s = status.data
  const on = enabled ?? s?.enabled ?? false
  const value = url ?? s?.url ?? ''
  const dirty = !!s && (on !== s.enabled || (on && value.trim().replace(/\/+$/, '') !== s.url))

  const save = async (nextEnabled: boolean) => {
    setBusy(true)
    try {
      const r = await workflowsApi.setGpu({ enabled: nextEnabled, url: value || PLACEHOLDER })
      toast('done', nextEnabled ? `Processamento na GPU ligado${r.health?.worker?.gpu ? ` (${r.health.worker.gpu})` : ''}.` : 'Processamento na GPU desligado: volta a usar a CPU deste servidor.')
      setEnabled(null)
      setUrl(null)
      await status.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (next: boolean) => {
    setEnabled(next)
    if (!next && s?.enabled) void save(false)
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block font-semibold">Processamento na GPU</span>
          <span className="block text-sm text-slate-500">Escanear (detector de balões) e a limpeza com o LaMa rodam no serviço de GPU. Se ele sair do ar, o trabalho volta sozinho para a CPU deste servidor.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Processamento na GPU"
          disabled={!sys || busy || !s}
          onClick={() => toggle(!on)}
          data-testid="gpu-switch"
          className={`relative mt-1 inline-block h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-done' : 'bg-slate-300 dark:bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      {!s && !status.error && (
        <p className="text-sm text-slate-500">
          <Spinner /> Carregando…
        </p>
      )}
      {on && s && (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="gpu-url">
            URL base do serviço
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="gpu-url"
              className={`${inputClass} min-w-64 flex-1`}
              placeholder={PLACEHOLDER}
              value={value}
              disabled={!sys || busy}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="gpu-url"
            />
            {sys && (
              <Button variant="primary" onClick={() => void save(true)} disabled={busy || (!dirty && s.connected)} data-testid="gpu-save">
                {busy ? <Spinner /> : s.enabled && s.connected && !dirty ? 'Conectado' : 'Conectar'}
              </Button>
            )}
          </div>
          {s.enabled && !dirty && <StatusLine s={s} />}
        </div>
      )}
      {!sys && <p className="text-xs text-slate-500">Só o Admin do sistema altera.</p>}
    </Card>
  )
}
