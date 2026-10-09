import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle } from '../../components/AlertTriangle'
import { assetViewUrl } from '../../lib/assets'
import { href, usePolling } from '../../lib/hooks'
import { reviewApi } from '../../reviewApi'
import { libraryApi, type LibraryChapter, type LibraryPage } from '../../workflowsApi'

const THEME = {
  '--reader-bg': '#0b0b0f',
  '--reader-surface': 'rgba(17, 17, 22, 0.92)',
  '--reader-card': '#1a1a22',
  '--reader-border': 'rgba(255, 255, 255, 0.08)',
  '--reader-text': '#e6e6ee',
  '--reader-muted': '#9a9ab0',
  '--reader-faint': '#6a6a80',
  '--reader-accent': '#5eead4',
} as CSSProperties

const EAGER = 3
const HIDE_AFTER = 100
const PLACEHOLDER = 900

interface Loaded {
  chapter: LibraryChapter
  pages: LibraryPage[]
}

const label = (c: LibraryChapter) => `Capítulo ${c.number}`
const imageOf = (p: LibraryPage) => {
  const id = p.current?.assetId ?? p.originalAssetId
  return id ? assetViewUrl(id) : null
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
const ICON = {
  back: 'M15 18l-6-6 6-6',
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  list: 'M4 6h16M4 12h16M4 18h10',
  top: 'M12 19V5M5 12l7-7 7 7',
}

function BarButton({ title, onClick, disabled, children, wide }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-[var(--reader-muted)] transition hover:bg-white/5 hover:text-[var(--reader-text)] disabled:opacity-30 disabled:hover:bg-transparent ${wide ? 'px-3 text-sm' : 'w-10'}`}
    >
      {children}
    </button>
  )
}

export function MangaReaderPage({ slug, chapterId }: { slug: string; chapterId?: string }) {
  const detail = usePolling(() => libraryApi.seriesDetail(slug), 0, [slug])
  const chapters = useMemo(() => [...(detail.data?.chapters ?? [])].filter((c) => c.pages > 0).sort((a, b) => a.number - b.number), [detail.data])
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [current, setCurrent] = useState<{ chapterId: string; page: number } | null>(null)
  const [bars, setBars] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingNext, setLoadingNext] = useState(false)
  const [reportedNow, setReportedNow] = useState<Record<string, boolean>>({})
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scroller = useRef<HTMLDivElement>(null)
  const tracker = useRef<IntersectionObserver | null>(null)
  const busy = useRef(false)
  const lastY = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const indexOf = useCallback((id: string | undefined) => chapters.findIndex((c) => c.id === id), [chapters])
  const currentChapter = chapters[indexOf(current?.chapterId)] ?? loaded[0]?.chapter
  const currentIndex = indexOf(currentChapter?.id)
  const currentPages = loaded.find((l) => l.chapter.id === currentChapter?.id)?.pages.length ?? 0
  const lastLoaded = loaded.at(-1)
  const nextToLoad = lastLoaded ? chapters[indexOf(lastLoaded.chapter.id) + 1] : undefined
  const atEnd = !!lastLoaded && !nextToLoad

  const open = useCallback(
    async (id: string) => {
      const chapter = chapters.find((c) => c.id === id)
      if (!chapter) return
      busy.current = true
      setError(null)
      setDrawer(false)
      try {
        const r = await libraryApi.pages(id)
        setLoaded([{ chapter, pages: r.pages }])
        setCurrent({ chapterId: id, page: 0 })
        setBars(true)
        scroller.current?.scrollTo({ top: 0 })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        busy.current = false
      }
    },
    [chapters],
  )

  const appendNext = useCallback(async () => {
    if (busy.current || !nextToLoad) return
    busy.current = true
    setLoadingNext(true)
    try {
      const r = await libraryApi.pages(nextToLoad.id)
      setLoaded((prev) => (prev.some((l) => l.chapter.id === nextToLoad.id) ? prev : [...prev, { chapter: nextToLoad, pages: r.pages }]))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      busy.current = false
      setLoadingNext(false)
    }
  }, [nextToLoad])

  useEffect(() => {
    if (!chapters.length || loaded.length || busy.current) return
    void open(chapters.some((c) => c.id === chapterId) ? chapterId! : chapters[0].id)
  }, [chapters, chapterId, loaded.length, open])

  useEffect(() => {
    tracker.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          setCurrent({ chapterId: el.dataset.chapter!, page: Number(el.dataset.index) })
        }
      },
      { root: scroller.current, rootMargin: '-50% 0px -50% 0px' },
    )
    return () => tracker.current?.disconnect()
  }, [])

  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void appendNext(), { root: scroller.current, rootMargin: '0px 0px 2000px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [appendNext, loaded.length])

  useEffect(() => {
    if (current?.chapterId) window.history.replaceState(null, '', href('ler', slug, current.chapterId))
  }, [current?.chapterId, slug])

  const goTo = useCallback((offset: number) => {
    const target = chapters[currentIndex + offset]
    if (target) void open(target.id)
  }, [chapters, currentIndex, open])

  const toTop = useCallback(() => {
    if (!currentChapter) return
    document.getElementById(`cap-${currentChapter.id}`)?.scrollIntoView({ block: 'start' })
    setBars(true)
  }, [currentChapter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') setDrawer(false)
      else if (e.key === 'ArrowLeft') goTo(-1)
      else if (e.key === 'ArrowRight') goTo(1)
      else if (e.key === 'Home') toTop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, toTop])

  const onScroll = () => {
    const y = scroller.current?.scrollTop ?? 0
    if (y > lastY.current + 8 && y > HIDE_AFTER) setBars(false)
    else if (y < lastY.current - 8) setBars(true)
    lastY.current = y
  }

  const onStripClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return
    clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => setBars((b) => !b), 250)
  }

  const list = useMemo(() => {
    const q = filter.trim()
    return [...chapters].reverse().filter((c) => !q || String(c.number).startsWith(q))
  }, [chapters, filter])

  const progress = currentPages ? ((current?.page ?? 0) + 1) / currentPages : 0
  const currentPage = loaded.find((l) => l.chapter.id === currentChapter?.id)?.pages[current?.page ?? 0]
  const isReported = currentPage ? (reportedNow[currentPage.id] ?? !!currentPage.reported) : false

  const say = (text: string) => {
    setFlash(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2500)
  }

  const toggleReport = async () => {
    if (!currentPage || !currentChapter) return
    const n = (current?.page ?? 0) + 1
    try {
      if (isReported) {
        await reviewApi.clearReport(currentPage.id)
        setReportedNow((r) => ({ ...r, [currentPage.id]: false }))
        say(`Relato da página ${n} retirado.`)
      } else {
        await reviewApi.reportReview(currentPage.id)
        setReportedNow((r) => ({ ...r, [currentPage.id]: true }))
        say(`Página ${n} do ${label(currentChapter).toLowerCase()} relatada para revisão.`)
      }
    } catch (err) {
      say(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={THEME} className="fixed inset-0 z-50 bg-[var(--reader-bg)] text-[var(--reader-text)]">
      <div ref={scroller} onScroll={onScroll} onClick={onStripClick} className="h-full overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[800px] pb-24">
          {detail.error && <p className="p-6 text-center text-sm text-red-400">{detail.error}</p>}
          {detail.data && !chapters.length && <p className="p-10 text-center text-sm text-[var(--reader-muted)]">Esta obra ainda não tem capítulos com páginas.</p>}
          {!loaded.length && !detail.error && chapters.length > 0 && <p className="p-10 text-center text-sm text-[var(--reader-muted)]">Carregando…</p>}
          {loaded.map(({ chapter, pages }) => (
            <section key={chapter.id} id={`cap-${chapter.id}`} className="scroll-mt-14">
              <header className="px-4 pb-4 pt-16 text-center">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--reader-faint)]">{detail.data?.title}</div>
                <h2 className="mt-1 text-xl font-semibold">{label(chapter)}</h2>
                <div className="mt-1 text-xs text-[var(--reader-faint)]">{pages.length} páginas</div>
              </header>
              {pages.map((p, i) => {
                const src = imageOf(p)
                return src ? (
                  <img
                    key={p.id}
                    ref={(el) => {
                      if (el) tracker.current?.observe(el)
                    }}
                    data-chapter={chapter.id}
                    data-index={i}
                    src={src}
                    alt={`${label(chapter)}, página ${i + 1}`}
                    loading={i < EAGER ? 'eager' : 'lazy'}
                    fetchPriority={i === 0 ? 'high' : 'auto'}
                    decoding="async"
                    draggable={false}
                    style={{ minHeight: PLACEHOLDER }}
                    onLoad={(e) => (e.currentTarget.style.minHeight = '')}
                    className="block w-full select-none bg-[var(--reader-card)]"
                  />
                ) : null
              })}
            </section>
          ))}
          <div ref={sentinel} />
          {loadingNext && <p className="py-10 text-center text-sm text-[var(--reader-muted)]">Carregando o {nextToLoad ? label(nextToLoad).toLowerCase() : 'próximo capítulo'}…</p>}
          {error && <p className="py-6 text-center text-sm text-red-400">{error}</p>}
          {atEnd && (
            <div className="mx-4 mt-10 rounded-xl border border-[var(--reader-border)] bg-[var(--reader-card)] p-6 text-center">
              <div className="text-sm text-[var(--reader-muted)]">Você chegou ao último capítulo disponível.</div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={toTop} className="rounded-lg border border-[var(--reader-border)] px-4 py-2 text-sm hover:bg-white/5">Topo do capítulo</button>
                <button type="button" onClick={() => setDrawer(true)} className="rounded-lg bg-[var(--reader-accent)] px-4 py-2 text-sm font-medium text-black">Escolher capítulo</button>
                <a href={href('s', slug)} className="rounded-lg border border-[var(--reader-border)] px-4 py-2 text-sm hover:bg-white/5">Voltar à obra</a>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`pointer-events-none fixed inset-x-0 top-0 z-10 transition-transform duration-200 motion-reduce:transition-none ${bars ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="pointer-events-auto flex h-[52px] items-center gap-2 border-b border-[var(--reader-border)] bg-[var(--reader-surface)] px-2 backdrop-blur-md">
          <a href={href('s', slug)} title="Voltar à obra" aria-label="Voltar à obra" className="flex size-10 items-center justify-center rounded-lg text-[var(--reader-muted)] hover:bg-white/5 hover:text-[var(--reader-text)]">
            <Icon d={ICON.back} />
          </a>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{detail.data?.title ?? '…'}</div>
            <div className="truncate text-xs text-[var(--reader-muted)]">{currentChapter ? label(currentChapter) : ''}</div>
          </div>
          {currentPages > 0 && (
            <span className="rounded-md bg-[var(--reader-card)] px-2 py-1 text-xs tabular-nums text-[var(--reader-muted)]">
              {(current?.page ?? 0) + 1} / {currentPages}
            </span>
          )}
        </div>
        <div className="h-0.5 bg-white/5">
          <div className="h-full bg-[var(--reader-accent)] transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className={`pointer-events-none fixed inset-x-0 bottom-4 z-10 flex justify-center transition-transform duration-200 motion-reduce:transition-none ${bars ? 'translate-y-0' : 'translate-y-[150%]'}`}>
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-1 shadow-2xl backdrop-blur-md">
          <BarButton title="Capítulo anterior (←)" onClick={() => goTo(-1)} disabled={currentIndex <= 0}>
            <Icon d={ICON.prev} />
          </BarButton>
          <BarButton title="Escolher capítulo" onClick={() => setDrawer(true)} wide>
            <Icon d={ICON.list} />
            <span className="tabular-nums">{currentChapter ? `Cap. ${currentChapter.number}` : 'Capítulos'}</span>
          </BarButton>
          <BarButton title="Topo do capítulo (Home)" onClick={toTop}>
            <Icon d={ICON.top} />
          </BarButton>
          <BarButton title={isReported ? 'Revisão já relatada nesta página (clique para retirar)' : 'Relatar revisão nesta página'} onClick={() => void toggleReport()} disabled={!currentPage}>
            <span className={isReported ? 'text-amber-400' : ''}>
              <AlertTriangle className="size-5" filled={isReported} />
            </span>
          </BarButton>
          <BarButton title="Próximo capítulo (→)" onClick={() => goTo(1)} disabled={currentIndex < 0 || currentIndex >= chapters.length - 1}>
            <Icon d={ICON.next} />
          </BarButton>
        </div>
      </div>

      {flash && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-4">
          <div className="rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] px-4 py-2 text-sm shadow-2xl backdrop-blur-md">{flash}</div>
        </div>
      )}
      {drawer && <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden />}
      <aside
        aria-label="Capítulos"
        aria-hidden={!drawer}
        className={`fixed inset-y-0 left-0 z-30 flex w-[85%] max-w-sm flex-col border-r border-[var(--reader-border)] bg-[#111116] transition-transform duration-200 motion-reduce:transition-none ${drawer ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="border-b border-[var(--reader-border)] p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--reader-faint)]">Capítulos</div>
          <div className="mt-1 truncate font-semibold">{detail.data?.title}</div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={currentIndex <= 0} onClick={() => goTo(-1)} className="flex-1 rounded-lg border border-[var(--reader-border)] py-1.5 text-sm hover:bg-white/5 disabled:opacity-30">
              Anterior
            </button>
            <button type="button" disabled={currentIndex < 0 || currentIndex >= chapters.length - 1} onClick={() => goTo(1)} className="flex-1 rounded-lg border border-[var(--reader-border)] py-1.5 text-sm hover:bg-white/5 disabled:opacity-30">
              Próximo
            </button>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            inputMode="decimal"
            placeholder="Ir para o capítulo…"
            className="mt-3 w-full rounded-lg border border-[var(--reader-border)] bg-[var(--reader-card)] px-3 py-1.5 text-sm text-[var(--reader-text)] placeholder:text-[var(--reader-faint)] focus:border-[var(--reader-accent)] focus:outline-none"
          />
        </div>
        <ol className="flex-1 overflow-y-auto p-2">
          {list.map((c) => {
            const active = c.id === currentChapter?.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void open(c.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-[var(--reader-accent)]/15 text-[var(--reader-accent)]' : 'hover:bg-white/5'}`}
                >
                  <span>{label(c)}</span>
                  <span className="text-xs text-[var(--reader-faint)]">{active ? 'lendo' : `${c.pages} pág.`}</span>
                </button>
              </li>
            )
          })}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-[var(--reader-faint)]">Nenhum capítulo com esse número.</li>}
        </ol>
      </aside>
    </div>
  )
}
