import { useEffect, useMemo, useRef, useState } from 'react'
import { DISABLED_REASON, useAuth } from '../../auth/authCtx'
import { LaunchDialog } from '../../components/LaunchDialog'
import { StageActions } from '../../components/StageActions'
import { useJobs } from '../../components/jobsContext'
import { UPLOAD_DONE_EVENT, useUploads, type Upload } from '../../components/uploadsContext'
import { Badge, Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner, Tabs } from '../../components/ui'
import { GlossaryPanel } from './GlossaryPanel'
import { DeleteSeriesDialog, RenameSeriesDialog } from './SeriesManageDialogs'
import { ago, num } from '../../lib/format'
import { useWorkflowEvents } from '../../lib/workflowEvents'
import { href, usePolling } from '../../lib/hooks'
import { chapterSpec, exportUrl, libraryApi, STAGE_LABEL, type ExportKind, type LaunchInput, type LibraryChapter } from '../../workflowsApi'

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
  const [ranging, setRanging] = useState(false)
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

  const chapters = useMemo(() => data?.chapters ?? [], [data])
  const free = chapters.filter((c) => !c.locked && c.pages > 0)
  const chosen = chapters.filter((c) => selected.has(c.id))
  const exportable = chosen.filter((c) => c.pages > 0)
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

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
              addUploads(data.id, Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <Tabs<'chapters' | 'glossary'>
        value={tab}
        onChange={(t) => {
          window.location.hash = t === 'glossary' ? href('s', slug, 'glossario') : href('s', slug)
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
      <Card className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 p-3">
        <StageActions
          count={chosen.length}
          unit={chosen.length === 1 ? 'capítulo' : 'capítulos'}
          canRender={chosen.some((c) => c.translated > 0)}
          onLaunch={(type) => setLaunch({ type, seriesId: data.id, chapterIds: chosen.map((c) => c.id) })}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setExporting(true)} disabled={!exportable.length} title={exportable.length ? 'Baixa os capítulos selecionados num .zip, uma pasta por capítulo' : 'Selecione capítulos com páginas'}>
            Baixar .zip{exportable.length ? ` (${exportable.length})` : ''}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(chapters.filter((c) => c.pages > 0).map((c) => c.id)))}>
            Selecionar todos ({chapters.filter((c) => c.pages > 0).length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(free.map((c) => c.id)))}>
            Selecionar livres ({free.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRanging(true)} disabled={!free.length} title="Escolhe do capítulo X até o Y de uma vez">
            Selecionar intervalo
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          )}
        </div>
      </Card>

      {!chapters.length && !mine.length && <EmptyState>Nenhum capítulo ainda. Use “Importar capítulos” para enviar os .zip (1.zip, 2.zip…){SITE_DOWNLOAD_ENABLED && data.sourceUrl ? ' ou “Baixar capítulos”' : ''}.</EmptyState>}
      {(chapters.length > 0 || mine.length > 0) && (
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
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {mine
                .filter((u) => !chapters.some((c) => c.number === u.number))
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
            window.location.hash = href()
          }} />
        </>
      )}
      <LaunchDialog input={launch} onClose={() => setLaunch(null)} onCreated={() => {
        setSelected(new Set())
        void reload()
      }} />
      <ExportDialog open={exporting} seriesId={data.id} chapters={exportable} onClose={() => setExporting(false)} />
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
          disabled={blocked || !c.pages}
          onChange={onToggle}
          aria-label={`Selecionar capítulo ${c.number}`}
          title={blocked ? 'Tem páginas em outro processo: abra o capítulo para escolher as livres' : ''}
        />
      </td>
      <td className="p-3 font-medium">
        <a href={href('s', slug, c.id)} className="hover:text-brand">
          Cap. {c.number}
        </a>
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
        {blocked && c.lock && (
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
  const start = () => {
    const a = document.createElement('a')
    a.href = exportUrl(seriesId, numbers, kind)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Baixar capítulos em .zip"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={start} disabled={!chapters.length}>
            Baixar .zip
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
        <p className="text-xs text-slate-500">O download começa na hora e o navegador mostra o progresso. Muitos capítulos podem dar alguns GB.</p>
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
