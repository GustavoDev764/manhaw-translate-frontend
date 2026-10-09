import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl, type PageInfo, type PageState } from '../api'
import { useJobs } from '../components/jobsContext'
import { Badge, Button, Card, EmptyState, Notice, Spinner, type Tone } from '../components/ui'
import { cx } from '../lib/cx'
import { chapterNo } from '../lib/format'
import { href, navigate, usePolling } from '../lib/hooks'

const PAGE_STATE: Record<PageState, { label: string; tone: Tone; border: string }> = {
  done: { label: 'traduzida', tone: 'done', border: 'border-done' },
  queued: { label: 'na fila', tone: 'queued', border: 'border-queued' },
  error: { label: 'erro', tone: 'failed', border: 'border-failed' },
  pending: { label: 'não enviada', tone: 'pending', border: 'border-slate-200 dark:border-slate-800' },
  'no-text': { label: 'sem texto', tone: 'neutral', border: 'border-slate-200 dark:border-slate-800' },
}

type View = 'translated' | 'downloads' | 'preview'

function src(slug: string, chapter: string, p: PageInfo, view: View): string {
  if (view === 'translated' && p.translated) return imageUrl('translated', slug, chapter, p.file, p.status)
  if (view === 'preview' && p.preview) return imageUrl('preview', slug, chapter, p.file)
  return imageUrl('downloads', slug, chapter, p.file)
}

export function ChapterPagesPage({ slug, chapter }: { slug: string; chapter: string }) {
  const { finishedCount } = useJobs()
  const { data, error } = usePolling(() => api.pages(slug, chapter), 10000, [slug, chapter, finishedCount])
  const [filter, setFilter] = useState<PageState | 'all'>('all')
  const [view, setView] = useState<View>('translated')
  const [open, setOpen] = useState<number | null>(null)

  const pages = useMemo(
    () => (data ?? []).filter((p) => filter === 'all' || p.status === filter),
    [data, filter],
  )
  const counts = useMemo(() => {
    const c: Partial<Record<PageState, number>> = {}
    for (const p of data ?? []) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [data])
  const hasPreview = data?.some((p) => p.preview)
  const n = chapterNo(chapter)

  return (
    <div className="space-y-5">
      <div>
        <a href={href('series', slug)} className="text-sm text-slate-500 hover:text-brand dark:text-slate-400">
          ← {slug}
        </a>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Capítulo {n}</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => navigate(href('series', slug, 'read', chapter))}>
              Ler e anotar
            </Button>
            <Button size="sm" onClick={() => navigate(href('series', slug, 'chapter', prevNext(chapter, -1)))}>
              ← Anterior
            </Button>
            <Button size="sm" onClick={() => navigate(href('series', slug, 'chapter', prevNext(chapter, 1)))}>
              Próximo →
            </Button>
          </div>
        </div>
      </div>

      {error && <Notice tone="failed">{error}</Notice>}
      {!data && !error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}

      {data && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">Mostrar:</span>
          {(['all', 'done', 'queued', 'error', 'pending', 'no-text'] as const).map((k) => {
            const count = k === 'all' ? data.length : (counts[k] ?? 0)
            if (k !== 'all' && !count) return null
            return (
              <Button
                key={k}
                size="sm"
                variant={filter === k ? 'primary' : 'secondary'}
                onClick={() => setFilter(k)}
              >
                {k === 'all' ? 'Todas' : PAGE_STATE[k].label} ({count})
              </Button>
            )
          })}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
            {(
              [
                ['translated', 'Traduzida'],
                ['downloads', 'Original'],
                ...(hasPreview ? [['preview', 'Prévia']] : []),
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx(
                  'rounded-md px-2.5 py-1 text-xs font-medium',
                  view === v ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {data && !data.length && <EmptyState>Capítulo ainda não escaneado.</EmptyState>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {pages.map((p, i) => {
          const st = PAGE_STATE[p.status]
          return (
            <button
              key={p.file}
              type="button"
              onClick={() => setOpen(i)}
              className={cx(
                'overflow-hidden rounded-lg border-2 bg-white text-left transition hover:shadow-md dark:bg-slate-900',
                st.border,
              )}
              title={p.error ?? p.file}
            >
              <div className="aspect-[5/8] overflow-hidden bg-slate-100 dark:bg-slate-800">
                <img
                  loading="lazy"
                  src={src(slug, chapter, p, view)}
                  alt={p.file}
                  className="size-full object-cover object-top"
                />
              </div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                <strong>{p.file.replace(/\.\w+$/, '')}</strong>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              {p.error && <div className="px-2 pb-1.5 text-[11px] text-failed">{p.error}</div>}
            </button>
          )
        })}
      </div>

      {open !== null && pages[open] && (
        <Viewer
          slug={slug}
          chapter={chapter}
          pages={pages}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function prevNext(chapter: string, step: number): string {
  const n = chapterNo(chapter) + step
  return `chapter-${String(Math.max(n, 0)).padStart(3, '0')}`
}

function Viewer({
  slug,
  chapter,
  pages,
  index,
  onIndex,
  onClose,
}: {
  slug: string
  chapter: string
  pages: PageInfo[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const p = pages[index]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < pages.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, pages.length, onIndex, onClose])

  const translated = p.translated && p.status !== 'pending' && p.status !== 'queued'
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950/95 text-slate-100" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-sm">
          <strong>{p.file}</strong>
          <Badge tone={PAGE_STATE[p.status].tone}>{PAGE_STATE[p.status].label}</Badge>
          <span className="text-slate-400">
            {index + 1} de {pages.length} · ← → para navegar
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={index === 0} onClick={() => onIndex(index - 1)}>
            ←
          </Button>
          <Button size="sm" disabled={index === pages.length - 1} onClick={() => onIndex(index + 1)}>
            →
          </Button>
          <Button size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
      <div className="grid flex-1 gap-4 overflow-auto px-4 pb-4 md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
        <figure className="space-y-1">
          <figcaption className="text-xs text-slate-400">Original</figcaption>
          <img src={imageUrl('downloads', slug, chapter, p.file)} alt="original" className="mx-auto w-full max-w-2xl" />
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-xs text-slate-400">{translated ? 'Traduzida' : p.preview ? 'Prévia (balões numerados)' : 'Ainda sem tradução'}</figcaption>
          {translated ? (
            <img src={imageUrl('translated', slug, chapter, p.file, p.status)} alt="traduzida" className="mx-auto w-full max-w-2xl" />
          ) : p.preview ? (
            <img src={imageUrl('preview', slug, chapter, p.file)} alt="prévia" className="mx-auto w-full max-w-2xl" />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-slate-800 text-sm text-slate-500">
              {p.error ?? 'Traduza o capítulo para ver aqui.'}
            </div>
          )}
        </figure>
      </div>
    </div>
  )
}
