import { api, type SeriesDetail } from '../api'
import { useJobs } from '../components/jobsContext'
import { QueueEntries } from '../components/QueueEntries'
import { Button, Card, EmptyState, Notice, Spinner } from '../components/ui'
import { ago, usd } from '../lib/format'
import { href, usePolling, useTick } from '../lib/hooks'

async function seriesWithQueue(): Promise<SeriesDetail[]> {
  const list = await api.series()
  const details = await Promise.all(list.map((s) => api.seriesDetail(s.slug)))
  return details.filter((d) => d.entries.length)
}

export function QueuePage() {
  const { finishedCount, toast } = useJobs()
  const status = usePolling(api.queue, 5000, [])
  const series = usePolling(seriesWithQueue, 15000, [finishedCount])
  const now = useTick(1000)
  const s = status.data
  const next = s ? Math.max(0, Math.round((new Date(s.nextSync).getTime() - now) / 1000)) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fila de tradução</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {s
              ? s.syncing
                ? 'Consultando a Anthropic…'
                : `Consultado ${ago(s.lastSync)} · próxima consulta em ${next}s. O que terminar é desenhado sozinho.`
              : 'Carregando…'}
          </p>
        </div>
        <Button
          onClick={async () => {
            try {
              await api.syncQueue()
              setTimeout(() => {
                void status.reload()
                void series.reload()
              }, 500)
            } catch (err) {
              toast('failed', err instanceof Error ? err.message : String(err))
            }
          }}
        >
          Consultar agora
        </Button>
      </div>

      {(status.error || s?.error) && <Notice tone="failed">{status.error ?? s?.error}</Notice>}
      {series.error && <Notice tone="failed">{series.error}</Notice>}
      {!series.data && !series.error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}
      {series.data && !series.data.length && (
        <EmptyState>Nada enviado para a fila ainda. Use "Traduzir pela fila" na tela de um manhwa.</EmptyState>
      )}

      {series.data?.map((d) => (
        <Card key={d.slug} className="p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <a href={href('series', d.slug, 'queue')} className="text-lg font-semibold hover:text-brand">
              {d.slug}
            </a>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {usd(d.cost.viaQueue)} gastos pela fila
            </span>
          </div>
          <QueueEntries entries={d.entries} />
        </Card>
      ))}

      {s && s.log.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 dark:text-slate-400">Registro da fila</summary>
          <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs whitespace-pre-wrap text-slate-300">
            {s.log.slice().reverse().join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}
