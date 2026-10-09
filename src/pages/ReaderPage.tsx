import { useEffect, useMemo, useRef, useState } from 'react'
import { api, imageUrl, type Note, type NoteKind, type PageInfo } from '../api'
import { useJobs } from '../components/jobsContext'
import { Button, EmptyState, Notice, Spinner } from '../components/ui'
import { cx } from '../lib/cx'
import { ago, chapterNo } from '../lib/format'
import { href, navigate, usePolling } from '../lib/hooks'
import { byPosition, KIND_ORDER, NOTE_KINDS } from '../lib/notes'

const ANNOTATE_KEY = 'reader.annotate'

function stored(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function store(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
  }
}

function neighbor(chapter: string, step: number): string {
  const n = chapterNo(chapter) + step
  return `chapter-${String(Math.max(n, 0)).padStart(3, '0')}`
}

type Draft = { page: string; x: number; y: number }

export function ReaderPage({ slug, chapter, focus }: { slug: string; chapter: string; focus?: string }) {
  const { finishedCount } = useJobs()
  const pagesQuery = usePolling(() => api.pages(slug, chapter), 0, [slug, chapter, finishedCount])
  const notesQuery = usePolling(() => api.chapterNotes(slug, chapter), 0, [slug, chapter])
  const [annotate, setAnnotate] = useState(() => stored(ANNOTATE_KEY))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openId, setOpenId] = useState<string | null>(focus ?? null)
  const [panel, setPanel] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [originals, setOriginals] = useState<Set<string>>(new Set())
  const [lastKind, setLastKind] = useState<NoteKind>('illegible')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const pages = pagesQuery.data
  const notes = useMemo(() => [...(notesQuery.data ?? [])].sort(byPosition), [notesQuery.data])
  const visible = notes.filter((n) => showResolved || !n.resolvedAt || n.id === openId)
  const number = new Map(visible.map((n, i) => [n.id, i + 1]))
  const openCount = notes.filter((n) => !n.resolvedAt).length

  const toggleAnnotate = (on = !annotate) => {
    setAnnotate(on)
    store(ANNOTATE_KEY, on)
    if (!on) setDraft(null)
  }

  const annotateRef = useRef(annotate)
  useEffect(() => {
    annotateRef.current = annotate
  }, [annotate])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select')
      if (e.key === 'Escape') {
        setDraft(null)
        setOpenId(null)
      } else if (!typing && (e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey) {
        const on = !annotateRef.current
        setAnnotate(on)
        store(ANNOTATE_KEY, on)
        if (!on) setDraft(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const scrolled = useRef(false)
  useEffect(() => {
    if (!focus || scrolled.current || !pages || !notesQuery.data) return
    const el = document.getElementById(`note-${focus}`)
    if (!el) return
    scrolled.current = true
    setTimeout(() => el.scrollIntoView({ block: 'center' }), 300)
  }, [focus, pages, notesQuery.data])

  const goTo = (note: Note) => {
    setDraft(null)
    setOpenId(note.id)
    document.getElementById(`note-${note.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setSaveError(null)
    try {
      await action()
      await notesQuery.reload()
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const onPageClick = (page: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (draft || openId) {
      setDraft(null)
      setOpenId(null)
      return
    }
    if (!annotate) return
    const r = e.currentTarget.getBoundingClientRect()
    setDraft({ page, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height })
  }

  const n = chapterNo(chapter)
  const chapterLink = (step: number) => href('series', slug, 'read', neighbor(chapter, step))

  return (
    <div className="-mx-4 -my-6 pb-28">
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-3">
            <a href={href('series', slug, 'notes')} className="text-slate-500 hover:text-brand dark:text-slate-400">
              ← {slug}
            </a>
            <a href={href('series', slug, 'chapter', chapter)} className="text-slate-500 hover:text-brand dark:text-slate-400">
              páginas
            </a>
          </div>
          <h1 className="text-lg font-semibold">Capítulo {n}</h1>
        </div>
      </div>

      {pagesQuery.error && (
        <div className="mx-auto max-w-3xl px-4">
          <Notice tone="failed">{pagesQuery.error}</Notice>
        </div>
      )}
      {!pages && !pagesQuery.error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}
      {pages && !pages.length && <EmptyState>Capítulo não encontrado ou ainda não escaneado.</EmptyState>}

      <div className="mx-auto max-w-3xl">
        {pages?.map((p) => (
          <ReaderPageImage
            key={p.file}
            slug={slug}
            chapter={chapter}
            page={p}
            original={originals.has(p.file)}
            onToggleOriginal={() =>
              setOriginals((s) => {
                const next = new Set(s)
                if (next.has(p.file)) next.delete(p.file)
                else next.add(p.file)
                return next
              })
            }
            annotate={annotate}
            onClick={(e) => onPageClick(p.file, e)}
          >
            {visible
              .filter((note) => note.page === p.file)
              .map((note) => (
                <Pin
                  key={note.id}
                  note={note}
                  number={number.get(note.id) ?? 0}
                  active={note.id === openId}
                  onClick={() => {
                    setDraft(null)
                    setOpenId(note.id === openId ? null : note.id)
                  }}
                >
                  {note.id === openId && (
                    <NoteEditor
                      key={note.id}
                      note={note}
                      busy={busy}
                      error={saveError}
                      onClose={() => setOpenId(null)}
                      onSave={(kind, comment) =>
                        run(() => api.editNote(slug, chapter, note.id, { kind, comment })).then(
                          (ok) => ok && setOpenId(null),
                        )
                      }
                      onResolve={(resolved) =>
                        run(() => api.editNote(slug, chapter, note.id, { resolved })).then(
                          (ok) => ok && setOpenId(null),
                        )
                      }
                      onDelete={() =>
                        run(() => api.deleteNote(slug, chapter, note.id)).then((ok) => ok && setOpenId(null))
                      }
                    />
                  )}
                </Pin>
              ))}
            {draft?.page === p.file && (
              <Pin draft note={{ ...draft, kind: lastKind }} number={0} active onClick={() => setDraft(null)}>
                <NoteEditor
                  kind={lastKind}
                  busy={busy}
                  error={saveError}
                  onClose={() => setDraft(null)}
                  onSave={(kind, comment) => {
                    setLastKind(kind)
                    return run(() => api.addNote(slug, chapter, { ...draft, kind, comment })).then(
                      (ok) => ok && setDraft(null),
                    )
                  }}
                />
              </Pin>
            )}
          </ReaderPageImage>
        ))}
      </div>

      {pages && pages.length > 0 && (
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-8">
          <a href={chapterLink(-1)} className="text-sm text-slate-500 hover:text-brand dark:text-slate-400">
            ← Capítulo {n - 1}
          </a>
          <Button variant="primary" onClick={() => navigate(chapterLink(1))}>
            Próximo capítulo ({n + 1}) →
          </Button>
        </div>
      )}

      <Toolbar
        annotate={annotate}
        onAnnotate={() => toggleAnnotate()}
        openCount={openCount}
        onPanel={() => setPanel((v) => !v)}
        prev={chapterLink(-1)}
        next={chapterLink(1)}
      />

      {panel && (
        <NotesPanel
          notes={notes}
          number={number}
          showResolved={showResolved}
          onShowResolved={setShowResolved}
          onPick={goTo}
          onClose={() => setPanel(false)}
          loadError={notesQuery.error}
        />
      )}
    </div>
  )
}

function ReaderPageImage({
  slug,
  chapter,
  page,
  original,
  onToggleOriginal,
  annotate,
  onClick,
  children,
}: {
  slug: string
  chapter: string
  page: PageInfo
  original: boolean
  onToggleOriginal: () => void
  annotate: boolean
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  children: React.ReactNode
}) {
  const translated = page.translated && !original
  const src = translated
    ? imageUrl('translated', slug, chapter, page.file, page.status)
    : imageUrl('downloads', slug, chapter, page.file)
  return (
    <div className="group relative" data-page={page.file}>
      <div className={cx('relative', annotate && 'cursor-crosshair')} onClick={onClick}>
        <img src={src} alt={page.file} loading="lazy" className="block w-full select-none" draggable={false} />
        {children}
      </div>
      <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
        <span className="rounded bg-slate-950/70 px-1.5 py-0.5 text-[11px] text-white">{page.file}</span>
        {page.translated ? (
          <button
            type="button"
            onClick={onToggleOriginal}
            className="pointer-events-auto rounded bg-slate-950/70 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand"
          >
            {original ? 'Ver tradução' : 'Ver original'}
          </button>
        ) : (
          <span className="rounded bg-queued px-1.5 py-0.5 text-[11px] font-medium text-white">original · sem tradução</span>
        )}
      </div>
      {original && (
        <span className="absolute top-2 left-2 rounded bg-queued px-1.5 py-0.5 text-[11px] font-medium text-white">
          original
        </span>
      )}
    </div>
  )
}

function Pin({
  note,
  number,
  active,
  draft,
  onClick,
  children,
}: {
  note: Pick<Note, 'x' | 'y' | 'kind'> & { id?: string; resolvedAt?: string }
  number: number
  active: boolean
  draft?: boolean
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      id={note.id ? `note-${note.id}` : undefined}
      className={cx('absolute', active ? 'z-30' : 'z-10')}
      style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onClick}
        title={NOTE_KINDS[note.kind].label}
        className={cx(
          'flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold shadow-lg ring-2 ring-white transition',
          note.resolvedAt ? 'bg-slate-400 text-white opacity-70' : NOTE_KINDS[note.kind].pin,
          active && 'scale-110 ring-4',
          draft && 'animate-pulse',
        )}
      >
        {draft ? '+' : note.resolvedAt ? '✓' : number}
      </button>
      {children && (
        <div className={cx('absolute top-5', note.x > 0.55 ? 'right-0' : 'left-0')}>{children}</div>
      )}
    </div>
  )
}

function NoteEditor({
  note,
  kind: initialKind,
  busy,
  error,
  onSave,
  onClose,
  onResolve,
  onDelete,
}: {
  note?: Note
  kind?: NoteKind
  busy: boolean
  error: string | null
  onSave: (kind: NoteKind, comment: string) => void
  onClose: () => void
  onResolve?: (resolved: boolean) => void
  onDelete?: () => void
}) {
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? initialKind ?? 'illegible')
  const [comment, setComment] = useState(note?.comment ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = () => onSave(kind, comment)
  return (
    <div
      className="w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <strong className="text-sm">{note ? 'Anotação' : 'Nova anotação'}</strong>
        {note && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {note.resolvedAt ? `resolvida ${ago(note.resolvedAt)}` : ago(note.createdAt)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cx(
              'rounded-md border px-2 py-1.5 text-xs font-medium transition',
              kind === k
                ? NOTE_KINDS[k].chip + ' ring-1 ring-current'
                : 'border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300',
            )}
          >
            {NOTE_KINDS[k].label}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
        }}
        placeholder="O que está errado? Sugestão de texto (opcional)"
        className="w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-950"
      />
      {error && <p className="text-xs text-failed">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {onDelete &&
            (confirmDelete ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>
                Confirmar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Excluir
              </Button>
            ))}
          {onResolve && note && (
            <Button size="sm" disabled={busy} onClick={() => onResolve(!note.resolvedAt)}>
              {note.resolvedAt ? 'Reabrir' : '✓ Resolvida'}
            </Button>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={save} title="Ctrl+Enter">
            {busy ? <Spinner className="size-3" /> : null} Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}

function Toolbar({
  annotate,
  onAnnotate,
  openCount,
  onPanel,
  prev,
  next,
}: {
  annotate: boolean
  onAnnotate: () => void
  openCount: number
  onPanel: () => void
  prev: string
  next: string
}) {
  const item =
    'rounded-full px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/10'
  return (
    <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-900/95 p-1 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <a href={prev} className={item} title="Capítulo anterior">
        ←
      </a>
      <button
        type="button"
        onClick={onAnnotate}
        title="Atalho: A"
        className={cx(item, annotate && 'bg-brand text-white hover:bg-brand')}
      >
        {annotate ? '✎ Anotando — clique na página' : '✎ Anotar'}
      </button>
      <button type="button" onClick={onPanel} className={item}>
        Anotações
        {openCount > 0 && (
          <span className="ml-1.5 rounded-full bg-failed px-1.5 text-xs text-white">{openCount}</span>
        )}
      </button>
      <a href={next} className={item} title="Próximo capítulo">
        →
      </a>
    </div>
  )
}

function NotesPanel({
  notes,
  number,
  showResolved,
  onShowResolved,
  onPick,
  onClose,
  loadError,
}: {
  notes: Note[]
  number: Map<string, number>
  showResolved: boolean
  onShowResolved: (v: boolean) => void
  onPick: (n: Note) => void
  onClose: () => void
  loadError: string | null
}) {
  const list = notes.filter((n) => showResolved || !n.resolvedAt)
  return (
    <aside className="fixed top-0 right-0 z-40 flex h-full w-80 max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <strong className="text-sm">Anotações do capítulo</strong>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Fechar">
          ✕
        </Button>
      </div>
      <label className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <input type="checkbox" checked={showResolved} onChange={(e) => onShowResolved(e.target.checked)} />
        Mostrar resolvidas
      </label>
      <div className="flex-1 overflow-y-auto">
        {loadError && <p className="p-4 text-sm text-failed">{loadError}</p>}
        {!list.length && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
            Nenhuma anotação{showResolved ? '' : ' aberta'}. Ligue “Anotar” e clique no ponto da página com problema.
          </p>
        )}
        {list.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onPick(n)}
            className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
          >
            <span
              className={cx(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                n.resolvedAt ? 'bg-slate-400 text-white' : NOTE_KINDS[n.kind].pin,
              )}
            >
              {n.resolvedAt ? '✓' : number.get(n.id)}
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {NOTE_KINDS[n.kind].label} · pág. {n.page.replace(/\.\w+$/, '')}
              </span>
              <span className={cx('block text-sm break-words', n.resolvedAt && 'line-through opacity-60')}>
                {n.comment || <em className="text-slate-400">sem comentário</em>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}
