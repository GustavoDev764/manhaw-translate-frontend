import { api } from '../api'
import { useJobs } from '../components/jobsContext'
import { QueueEntries } from '../components/QueueEntries'
import { Badge, Card, EmptyState, Notice, Spinner, Stat, Tabs } from '../components/ui'
import { num, usd } from '../lib/format'
import { href, usePolling } from '../lib/hooks'
import { DownloadTab } from './series/DownloadTab'
import { NotesTab } from './series/NotesTab'
import { TranslateTab } from './series/TranslateTab'

type Tab = 'translate' | 'download' | 'queue' | 'notes'

export function SeriesPage({ slug, tab }: { slug: string; tab: Tab }) {
  const { finishedCount, jobs } = useJobs()
  const running = jobs.filter((j) => j.series === slug && j.status === 'running')
  const { data, error, reload } = usePolling(
    () => api.seriesDetail(slug),
    running.length ? 5000 : 20000,
    [slug, finishedCount, running.length],
  )

  if (error && !data) return <Notice tone="failed">{error}</Notice>
  if (!data) {
    return (
      <EmptyState>
        <Spinner /> Carregando…
      </EmptyState>
    )
  }

  const t = data.chapters.reduce(
    (a, c) => ({
      total: a.total + c.total,
      done: a.done + c.done,
      queued: a.queued + c.queued,
      error: a.error + c.error,
    }),
    { total: 0, done: 0, queued: 0, error: 0 },
  )
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0
  const openEntries = data.entries.filter((e) => !e.collectedAt).length

  return (
    <div className="space-y-5">
      <div>
        <a href={href()} className="text-sm text-slate-500 hover:text-brand dark:text-slate-400">
          ← Manhwas
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold break-all">{data.slug}</h1>
          {running.map((j) => (
            <Badge key={j.id} tone="queued">
              <Spinner className="size-3" /> {j.title}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="No site" value={num(data.site?.chapters ?? 0)} sub="capítulos" />
        <Stat label="Baixados" value={num(data.local.chapters)} sub={`${num(data.local.scanned)} escaneados`} />
        <Stat label="Traduzidos" dot="bg-done" value={`${pct}%`} sub={`${num(t.done)} de ${num(t.total)} lotes`} />
        <Stat label="Na fila" dot="bg-queued" value={num(t.queued)} sub="lotes aguardando" />
        <Stat label="Com erro" dot="bg-failed" value={num(t.error)} sub="tente de novo" />
        <Stat label="Custo até agora" value={usd(data.cost.total)} sub={`${usd(data.cost.viaQueue)} pela fila`} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={(v) => (window.location.hash = href('series', slug, v))}
        tabs={[
          { value: 'translate', label: 'Traduzir' },
          { value: 'download', label: 'Baixar do site' },
          {
            value: 'queue',
            label: openEntries ? `Fila (${openEntries} aguardando)` : 'Fila',
          },
          { value: 'notes', label: 'Leitura e correções' },
        ]}
      />

      {tab === 'translate' && <TranslateTab series={data} />}
      {tab === 'download' && <DownloadTab series={data} onChanged={reload} />}
      {tab === 'notes' && <NotesTab slug={slug} chapters={data.chapters} />}
      {tab === 'queue' && (
        <Card className="p-4">
          <QueueEntries entries={data.entries} />
        </Card>
      )}
    </div>
  )
}
