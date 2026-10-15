import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DISABLED_REASON, useAuth } from '../../auth/authCtx'
import { LaunchDialog } from '../../components/LaunchDialog'
import { StageActions } from '../../components/StageActions'
import { useJobs } from '../../components/jobsContext'
import { useConfirm } from '../../components/confirm'
import { reviewApi, type FontRaiseResult } from '../../reviewApi'
import { UPLOAD_DONE_EVENT, useUploads, type Upload } from '../../components/uploadsContext'
import { Badge, Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner, Tabs } from '../../components/ui'
import { GlossaryPanel } from './GlossaryPanel'
import { DeleteSeriesDialog, RenameSeriesDialog } from './SeriesManageDialogs'
import { ago, num } from '../../lib/format'
import { useWorkflowEvents } from '../../lib/workflowEvents'
import { href, navigate, usePolling } from '../../lib/hooks'
import { AlertTriangle } from '../../components/AlertTriangle'
import { CheckIcon, PencilIcon } from '../../components/icons'
import { DownloadsDrawer, OPEN_DOWNLOADS } from '../../components/DownloadsDrawer'
import { chapterSpec, exportsApi, libraryApi, STAGE_LABEL, workflowsApi, type ExportKind, type LaunchInput, type LibraryChapter, type PackageInclude } from '../../workflowsApi'

const SITE_DOWNLOAD_ENABLED = false

function Progress({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="min-w-16" title={`${num(value)} de ${num(total)}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">{value === total && total ? 'tudo' : `${num(value)}/${num(total)}`}</div>
    </div>
  )
}

export function SeriesStagesPage({ slug, tab = 'chapters' }: { slug: string; tab?: 'chapters' | 'glossary' }) {
  const { can, me } = useAuth()
  const admin = me?.role === 'system_admin' || me?.role === 'scan_admin'
  const [manage, setManage] = useState<'rename' | 'delete' | null>(null)
  const { data, error, reload } = usePolling(() => libraryApi.seriesDetail(slug), 0, [slug])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [launch, setLaunch] = useState<Omit<LaunchInput, 'force'> | null>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [packaging, setPackaging] = useState(false)
  const [ranging, setRanging] = useState(false)
  const [raising, setRaising] = useState(false)
  const [checking, setChecking] = useState(false)
  const [approval, setApproval] = useState<'all' | 'approved' | 'pending'>('all')
  const [publishing, setPublishing] = useState(false)
  const { toast } = useJobs()
  const [ask, confirmDialog] = useConfirm()
  const { uploads, add: addUploads, dismiss } = useUploads()
  const zipInput = useRef<HTMLInputElement>(null)
  const seriesId = data?.id
  const mine = useMemo(() => uploads.filter((u) => u.seriesId === seriesId), [uploads, seriesId])
  const extracting = (data?.chapters ?? []).some((c) => c.import?.status === 'extracting')

  useEffect(() => {
    const onDone = (e: Event) => {
      if ((e as CustomEvent<{ seriesId: string }>).detail.seriesId === seriesId) void reload()
    }
    window.addEventListener(UPLOAD_DONE_EVENT, onDone)
    return () => window.removeEventListener(UPLOAD_DONE_EVENT, onDone)
  }, [seriesId, reload])

  useEffect(() => {
    if (!extracting) return
    const t = setInterval(() => void reload(), 3000)
    return () => clearInterval(t)
  }, [extracting, reload])

  useWorkflowEvents(() => {
    if (extracting) void reload()
  })

  const allChapters = useMemo(() => data?.chapters ?? [], [data])
  const isApproved = (c: LibraryChapter) => c.pages - c.noText > 0 && (c.approvedText ?? 0) >= c.pages - c.noText
  const approvedCount = allChapters.filter(isApproved).length
  const pendingCount = allChapters.filter((c) => c.pages - c.noText > 0 && !isApproved(c)).length
  const chapters = approval === 'all' ? allChapters : allChapters.filter((c) => (approval === 'approved' ? isApproved(c) : c.pages - c.noText > 0 && !isApproved(c)))
  const free = chapters.filter((c) => !c.locked && c.pages > 0)
  const chosen = chapters.filter((c) => selected.has(c.id))
  const exportable = chosen.filter((c) => c.pages > 0)
  const reportedChosen = chosen.reduce((n, c) => n + c.reported, 0)
  const withChanges = chapters.filter((c) => (c.unpublished ?? 0) > 0)
  const toPublish = (chosen.length ? chosen : withChanges).filter((c) => (c.unpublished ?? 0) > 0 && !c.busy)
  const pagesToPublish = toPublish.reduce((n, c) => n + (c.unpublished ?? 0), 0)
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const publish = async () => {
    if (!toPublish.length) return
    const ok = await ask({
      title: 'Publicar alterações',
      message: `Gera a imagem nova de ${num(pagesToPublish)} ${pagesToPublish === 1 ? 'página' : 'páginas'} em ${num(toPublish.length)} ${toPublish.length === 1 ? 'capítulo' : 'capítulos'} (${toPublish.map((c) => c.number).join(', ')}) com as caixas de texto atuais.`,
      confirmLabel: 'Publicar',
    })
    if (!ok) return
    setPublishing(true)
    try {
      const r = await workflowsApi.publishChapters(toPublish.map((c) => c.id))
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

  if (error) return <Notice tone="failed">{error}</Notice>
  if (!data)
    return (
      <EmptyState>
        <Spinner /> Carregando…
      </EmptyState>
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href={href()} className="text-sm text-slate-500 hover:text-brand">
            ← Manhwas
          </a>
          <h1 className="text-2xl font-semibold">{data.title}</h1>
          <p className="text-sm text-slate-500">
            {num(chapters.length)} capítulos
            {data.sourceUrl && (
              <>
                {' · '}
                <a className="hover:text-brand" href={data.sourceUrl} target="_blank" rel="noreferrer">
                  site de origem
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={href('ler', data.slug)}
            title="Abre o leitor em tela cheia, como num site de leitura"
            className={`inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 ${chapters.some((c) => c.pages > 0) ? '' : 'pointer-events-none opacity-50'}`}
          >
            Ler (preview)
          </a>
          {admin && (
            <>
              <Button variant="ghost" onClick={() => setManage('rename')}>Editar título</Button>
              <Button variant="ghost" className="text-failed! hover:bg-failed/10!" onClick={() => setManage('delete')}>Excluir</Button>
            </>
          )}
          {SITE_DOWNLOAD_ENABLED && data.sourceUrl && (
            <Button onClick={() => setDownloadOpen(true)} disabled={!can('download')} title={can('download') ? '' : DISABLED_REASON}>
              Baixar capítulos
            </Button>
          )}
          <Button variant="primary" onClick={() => zipInput.current?.click()} disabled={!can('download')} title={can('download') ? 'Um .zip por capítulo: 1.zip, 2.zip…' : DISABLED_REASON}>
            Importar capítulos
          </Button>
          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            multiple
            hidden
            data-testid="zip-input"
            onChange={(e) => {
              addUploads(
                data.id,
                Array.from(e.target.files ?? []),
                chapters.map((c) => ({ number: c.number, pages: c.pages, translated: c.translated, rendered: c.rendered })),
              )
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <Tabs<'chapters' | 'glossary'>
        value={tab}
        onChange={(t) => {
          navigate(t === 'glossary' ? href('s', slug, 'glossario') : href('s', slug))
        }}
        tabs={[
          { value: 'chapters', label: 'Capítulos' },
          { value: 'glossary', label: 'Glossário' },
        ]}
      />
      {tab === 'glossary' ? (
        <GlossaryPanel seriesId={data.id} />
      ) : (
      <>
      <HowToTranslate />
      <Card className="sticky top-14 z-10 divide-y divide-slate-100 dark:divide-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <span className={`mr-2 text-sm ${chosen.length ? 'font-semibold text-brand' : 'text-slate-500'}`}>
              {chosen.length ? `${num(chosen.length)} ${chosen.length === 1 ? 'capítulo selecionado' : 'capítulos selecionados'}` : 'Nenhum capítulo selecionado'}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(chapters.filter((c) => c.pages > 0).map((c) => c.id)))}>
              Todos ({chapters.filter((c) => c.pages > 0).length})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(free.map((c) => c.id)))} title="Só os capítulos que não estão em outro processo">
              Livres ({free.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRanging(true)} disabled={!free.length} title="Escolhe do capítulo X até o Y de uma vez">
              Intervalo…
            </Button>
            {withChanges.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(withChanges.filter((c) => !c.busy).map((c) => c.id)))} title="Só os capítulos com alterações nas caixas de texto que ainda não foram publicadas">
                <PencilIcon className="mr-1 size-3.5" />
                Não publicados ({withChanges.length})
              </Button>
            )}
            {selected.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(approvedCount > 0 || pendingCount > 0 || approval !== 'all') && (
              <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800/60" role="group" aria-label="Filtrar por aprovação">
                {(
                  [
                    ['all', `Todos`],
                    ['approved', `Aprovados (${approvedCount})`],
                    ['pending', `Pendentes (${pendingCount})`],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setApproval(v)}
                    data-testid={v === 'approved' ? 'filter-approved' : undefined}
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium transition ${approval === v ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                  >
                    {v === 'approved' && <CheckIcon className="mr-1 size-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            )}
            <DownloadsDrawer seriesId={data.id} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
          <ToolbarGroup label="Processar">
            <StageActions
              count={chosen.length}
              unit={chosen.length === 1 ? 'capítulo' : 'capítulos'}
              showCount={false}
              canRender={chosen.some((c) => c.translated > 0)}
              onLaunch={(type) => setLaunch({ type, seriesId: data.id, chapterIds: chosen.map((c) => c.id) })}
            />
          </ToolbarGroup>
          <ToolbarGroup label="Ajustar">
            <Button
              size="sm"
              variant={pagesToPublish ? 'primary' : undefined}
              onClick={() => void publish()}
              disabled={!pagesToPublish || publishing || !can('edit_text')}
              title={!can('edit_text') ? DISABLED_REASON : pagesToPublish ? `Gera a imagem nova das páginas com alterações nas caixas de texto${chosen.length ? ' dos capítulos selecionados' : ' de todos os capítulos'}` : chosen.length ? 'Os capítulos selecionados não têm alterações para publicar (ou estão em outro processo)' : 'Nenhum capítulo tem alterações para publicar'}
              data-testid="publish-chapters"
            >
              {publishing ? <Spinner /> : `Publicar alterações${pagesToPublish ? ` (${pagesToPublish})` : ''}`}
            </Button>
            <Button size="sm" onClick={() => setRaising(true)} disabled={!exportable.length || !can('edit_text')} title={!can('edit_text') ? DISABLED_REASON : exportable.length ? 'Aumenta para um tamanho mínimo só os textos menores que ele e publica as páginas' : 'Selecione capítulos com páginas'} data-testid="raise-font">
              Fonte mínima
            </Button>
            <Button size="sm" onClick={() => setChecking(true)} disabled={!reportedChosen || !can('cleanup_render')} title={!can('cleanup_render') ? DISABLED_REASON : reportedChosen ? 'Nas páginas marcadas para revisão: procura inglês que sobrou na base limpa, apaga e desenha a tradução de novo por cima' : 'Selecione capítulos com páginas marcadas para revisão'} data-testid="clean-check">
              Remover inglês restante{reportedChosen ? ` (${reportedChosen})` : ''}
            </Button>
          </ToolbarGroup>
          <ToolbarGroup label="Baixar">
            <Button size="sm" onClick={() => setExporting(true)} disabled={!exportable.length} title={exportable.length ? 'Baixa os capítulos selecionados num .zip, uma pasta por capítulo' : 'Selecione capítulos com páginas'}>
              .zip
            </Button>
            <Button size="sm" onClick={() => setPackaging(true)} disabled={!exportable.length} title={exportable.length ? 'Um .zip por capítulo com imagens, escaneamento, tradução e glossário, para importar em outro ambiente' : 'Selecione capítulos com páginas'} data-testid="export-package">
              Pacote
            </Button>
          </ToolbarGroup>
        </div>
      </Card>

      {!allChapters.length && !mine.length && <EmptyState>Nenhum capítulo ainda. Use “Importar capítulos” para enviar os .zip (1.zip, 2.zip…){SITE_DOWNLOAD_ENABLED && data.sourceUrl ? ' ou “Baixar capítulos”' : ''}.</EmptyState>}
      {(allChapters.length > 0 || mine.length > 0) && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="w-10 p-3" />
                <th className="p-3">Capítulo</th>
                <th className="p-3">Páginas</th>
                <th className="p-3">Escaneadas</th>
                <th className="p-3">Traduzidas</th>
                <th className="p-3">Limpas</th>
                <th className="p-3">Desenhadas</th>
                <th className="p-3">Aprovação</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {mine
                .filter((u) => !allChapters.some((c) => c.number === u.number))
                .map((u) => (
                  <UploadRow key={u.id} u={u} onDismiss={() => dismiss(u.id)} />
                ))}
              {chapters.map((c) => (
                <ChapterRow key={c.id} c={c} slug={slug} checked={selected.has(c.id)} onToggle={() => toggle(c.id)} upload={mine.find((u) => u.number === c.number)} onDismiss={dismiss} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      </>
      )}

      {admin && (
        <>
          <RenameSeriesDialog key={data.title} open={manage === 'rename'} series={data} onClose={() => setManage(null)} onSaved={() => {
            setManage(null)
            void reload()
          }} />
          <DeleteSeriesDialog open={manage === 'delete'} series={data} chapters={chapters.length} pages={chapters.reduce((n, c) => n + c.pages, 0)} onClose={() => setManage(null)} onDeleted={() => {
            setManage(null)
            navigate(href())
          }} />
        </>
      )}
      {confirmDialog}
      <LaunchDialog input={launch} onClose={() => setLaunch(null)} onCreated={() => {
        setSelected(new Set())
        void reload()
      }} />
      <ExportDialog open={exporting} seriesId={data.id} chapters={exportable} onClose={() => setExporting(false)} />
      <PackageDialog open={packaging} seriesId={data.id} chapters={exportable} onClose={() => setPackaging(false)} />
      <CleanCheckDialog open={checking} chapters={chosen.filter((c) => c.reported > 0)} onClose={() => setChecking(false)} onDone={() => {
        setChecking(false)
        setSelected(new Set())
        void reload()
      }} />
      <FontRaiseDialog open={raising} chapters={exportable} onClose={() => setRaising(false)} onDone={() => {
        setRaising(false)
        setSelected(new Set())
        void reload()
      }} />
      <RangeDialog
        open={ranging}
        chapters={chapters}
        onClose={() => setRanging(false)}
        onPick={(ids) => {
          setSelected((prev) => new Set([...prev, ...ids]))
          setRanging(false)
        }}
      />
      <DownloadDialog open={downloadOpen} seriesId={data.id} onClose={() => setDownloadOpen(false)} onPick={(numbers) => {
        setDownloadOpen(false)
        setLaunch({ type: 'download', seriesId: data.id, chapterNumbers: numbers })
      }} />
    </div>
  )
}

const percent = (u: Upload) => (u.total ? Math.min(100, Math.round((u.loaded / u.total) * 100)) : 0)

function UploadStatus({ u, onDismiss }: { u: Upload; onDismiss: () => void }) {
  if (u.status === 'failed')
    return (
      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-failed">
        Envio falhou: {u.error}
        <button type="button" className="underline" onClick={onDismiss}>
          Remover
        </button>
      </span>
    )
  return (
    <span className="mt-1 block text-xs font-medium text-brand">
      {u.status === 'waiting' ? `Na fila de envio · ${u.fileName}` : `Enviando ${u.fileName} · ${percent(u)}%`}
    </span>
  )
}

function UploadRow({ u, onDismiss }: { u: Upload; onDismiss: () => void }) {
  const failed = u.status === 'failed'
  return (
    <tr className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${failed ? '' : 'row-uploading'}`} data-state={failed ? 'upload-failed' : 'uploading'}>
      <td className="p-3" />
      <td className="p-3 font-medium">
        Cap. {u.number}
        <UploadStatus u={u} onDismiss={onDismiss} />
      </td>
      <td className="p-3 text-slate-400" colSpan={6}>
        {failed ? '' : 'aguardando o envio terminar'}
      </td>
    </tr>
  )
}

function ChapterRow({ c, slug, checked, onToggle, upload, onDismiss }: { c: LibraryChapter; slug: string; checked: boolean; onToggle: () => void; upload?: Upload; onDismiss: (id: string) => void }) {
  const withText = Math.max(0, c.pages - c.noText)
  const blocked = c.locked > 0
  const sending = !!upload && upload.status !== 'failed'
  const state = sending ? 'uploading' : c.import?.status === 'extracting' ? 'extracting' : null
  return (
    <tr
      data-state={state ?? undefined}
      className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${state ? `row-${state}` : checked ? 'bg-brand/5' : ''}`}
    >
      <td className="p-3">
        <input
          type="checkbox"
          className="accent-brand"
          checked={checked}
          disabled={!c.pages}
          onChange={onToggle}
          aria-label={`Selecionar capítulo ${c.number}`}
          title={c.busy ? `Em ${c.busy.label}: fica de fora dos workflows até terminar` : blocked ? 'Tem páginas em outro processo' : ''}
        />
      </td>
      <td className="p-3 font-medium">
        <a href={href('s', slug, c.id)} className="hover:text-brand">
          Cap. {c.number}
        </a>
        {c.reported > 0 && (
          <a href={href('s', slug, c.id)} className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-amber-600 dark:text-amber-400" title={`${c.reported} ${c.reported === 1 ? 'página com revisão relatada' : 'páginas com revisão relatada'}`}>
            <AlertTriangle className="size-3.5" /> {c.reported}
          </a>
        )}
        {(c.unpublished ?? 0) > 0 && (
          <a href={href('s', slug, c.id)} className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-amber-600 dark:text-amber-400" title={`${c.unpublished} ${c.unpublished === 1 ? 'página com alteração não publicada' : 'páginas com alteração não publicada'}`} data-testid="chapter-unpublished">
            <PencilIcon className="size-3.5" /> {c.unpublished}
          </a>
        )}
        {upload && <UploadStatus u={upload} onDismiss={() => onDismiss(upload.id)} />}
        {!sending && c.import?.status === 'extracting' && (
          <a href={href('workflows', String(c.import.workflowId))} className="mt-1 block text-xs font-medium text-queued">
            Upload feito com sucesso, agora estamos descompactando seus arquivos…
          </a>
        )}
        {!sending && c.import?.status === 'failed' && (
          <a href={href('workflows', String(c.import.workflowId))} className="mt-1 block text-xs text-failed">
            Importação falhou{c.import.message ? `: ${c.import.message}` : ''} · envie o .zip de novo
          </a>
        )}
        {c.busy ? (
          <a href={href('workflows', String(c.busy.workflowId))} className="ml-2">
            <Badge tone="queued">{c.busy.label}</Badge>
          </a>
        ) : blocked && c.lock && (
          <a href={href('workflows', String(c.lock.workflowId))} className="ml-2">
            <Badge tone="queued">
              {STAGE_LABEL[c.lock.stage]} #{c.lock.workflowId} · {c.locked} pág.
            </Badge>
          </a>
        )}
      </td>
      <td className="p-3 tabular-nums">
        {c.pages ? num(c.pages) : <span className="text-slate-400">{state ? '…' : 'sem páginas'}</span>}
        {c.noText > 0 && <span className="block text-[11px] text-slate-500">{c.noText} sem texto</span>}
      </td>
      <td className="p-3"><Progress value={c.scanned} total={c.pages} color="bg-brand/60" /></td>
      <td className="p-3"><Progress value={c.translated} total={withText} color="bg-done" /></td>
      <td className="p-3"><Progress value={c.cleaned} total={withText} color="bg-slate-400" /></td>
      <td className="p-3"><Progress value={c.rendered} total={withText} color="bg-done" /></td>
      <td className="p-3">
        {withText > 0 && (c.approvedText ?? 0) >= withText ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-done px-2 py-0.5 text-xs font-medium text-white" data-testid="chapter-approved">
            <CheckIcon className="size-3" /> Aprovado
          </span>
        ) : (c.approvedText ?? 0) > 0 ? (
          <span className="block min-w-24">
            <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span className="block h-full bg-done" style={{ width: `${Math.round(((c.approvedText ?? 0) / withText) * 100)}%` }} />
            </span>
            <span className="text-[11px] tabular-nums text-slate-500">{num(c.approvedText ?? 0)} de {num(withText)} aprovadas</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="p-3 text-right">
        <a href={href('s', slug, c.id)} className="text-xs text-brand hover:underline">
          Abrir
        </a>
      </td>
    </tr>
  )
}

const HOWTO_KEY = 'series.howto'

function readOpen(): boolean {
  try {
    return localStorage.getItem(HOWTO_KEY) !== 'closed'
  } catch {
    return true
  }
}

function HowToTranslate() {
  const [open] = useState(readOpen)
  return (
    <details
      open={open}
      onToggle={(e) => {
        try {
          localStorage.setItem(HOWTO_KEY, e.currentTarget.open ? 'open' : 'closed')
        } catch {
          return
        }
      }}
      className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm [&_summary::-webkit-details-marker]:hidden"
      data-testid="howto"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 font-semibold text-brand">
        Como traduzir os capítulos
        <span className="text-xs font-normal text-slate-500">mostrar / esconder</span>
      </summary>
      <ol className="mt-3 space-y-2.5">
        <li>
          <b>1. Escanear:</b> selecione os capítulos e clique em <b>Escanear</b>. A plataforma encontra os balões e textos de cada página.
        </li>
        <li>
          <b>2. Escolha o caminho:</b>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <b>Com IA:</b> selecione e clique em <b>Traduzir</b>. A IA apaga o inglês, traduz e já publica as páginas.
            </li>
            <li>
              <b>Manual:</b> selecione e clique em <b>Limpar balões</b>. Depois abra cada página, crie as caixas de texto com a tradução e clique em <b>Aplicar alteração</b>.
            </li>
          </ul>
        </li>
        <li>
          <b>3. Revisar e publicar:</b> abra as páginas para conferir e corrija o texto, a posição ou os restos de inglês. As alterações só aparecem depois de <b>Aplicar alteração</b>, ou de <b>Desenhar</b>, que publica várias páginas de uma vez.
        </li>
      </ol>
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
        <b>Atenção:</b> o <b>Baixar .zip</b> entrega a última versão publicada de cada página. Página que nunca foi publicada sai como o <b>original em inglês</b>. Capítulos importados já vêm escaneados e limpos; os que tinham tradução já vêm publicados.
      </p>
    </details>
  )
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </div>
  )
}

type CleanCheckPreview = Awaited<ReturnType<typeof workflowsApi.cleanCheck>>

function CleanCheckDialog({ open, chapters, onClose, onDone }: { open: boolean; chapters: LibraryChapter[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useJobs()
  const [result, setResult] = useState<{ key: string; preview: CleanCheckPreview | null; error: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const ids = chapters.map((c) => c.id).join(',')
  const key = ids
  const preview = result?.key === key ? result.preview : null
  const error = result?.key === key ? result.error : null

  useEffect(() => {
    if (!open || !ids) return
    let alive = true
    workflowsApi.cleanCheck(ids.split(','), true).then(
      (r) => alive && setResult({ key: ids, preview: r, error: null }),
      (err: unknown) => alive && setResult({ key: ids, preview: null, error: err instanceof Error ? err.message : String(err) }),
    )
    return () => {
      alive = false
    }
  }, [open, ids])

  const submit = async () => {
    if (!preview?.pages) return
    setSaving(true)
    try {
      const r = await workflowsApi.cleanCheck(ids.split(','), false)
      toast('done', `Workflow #${r.id} criado: verificando ${r.pages} ${r.pages === 1 ? 'página' : 'páginas'} na fila de processamento.`)
      onDone()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const skipped = preview?.skipped
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Remover inglês restante"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!preview?.pages || saving} onClick={() => void submit()} data-testid="clean-check-apply">
            {saving ? 'Criando…' : preview?.pages ? `Verificar ${plural(preview.pages, 'página', 'páginas')}` : 'Verificar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          Só as páginas marcadas para revisão entram. O detector de texto (o mesmo do Escanear, sem custo de API) olha a base limpa de cada uma. Texto em inglês que sobrou embaixo de uma caixa de tradução é apagado com o LaMa, e restos claros (texto "fantasma") dentro dos balões são removidos sem mexer no contorno. A tradução é desenhada de novo por cima e a página é publicada. Inglês num balão sem tradução não é apagado: vira um comentário na página para você decidir.
        </p>
        <div data-testid="clean-check-preview">
          {error ? (
            <span className="text-failed">{error}</span>
          ) : !preview ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Contando as páginas…
            </span>
          ) : preview.pages ? (
            `${plural(preview.pages, 'página marcada para revisão', 'páginas marcadas para revisão')} em ${plural(preview.chapters, 'capítulo', 'capítulos')} ${preview.pages === 1 ? 'será verificada' : 'serão verificadas'}.`
          ) : (
            'Nenhuma página marcada para revisão com base limpa nesses capítulos.'
          )}
        </div>
        {skipped && (skipped.busy.length > 0 || skipped.lockedPages > 0) && (
          <Notice tone="queued">
            Ficam de fora:
            {skipped.busy.length > 0 && ` ${skipped.busy.map((b) => `Cap. ${b.number} (${b.label})`).join(', ')};`}
            {skipped.lockedPages > 0 && ` ${plural(skipped.lockedPages, 'página em outro processo', 'páginas em outro processo')};`}
            {' '}rode de novo quando terminarem.
          </Notice>
        )}
      </div>
    </Dialog>
  )
}

function FontRaiseDialog({ open, chapters, onClose, onDone }: { open: boolean; chapters: LibraryChapter[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useJobs()
  const [size, setSize] = useState('30')
  const [result, setResult] = useState<{ key: string; preview: FontRaiseResult | null; error: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const value = Math.round(Number(size))
  const valid = size.trim() !== '' && value >= 6 && value <= 300
  const ids = chapters.map((c) => c.id).join(',')
  const key = `${ids}|${value}`
  const preview = result?.key === key ? result.preview : null
  const error = result?.key === key ? result.error : null

  useEffect(() => {
    if (!open || !valid || !ids) return
    let alive = true
    const t = setTimeout(() => {
      reviewApi.raiseFontSize(ids.split(','), value, true).then(
        (r) => alive && setResult({ key: `${ids}|${value}`, preview: r, error: null }),
        (err: unknown) => alive && setResult({ key: `${ids}|${value}`, preview: null, error: err instanceof Error ? err.message : String(err) }),
      )
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [open, valid, value, ids])

  const submit = async () => {
    if (!valid || !preview?.layers) return
    setSaving(true)
    try {
      const r = await reviewApi.raiseFontSize(ids.split(','), value, false)
      const what = `${r.layers} ${r.layers === 1 ? 'caixa foi' : 'caixas foram'} para ${r.minSize} px em ${r.pages} ${r.pages === 1 ? 'página' : 'páginas'}`
      if (r.workflow) toast('done', `${what}. Workflow #${r.workflow.id} publicando ${r.workflow.items} ${r.workflow.items === 1 ? 'página' : 'páginas'} na fila leve.`)
      else toast('failed', `${what}, mas a publicação não começou: ${r.publishError ?? 'motivo desconhecido'}. As alterações ficam salvas para publicar depois.`)
      onDone()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const skipped = preview?.skipped
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Tamanho mínimo da fonte"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid || !preview?.layers || saving} onClick={() => void submit()} data-testid="raise-font-apply">
            {saving ? 'Aplicando…' : preview?.layers ? `Aumentar ${plural(preview.layers, 'caixa', 'caixas')} e publicar` : 'Aumentar e publicar'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Tamanho mínimo (px)" hint="Só os textos menores que esse valor mudam; os maiores ou iguais ficam como estão.">
          <input className={inputClass} type="number" min={6} max={300} step={1} value={size} onChange={(e) => setSize(e.target.value)} autoFocus />
        </Field>
        <div className="text-sm text-slate-600 dark:text-slate-300" data-testid="raise-font-preview">
          {!valid ? (
            'Digite um tamanho de 6 a 300 px.'
          ) : error ? (
            <span className="text-failed">{error}</span>
          ) : !preview ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Contando as caixas…
            </span>
          ) : preview.layers ? (
            <>
              {plural(preview.layers, 'caixa de texto', 'caixas de texto')} em {plural(preview.pages, 'página', 'páginas')} de {plural(preview.chapters, 'capítulo', 'capítulos')} {preview.layers === 1 ? 'está' : 'estão'} abaixo de {preview.minSize} px (a menor tem {preview.smallest} px). Elas vão para {preview.minSize} px e as páginas são redesenhadas e publicadas.
            </>
          ) : (
            `Nenhuma caixa de texto abaixo de ${preview.minSize} px nos capítulos escolhidos.`
          )}
        </div>
        {skipped && (skipped.busy.length > 0 || skipped.lockedPages > 0 || skipped.editingPages > 0) && (
          <Notice tone="queued">
            Ficam de fora:
            {skipped.busy.length > 0 && ` ${skipped.busy.map((b) => `Cap. ${b.number} (${b.label})`).join(', ')};`}
            {skipped.lockedPages > 0 && ` ${plural(skipped.lockedPages, 'página em outro processo', 'páginas em outro processo')};`}
            {skipped.editingPages > 0 && ` ${plural(skipped.editingPages, 'página sendo editada', 'páginas sendo editadas')} por outra pessoa;`}
            {' '}rode de novo quando terminarem.
          </Notice>
        )}
        <p className="text-xs text-slate-500">Se o texto maior não couber na caixa, ele passa da altura dela; confira as páginas na revisão.</p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function RangeDialog({ open, chapters, onClose, onPick }: { open: boolean; chapters: LibraryChapter[]; onClose: () => void; onPick: (ids: string[]) => void }) {
  const numbers = chapters.filter((c) => c.pages > 0).map((c) => c.number)
  const min = numbers.length ? Math.min(...numbers) : 1
  const max = numbers.length ? Math.max(...numbers) : 1
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const a = from.trim() === '' ? min : Number(from)
  const b = to.trim() === '' ? max : Number(to)
  const valid = Number.isFinite(a) && Number.isFinite(b)
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  const inRange = valid ? chapters.filter((c) => c.number >= lo && c.number <= hi && c.pages > 0) : []
  const pick = inRange.filter((c) => !c.locked)
  const busy = inRange.length - pick.length
  const submit = () => {
    if (!pick.length) return
    onPick(pick.map((c) => c.id))
    setFrom('')
    setTo('')
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Selecionar intervalo de capítulos"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!pick.length} onClick={submit}>
            Selecionar {pick.length ? `${pick.length} ${pick.length === 1 ? 'capítulo' : 'capítulos'}` : ''}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Do capítulo">
            <input className={inputClass} type="number" inputMode="decimal" step="any" placeholder={String(min)} value={from} onChange={(e) => setFrom(e.target.value)} autoFocus />
          </Field>
          <Field label="Até o capítulo">
            <input className={inputClass} type="number" inputMode="decimal" step="any" placeholder={String(max)} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          {!valid
            ? 'Digite números de capítulo.'
            : pick.length
              ? `Do ${lo} ao ${hi}: ${pick.length} ${pick.length === 1 ? 'capítulo entra' : 'capítulos entram'} na seleção, somando aos que já estão marcados.`
              : `Nenhum capítulo livre com páginas entre ${lo} e ${hi}.`}
          {busy > 0 && ` ${busy} ${busy === 1 ? 'fica de fora por estar' : 'ficam de fora por estarem'} em outro processo.`}
        </p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

function ExportDialog({ open, seriesId, chapters, onClose }: { open: boolean; seriesId: string; chapters: LibraryChapter[]; onClose: () => void }) {
  const [kind, setKind] = useState<ExportKind>('current')
  const pages = chapters.reduce((s, c) => s + c.pages, 0)
  const translated = chapters.reduce((s, c) => s + c.rendered, 0)
  const numbers = chapters.map((c) => c.number).sort((a, b) => a - b)
  const { toast } = useJobs()
  const [sending, setSending] = useState(false)
  const start = async () => {
    setSending(true)
    try {
      const r = await exportsApi.create(seriesId, numbers, kind)
      toast('done', r.reused ? 'Esse zip já existe: está em Downloads.' : 'Gerando o zip. Ele aparece em Downloads quando ficar pronto.')
      onClose()
      window.dispatchEvent(new Event(OPEN_DOWNLOADS))
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Baixar capítulos em .zip"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={start} disabled={!chapters.length || sending}>
            {sending ? <Spinner /> : 'Gerar .zip'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          {num(chapters.length)} {chapters.length === 1 ? 'capítulo' : 'capítulos'} ({chapterSpec(numbers)}) · {num(pages)} páginas. Dentro do .zip, uma pasta por capítulo (<code>1/</code>, <code>2/</code>…) com as páginas em ordem.
        </p>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-medium">Quais imagens?</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="export-kind" className="mt-1 accent-brand" checked={kind === 'current'} onChange={() => setKind('current')} />
            <span>
              <b>Traduzidas</b> — a versão atual de cada página ({num(translated)} com tradução). Páginas sem tradução vão como o original.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="export-kind" className="mt-1 accent-brand" checked={kind === 'original'} onChange={() => setKind('original')} />
            <span>
              <b>Originais</b> — as páginas como vieram, sem tradução.
            </span>
          </label>
        </fieldset>
        <p className="text-xs text-slate-500">O zip é montado no servidor e aparece em Downloads (no topo da tela) quando ficar pronto. Fica disponível por 24 horas para qualquer pessoa da scan.</p>
      </div>
    </Dialog>
  )
}

const PACKAGE_OPTIONS: { key: keyof PackageInclude; label: string; hint: string }[] = [
  { key: 'analysis', label: 'Escaneamento (detecção dos balões)', hint: 'analysis.json' },
  { key: 'layers', label: 'Tradução: caixas de texto e página limpa', hint: 'layers.json + clean/' },
  { key: 'translated', label: 'Imagens traduzidas publicadas', hint: 'translated/ · deixa o pacote maior' },
  { key: 'glossary', label: 'Glossário da série', hint: 'glossary.json' },
]

function PackageDialog({ open, seriesId, chapters, onClose }: { open: boolean; seriesId: string; chapters: LibraryChapter[]; onClose: () => void }) {
  const [include, setInclude] = useState<PackageInclude>({ analysis: true, layers: true, translated: true, glossary: true })
  const numbers = chapters.map((c) => c.number).sort((a, b) => a - b)
  const pages = chapters.reduce((s, c) => s + c.pages, 0)
  const { toast } = useJobs()
  const [sending, setSending] = useState(false)
  const start = async () => {
    setSending(true)
    try {
      await exportsApi.create(seriesId, numbers, 'package', include)
      toast('done', 'Gerando o pacote. Ele aparece em Downloads quando ficar pronto.')
      onClose()
      window.dispatchEvent(new Event(OPEN_DOWNLOADS))
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Exportar pacote · ${chapters.length === 1 ? 'cap.' : 'caps.'} ${chapterSpec(numbers)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={start} disabled={!chapters.length || sending} data-testid="export-package-start">
            {sending ? <Spinner /> : 'Exportar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          Um .zip por capítulo ({num(chapters.length)} {chapters.length === 1 ? 'capítulo' : 'capítulos'}, {num(pages)} páginas), para importar em outro ambiente já traduzido. <b>Não é só o download das imagens:</b> para isso use o Baixar .zip.
        </p>
        <fieldset className="space-y-1.5">
          <label className="flex items-start gap-2 text-slate-500">
            <input type="checkbox" className="mt-1" checked disabled />
            <span>
              Páginas originais <span className="block text-xs">sempre incluídas</span>
            </span>
          </label>
          {PACKAGE_OPTIONS.map((o) => (
            <label key={o.key} className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 accent-brand" checked={include[o.key]} onChange={(e) => setInclude({ ...include, [o.key]: e.target.checked })} />
              <span>
                {o.label} <span className="block text-xs text-slate-500">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-slate-500">O resultado é um .zip com um .zip por capítulo dentro (6.zip, 7.zip…): extraia e use “Importar capítulos” no outro ambiente. Fica em Downloads por 24 horas.</p>
      </div>
    </Dialog>
  )
}

function DownloadDialog({ open, seriesId, onClose, onPick }: { open: boolean; seriesId: string; onClose: () => void; onPick: (numbers: number[]) => void }) {
  const { toast } = useJobs()
  const site = usePolling(() => (open ? libraryApi.siteChapters(seriesId) : Promise.resolve(null)), 0, [open, seriesId])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const list = site.data?.chapters ?? []
  const missing = list.filter((c) => !c.downloaded)

  const refresh = async () => {
    setRefreshing(true)
    try {
      await libraryApi.refreshSiteChapters(seriesId)
      await site.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Baixar capítulos"
      wide
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          <Button variant="primary" disabled={!picked.size} onClick={() => onPick([...picked])}>
            Continuar · {picked.size}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-500">
            {site.data?.listedAt ? `${num(list.length)} capítulos no site · lista ${ago(site.data.listedAt)}` : 'A lista do site ainda não foi lida.'}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(missing.map((c) => c.number)))} disabled={!missing.length}>
              Todos os que faltam ({missing.length})
            </Button>
            <Button size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Spinner /> : 'Atualizar lista'}
            </Button>
          </div>
        </div>
        {site.error && <Notice tone="failed">{site.error}</Notice>}
        <div className="grid max-h-80 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-8">
          {list.map((c) => {
            const on = picked.has(c.number)
            return (
              <button
                key={c.number}
                type="button"
                onClick={() =>
                  setPicked((s) => {
                    const n = new Set(s)
                    if (on) n.delete(c.number)
                    else n.add(c.number)
                    return n
                  })
                }
                className={`rounded-md border px-2 py-1 text-xs tabular-nums ${on ? 'border-brand bg-brand text-white' : c.downloaded ? 'border-done/40 text-done' : 'border-slate-300 dark:border-slate-700'}`}
                title={c.downloaded ? 'Já baixado' : ''}
              >
                {c.number}
                {c.downloaded ? ' ✓' : ''}
              </button>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}
