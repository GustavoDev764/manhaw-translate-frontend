import { useMemo, useState } from 'react'
import { FileLinks } from '../../components/FileLinks'
import { assetViewUrl } from '../../lib/assets'
import { LaunchDialog } from '../../components/LaunchDialog'
import { StageActions } from '../../components/StageActions'
import { Badge, Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { num } from '../../lib/format'
import { href, usePolling } from '../../lib/hooks'
import { libraryApi, STAGE_LABEL, type LaunchInput, type LibraryPage } from '../../workflowsApi'

const STAGE_DOTS: { key: keyof LibraryPage['stages']; label: string }[] = [
  { key: 'scanned', label: 'Escaneada' },
  { key: 'translated', label: 'Traduzida' },
  { key: 'cleaned', label: 'Limpa' },
  { key: 'rendered', label: 'Desenhada' },
  { key: 'approved', label: 'Aprovada' },
]

export function ChapterStagesPage({ slug, chapterId }: { slug: string; chapterId: string }) {
  const { data, error, reload } = usePolling(() => libraryApi.pages(chapterId), 0, [chapterId])
  const series = usePolling(() => libraryApi.seriesDetail(slug), 0, [slug])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [launch, setLaunch] = useState<Omit<LaunchInput, 'force'> | null>(null)
  const [onlyFree, setOnlyFree] = useState(false)

  const pages = useMemo(() => data?.pages ?? [], [data])
  const free = pages.filter((p) => !p.lock)
  const locked = pages.length - free.length
  const chosen = pages.filter((p) => selected.has(p.id))
  const shown = onlyFree ? free : pages
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (error) return <Notice tone="failed">{error}</Notice>
  if (!data || !series.data)
    return (
      <EmptyState>
        <Spinner /> Carregando…
      </EmptyState>
    )

  return (
    <div className="space-y-5">
      <div>
        <a href={href('s', slug)} className="text-sm text-slate-500 hover:text-brand">
          ← {data.chapter.series.title}
        </a>
        <h1 className="text-2xl font-semibold">Capítulo {data.chapter.number}</h1>
        <p className="text-sm text-slate-500">
          {num(pages.length)} páginas{locked ? ` · ${num(locked)} em outro processo` : ''}
        </p>
      </div>

      <Card className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 p-3">
        <StageActions
          count={chosen.length}
          unit={chosen.length === 1 ? 'página' : 'páginas'}
          canRender={chosen.some((p) => p.stages.translated)}
          onLaunch={(type) => setLaunch({ type, seriesId: series.data!.id, pageIds: chosen.map((p) => p.id) })}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={locked ? 'primary' : 'ghost'} onClick={() => setSelected(new Set(free.map((p) => p.id)))} disabled={!free.length}>
            Selecionar páginas livres ({free.length})
          </Button>
          {locked > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOnlyFree((v) => !v)}>
              {onlyFree ? 'Mostrar todas' : 'Só as livres'}
            </Button>
          )}
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map((p) => {
          const on = selected.has(p.id)
          const asset = p.current?.assetId ?? p.originalAssetId
          return (
            <div
              key={p.id}
              className={cx(
                'group relative overflow-hidden rounded-lg border-2 bg-white transition dark:bg-slate-900',
                on ? 'border-brand' : 'border-slate-200 hover:border-brand/50 dark:border-slate-800',
              )}
            >
              <button
                type="button"
                disabled={!!p.lock}
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                aria-label={`Selecionar página ${p.position}`}
                title={p.lock ? `Em processo: ${STAGE_LABEL[p.lock.stage]} #${p.lock.workflowId}` : p.file}
                className={cx('block w-full text-left', p.lock && 'cursor-not-allowed opacity-50')}
              >
                <div className="aspect-[3/4] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {asset && <img src={assetViewUrl(asset)} alt="" loading="lazy" className="h-full w-full object-cover object-top" />}
                </div>
              </button>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                <span className="tabular-nums">{p.position}</span>
                <span className="flex gap-0.5" aria-label="Etapas">
                  {STAGE_DOTS.map((s) => (
                    <span key={s.key} title={s.label} className={cx('size-1.5 rounded-full', p.stages[s.key] ? 'bg-done' : 'bg-slate-300 dark:bg-slate-700')} />
                  ))}
                </span>
                <a href={href('r', p.id)} className="font-medium text-brand hover:underline">Revisar</a>
              </div>
              {asset && <FileLinks assetId={asset} label={`página ${p.position}`} className="flex justify-center border-t border-slate-100 py-1 dark:border-slate-800" />}
              {p.status === 'no_text' && <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-slate-900/70 px-1.5 text-[10px] text-white">sem texto</span>}
              {p.current && <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-slate-900/70 px-1.5 text-[10px] text-white">v{p.current.number}</span>}
              {p.unpublished && <span className="pointer-events-none absolute left-1.5 top-7 rounded bg-queued px-1.5 text-[10px] font-medium text-white" title="Há alterações nas caixas de texto que ainda não viraram versão">não publicada</span>}
              {p.lock && (
                <span className="pointer-events-none absolute inset-x-1.5 bottom-9">
                  <Badge tone="queued">
                    {STAGE_LABEL[p.lock.stage]} #{p.lock.workflowId}
                  </Badge>
                </span>
              )}
              {on && <span className="pointer-events-none absolute left-1.5 bottom-9 grid size-5 place-items-center rounded-full bg-brand text-[11px] text-white">✓</span>}
            </div>
          )
        })}
      </div>

      <LaunchDialog
        input={launch}
        onClose={() => setLaunch(null)}
        onCreated={() => {
          setSelected(new Set())
          void reload()
        }}
      />
    </div>
  )
}
