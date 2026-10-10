import { useState } from 'react'
import { useAuth } from '../../auth/authCtx'
import { useJobs } from '../../components/jobsContext'
import { Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { num } from '../../lib/format'
import { usePolling } from '../../lib/hooks'
import { workflowsApi, type Lane, type LaneInfo, type ServerInfo } from '../../workflowsApi'
import { SettingsLayout } from './SettingsLayout'

const LANE_TEXT: Record<Lane, { title: string; types: string; hint: string }> = {
  light: {
    title: 'Fila leve',
    types: 'Corrigir área e Editar texto',
    hint: 'Ações de uma página só, feitas por quem está revisando. Ficam numa fila própria para nunca esperar atrás de um capítulo inteiro.',
  },
  process: {
    title: 'Fila de processamento',
    types: 'Escanear, Traduzir, Limpar e Desenhar',
    hint: 'O trabalho pesado de CPU (detector, LaMa, desenho). Cada worker processa um capítulo por vez; mais workers terminam antes, mas usam mais CPU e memória.',
  },
  transfer: {
    title: 'Fila de transferência',
    types: 'Baixar, Importar, Exportar e Excluir',
    hint: 'Leitura e escrita de arquivos no armazenamento. Usa pouca CPU, mas muito disco e rede; pode rodar junto com o processamento sem disputar a máquina.',
  },
}

function gb(bytes: number) {
  return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
}

function ServerLine({ s }: { s: ServerInfo }) {
  const parts = [
    s.model ? `${s.model}${s.mhz ? ` · ${(s.mhz / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GHz` : ''}` : null,
    `${num(s.threads)} threads`,
    s.containerCpus ? `limite do container: ${s.containerCpus.toLocaleString('pt-BR')} CPUs` : null,
    `${gb(s.memoryBytes)} de memória${s.memoryLimited ? ' (limite do container)' : ''}`,
    `${num(s.opWorkers)} processos de imagem com o LaMa carregado`,
  ].filter(Boolean)
  return (
    <Card className="p-4 text-sm">
      <span className="block font-semibold">Servidor</span>
      <span className="text-slate-500">{parts.join(' · ')}</span>
    </Card>
  )
}

function LaneCard({ info, sys, onSaved }: { info: LaneInfo; sys: boolean; onSaved: () => Promise<void> }) {
  const { toast } = useJobs()
  const [value, setValue] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const current = value ?? info.concurrency
  const text = LANE_TEXT[info.lane]

  const save = async () => {
    setBusy(true)
    try {
      await workflowsApi.setProcessing(info.lane, current)
      toast('done', `${text.title}: ${current} ${current === 1 ? 'worker' : 'workers'}. Vale na hora, sem reiniciar.`)
      setValue(null)
      await onSaved()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="block font-semibold">{text.title}</span>
          <span className="block text-xs text-slate-500">{text.types}</span>
        </div>
        <span className="text-2xl tabular-nums text-brand">{current}</span>
      </div>
      <div className="flex gap-4 text-xs text-slate-500">
        <span>
          <b className="text-slate-700 dark:text-slate-200">{num(info.queue.active)}</b> rodando
        </span>
        <span>
          <b className="text-slate-700 dark:text-slate-200">{num(info.queue.waiting)}</b> na fila
        </span>
        <span>
          <b className="text-slate-700 dark:text-slate-200">{num(info.queue.delayed)}</b> esperando nova tentativa
        </span>
      </div>
      <input
        aria-label={`Workers da ${text.title.toLowerCase()}`}
        type="range"
        min={info.min}
        max={info.max}
        value={current}
        disabled={!sys}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-brand"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>{info.min}</span>
        <span>padrão {info.default}</span>
        <span>{info.max}</span>
      </div>
      <p className="text-sm text-slate-500">{text.hint}</p>
      {sys && (
        <Button variant="primary" onClick={save} disabled={busy || value === null || value === info.concurrency}>
          {busy ? <Spinner /> : 'Salvar'}
        </Button>
      )}
    </Card>
  )
}

export function ProcessingPage() {
  const { me } = useAuth()
  const { toast } = useJobs()
  const info = usePolling(workflowsApi.processing, 0, [])
  const [busy, setBusy] = useState(false)
  const sys = me?.role === 'system_admin'
  const d = info.data

  const toggleClean = async (on: boolean) => {
    setBusy(true)
    try {
      await workflowsApi.setCleanOnScan(on)
      toast('done', on ? 'As páginas serão limpas logo depois de escanear.' : 'As páginas serão limpas enquanto o capítulo espera a Anthropic.')
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
        <p className="text-sm text-slate-500">Os workflows são divididos em três filas, cada uma com seus próprios workers. Assim um download grande não segura uma correção de página, e o processamento pesado não disputa vaga com as transferências.</p>
      </div>
      {info.error && <Notice tone="failed">{info.error}</Notice>}
      {!d ? (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      ) : (
        <>
          {d.server && <ServerLine s={d.server} />}
          <div className="grid gap-3 lg:grid-cols-3">
            {(d.lanes ?? []).map((l) => (
              <LaneCard key={l.lane} info={l} sys={sys} onSaved={info.reload} />
            ))}
          </div>
          {!sys && <p className="text-xs text-slate-500">Só o Admin do sistema altera.</p>}
          <Card className="space-y-2 p-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 accent-brand" checked={d.cleanOnScan} disabled={!sys || busy} onChange={(e) => toggleClean(e.target.checked)} data-testid="clean-on-scan" />
              <span>
                <span className="block font-semibold">Limpar as páginas logo depois de escanear</span>
                <span className="block text-sm text-slate-500">
                  Por padrão, as páginas são limpas (texto apagado) enquanto o capítulo espera a Anthropic, só quando ele vai ser traduzido. Ligue se a scan sempre traduz tudo o que escaneia: a tradução fica pronta mais rápido, mas o escaneamento usa mais CPU.
                </span>
              </span>
            </label>
          </Card>
        </>
      )}
    </SettingsLayout>
  )
}
