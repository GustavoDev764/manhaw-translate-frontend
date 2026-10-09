import { useCallback, useEffect, useRef, useState } from 'react'
import { FileLinks } from '../components/FileLinks'
import { assetViewUrl } from '../lib/assets'
import { DISABLED_REASON, useAuth } from '../auth/authCtx'
import { useJobs } from '../components/jobsContext'
import { Badge, Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner, Tabs } from '../components/ui'
import { cx } from '../lib/cx'
import { ago, when } from '../lib/format'
import { href, usePolling } from '../lib/hooks'
import { useWorkflowEvents } from '../lib/workflowEvents'
import { CHANGE_LABEL, loadFont, reviewApi, type CommentAction, type FontRow, type Rect, type ReviewPage as Page, type TextLayer } from '../reviewApi'
import { LayerCanvas, TextPanel } from './review/TextEditing'
import { HANDLES, handleCursor, moveBox, resizeBox, rotationTo, roundBox, type Box, type Handle } from './review/boxGeometry'
import { useEditLock, useLayerDraft } from './review/useLayerDraft'

type Mode = 'view' | 'area' | 'text'
type Tab = 'comments' | 'text' | 'history'
type View = { kind: 'current' } | { kind: 'original' } | { kind: 'clean' } | { kind: 'version'; assetId: string; number: number }

const MIN_BOX = 8
const MAX_FIT_SCALE = 2
const FULL_KEY = 'review.fullscreen'
const PANEL_KEY = 'review.panel'
const CONTEXT_KEY = 'review.context'
const CONTEXT_CHOICES = [0, 250, 500] as const
const CONTEXT_GAP = 0
const asset = assetViewUrl

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function useStoredNumber(key: string, choices: readonly number[], fallback: number): [number, (v: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key))
      return localStorage.getItem(key) !== null && choices.includes(v) ? v : fallback
    } catch {
      return fallback
    }
  })
  const set = useCallback(
    (v: number) => {
      setValue(v)
      try {
        localStorage.setItem(key, String(v))
      } catch {
        return
      }
    },
    [key],
  )
  return [value, set]
}

function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => readPref(key, fallback))
  const set = useCallback(
    (v: boolean) => {
      setValue(v)
      try {
        localStorage.setItem(key, v ? '1' : '0')
      } catch {
        return
      }
    },
    [key],
  )
  return [value, set]
}

export function ReviewPage({ pageId }: { pageId: string }) {
  const { can } = useAuth()
  const { toast } = useJobs()
  const { data: page, error, reload } = usePolling(() => reviewApi.page(pageId), 0, [pageId])
  const fonts = usePolling(reviewApi.fonts, 0, [])
  const [mode, setMode] = useState<Mode>('view')
  const [tab, setTab] = useState<Tab>('comments')
  const [view, setView] = useState<View>({ kind: 'current' })
  const [pendingArea, setPendingArea] = useState<Rect | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [square, setSquare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [full, setFull] = usePref(FULL_KEY, false)
  const [panel, setPanel] = usePref(PANEL_KEY, true)
  const [hideText, setHideText] = useState(false)
  const [contextPx, setContextPx] = useStoredNumber(CONTEXT_KEY, CONTEXT_CHOICES, 250)
  const draft = useLayerDraft(page, reload, useCallback((message: string) => toast('failed', message), [toast]))
  const draftUndo = draft.undo
  const lockedBy = page?.lock?.workflowId ?? null
  useWorkflowEvents((e) => {
    if (lockedBy && (!e || e.workflowId === lockedBy)) void reload()
  })
  const editingActive = !!page && tab === 'text' && view.kind === 'current' && page.editable && can('edit_text')
  const editLock = useEditLock(pageId, editingActive)

  useEffect(() => {
    for (const l of page?.layers ?? []) {
      const f = fonts.data?.find((x) => x.id === l.fontId)
      if (f) void loadFont(f)
    }
  }, [page, fonts.data])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
      if (typing || !page) return
      if (e.key === 'Escape' && full && !document.querySelector('dialog[open]')) {
        setFull(false)
        return
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') {
        setFull(!full)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tab === 'text' && page.editable) {
        e.preventDefault()
        draftUndo()
        return
      }
      if (e.key === 'ArrowLeft' && page.prevId) window.location.hash = href('r', page.prevId)
      if (e.key === 'ArrowRight' && page.nextId) window.location.hash = href('r', page.nextId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, tab, draftUndo, full, setFull])

  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      setBusy(true)
      try {
        const r = await fn()
        if (ok) toast('done', ok)
        await reload()
        return r
      } catch (err) {
        toast('failed', err instanceof Error ? err.message : String(err))
        return null
      } finally {
        setBusy(false)
      }
    },
    [reload, toast],
  )

  if (error) return <Notice tone="failed">{error}</Notice>
  if (!page)
    return (
      <EmptyState>
        <Spinner /> Carregando…
      </EmptyState>
    )

  const current = page.versions.find((v) => v.current)
  const imageId =
    view.kind === 'original' ? page.originalAssetId : view.kind === 'clean' ? page.cleanAssetId : view.kind === 'version' ? view.assetId : (current?.assetId ?? page.originalAssetId)
  const locked = !!page.lock
  const editing = tab === 'text' && view.kind === 'current' && page.editable
  const readOnlyReason = locked ? null : editLock.holder ? editLock.holder : !can('edit_text') ? DISABLED_REASON : null
  const canEditText = editing && !locked && !editLock.holder && can('edit_text')
  const hidingText = hideText && view.kind === 'current' && !!page.cleanAssetId
  const shownImageId = (editing || hidingText) && page.cleanAssetId ? page.cleanAssetId : imageId

  const onDrawn = async (r: Rect) => {
    if (mode === 'area') setPendingArea(r)
    if (mode === 'text') {
      try {
        setSelected(await draft.add(page.id, r, square))
        setMode('view')
      } catch (err) {
        toast('failed', err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <div className={full ? 'fixed inset-0 z-30 flex flex-col gap-2 bg-slate-50 p-2 dark:bg-slate-950' : 'space-y-4'} data-testid="review-root">
      <div className={cx('flex flex-wrap items-center justify-between', full ? 'gap-2 px-1' : 'gap-3')}>
        <div className={full ? 'flex items-baseline gap-3' : undefined}>
          <div className="text-sm text-slate-500">
            <a href={href('s', page.series.slug)} className="hover:text-brand">{page.series.title}</a> ›{' '}
            <a href={href('s', page.series.slug, page.chapter.id)} className="hover:text-brand">Cap. {page.chapter.number}</a>
          </div>
          <h1 className={full ? 'text-base font-semibold' : 'text-xl font-semibold'}>
            Página {page.position} <span className="text-base font-normal text-slate-500">de {page.total}</span>
            {current && <Badge tone="neutral">v{current.number}</Badge>}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={page.prevId ? href('r', page.prevId) : undefined} aria-disabled={!page.prevId}>
            <Button size="sm" disabled={!page.prevId} title="Página anterior (←)">← Anterior</Button>
          </a>
          <a href={page.nextId ? href('r', page.nextId) : undefined} aria-disabled={!page.nextId}>
            <Button size="sm" disabled={!page.nextId} title="Próxima página (→)">Próxima →</Button>
          </a>
          {page.approved ? (
            <span className="flex items-center gap-2 text-sm">
              <Badge tone="done">Aprovada por {page.approved.by}</Badge>
              {can('approve') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => reviewApi.approve(page.id, false), 'Aprovação desfeita.')}>Desfazer</Button>}
            </span>
          ) : (
            <Button size="sm" variant="primary" disabled={busy || !can('approve')} title={can('approve') ? '' : DISABLED_REASON} onClick={() => run(() => reviewApi.approve(page.id, true), 'Página aprovada.')}>
              Aprovar página
            </Button>
          )}
        </div>
      </div>

      {locked && (
        <Notice tone="queued">
          <span className="flex flex-wrap items-center gap-2">
            Em processo: <b>{page.lock!.label} #{page.lock!.workflowId}</b>. As ferramentas voltam quando terminar (você recebe um aviso).
            <Button size="sm" onClick={() => void reload()}>Atualizar</Button>
          </span>
        </Notice>
      )}

      <div className={full ? cx('grid min-h-0 flex-1 gap-2', panel && 'lg:grid-cols-[minmax(0,1fr)_380px]') : 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]'}>
        <Card className={full ? 'flex min-h-0 flex-col gap-2 p-2' : 'space-y-2 p-2'}>
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <div className="flex gap-1" role="radiogroup" aria-label="Ferramenta">
              {([
                ['view', 'Ver'],
                ['area', 'Marcar área'],
                ['text', 'Caixa de texto'],
              ] as const).map(([m, label]) => (
                <Button
                  key={m}
                  size="sm"
                  role="radio"
                  aria-checked={mode === m}
                  variant={mode === m ? 'primary' : 'ghost'}
                  disabled={m !== 'view' && (locked || view.kind !== 'current' || (m === 'area' ? !can('comment_area') : !can('edit_text') || !page.editable || !!editLock.holder))}
                  onClick={() => {
                    setMode(m)
                    if (m === 'text') setTab('text')
                    if (m === 'area') setTab('comments')
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            {page.cleanAssetId && view.kind === 'current' && (
              <label className="ml-1 flex items-center gap-1.5 text-xs" title="Mostra a página limpa, sem o texto em português, para achar e apagar pedaços de letra que sobraram">
                <input type="checkbox" className="accent-brand" checked={hideText} onChange={(e) => setHideText(e.target.checked)} /> Ocultar texto
              </label>
            )}
            {(page.prev || page.next) && (
              <label className="ml-1 flex items-center gap-1.5 text-xs" title="Mostra o final da página anterior e o começo da próxima, para alinhar textos que passam de uma página para a outra">
                Vizinhas
                <select className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-950" value={contextPx} onChange={(e) => setContextPx(Number(e.target.value))}>
                  <option value={0}>não mostrar</option>
                  <option value={250}>um pouco</option>
                  <option value={500}>mais</option>
                </select>
              </label>
            )}
            {mode === 'text' && (
              <label className="ml-1 flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="accent-brand" checked={square} onChange={(e) => setSquare(e.target.checked)} /> Quadrada
              </label>
            )}
            <span className="ml-auto flex gap-1">
              {(
                [
                  ['current', 'Atual'],
                  ['original', 'Original'],
                  ...(page.cleanAssetId ? ([['clean', 'Limpa']] as const) : []),
                ] as const
              ).map(([k, label]) => (
                <Button key={k} size="sm" variant={view.kind === k ? 'secondary' : 'ghost'} onClick={() => setView({ kind: k } as View)}>
                  {label}
                </Button>
              ))}
              {view.kind === 'version' && <Badge tone="brand">vendo v{view.number}</Badge>}
              {imageId && <FileLinks assetId={imageId} label="imagem exibida" />}
              {full && (
                <Button size="sm" variant="ghost" onClick={() => setPanel(!panel)} title="Mostrar ou esconder comentários, texto e histórico">
                  {panel ? 'Esconder painel' : 'Mostrar painel'}
                </Button>
              )}
              <Button size="sm" variant={full ? 'secondary' : 'ghost'} onClick={() => setFull(!full)} title={full ? 'Sair da tela cheia (Esc)' : 'Tela cheia: a página inteira cabe na tela (F)'}>
                {full ? 'Sair da tela cheia' : 'Tela cheia'}
              </Button>
            </span>
          </div>
          {mode !== 'view' && <p className="px-1 text-xs text-slate-500">{mode === 'area' ? 'Arraste sobre a imagem para marcar a área.' : `Arraste para criar uma caixa${square ? ' quadrada' : ''}.`}</p>}
          {shownImageId ? (
            <Stage
              fit={full}
              context={
                contextPx
                  ? {
                      px: contextPx,
                      prev: page.prev ? { src: asset(page.prev.assetId), label: `Página ${page.prev.position}`, link: href('r', page.prev.id) } : null,
                      next: page.next ? { src: asset(page.next.assetId), label: `Página ${page.next.position}`, link: href('r', page.next.id) } : null,
                    }
                  : null
              }
              src={asset(shownImageId)}
              fonts={fonts.data ?? []}
              textCanvas={editing && !hidingText}
              size={page.size}
              mode={mode}
              comments={tab === 'comments' && view.kind === 'current' ? page.comments.filter((c) => c.status !== 'discarded') : []}
              layers={editing && !hidingText ? draft.layers : []}
              selected={selected}
              onSelect={setSelected}
              onDrawn={onDrawn}
              onLayerMoved={(id, region) => {
                const l = draft.layers.find((x) => x.id === id)
                if (l) draft.update(id, { region: { ...l.region, ...region } })
              }}
              editable={canEditText}
            />
          ) : (
            <EmptyState>Sem imagem.</EmptyState>
          )}
        </Card>

        {(!full || panel) && (
        <Card className={full ? 'min-h-0 space-y-3 overflow-y-auto p-3' : 'space-y-3 p-3'}>
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'comments', label: `Comentários (${page.comments.filter((c) => c.status === 'open' || c.status === 'processing').length})` },
              { value: 'text', label: `Texto (${draft.layers.length})` },
              { value: 'history', label: `Histórico (${page.versions.length})` },
            ]}
          />
          {tab === 'comments' && <CommentsPanel page={page} busy={busy} run={run} />}
          {tab === 'text' && (
            <TextPanel
              page={page}
              layers={draft.layers}
              linked={draft.linked}
              fonts={fonts.data ?? []}
              selected={selected}
              onSelect={setSelected}
              onChange={draft.update}
              onRemove={async (id) => {
                try {
                  await draft.remove(id)
                  setSelected(null)
                } catch (err) {
                  toast('failed', err instanceof Error ? err.message : String(err))
                }
              }}
              onApply={async () => {
                await draft.flush()
                await run(() => reviewApi.applyText(page.id), 'Aplicando a alteração: a página ganha uma versão nova.')
              }}
              saveState={draft.state}
              canEdit={canEditText}
              readOnlyReason={readOnlyReason}
              busy={busy}
            />
          )}
          {tab === 'history' && (
            <HistoryPanel
              page={page}
              busy={busy}
              locked={locked}
              viewing={view.kind === 'version' ? view.assetId : null}
              onView={(assetId, number) => setView({ kind: 'version', assetId, number })}
              run={run}
            />
          )}
        </Card>
        )}
      </div>

      <AreaDialog
        area={pendingArea}
        onClean={page.editable}
        onClose={() => {
          setPendingArea(null)
          setMode('view')
        }}
        onSend={async (comment, action) => {
          const r = await run(
            () => reviewApi.comment(page.id, { region: pendingArea!, comment, action }),
            action === 'none' ? 'Comentário salvo.' : action === 'reread' ? 'Correção enviada: a Claude vai reler a área.' : 'A área vai ser apagada.',
          )
          if (r) {
            setPendingArea(null)
            setMode('view')
          }
        }}
      />
    </div>
  )
}

function Stage({
  fit = false,
  context = null,
  src,
  fonts,
  textCanvas,
  size,
  mode,
  comments,
  layers,
  selected,
  onSelect,
  onDrawn,
  onLayerMoved,
  editable,
}: {
  fit?: boolean
  context?: { px: number; prev: Neighbor | null; next: Neighbor | null } | null
  src: string
  fonts: FontRow[]
  textCanvas: boolean
  size: { width: number; height: number } | null
  mode: Mode
  comments: Page['comments']
  layers: TextLayer[]
  selected: string | null
  onSelect: (id: string | null) => void
  onDrawn: (r: Rect) => void
  onLayerMoved: (id: string, r: Box) => void
  editable: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState(size)
  const [avail, setAvail] = useState({ width: 0, height: 0 })
  const [draft, setDraft] = useState<Rect | null>(null)
  const [moving, setMoving] = useState<{ id: string; rect: Box } | null>(null)
  const start = useRef<{ x: number; y: number; kind: 'draw' | 'move' | 'resize' | 'rotate'; id?: string; rect?: Box; handle?: Handle; square?: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nat = natural ?? { width: 800, height: 1280 }
  const ctxTop = context?.prev ? context.px : 0
  const ctxBottom = context?.next ? context.px : 0
  const gaps = (ctxTop ? CONTEXT_GAP : 0) + (ctxBottom ? CONTEXT_GAP : 0)
  const scale = !avail.width ? 1 : fit && avail.height ? Math.min(MAX_FIT_SCALE, avail.width / nat.width, (avail.height - gaps) / (nat.height + ctxTop + ctxBottom)) : Math.min(1, avail.width / nat.width)
  const stripWidth = nat.width * scale
  const point = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: Math.round((e.clientX - r.left) / scale), y: Math.round((e.clientY - r.top) / scale) }
  }
  const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.max(0, Math.min(a.x, b.x)),
    y: Math.max(0, Math.min(a.y, b.y)),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  })

  const down = (e: React.PointerEvent) => {
    if (mode === 'view') {
      onSelect(null)
      return
    }
    e.preventDefault()
    const p = point(e)
    start.current = { ...p, kind: 'draw' }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const p = point(e)
    if (s.kind === 'draw') setDraft(norm(s, p))
    else if (s.kind === 'move' && s.rect && s.id) setMoving({ id: s.id, rect: moveBox(s.rect, p.x - s.x, p.y - s.y, { left: 0, right: nat.width, top: -ctxTop, bottom: nat.height + ctxBottom }) })
    else if (s.kind === 'resize' && s.rect && s.id && s.handle) setMoving({ id: s.id, rect: resizeBox(s.rect, s.handle, p.x - s.x, p.y - s.y, { square: !!s.square, min: MIN_BOX * 2 }) })
    else if (s.kind === 'rotate' && s.rect && s.id) setMoving({ id: s.id, rect: { ...s.rect, rotation: rotationTo(s.rect, p, e.shiftKey) } })
  }
  const up = () => {
    const s = start.current
    start.current = null
    if (s?.kind === 'draw' && draft && draft.w >= MIN_BOX && draft.h >= MIN_BOX) onDrawn(draft)
    if (s && s.kind !== 'draw' && moving) onLayerMoved(moving.id, roundBox(moving.rect))
    setDraft(null)
    setMoving(null)
  }
  const grab = (e: React.PointerEvent, l: TextLayer, kind: 'move' | 'resize' | 'rotate', handle?: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(l.id)
    if (!editable) return
    const p = point(e)
    start.current = { ...p, kind, handle, id: l.id, rect: { x: l.region.x, y: l.region.y, w: l.region.w, h: l.region.h, rotation: l.region.rotation ?? 0 }, square: l.boxShape === 'square' }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  return (
    <div ref={box} className={cx('select-none', fit ? 'flex min-h-0 w-full flex-1 flex-col items-center overflow-hidden' : 'flex w-full flex-col')} style={{ rowGap: CONTEXT_GAP }} onDragStart={(e) => e.preventDefault()}>
    {context?.prev && ctxTop > 0 && <NeighborStrip side="prev" neighbor={context.prev} height={ctxTop * scale} width={stripWidth} />}
    <div ref={wrap} className={cx('relative z-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800', !fit && 'w-full')} style={{ width: fit ? nat.width * scale : undefined, height: nat.height * scale }}>
      <img
        src={src}
        alt="Página"
        draggable={false}
        onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        className="absolute left-0 top-0 select-none"
        style={{ width: nat.width * scale, height: nat.height * scale }}
      />
      {textCanvas && (
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: nat.width, height: nat.height, transform: `scale(${scale})` }}>
          <LayerCanvas width={nat.width} height={nat.height} fonts={fonts} layers={layers.map((l) => (moving?.id === l.id ? { ...l, region: { ...l.region, ...moving.rect } } : l))} />
        </div>
      )}
      <div
        className={cx('absolute left-0 top-0 origin-top-left', mode !== 'view' && 'cursor-crosshair')}
        style={{ width: nat.width, height: nat.height, transform: `scale(${scale})`, touchAction: 'none' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {comments.map((c, i) => (
          <div
            key={c.id}
            className={cx('pointer-events-none absolute border-2 border-dashed', c.status === 'resolved' ? 'border-done/70' : c.status === 'processing' ? 'border-queued' : 'border-failed')}
            style={{ left: c.region.x, top: c.region.y, width: c.region.w, height: c.region.h }}
          >
            <span className={cx('absolute -left-0.5 -top-6 rounded px-1.5 text-sm font-bold text-white', c.status === 'resolved' ? 'bg-done' : c.status === 'processing' ? 'bg-queued' : 'bg-failed')} style={{ transform: `scale(${1 / scale})`, transformOrigin: 'bottom left' }}>
              {comments.length - i}
            </span>
          </div>
        ))}
        {layers.map((l) => {
          const r = moving?.id === l.id ? moving.rect : { ...l.region, rotation: l.region.rotation ?? 0 }
          const sel = selected === l.id
          return (
            <div
              key={l.id}
              onPointerDown={(e) => grab(e, l, 'move')}
              data-testid="layer-box"
              className={cx('absolute', sel ? 'outline-2 outline-brand' : 'outline-1 outline-dashed outline-brand/60', editable && 'cursor-move')}
              style={{
                left: r.x,
                top: r.y,
                width: r.w,
                height: r.h,
                transform: r.rotation ? `rotate(${r.rotation}deg)` : undefined,
              }}
            >
              {sel && editable && (
                <>
                  {HANDLES.map((h) => (
                    <span
                      key={`${h.ax},${h.ay}`}
                      data-testid="resize-handle"
                      onPointerDown={(e) => grab(e, l, 'resize', h)}
                      title="Arraste para mudar o tamanho"
                      className="absolute size-3.5 rounded-sm border-2 border-white bg-brand"
                      style={{ left: `${((h.ax + 1) / 2) * 100}%`, top: `${((h.ay + 1) / 2) * 100}%`, transform: `translate(-50%, -50%) scale(${1 / scale})`, cursor: handleCursor(h, r.rotation) }}
                    />
                  ))}
                  <span className="pointer-events-none absolute left-1/2 top-0 h-6 w-0.5 -translate-x-1/2 -translate-y-full bg-brand" style={{ transform: `translate(-50%, -100%) scale(1, ${1 / scale})`, transformOrigin: 'bottom' }} />
                  <span
                    data-testid="rotate-handle"
                    onPointerDown={(e) => grab(e, l, 'rotate')}
                    title={`Arraste para girar (${r.rotation}°). Encaixa em 0°, 90°, 180° e 270°; segure Shift para girar de 15 em 15°.`}
                    className="absolute left-1/2 top-0 size-4 cursor-grab rounded-full border-2 border-white bg-brand"
                    style={{ transform: `translate(-50%, ${-24 / scale - 8}px) scale(${1 / scale})` }}
                  />
                </>
              )}
            </div>
          )
        })}
        {draft && <div className="pointer-events-none absolute border-2 border-brand bg-brand/10" style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }} />}
      </div>
    </div>
    {context?.next && ctxBottom > 0 && <NeighborStrip side="next" neighbor={context.next} height={ctxBottom * scale} width={stripWidth} />}
    </div>
  )
}

interface Neighbor {
  src: string
  label: string
  link: string
}

function NeighborStrip({ side, neighbor, height, width }: { side: 'prev' | 'next'; neighbor: Neighbor; height: number; width: number }) {
  const where = side === 'prev' ? 'final' : 'começo'
  return (
    <a
      href={neighbor.link}
      data-testid={`neighbor-${side}`}
      title={`${neighbor.label} (${where}): clique para abrir`}
      aria-label={`Abrir ${neighbor.label}`}
      className={cx('relative block shrink-0 overflow-hidden rounded-lg opacity-80 transition-opacity hover:opacity-100', side === 'prev' ? 'border-b-2 border-dashed border-brand/70' : 'border-t-2 border-dashed border-brand/70')}
      style={{ height, width }}
    >
      <img src={neighbor.src} alt="" draggable={false} className={cx('absolute left-0 w-full select-none', side === 'prev' ? 'bottom-0' : 'top-0')} />
      <span className={cx('absolute left-1.5 rounded bg-slate-900/75 px-1.5 py-0.5 text-[11px] font-medium text-white', side === 'prev' ? 'top-1.5' : 'bottom-1.5')}>
        {neighbor.label} · {where}
      </span>
    </a>
  )
}

function AreaDialog({ area, onClean, onClose, onSend }: { area: Rect | null; onClean: boolean; onClose: () => void; onSend: (comment: string, action: CommentAction) => Promise<void> }) {
  const { can } = useAuth()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<CommentAction | null>(null)
  const send = async (action: CommentAction) => {
    setBusy(action)
    await onSend(comment.trim(), action)
    setBusy(null)
    setComment('')
  }
  return (
    <Dialog
      open={!!area}
      onClose={onClose}
      title="Área marcada"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button disabled={!!busy || !comment.trim()} onClick={() => send('none')}>Só comentar</Button>
          <Button disabled={!!busy || !can('erase_area')} title={can('erase_area') ? 'Apaga o texto da área (sem custo de API)' : DISABLED_REASON} onClick={() => send('erase')}>
            {busy === 'erase' ? <Spinner /> : 'Apagar texto'}
          </Button>
          <Button variant="primary" disabled={!!busy || !can('fix_area_claude')} title={can('fix_area_claude') ? '' : DISABLED_REASON} onClick={() => send('reread')}>
            {busy === 'reread' ? <Spinner /> : 'Corrigir com a Claude'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="O que está errado?" hint='Ex.: "texto não está legível", "nome do personagem errado". A Claude lê este comentário ao corrigir.'>
          <textarea className={`${inputClass} h-24`} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
        </Field>
        <ul className="space-y-1 text-xs text-slate-500">
          <li><b>Corrigir com a Claude:</b> relê o texto original da área, traduz de novo e desenha no lugar (usa a API).</li>
          {onClean ? (
            <li><b>Apagar texto:</b> funciona como borracha na <b>página limpa</b>: apaga <b>tudo</b> dentro da área marcada (bom para pedaços de letra em inglês que sobraram), o LaMa refaz o fundo e o texto em português é desenhado de novo por cima. Marque só o pedaço a remover; se pegar um traço do desenho, o LaMa tenta refazê-lo. Use “Ocultar texto” para ver o que vai ser apagado.</li>
          ) : (
            <li><b>Apagar texto:</b> limpa a área; o fundo é refeito pelo LaMa no servidor.</li>
          )}
          <li>As duas criam uma versão nova da página; a atual fica no histórico.</li>
        </ul>
      </div>
    </Dialog>
  )
}

function CommentsPanel({ page, busy, run }: { page: Page; busy: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<unknown> }) {
  const { can } = useAuth()
  if (!page.comments.length) return <p className="py-6 text-center text-sm text-slate-500">Nenhum comentário. Use “Marcar área” para apontar um problema.</p>
  const STATUS = { open: ['aberto', 'failed'], processing: ['corrigindo', 'queued'], resolved: ['resolvido', 'done'], discarded: ['descartado', 'pending'] } as const
  return (
    <ol className="max-h-[65vh] space-y-2 overflow-y-auto">
      {page.comments.map((c, i) => (
        <li key={c.id} className="rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-800">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold">#{page.comments.length - i}</span>
            <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
          </div>
          <p className="mt-1">{c.comment}</p>
          <p className="mt-1 text-xs text-slate-500">
            {c.by} · {ago(c.at)}
            {c.action !== 'none' && ` · ${c.action === 'reread' ? 'corrigir com a Claude' : 'apagar'}`}
            {c.resolvedBy && ` · resolvido por ${c.resolvedBy}`}
          </p>
          {can('comment_area') && c.status !== 'processing' && (
            <div className="mt-2 flex gap-1.5">
              {c.status === 'open' ? (
                <>
                  <Button size="sm" disabled={busy} onClick={() => run(() => reviewApi.setComment(c.id, 'resolved'), 'Comentário resolvido.')}>Resolver</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => reviewApi.setComment(c.id, 'discarded'), 'Comentário descartado.')}>Descartar</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => reviewApi.setComment(c.id, 'open'), 'Comentário reaberto.')}>Reabrir</Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

function HistoryPanel({ page, busy, locked, viewing, onView, run }: { page: Page; busy: boolean; locked: boolean; viewing: string | null; onView: (assetId: string, number: number) => void; run: (fn: () => Promise<unknown>, ok?: string) => Promise<unknown> }) {
  const { can } = useAuth()
  const base = page.cleanBase
  const resetBase = () =>
    confirm('Voltar a base limpa para a original (balões vazios do início)? As caixas de texto continuam como estão e são desenhadas de novo por cima.') &&
    run(() => reviewApi.resetClean(page.id), 'Voltando a base para a original: a página ganha uma versão nova.')
  const baseCard = base && page.cleanAssetId && (
    <div className="mb-3 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
      <div className="flex items-center gap-1.5">
        <b>Base limpa</b>
        {base.isOriginal ? <Badge>original</Badge> : <Badge tone="brand">alterada</Badge>}
      </div>
      <div className="text-xs text-slate-500">
        {base.isOriginal ? 'A imagem sem texto onde as caixas são desenhadas é a original.' : 'A imagem sem texto foi alterada (ex.: Apagar texto). Se ficou estragada, volte para a original.'}
      </div>
      <div className="mt-2 flex gap-2">
        <figure className="text-center text-xs text-slate-500">
          <img src={asset(base.originalAssetId)} alt="" loading="lazy" className="h-20 w-14 rounded object-cover object-top" />
          <figcaption>original</figcaption>
        </figure>
        {!base.isOriginal && (
          <figure className="text-center text-xs text-slate-500">
            <img src={asset(page.cleanAssetId)} alt="" loading="lazy" className="h-20 w-14 rounded object-cover object-top" />
            <figcaption>atual</figcaption>
          </figure>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <FileLinks assetId={base.originalAssetId} label="base original" />
        {!base.isOriginal && (
          <Button size="sm" disabled={busy || locked || !can('restore_version')} title={can('restore_version') ? 'Volta só a imagem de fundo (balões vazios) para a original; as caixas de texto não mudam' : DISABLED_REASON} onClick={resetBase}>
            Resetar imagem base
          </Button>
        )}
      </div>
    </div>
  )
  if (!page.versions.length)
    return (
      <>
        {baseCard}
        <p className="py-6 text-center text-sm text-slate-500">Ainda sem versões: a página só tem o original.</p>
      </>
    )
  return (
    <>
      {baseCard}
      <ol className="max-h-[65vh] space-y-2 overflow-y-auto">
      {page.versions.map((v) => (
        <li key={v.id} className={cx('flex gap-2.5 rounded-lg border p-2 text-sm', v.current ? 'border-brand' : 'border-slate-200 dark:border-slate-800', viewing === v.assetId && 'bg-brand/5')}>
          <img src={asset(v.assetId)} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded object-cover object-top" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <b>v{v.number}</b> {CHANGE_LABEL[v.change]}
              {v.current && <Badge tone="brand">atual</Badge>}
            </div>
            <div className="text-xs text-slate-500">
              {v.by} · {when(v.at)}
            </div>
            {v.note && <div className="truncate text-xs text-slate-500" title={v.note}>{v.note}</div>}
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => onView(v.assetId, v.number)}>Mostrar</Button>
              <FileLinks assetId={v.assetId} label={`v${v.number}`} />
              {!v.current && (
                <Button size="sm" disabled={busy || locked || !can('restore_version')} title={can('restore_version') ? 'Cria uma versão nova igual a esta' : DISABLED_REASON} onClick={() => run(() => reviewApi.restore(page.id, v.id), `v${v.number} restaurada como versão nova.`)}>
                  Restaurar
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
      </ol>
    </>
  )
}
