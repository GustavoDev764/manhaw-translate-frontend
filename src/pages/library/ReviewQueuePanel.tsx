import { AlertTriangle } from '../../components/AlertTriangle'
import { CheckIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { assetViewUrl } from '../../lib/assets'
import { num, when } from '../../lib/format'
import { href, navigate, usePolling } from '../../lib/hooks'
import { reviewApi, type QueuePage } from '../../reviewApi'

export function ReviewQueuePanel({ seriesId }: { seriesId: string }) {
  const { data, error } = usePolling(() => reviewApi.queue(seriesId), 0, [seriesId])
  if (error) return <Notice tone="failed">{error}</Notice>
  if (!data)
    return (
      <EmptyState>
        <Spinner /> Carregando…
      </EmptyState>
    )
  if (!data.pages.length) return <EmptyState>Nenhuma página marcada para revisão nesta série.</EmptyState>

  const groups = new Map<string, { number: number; pages: QueuePage[] }>()
  for (const p of data.pages) {
    const g = groups.get(p.chapter.id) ?? { number: p.chapter.number, pages: [] }
    g.pages.push(p)
    groups.set(p.chapter.id, g)
  }

  return (
    <div className="space-y-4" data-testid="review-queue">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4" />
          {num(data.pages.length)} {data.pages.length === 1 ? 'página marcada' : 'páginas marcadas'} para revisão em {num(groups.size)} {groups.size === 1 ? 'capítulo' : 'capítulos'}
        </p>
        <Button size="sm" variant="primary" onClick={() => navigate(href('r', data.pages[0].id, 'fila'))} data-testid="review-queue-start">
          Começar revisão
        </Button>
      </Card>
      <p className="text-xs text-slate-500">No modo revisão, as setas (e ← →) pulam direto para a próxima página marcada, mesmo em outro capítulo. “Marcar como revisada” tira a página da fila e abre a próxima.</p>
      {[...groups.entries()].map(([chapterId, g]) => (
        <section key={chapterId} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <a href={href('s', data.series.slug, chapterId)} className="hover:text-brand">Capítulo {g.number}</a>
            <span className="font-normal text-slate-500">{g.pages.length === 1 ? '1 página' : `${g.pages.length} páginas`}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {g.pages.map((p) => (
              <a
                key={p.id}
                href={href('r', p.id, 'fila')}
                title={`Revisão relatada por ${p.reported.by} em ${when(p.reported.at)}`}
                className="group relative block overflow-hidden rounded-lg border-2 border-slate-200 bg-white transition hover:border-brand/50 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="aspect-[3/4] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {p.assetId && <img src={assetViewUrl(p.assetId)} alt="" loading="lazy" className="h-full w-full object-cover object-top" />}
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                  <span className="tabular-nums">Página {p.position}</span>
                  <span className="font-medium text-brand group-hover:underline">Revisar</span>
                </div>
                {p.approved && (
                  <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-done text-white shadow" title="Página aprovada" aria-label="Aprovada">
                    <CheckIcon className="size-3.5" />
                  </span>
                )}
                {p.openComments > 0 && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-failed px-1.5 text-[10px] font-semibold text-white" title="Comentários abertos">
                    {p.openComments} {p.openComments === 1 ? 'comentário' : 'comentários'}
                  </span>
                )}
                {p.lock && (
                  <span className="pointer-events-none absolute inset-x-1.5 bottom-9">
                    <Badge tone="queued">
                      {p.lock.label} #{p.lock.workflowId}
                    </Badge>
                  </span>
                )}
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
