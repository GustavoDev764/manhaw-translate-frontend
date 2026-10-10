import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/authCtx'
import { AlertTriangle } from '../../components/AlertTriangle'
import { useConfirm } from '../../components/confirm'
import { CheckIcon, PencilIcon } from '../../components/icons'
import { useJobs } from '../../components/jobsContext'
import { FileLinks } from '../../components/FileLinks'
import { assetViewUrl } from '../../lib/assets'
import { LaunchDialog } from '../../components/LaunchDialog'
import { StageActions } from '../../components/StageActions'
import { Badge, Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { num, when } from '../../lib/format'
import { href, usePolling } from '../../lib/hooks'
import { libraryApi, STAGE_LABEL, workflowsApi, type LaunchInput, type LibraryPage } from '../../workflowsApi'

const STAGE_DOTS: { key: keyof LibraryPage['stages']; label: string }[] = [
  { key: 'scanned', label: 'Escaneada' },
  { key: 'translated', label: 'Traduzida' },
  { key: 'cleaned', label: 'Limpa' },
  { key: 'rendered', label: 'Desenhada' },
  { key: 'approved', label: 'Aprovada' },
]

function PreparedFilesPanel({ chapterId }: { chapterId: string }) {
  const [open, setOpen] = useState(false)
  const files = usePolling(() => (open ? libraryApi.preparedFiles(chapterId) : Promise.resolve(null)), 0, [chapterId, open])
  return (
    <details className="rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-slate-900" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} data-testid="prepared-files">
      <summary className="cursor-pointer px-4 py-2 font-medium">Arquivos preparados para a tradução</summary>
      <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <p className="text-xs text-slate-500">Páginas limpas sem texto, páginas marcadas e folhas com os recortes dos balões. São refeitas só quando o capítulo é escaneado de novo.</p>
        {files.error && <Notice tone="failed">{files.error}</Notice>}
        {!files.data && !files.error && <Spinner />}
        {files.data && !files.data.pages.length && !files.data.sheets.length && <p className="text-slate-500">Nada preparado ainda.</p>}
        {files.data && files.data.pages.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {files.data.pages.map((p) => (
              <li key={p.file} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="w-24 text-slate-500">Página {p.position}</span>
                {p.cleanFullId && (
                  <span className="flex items-center gap-1">
                    Limpa completa <FileLinks assetId={p.cleanFullId} label={`limpa completa da página ${p.position}`} />
                  </span>
                )}
                {p.markedId && (
                  <span className="flex items-center gap-1">
                    Marcada <FileLinks assetId={p.markedId} label={`página ${p.position} marcada`} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {files.data && files.data.sheets.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Folhas com os recortes dos balões (leitura)</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {files.data.sheets.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1" title={s.name}>
                  Folha {i + 1} <FileLinks assetId={s.id} label={`folha ${i + 1}`} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

export function ChapterStagesPage({ slug, chapterId }: { slug: string; chapterId: string }) {
  const { data, error, reload } = usePolling(() => libraryApi.pages(chapterId), 0, [chapterId])
  const series = usePolling(() => libraryApi.seriesDetail(slug), 0, [slug])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [launch, setLaunch] = useState<Omit<LaunchInput, 'force'> | null>(null)
  const busyInfo = usePolling(() => workflowsApi.chapterBusy(chapterId), 5000, [chapterId])
  const { me } = useAuth()
  const { toast } = useJobs()
  const [ask, confirmDialog] = useConfirm()
  const [releasing, setReleasing] = useState(false)
  const canRelease = me?.role === 'system_admin' || me?.role === 'scan_admin'
  const chapterBusy = busyInfo.data?.busy ?? null

  const publish = async () => {
    if (!toPublish.length) return
    setPublishing(true)
    try {
      const r = await workflowsApi.publishPages(toPublish.map((p) => p.id))
      const out = r.excluded.busyPages + r.excluded.locked + r.excluded.editing
      toast('done', `Workflow #${r.id} criado: publicando ${r.items} ${r.items === 1 ? 'página' : 'páginas'} na fila leve${out ? ` · ${out} ficaram de fora` : ''}.`)
      setSelected(new Set())
      await reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setPublishing(false)
    }
  }

  const release = async () => {
    if (!chapterBusy) return
    const ok = await ask({
      title: 'Liberar capítulo',
      message: `Cancela tudo o que está em andamento neste capítulo (${chapterBusy.label} e correções de página) e solta as travas. Use só se o processo travou.`,
      confirmLabel: 'Liberar capítulo',
      danger: true,
    })
    if (!ok) return
    setReleasing(true)
    try {
      const r = await workflowsApi.releaseChapter(chapterId)
      toast('done', `Capítulo liberado: ${r.released} ${r.released === 1 ? 'item cancelado' : 'itens cancelados'}.`)
      await Promise.all([busyInfo.reload(), reload()])
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setReleasing(false)
    }
  }
  const [onlyFree, setOnlyFree] = useState(false)
  const [onlyReported, setOnlyReported] = useState(false)
  const [onlyUnpublished, setOnlyUnpublished] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const pages = useMemo(() => data?.pages ?? [], [data])
  const free = pages.filter((p) => !p.lock)
  const locked = pages.length - free.length
  const chosen = pages.filter((p) => selected.has(p.id))
  const reported = pages.filter((p) => p.reported).length
  const unpublishedPages = pages.filter((p) => p.unpublished)
  const shown = (onlyFree ? free : pages).filter((p) => (!onlyReported || p.reported) && (!onlyUnpublished || p.unpublished))
  const toPublish = (chosen.length ? chosen : unpublishedPages).filter((p) => p.unpublished && !p.lock)
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
          {reported > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              · <AlertTriangle className="size-3.5" /> {num(reported)} com revisão relatada
            </span>
          )}
        </p>
      </div>

      {chapterBusy && (
        <Notice tone="queued">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              O capítulo está em{' '}
              <a className="font-semibold underline" href={href('workflows', String(chapterBusy.workflowId))}>
                {chapterBusy.label}
              </a>
              . Outros workflows deixam este capítulo de fora até terminar, e as alterações de texto ficam salvas sem publicar.
            </span>
            {canRelease && (
              <Button size="sm" variant="ghost" className="text-failed" onClick={release} disabled={releasing}>
                {releasing ? <Spinner /> : 'Liberar capítulo'}
              </Button>
            )}
          </span>
        </Notice>
      )}
      {confirmDialog}

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
          {(unpublishedPages.length > 0 || onlyUnpublished) && (
            <Button size="sm" variant={onlyUnpublished ? 'primary' : 'ghost'} onClick={() => setOnlyUnpublished((v) => !v)} title="Mostra só as páginas com alterações nas caixas de texto que ainda não viraram versão">
              <PencilIcon className="mr-1 size-3.5" />
              {onlyUnpublished ? 'Mostrar todas' : `Só não publicadas (${unpublishedPages.length})`}
            </Button>
          )}
          {unpublishedPages.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(unpublishedPages.filter((p) => !p.lock).map((p) => p.id)))}>
              Selecionar não publicadas
            </Button>
          )}
          {toPublish.length > 0 && (
            <Button
              size="sm"
              variant="primary"
              onClick={publish}
              disabled={publishing || !!chapterBusy}
              title={chapterBusy ? `O capítulo está em ${chapterBusy.label}: as alterações ficam salvas e podem ser publicadas quando terminar.` : 'Gera a imagem nova de cada página com as caixas de texto atuais'}
              data-testid="publish-pages"
            >
              {publishing ? <Spinner /> : `Publicar alterações (${toPublish.length})`}
            </Button>
          )}
          {(reported > 0 || onlyReported) && (
            <Button size="sm" variant={onlyReported ? 'primary' : 'ghost'} onClick={() => setOnlyReported((v) => !v)} title="Mostra só as páginas que alguém relatou para revisão">
              <AlertTriangle className="mr-1 size-3.5" />
              {onlyReported ? 'Mostrar todas' : `Só relatadas (${reported})`}
            </Button>
          )}
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
              {p.reported && (
                <span className="absolute right-1.5 top-7 grid size-6 place-items-center rounded-full bg-amber-500 text-white shadow" title={`Revisão relatada por ${p.reported.by} em ${when(p.reported.at)}`} aria-label="Revisão relatada">
                  <AlertTriangle className="size-3.5" />
                </span>
              )}
              {(p.unpublished || p.stages.approved) && (
                <span className="absolute left-1.5 top-7 flex gap-1">
                  {p.stages.approved && (
                    <span className="grid size-6 place-items-center rounded-full bg-done text-white shadow" title="Página aprovada" aria-label="Aprovada">
                      <CheckIcon className="size-3.5" />
                    </span>
                  )}
                  {p.unpublished && (
                    <span className="grid size-6 place-items-center rounded-full bg-amber-500 text-white shadow" title="Alterações não publicadas: há mudanças nas caixas de texto que ainda não viraram versão" aria-label="Alterações não publicadas">
                      <PencilIcon className="size-3.5" />
                    </span>
                  )}
                </span>
              )}
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

      <PreparedFilesPanel chapterId={chapterId} />

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
