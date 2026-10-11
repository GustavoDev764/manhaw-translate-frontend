import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useConfirm } from '../../components/confirm'
import { Button, Dialog, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { applyRemoval, magicWand, maskPixelCount, MASK_COLOR, METHOD_LABEL, WandError, type Method } from '../../lib/opencv/inpaint'
import { loadOpenCv, type CV } from '../../lib/opencv/opencv'
import { reviewApi, type ReviewPage } from '../../reviewApi'
import { blankCanvas, ctx2d, flatten, FUNDO, layerFromSnap, mountCanvas, newLayerId, snapLayer, type Layer, type LayerSnap } from './baseLayers'
import { LayersPanel } from './LayersPanel'

type Tool = 'move' | 'brush' | 'imageEraser' | 'eraser' | 'wand' | 'lasso' | 'crop' | 'hand'
type Lasso = { points: { x: number; y: number }[]; closed: boolean }
type Point = { x: number; y: number }
type Rect = { x: number; y: number; w: number; h: number }
type Snapshot = { fundo: ImageData; origin: Point; layers: LayerSnap[] }
type Step = Snapshot & { label: string }
type CropDrag = { mode: string; start: Point; rect: Rect }

const MIN_CROP = 8
const CROP_CURSOR: Record<string, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', move: 'move' }

const HISTORY_LIMIT = 8
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

const LAYER_STEPS = ['Nova camada', 'Mover', 'Mesclar', 'Excluir', 'Duplicar', 'Ordem']
const stepIcon = (label: string) =>
  LAYER_STEPS.some((s) => label.startsWith(s))
    ? ICONS.layers
    : label.startsWith('Laço')
      ? ICONS.lasso
      : label.startsWith('Caneta')
      ? ICONS.wand
      : label.startsWith('Recorte')
        ? ICONS.crop
        : label.startsWith('Importada')
          ? ICONS.upload
          : label.startsWith('Borracha')
            ? ICONS.imageEraser
            : ICONS.brush
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
const mimeOf = (file: string) => MIME[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png'
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-[18px]', className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

const ICONS: Record<Tool | 'compare' | 'undo' | 'redo' | 'zoomIn' | 'zoomOut' | 'fit' | 'upload' | 'layers', ReactNode> = {
  lasso: (
    <>
      <path d="M4 7 11 3l9 5-3 9-7 3-6-6Z" strokeDasharray="2.5 2" />
      <circle cx="4" cy="7" r="1.6" fill="currentColor" />
      <circle cx="11" cy="3" r="1.6" fill="currentColor" />
      <circle cx="20" cy="8" r="1.6" fill="currentColor" />
      <circle cx="17" cy="17" r="1.6" fill="currentColor" />
      <circle cx="4" cy="14" r="1.6" fill="currentColor" />
    </>
  ),
  move: (
    <>
      <path d="M12 2v20" />
      <path d="m15 19-3 3-3-3" />
      <path d="m19 9 3 3-3 3" />
      <path d="M2 12h20" />
      <path d="m5 9-3 3 3 3" />
      <path d="m9 5 3-3 3 3" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 10 5-10 5L2 7l10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </>
  ),
  brush: (
    <>
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </>
  ),
  imageEraser: (
    <>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="m5 11 9 9" />
      <path d="M16 21h6" strokeDasharray="1.5 2" />
      <circle cx="19" cy="5" r="2.5" fill="currentColor" stroke="none" opacity="0.6" />
    </>
  ),
  wand: (
    <>
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </>
  ),
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-4 0" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  compare: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18" />
    </>
  ),
  undo: (
    <>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </>
  ),
  redo: (
    <>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
      <path d="M8 11h6" />
    </>
  ),
  fit: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>
  ),
}

const TOOLS: { tool: Tool; label: string; key: string; hint: string }[] = [
  { tool: 'move', label: 'Mover', key: 'V', hint: 'Arraste para mover a camada selecionada no painel Camadas' },
  { tool: 'brush', label: 'Pincel', key: 'B', hint: 'Pinte por cima do que quer remover' },
  { tool: 'imageEraser', label: 'Borracha de imagem', key: 'E', hint: 'Apaga direto na imagem pintando com a cor escolhida (Alt+clique pega a cor da imagem)' },
  { tool: 'eraser', label: 'Borracha de máscara', key: 'M', hint: 'Tira o vermelho onde a máscara passou do ponto; não apaga a imagem (para isso, pinte com o Pincel e clique em Remover)' },
  { tool: 'wand', label: 'Caneta mágica', key: 'W', hint: 'Clique na parte clara de um balão: marca só as letras dele' },
  { tool: 'lasso', label: 'Laço poligonal', key: 'L', hint: 'Clique ponto a ponto em volta da área; feche no primeiro ponto, com duplo clique ou Enter' },
  { tool: 'crop', label: 'Recorte', key: 'R', hint: 'Arraste para escolher a área que fica; o resto da imagem é cortado (Enter aplica)' },
  { tool: 'hand', label: 'Mão', key: 'H', hint: 'Arraste para mover a imagem (ou segure Espaço)' },
]

const SHORTCUTS: [string, string][] = [
  ['B / E / M', 'Pincel, borracha de imagem, borracha de máscara'],
  ['V / W / L / R / H', 'Mover camada, caneta mágica, laço, recorte, mão'],
  ['Laço: Enter / Backspace', 'Fechar a seleção / tirar o último ponto'],
  ['Laço: Delete', 'Apagar a seleção (camada: transparente; Fundo: reconstrói)'],
  ['Ctrl+J / Ctrl+Shift+J', 'Copiar / recortar a seleção para nova camada'],
  ['Alt+clique', 'Pegar a cor da imagem (borracha de imagem)'],
  ['[ e ]', 'Diminuir / aumentar pincel'],
  ['Enter', 'Remover a máscara / aplicar o recorte'],
  ['Esc', 'Limpar a máscara / desfazer a seleção do recorte'],
  ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
  ['Espaço', 'Mover a imagem'],
  ['Ctrl+roda, Ctrl + / −', 'Zoom'],
  ['Ctrl+0 / Ctrl+1', 'Ajustar / 100%'],
  ['C (segure)', 'Comparar com a base atual'],
]

function IconButton({ icon, label, active, disabled, onClick, className, ...rest }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; onClick?: () => void; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'grid size-9 place-items-center rounded-md transition',
        active ? 'bg-[#4b4b4b] text-white shadow-[inset_0_0_0_1px_#6b6b6b]' : 'text-[#c8c8c8] hover:bg-[#3a3a3a] hover:text-white',
        'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
        className,
      )}
      {...rest}
    >
      <Svg>{icon}</Svg>
    </button>
  )
}

function Opt({ label, value, min, max, step = 1, suffix, disabled, onChange, title, wide }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onChange: (v: number) => void; title?: string; wide?: boolean }) {
  return (
    <label className={cx('flex items-center gap-2 whitespace-nowrap', disabled && 'opacity-40')} title={title}>
      <span className="text-[#a8a8a8]">{label}</span>
      <input type="range" className={cx('accent-brand', wide ? 'w-32' : 'w-24')} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="flex items-center rounded border border-[#3f3f3f] bg-[#1d1d1d]">
        <input
          type="number"
          className="w-10 bg-transparent px-1 py-0.5 text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)))
          }}
        />
        {suffix && <span className="pr-1.5 text-[#8a8a8a]">{suffix}</span>}
      </span>
    </label>
  )
}

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-[#1a1a1a]">
      <header className="flex items-center justify-between bg-[#323232] px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#c4c4c4]">{title}</h3>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

const Divider = () => <span className="mx-1 h-6 w-px bg-[#3f3f3f]" />

export function BaseEditor({ page, onClose, onSaved }: { page: ReviewPage; onClose: () => void; onSaved: (message: string) => void }) {
  const [cv, setCv] = useState<CV | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('brush')
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [brush, setBrush] = useState(24)
  const [paint, setPaint] = useState('#ffffff')
  const [eraserKind, setEraserKind] = useState<'imageEraser' | 'eraser'>('imageEraser')
  const [eraserMenu, setEraserMenu] = useState(false)
  const eraserGroupRef = useRef<HTMLDivElement>(null)
  const [method, setMethod] = useState<Method>('auto')
  const [radius, setRadius] = useState(5)
  const [dilate, setDilate] = useState(2)
  const [threshold, setThreshold] = useState(200)
  const [wandClose, setWandClose] = useState(0)
  const [wandDilate, setWandDilate] = useState(2)
  const [autoApply, setAutoApply] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [comparing, setComparing] = useState(false)
  const [maskPixels, setMaskPixels] = useState(0)
  const [history, setHistory] = useState<{ done: string[]; undone: string[]; dropped: boolean }>({ done: [], undone: [], dropped: false })
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const [origin, setOriginState] = useState<Point>({ x: 0, y: 0 })
  const [crop, setCrop] = useState<Rect | null>(null)
  const [cropCursor, setCropCursor] = useState('crosshair')
  const [importing, setImporting] = useState<{ bitmap: ImageBitmap; name: string } | null>(null)
  const [layers, setLayersState] = useState<Layer[]>([])
  const [activeId, setActiveId] = useState<string>(FUNDO)
  const [fundoVisible, setFundoVisible] = useState(true)
  const [lasso, setLasso] = useState<Lasso | null>(null)
  const [lassoHover, setLassoHover] = useState<Point | null>(null)
  const [ask, confirmDialog] = useConfirm()
  const layersRef = useRef<Layer[]>([])
  const layerFileRef = useRef<HTMLInputElement>(null)
  const moveDrag = useRef<{ start: Point; x: number; y: number; before: Snapshot; moved: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const originRef = useRef<Point>({ x: 0, y: 0 })
  const cropDrag = useRef<CropDrag | null>(null)
  const imageRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const coordsRef = useRef<HTMLSpanElement>(null)
  const undoStack = useRef<Step[]>([])
  const redoStack = useRef<Step[]>([])
  const dropped = useRef(false)
  const drawing = useRef<Point | null>(null)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const maskSource = useRef('Pincel')
  const anchor = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null)
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined)
  const wheel = useRef<(e: WheelEvent) => void>(() => undefined)

  const imageCtx = () => imageRef.current!.getContext('2d', { willReadFrequently: true })!
  const maskCtx = () => maskRef.current!.getContext('2d', { willReadFrequently: true })!

  const fitZoom = useCallback((width: number, height: number) => {
    const vp = viewportRef.current
    const w = (vp?.clientWidth ?? width) - 80
    const h = (vp?.clientHeight ?? height) - 80
    const fit = height > width * 2 ? w / width : Math.min(w / width, h / height)
    setZoom(clampZoom(Math.min(1, fit)))
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    Promise.all([loadOpenCv(), reviewApi.baseImage(page.id).then(async (blob) => ({ blob, bitmap: await createImageBitmap(blob) }))])
      .then(([{ cv }, { blob, bitmap }]) => {
        const image = imageRef.current
        const mask = maskRef.current
        if (cancelled || !image || !mask) return bitmap.close()
        image.width = mask.width = bitmap.width
        image.height = mask.height = bitmap.height
        image.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0)
        bitmap.close()
        url = URL.createObjectURL(blob)
        setSourceUrl(url)
        setSourceSize({ width: image.width, height: image.height })
        setSize({ width: image.width, height: image.height })
        fitZoom(image.width, image.height)
        setCv(cv)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [page.id, fitZoom])

  useLayoutEffect(() => {
    const a = anchor.current
    const wrap = wrapRef.current
    const vp = viewportRef.current
    if (!a || !wrap || !vp) return
    anchor.current = null
    const r = wrap.getBoundingClientRect()
    vp.scrollLeft += r.left + a.px * zoom - a.cx
    vp.scrollTop += r.top + a.py * zoom - a.cy
  }, [zoom])

  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const wrap = wrapRef.current
    const vp = viewportRef.current
    if (!wrap || !vp) return setZoom(clampZoom(next))
    const box = vp.getBoundingClientRect()
    const cx = clientX ?? box.left + box.width / 2
    const cy = clientY ?? box.top + box.height / 2
    const r = wrap.getBoundingClientRect()
    anchor.current = { px: (cx - r.left) / zoom, py: (cy - r.top) / zoom, cx, cy }
    setZoom(clampZoom(next))
  }

  const syncHistory = () =>
    setHistory({ done: undoStack.current.map((s) => s.label), undone: redoStack.current.map((s) => s.label).reverse(), dropped: dropped.current })

  const fullImage = () => {
    const canvas = imageRef.current!
    return imageCtx().getImageData(0, 0, canvas.width, canvas.height)
  }

  const setOrigin = (p: Point) => {
    originRef.current = p
    setOriginState(p)
  }

  const resizeCanvases = (width: number, height: number) => {
    const image = imageRef.current!
    const mask = maskRef.current!
    image.width = mask.width = width
    image.height = mask.height = height
    setSize({ width, height })
    setMaskPixels(0)
  }

  const pickTool = (t: Tool) => {
    setTool(t)
    if (t === 'imageEraser' || t === 'eraser') setEraserKind(t)
    if (t !== 'crop') setCrop(null)
    if (t !== 'lasso') {
      setLasso(null)
      setLassoHover(null)
    }
    setEraserMenu(false)
  }

  useEffect(() => {
    if (!eraserMenu) return
    const outside = (e: PointerEvent) => {
      if (!eraserGroupRef.current?.contains(e.target as Node)) setEraserMenu(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [eraserMenu])

  const setLayers = (next: Layer[]) => {
    layersRef.current = next
    setLayersState(next)
  }

  const activeLayer = () => layersRef.current.find((l) => l.id === activeId) ?? null

  const snapshot = (): Snapshot => ({ fundo: fullImage(), origin: originRef.current, layers: layersRef.current.map(snapLayer) })

  const restore = (s: Snapshot) => {
    const image = imageRef.current!
    if (s.fundo.width !== image.width || s.fundo.height !== image.height) resizeCanvases(s.fundo.width, s.fundo.height)
    imageCtx().putImageData(s.fundo, 0, 0)
    setOrigin(s.origin)
    const next = s.layers.map(layerFromSnap)
    setLayers(next)
    if (!next.some((l) => l.id === activeId)) setActiveId(FUNDO)
  }

  const pushUndo = (before: Snapshot, label: string) => {
    undoStack.current.push({ ...before, label })
    if (undoStack.current.length > HISTORY_LIMIT) {
      undoStack.current.shift()
      dropped.current = true
    }
    redoStack.current = []
    syncHistory()
  }

  const clearMask = () => {
    const canvas = maskRef.current
    if (!canvas) return
    maskCtx().clearRect(0, 0, canvas.width, canvas.height)
    setMaskPixels(0)
  }

  const refreshMaskCount = () => {
    if (cv && maskRef.current) setMaskPixels(maskPixelCount(cv, maskRef.current))
  }

  const apply = () => {
    if (!cv || !imageRef.current || !maskRef.current) return
    const before = snapshot()
    const result = applyRemoval(cv, imageRef.current, maskRef.current, { method, radius, dilate })
    if (!result) {
      setStatus({ text: 'Pinte uma máscara (ou use a caneta mágica) antes de remover.', error: true })
      return
    }
    pushUndo(before, `${maskSource.current} · ${METHOD_LABEL[method]}`)
    clearMask()
    setStatus({ text: `${METHOD_LABEL[method]}${method === 'fill' ? '' : ` · raio ${radius}`} · ${result.pixels.toLocaleString('pt-BR')} px removidos em ${result.ms.toFixed(0)} ms` })
  }

  const swap = (from: Step[], to: Step[]) => {
    const step = from.pop()
    const image = imageRef.current
    if (!step || !image) return false
    to.push({ ...snapshot(), label: step.label })
    restore(step)
    setCrop(null)
    return true
  }

  const applyCrop = () => {
    const c = crop
    const image = imageRef.current
    if (!c || !image) return
    if (c.w < MIN_CROP || c.h < MIN_CROP) {
      setStatus({ text: 'Arraste sobre a imagem para escolher a área que fica.', error: true })
      return
    }
    if (c.x === 0 && c.y === 0 && c.w === image.width && c.h === image.height) {
      setCrop(null)
      return
    }
    const before = snapshot()
    const piece = imageCtx().getImageData(c.x, c.y, c.w, c.h)
    pushUndo(before, `Recorte ${c.w}×${c.h}`)
    resizeCanvases(c.w, c.h)
    imageCtx().putImageData(piece, 0, 0)
    setOrigin({ x: originRef.current.x + c.x, y: originRef.current.y + c.y })
    setLayers(layersRef.current.map((l) => ({ ...l, x: l.x - c.x, y: l.y - c.y })))
    setCrop(null)
    fitZoom(c.w, c.h)
    setStatus({ text: `Recortada para ${c.w} × ${c.h} px. As caixas de texto vão ser movidas junto ao salvar.` })
  }

  const replaceWith = (bitmap: ImageBitmap, name: string, keepSize: boolean) => {
    const image = imageRef.current
    if (!image) return bitmap.close()
    const before = snapshot()
    const width = keepSize ? image.width : bitmap.width
    const height = keepSize ? image.height : bitmap.height
    pushUndo(before, `Importada: ${name}`)
    if (width !== image.width || height !== image.height) resizeCanvases(width, height)
    clearMask()
    const ctx = imageCtx()
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    setOrigin({ x: 0, y: 0 })
    setCrop(null)
    fitZoom(width, height)
    setStatus({ text: `Imagem "${name}" importada (${width} × ${height} px). Salve para ela virar a base.` })
  }

  const importFile = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      const image = imageRef.current
      if (image && bitmap.width === image.width && bitmap.height === image.height) replaceWith(bitmap, file.name, true)
      else setImporting({ bitmap, name: file.name })
    } catch {
      setStatus({ text: `Não consegui abrir "${file.name}". Use PNG, JPEG ou WebP.`, error: true })
    }
  }

  const viewCenter = (): Point => {
    const image = imageRef.current!
    const vp = viewportRef.current?.getBoundingClientRect()
    const wrap = wrapRef.current?.getBoundingClientRect()
    if (!vp || !wrap) return { x: image.width / 2, y: image.height / 2 }
    return {
      x: Math.max(0, Math.min(image.width, (vp.left + vp.width / 2 - wrap.left) / zoom)),
      y: Math.max(0, Math.min(image.height, (vp.top + vp.height / 2 - wrap.top) / zoom)),
    }
  }

  const addLayer = async (file: File) => {
    const image = imageRef.current
    if (!image) return
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      setStatus({ text: `Não consegui abrir "${file.name}". Use PNG, JPEG ou WebP.`, error: true })
      return
    }
    const scale = Math.min(1, image.width / bitmap.width, image.height / bitmap.height)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = blankCanvas(w, h)
    ctx2d(canvas).drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const c = viewCenter()
    const x = Math.round(Math.max(0, Math.min(image.width - w, c.x - w / 2)))
    const y = Math.round(Math.max(0, Math.min(image.height - h, c.y - h / 2)))
    const name = file.name.replace(/\.[^.]+$/, '') || `Camada ${layersRef.current.length + 1}`
    pushUndo(snapshot(), `Nova camada: ${name}`)
    const layer: Layer = { id: newLayerId(), name, canvas, x, y, visible: true, opacity: 1 }
    setLayers([...layersRef.current, layer])
    setActiveId(layer.id)
    pickTool('move')
    setStatus({ text: `Camada "${name}" adicionada (${w} × ${h} px${scale < 1 ? `, reduzida a ${Math.round(scale * 100)}%` : ''}). Arraste com Mover (V).` })
  }

  const changeLayer = (id: string, patch: Partial<Pick<Layer, 'name' | 'visible' | 'opacity'>>) => setLayers(layersRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const duplicateLayer = () => {
    const l = activeLayer()
    if (!l) return
    pushUndo(snapshot(), `Duplicar ${l.name}`)
    const canvas = blankCanvas(l.canvas.width, l.canvas.height)
    ctx2d(canvas).drawImage(l.canvas, 0, 0)
    const copy: Layer = { ...l, id: newLayerId(), name: `${l.name} cópia`, canvas, x: l.x + 12, y: l.y + 12 }
    const i = layersRef.current.indexOf(l)
    setLayers([...layersRef.current.slice(0, i + 1), copy, ...layersRef.current.slice(i + 1)])
    setActiveId(copy.id)
  }

  const reorderLayer = (dir: 1 | -1) => {
    const list = [...layersRef.current]
    const i = list.findIndex((l) => l.id === activeId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    pushUndo(snapshot(), `Ordem das camadas`)
    ;[list[i], list[j]] = [list[j], list[i]]
    setLayers(list)
  }

  const mergeLayer = () => {
    const l = activeLayer()
    if (!l) return
    pushUndo(snapshot(), `Mesclar ${l.name} no Fundo`)
    const ctx = imageCtx()
    if (l.visible) {
      ctx.globalAlpha = l.opacity
      ctx.drawImage(l.canvas, l.x, l.y)
      ctx.globalAlpha = 1
    }
    setLayers(layersRef.current.filter((x) => x.id !== l.id))
    setActiveId(FUNDO)
    setStatus({ text: l.visible ? `"${l.name}" gravada no Fundo. Agora o Pincel e a Caneta mágica agem nela também.` : `"${l.name}" estava oculta e foi descartada.` })
  }

  const removeLayer = () => {
    const l = activeLayer()
    if (!l) return
    pushUndo(snapshot(), `Excluir ${l.name}`)
    setLayers(layersRef.current.filter((x) => x.id !== l.id))
    setActiveId(FUNDO)
  }

  const tracePolygon = (ctx: CanvasRenderingContext2D, points: Point[], ox = 0, oy = 0) => {
    ctx.beginPath()
    points.forEach((p, i) => (i ? ctx.lineTo(p.x - ox, p.y - oy) : ctx.moveTo(p.x - ox, p.y - oy)))
    ctx.closePath()
  }

  const closeLasso = () => {
    if (!lasso || lasso.closed) return
    if (lasso.points.length < 3) {
      setStatus({ text: 'O laço precisa de pelo menos 3 pontos.', error: true })
      return
    }
    setLasso({ ...lasso, closed: true })
    setLassoHover(null)
    setStatus({ text: 'Seleção fechada. Escolha o que fazer na barra de opções (Delete apaga, Ctrl+J copia para camada).' })
  }

  const lassoBox = (points: Point[]): Rect | null => {
    const image = imageRef.current!
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const x = Math.max(0, Math.floor(Math.min(...xs)))
    const y = Math.max(0, Math.floor(Math.min(...ys)))
    const w = Math.min(image.width, Math.ceil(Math.max(...xs))) - x
    const h = Math.min(image.height, Math.ceil(Math.max(...ys))) - y
    return w > 0 && h > 0 ? { x, y, w, h } : null
  }

  const lassoSource = () => {
    const l = activeLayer()
    return l ? { canvas: l.canvas, x: l.x, y: l.y, name: l.name, layer: l } : { canvas: imageRef.current!, x: 0, y: 0, name: 'Fundo', layer: null }
  }

  const lassoToLayer = (cut: boolean) => {
    if (!lasso?.closed) return
    const box = lassoBox(lasso.points)
    if (!box) return
    const src = lassoSource()
    pushUndo(snapshot(), `Laço: ${cut ? 'recortar' : 'copiar'} para camada`)
    const canvas = blankCanvas(box.w, box.h)
    const ctx = ctx2d(canvas)
    tracePolygon(ctx, lasso.points, box.x, box.y)
    ctx.save()
    ctx.clip()
    ctx.drawImage(src.canvas, src.x - box.x, src.y - box.y)
    ctx.restore()
    if (cut) {
      const sctx = ctx2d(src.canvas)
      tracePolygon(sctx, lasso.points, src.x, src.y)
      if (src.layer) {
        sctx.globalCompositeOperation = 'destination-out'
        sctx.fill()
        sctx.globalCompositeOperation = 'source-over'
      } else {
        sctx.fillStyle = paint
        sctx.fill()
      }
    }
    const layer: Layer = { id: newLayerId(), name: `${cut ? 'Recorte' : 'Cópia'} de ${src.name}`, canvas, x: box.x, y: box.y, visible: true, opacity: 1 }
    const list = layersRef.current
    const at = src.layer ? list.indexOf(src.layer) + 1 : 0
    setLayers([...list.slice(0, at), layer, ...list.slice(at)])
    setActiveId(layer.id)
    setLasso(null)
    pickTool('move')
    setStatus({ text: `Seleção ${cut ? 'recortada' : 'copiada'} para a camada "${layer.name}" (${box.w} × ${box.h} px). Arraste com Mover (V).${cut && !src.layer ? ` No Fundo o buraco foi pintado com ${paint}.` : ''}` })
  }

  const lassoToMask = () => {
    if (!lasso?.closed || !maskRef.current) return
    const ctx = maskCtx()
    tracePolygon(ctx, lasso.points)
    ctx.fillStyle = `rgb(${MASK_COLOR.join(',')})`
    ctx.fill()
    maskSource.current = 'Laço'
    refreshMaskCount()
    setLasso(null)
  }

  const lassoDelete = () => {
    if (!lasso?.closed) return
    const l = activeLayer()
    if (l) {
      pushUndo(snapshot(), `Laço: apagar em ${l.name}`)
      const ctx = ctx2d(l.canvas)
      tracePolygon(ctx, lasso.points, l.x, l.y)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      setLayers([...layersRef.current])
      setLasso(null)
      return
    }
    lassoToMask()
    apply()
  }

  const cropHit = (p: Point, c: Rect): string | null => {
    const t = 10 / zoom
    const inX = p.x >= c.x - t && p.x <= c.x + c.w + t
    const inY = p.y >= c.y - t && p.y <= c.y + c.h + t
    let h = ''
    if (inX && Math.abs(p.y - c.y) <= t) h += 'n'
    if (inX && Math.abs(p.y - (c.y + c.h)) <= t) h += 's'
    if (inY && Math.abs(p.x - c.x) <= t) h += 'w'
    if (inY && Math.abs(p.x - (c.x + c.w)) <= t) h += 'e'
    if (h) return h
    return p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h ? 'move' : null
  }

  const dragCrop = (p: Point) => {
    const d = cropDrag.current
    const canvas = imageRef.current
    if (!d || !canvas) return
    const W = canvas.width
    const H = canvas.height
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    if (d.mode === 'draw') {
      const x = Math.min(d.start.x, p.x)
      const y = Math.min(d.start.y, p.y)
      setCrop({ x, y, w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) })
      return
    }
    const dx = p.x - d.start.x
    const dy = p.y - d.start.y
    const r = d.rect
    if (d.mode === 'move') {
      setCrop({ ...r, x: clamp(r.x + dx, 0, W - r.w), y: clamp(r.y + dy, 0, H - r.h) })
      return
    }
    let [x1, y1, x2, y2] = [r.x, r.y, r.x + r.w, r.y + r.h]
    if (d.mode.includes('w')) x1 = clamp(x1 + dx, 0, x2 - MIN_CROP)
    if (d.mode.includes('e')) x2 = clamp(x2 + dx, x1 + MIN_CROP, W)
    if (d.mode.includes('n')) y1 = clamp(y1 + dy, 0, y2 - MIN_CROP)
    if (d.mode.includes('s')) y2 = clamp(y2 + dy, y1 + MIN_CROP, H)
    setCrop({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
  }

  const undo = () => {
    if (swap(undoStack.current, redoStack.current)) syncHistory()
  }

  const redo = () => {
    if (swap(redoStack.current, undoStack.current)) syncHistory()
  }

  const jumpTo = (done: number) => {
    while (undoStack.current.length !== done) {
      const moved = undoStack.current.length > done ? swap(undoStack.current, redoStack.current) : swap(redoStack.current, undoStack.current)
      if (!moved) break
    }
    syncHistory()
  }

  const dirty = history.done.length > 0

  const close = async () => {
    if (saving) return
    if (dirty && !(await ask({ title: 'Descartar edição da base', message: 'As remoções feitas aqui ainda não foram salvas e vão ser perdidas.', confirmLabel: 'Descartar', danger: true }))) return
    onClose()
  }

  const save = async () => {
    const image = imageRef.current
    if (!image || !dirty || !fundoVisible) return
    setSaving(true)
    setStatus({ text: 'Enviando a base editada…' })
    try {
      const canvas = layersRef.current.some((l) => l.visible) ? flatten(image, true, layersRef.current) : image
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui gerar a imagem.'))), mimeOf(page.file), 0.95))
      const r = await reviewApi.saveBase(page.id, blob, originRef.current)
      onSaved(`Base salva (limpa v${r.version}).${r.shiftedLayers ? ` ${r.shiftedLayers} caixas de texto movidas junto com o recorte.` : ''} As caixas de texto vão ser desenhadas por cima numa versão nova.`)
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), error: true })
      setSaving(false)
    }
  }

  const toImagePoint = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = maskRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.round(((e.clientX - rect.left) * canvas.width) / rect.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.round(((e.clientY - rect.top) * canvas.height) / rect.height))),
    }
  }

  const rawPoint = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = maskRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: Math.round(((e.clientX - rect.left) * canvas.width) / rect.width), y: Math.round(((e.clientY - rect.top) * canvas.height) / rect.height) }
  }

  const strokeTo = (from: Point, to: Point) => {
    const onImage = tool === 'imageEraser'
    const layer = onImage ? activeLayer() : null
    const ctx = layer ? ctx2d(layer.canvas) : onImage ? imageCtx() : maskCtx()
    const ox = layer?.x ?? 0
    const oy = layer?.y ?? 0
    ctx.globalCompositeOperation = tool === 'eraser' || layer ? 'destination-out' : 'source-over'
    ctx.strokeStyle = onImage && !layer ? paint : `rgb(${MASK_COLOR.join(',')})`
    ctx.lineWidth = brush
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x - ox, from.y - oy)
    ctx.lineTo(to.x - ox, to.y - oy)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const handActive = tool === 'hand' || spaceHeld

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if ((e.button !== 0 && e.button !== 1) || !cv || !imageRef.current || !maskRef.current || saving) return
    if (handActive || e.button === 1) {
      const vp = viewportRef.current
      if (!vp) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      pan.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop }
      setPanning(true)
      return
    }
    const point = toImagePoint(e)
    if (tool === 'lasso') {
      const near = 8 / zoom
      if (!lasso || lasso.closed) {
        setLasso({ points: [point], closed: false })
        return
      }
      const first = lasso.points[0]
      if (lasso.points.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) <= near) return closeLasso()
      const last = lasso.points[lasso.points.length - 1]
      if (Math.hypot(point.x - last.x, point.y - last.y) <= 1) return
      setLasso({ points: [...lasso.points, point], closed: false })
      return
    }
    if (tool === 'move') {
      const l = activeLayer()
      if (!l) {
        setStatus({ text: 'Selecione uma camada no painel Camadas para mover. O Fundo não se move.', error: true })
        return
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      moveDrag.current = { start: rawPoint(e), x: l.x, y: l.y, before: snapshot(), moved: false }
      return
    }
    if (tool === 'crop') {
      e.currentTarget.setPointerCapture(e.pointerId)
      const hit = crop ? cropHit(point, crop) : null
      cropDrag.current = { mode: hit ?? 'draw', start: point, rect: crop ?? { x: point.x, y: point.y, w: 0, h: 0 } }
      if (!hit) setCrop({ x: point.x, y: point.y, w: 0, h: 0 })
      return
    }
    if (tool === 'wand') {
      try {
        const result = magicWand(cv, imageRef.current, maskRef.current, point.x, point.y, { threshold, closeSize: wandClose, dilate: wandDilate })
        maskSource.current = 'Caneta mágica'
        refreshMaskCount()
        setStatus({ text: `Caneta mágica: ${result.pixels.toLocaleString('pt-BR')} px de texto em ${result.ms.toFixed(0)} ms` })
        if (autoApply) apply()
      } catch (err) {
        if (!(err instanceof WandError)) throw err
        setStatus({ text: err.message, error: true })
      }
      return
    }
    if (tool === 'brush') maskSource.current = 'Pincel'
    if (tool === 'eraser' && !maskPixels) {
      setStatus({ text: 'A borracha de máscara só apaga o vermelho. Para apagar a imagem, use a Borracha de imagem (E) ou pinte com o Pincel (B) e clique em Remover.', error: true })
      return
    }
    if (tool === 'imageEraser') {
      if (e.altKey) {
        const [r, g, b] = imageCtx().getImageData(point.x, point.y, 1, 1).data
        const hex = toHex(r, g, b)
        setPaint(hex)
        setStatus({ text: `Cor da borracha: ${hex}` })
        return
      }
      const l = activeLayer()
      if (l && !l.visible) {
        setStatus({ text: `A camada "${l.name}" está oculta. Mostre ela (olho) para apagar.`, error: true })
        return
      }
      pushUndo(snapshot(), l ? `Borracha · ${l.name}` : 'Borracha de imagem')
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = point
    strokeTo(point, point)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cursor = cursorRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    if (cursor) cursor.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`
    if (coordsRef.current && maskRef.current) {
      const p = toImagePoint(e)
      coordsRef.current.textContent = `X ${p.x} · Y ${p.y}`
    }
    const vp = viewportRef.current
    if (pan.current && vp) {
      vp.scrollLeft = pan.current.left - (e.clientX - pan.current.x)
      vp.scrollTop = pan.current.top - (e.clientY - pan.current.y)
      return
    }
    if (tool === 'lasso') {
      if (lasso && !lasso.closed) setLassoHover(toImagePoint(e))
      return
    }
    const md = moveDrag.current
    if (md) {
      const p = rawPoint(e)
      const x = md.x + p.x - md.start.x
      const y = md.y + p.y - md.start.y
      md.moved = md.moved || x !== md.x || y !== md.y
      setLayers(layersRef.current.map((l) => (l.id === activeId ? { ...l, x, y } : l)))
      return
    }
    if (tool === 'crop') {
      const p = toImagePoint(e)
      if (cropDrag.current) dragCrop(p)
      else {
        const hit = crop ? cropHit(p, crop) : null
        const next = hit ? CROP_CURSOR[hit] : 'crosshair'
        if (next !== cropCursor) setCropCursor(next)
      }
      return
    }
    if (!drawing.current) return
    const point = toImagePoint(e)
    strokeTo(drawing.current, point)
    drawing.current = point
  }

  const onPointerUp = () => {
    if (pan.current) {
      pan.current = null
      setPanning(false)
      return
    }
    const md = moveDrag.current
    if (md) {
      moveDrag.current = null
      if (md.moved) pushUndo(md.before, `Mover ${activeLayer()?.name ?? 'camada'}`)
      return
    }
    if (cropDrag.current) {
      cropDrag.current = null
      if (crop && (crop.w < MIN_CROP || crop.h < MIN_CROP)) setCrop(null)
      return
    }
    if (!drawing.current) return
    drawing.current = null
    refreshMaskCount()
  }

  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      e.stopPropagation()
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (k === ' ') {
        e.preventDefault()
        if (!e.repeat) setSpaceHeld(true)
      } else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault()
        redo()
      } else if (mod && k === 'z') {
        e.preventDefault()
        undo()
      } else if (mod && (k === '=' || k === '+')) {
        e.preventDefault()
        zoomTo(zoom * 1.25)
      } else if (mod && k === '-') {
        e.preventDefault()
        zoomTo(zoom / 1.25)
      } else if (mod && k === '0') {
        e.preventDefault()
        if (size) fitZoom(size.width, size.height)
      } else if (mod && k === '1') {
        e.preventDefault()
        zoomTo(1)
      } else if (mod && k === 'j') {
        e.preventDefault()
        lassoToLayer(e.shiftKey)
      } else if (lasso && !lasso.closed && k === 'backspace') {
        e.preventDefault()
        const points = lasso.points.slice(0, -1)
        setLasso(points.length ? { points, closed: false } : null)
      } else if (lasso?.closed && (k === 'delete' || k === 'backspace')) {
        e.preventDefault()
        lassoDelete()
      } else if (lasso && k === 'escape') {
        setLasso(null)
        setLassoHover(null)
      } else if (lasso && !lasso.closed && k === 'enter') {
        closeLasso()
      } else if (mod || e.altKey) {
        return
      } else if (k === 'v') pickTool('move')
      else if (k === 'b') pickTool('brush')
      else if (k === 'e') pickTool('imageEraser')
      else if (k === 'm') pickTool('eraser')
      else if (k === 'w') pickTool('wand')
      else if (k === 'r') pickTool('crop')
      else if (k === 'l') pickTool('lasso')
      else if (k === 'h') pickTool('hand')
      else if (k === '[') setBrush((b) => Math.max(2, b - 4))
      else if (k === ']') setBrush((b) => Math.min(160, b + 4))
      else if (k === 'enter') {
        if (tool === 'crop') applyCrop()
        else apply()
      } else if (k === 'escape' || k === 'delete') {
        if (crop) setCrop(null)
        else clearMask()
      }
      else if (k === 'c' && !e.repeat) setComparing(true)
    }
    wheel.current = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)
    }
  })

  useEffect(() => {
    const vp = viewportRef.current
    const down = (e: KeyboardEvent) => keys.current(e)
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'c') setComparing(false)
      if (k === ' ') setSpaceHeld(false)
    }
    const onWheel = (e: WheelEvent) => wheel.current(e)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    vp?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
      vp?.removeEventListener('wheel', onWheel)
    }
  }, [])

  const ready = !!cv && !!size
  const cursorSize = brush * zoom
  const active = TOOLS.find((t) => t.tool === tool)!
  const ext = (page.file.split('.').pop() ?? '').toUpperCase()
  const showBrushCursor = (tool === 'brush' || tool === 'eraser' || tool === 'imageEraser') && !handActive
  const selectedLayer = layers.find((l) => l.id === activeId) ?? null

  return createPortal(
    <div className="fixed inset-0 z-50 flex select-none flex-col bg-[#1e1e1e] text-[13px] text-[#d6d6d6]" data-testid="base-editor">
      {confirmDialog}
      <Dialog
        open={!!importing}
        onClose={() => {
          importing?.bitmap.close()
          setImporting(null)
        }}
        title="Tamanho diferente da base"
        footer={
          importing &&
          size && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  importing.bitmap.close()
                  setImporting(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  replaceWith(importing.bitmap, importing.name, false)
                  setImporting(null)
                }}
              >
                Usar {importing.bitmap.width} × {importing.bitmap.height}
              </Button>
              <Button
                variant="primary"
                autoFocus
                onClick={() => {
                  replaceWith(importing.bitmap, importing.name, true)
                  setImporting(null)
                }}
              >
                Redimensionar para {size.width} × {size.height}
              </Button>
            </>
          )
        }
      >
        {importing && size && (
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              <b>{importing.name}</b> tem {importing.bitmap.width} × {importing.bitmap.height} px e a base atual tem {size.width} × {size.height} px.
            </p>
            <p>Redimensionar estica a imagem para o tamanho da base e mantém as caixas de texto no lugar. Usar o tamanho dela troca o tamanho da página; confira as caixas de texto depois de salvar.</p>
          </div>
        )}
      </Dialog>

      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[#111] bg-[#252525] px-3">
        <span className="grid size-7 place-items-center rounded-md bg-brand text-white">
          <Svg className="size-4">{ICONS.wand}</Svg>
        </span>
        <div className="min-w-0 leading-tight">
          <div className="font-semibold text-white">
            Edição de base{dirty && <span className="text-brand"> •</span>}
          </div>
          <div className="truncate text-[11px] text-[#9a9a9a]">
            {page.series.title} › Cap. {page.chapter.number} › Página {page.position}
          </div>
        </div>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-[#3a3a3a] bg-[#1d1d1d] px-2.5 py-1 text-[11px] text-[#a8a8a8] md:flex" title="Todo o processamento roda neste navegador com OpenCV.js; o servidor só recebe a imagem pronta">
          <span className="size-1.5 rounded-full bg-done" /> OpenCV local · sem custo de CPU/GPU no servidor
        </span>
        <button type="button" className="rounded-md px-3 py-1.5 text-[#c8c8c8] hover:bg-[#3a3a3a] hover:text-white disabled:opacity-40" disabled={saving} onClick={() => void close()}>
          Cancelar
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-1.5 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!ready || !dirty || saving || !fundoVisible}
          title={!fundoVisible ? 'Mostre a camada Fundo para salvar' : dirty ? 'Salva a imagem (camadas visíveis juntas) como uma versão nova da base e redesenha as caixas de texto por cima' : 'Faça alguma alteração antes de salvar'}
          onClick={() => void save()}
        >
          {saving && <Spinner className="size-3.5" />} Salvar base
        </button>
      </div>

      <div className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-[#111] bg-[#2b2b2b] px-3 text-xs">
        <span className="flex items-center gap-2 font-medium text-white">
          <Svg className="size-4">{ICONS[tool]}</Svg>
          {active.label}
        </span>
        <Divider />
        {(tool === 'eraser' || tool === 'imageEraser') && (
          <>
            <span className="inline-flex rounded-md bg-[#1d1d1d] p-0.5" role="radiogroup" aria-label="Tipo de borracha">
              {(['imageEraser', 'eraser'] as const).map((kind) => (
                <button key={kind} type="button" role="radio" aria-checked={tool === kind} onClick={() => pickTool(kind)} className={cx('whitespace-nowrap rounded px-2 py-0.5', tool === kind ? 'bg-[#4b4b4b] text-white' : 'text-[#a8a8a8] hover:text-white')}>
                  {kind === 'imageEraser' ? 'Imagem' : 'Máscara'}
                </button>
              ))}
            </span>
            <Divider />
          </>
        )}
        {(tool === 'brush' || tool === 'eraser' || tool === 'imageEraser') && <Opt label="Tamanho" value={brush} min={2} max={160} suffix="px" onChange={setBrush} title="Atalhos: [ e ]" wide />}
        {tool === 'imageEraser' && selectedLayer && <span className="whitespace-nowrap text-[#9a9a9a]">Apagando na camada “{selectedLayer.name}”: fica transparente</span>}
        {tool === 'imageEraser' && !selectedLayer && (
          <>
            <Divider />
            <label className="flex items-center gap-2 whitespace-nowrap" title="Cor usada para apagar. Alt+clique na imagem pega a cor do ponto">
              <span className="text-[#a8a8a8]">Cor</span>
              <input type="color" className="h-6 w-8 cursor-pointer rounded border border-[#3f3f3f] bg-transparent p-0" value={paint} onChange={(e) => setPaint(e.target.value)} />
              <span className="tabular-nums text-[#c8c8c8]">{paint}</span>
            </label>
            {['#ffffff', '#000000'].map((c) => (
              <button key={c} type="button" title={c === '#ffffff' ? 'Branco' : 'Preto'} aria-label={c === '#ffffff' ? 'Branco' : 'Preto'} onClick={() => setPaint(c)} className={cx('size-5 rounded border', paint === c ? 'border-brand ring-1 ring-brand' : 'border-[#555]')} style={{ background: c }} />
            ))}
            <span className="whitespace-nowrap text-[#8a8a8a]">Alt+clique pega a cor</span>
          </>
        )}
        {tool === 'wand' && (
          <>
            <Opt label="Limiar do branco" value={threshold} min={60} max={250} onChange={setThreshold} title="Quanto mais alto, mais clara a área precisa ser para contar como fundo do balão" />
            <Opt label="Expandir texto" value={wandDilate} min={0} max={10} suffix="px" onChange={setWandDilate} />
            <Opt label="Fechar letras na borda" value={wandClose} min={0} max={30} onChange={setWandClose} title="Use quando letras encostadas no contorno do balão ficam de fora" />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-[#c8c8c8]">
              <input type="checkbox" className="accent-brand" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} /> Remover ao clicar
            </label>
          </>
        )}
        {tool === 'hand' && <span className="text-[#9a9a9a]">Arraste para mover a imagem. Ctrl+roda do mouse para zoom.</span>}
        {tool === 'lasso' && !lasso?.closed && (
          <>
            <span className="whitespace-nowrap text-[#c8c8c8]">{lasso ? `${lasso.points.length} pontos` : 'Clique para começar'}</span>
            <span className="whitespace-nowrap text-[#8a8a8a]">feche no primeiro ponto (azul), duplo clique ou Enter · Backspace tira o último ponto · Esc cancela</span>
            {lasso && (
              <button type="button" className="whitespace-nowrap rounded bg-brand px-2.5 py-0.5 font-medium text-white hover:brightness-110 disabled:opacity-40" disabled={lasso.points.length < 3} onClick={closeLasso}>
                Fechar seleção
              </button>
            )}
          </>
        )}
        {tool === 'lasso' && lasso?.closed && (
          <>
            <span className="whitespace-nowrap text-[#9a9a9a]">Seleção em {selectedLayer ? `“${selectedLayer.name}”` : 'Fundo'}:</span>
            <button type="button" className="whitespace-nowrap rounded border border-[#444] px-2 py-0.5 text-[#d6d6d6] hover:bg-[#3a3a3a]" title="Ctrl+J" onClick={() => lassoToLayer(false)}>
              Copiar para camada
            </button>
            <button type="button" className="whitespace-nowrap rounded border border-[#444] px-2 py-0.5 text-[#d6d6d6] hover:bg-[#3a3a3a]" title={`Ctrl+Shift+J${selectedLayer ? '' : `. No Fundo, o buraco é pintado com a cor da borracha (${paint})`}`} onClick={() => lassoToLayer(true)}>
              Recortar para camada
            </button>
            <button type="button" className="whitespace-nowrap rounded bg-brand px-2.5 py-0.5 font-medium text-white hover:brightness-110" title="Delete" onClick={lassoDelete}>
              {selectedLayer ? 'Apagar (transparente)' : 'Apagar e reconstruir fundo'}
            </button>
            <button type="button" className="whitespace-nowrap rounded border border-[#444] px-2 py-0.5 text-[#d6d6d6] hover:bg-[#3a3a3a]" title="Pinta a seleção na máscara vermelha para ajustar antes de Remover" onClick={lassoToMask}>
              Adicionar à máscara
            </button>
            <button type="button" className="whitespace-nowrap rounded px-2 py-0.5 text-[#c8c8c8] hover:bg-[#3a3a3a]" title="Esc" onClick={() => setLasso(null)}>
              Cancelar
            </button>
          </>
        )}
        {tool === 'crop' && (
          <>
            <span className="whitespace-nowrap tabular-nums text-[#c8c8c8]">
              {crop ? (
                <>
                  <span className="text-[#8a8a8a]">X</span> {crop.x} <span className="ml-2 text-[#8a8a8a]">Y</span> {crop.y} <span className="ml-2 text-[#8a8a8a]">L</span> {crop.w} <span className="ml-2 text-[#8a8a8a]">A</span> {crop.h} px
                </>
              ) : (
                <span className="text-[#9a9a9a]">Arraste sobre a imagem para escolher a área que fica</span>
              )}
            </span>
            {size && (
              <button type="button" className="whitespace-nowrap rounded border border-[#444] px-2 py-0.5 text-[#d6d6d6] hover:bg-[#3a3a3a]" onClick={() => setCrop({ x: 0, y: 0, w: size.width, h: size.height })} title="Seleciona a imagem inteira para ajustar pelas bordas">
                Selecionar tudo
              </button>
            )}
            <button type="button" className="whitespace-nowrap rounded bg-brand px-2.5 py-0.5 font-medium text-white hover:brightness-110 disabled:opacity-40" disabled={!crop || crop.w < MIN_CROP || crop.h < MIN_CROP} onClick={applyCrop} title="Enter">
              Aplicar recorte
            </button>
            <button type="button" className="whitespace-nowrap rounded px-2 py-0.5 text-[#c8c8c8] hover:bg-[#3a3a3a] disabled:opacity-40" disabled={!crop} onClick={() => setCrop(null)} title="Esc">
              Cancelar seleção
            </button>
          </>
        )}
        <span className="ml-auto truncate text-[#9a9a9a]">{active.hint}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#111] bg-[#2b2b2b] py-2" aria-label="Ferramentas">
          {TOOLS.filter((t) => t.tool !== 'eraser').map((t) => {
            if (t.tool !== 'imageEraser') return <IconButton key={t.tool} icon={ICONS[t.tool]} label={`${t.label} (${t.key})`} active={tool === t.tool} onClick={() => pickTool(t.tool)} />
            const isEraser = tool === 'imageEraser' || tool === 'eraser'
            const current = TOOLS.find((x) => x.tool === eraserKind)!
            return (
              <div key="eraser-group" ref={eraserGroupRef} className="relative">
                <IconButton
                  icon={ICONS[eraserKind]}
                  label={`${current.label} (${current.key}). Clique de novo ou com o botão direito para escolher o tipo de borracha`}
                  active={isEraser}
                  aria-haspopup="menu"
                  aria-expanded={eraserMenu}
                  onClick={() => (isEraser ? setEraserMenu(!eraserMenu) : pickTool(eraserKind))}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setEraserMenu(true)
                  }}
                />
                <svg viewBox="0 0 6 6" className="pointer-events-none absolute bottom-1 right-1 size-1.5 fill-[#c8c8c8]" aria-hidden>
                  <path d="M6 0v6H0Z" />
                </svg>
                {eraserMenu && (
                  <div role="menu" aria-label="Tipo de borracha" className="absolute left-full top-0 z-30 ml-2 w-72 overflow-hidden rounded-md border border-[#111] bg-[#2f2f2f] py-1 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
                    <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a8a8a]">Borracha</div>
                    {(['imageEraser', 'eraser'] as const).map((kind) => {
                      const item = TOOLS.find((x) => x.tool === kind)!
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="menuitemradio"
                          aria-checked={eraserKind === kind}
                          onClick={() => pickTool(kind)}
                          className={cx('flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-[#3d4b63]', eraserKind === kind && 'bg-[#383838]')}
                        >
                          <span className="mt-0.5 w-3 text-[11px] text-white">{eraserKind === kind ? '■' : ''}</span>
                          <Svg className="mt-0.5 size-4 shrink-0">{ICONS[kind]}</Svg>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2 text-white">
                              {item.label}
                              <kbd className="text-[10px] text-[#9a9a9a]">{item.key}</kbd>
                            </span>
                            <span className="block text-[11px] leading-snug text-[#9a9a9a]">{kind === 'imageEraser' ? 'Apaga na imagem pintando com uma cor (Alt+clique pega a cor)' : 'Tira o vermelho da máscara; não mexe na imagem'}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          <span className="my-1 h-px w-7 bg-[#3f3f3f]" />
          <IconButton icon={ICONS.upload} label="Importar imagem: envia um arquivo que substitui a base" disabled={!ready || saving} onClick={() => fileRef.current?.click()} />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importFile(file)
            }}
          />
          <IconButton
            icon={ICONS.compare}
            label="Comparar com a base atual (segure, ou segure C)"
            active={comparing}
            disabled={!ready}
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
          />
          <span className="my-1 h-px w-7 bg-[#3f3f3f]" />
          <IconButton icon={ICONS.undo} label="Desfazer (Ctrl+Z)" disabled={!history.done.length} onClick={undo} />
          <IconButton icon={ICONS.redo} label="Refazer (Ctrl+Y)" disabled={!history.undone.length} onClick={redo} />
          <span className="mt-auto flex size-7 items-center justify-center rounded border border-[#555] text-[10px]" style={{ background: `rgb(${MASK_COLOR.join(',')})` }} title="Cor da máscara" />
        </nav>

        <div ref={viewportRef} className="relative min-w-0 flex-1 overflow-auto bg-[#191919]">
          {!ready && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-[#333] bg-[#252525] px-8 py-6 text-center">
                {loadError ? (
                  <>
                    <span className="font-medium text-failed">Não consegui abrir o editor</span>
                    <span className="text-xs text-[#a8a8a8]">{loadError}</span>
                  </>
                ) : (
                  <>
                    <Spinner className="size-6 text-brand" />
                    <span className="font-medium text-white">Preparando o editor</span>
                    <span className="text-xs text-[#9a9a9a]">Carregando o OpenCV (~4 MB, só na primeira vez) e a imagem base.</span>
                  </>
                )}
              </div>
            </div>
          )}
          <div className={cx('flex min-h-full min-w-full w-max items-center justify-center p-10', !ready && 'invisible')}>
            <div
              ref={wrapRef}
              className={cx('relative shrink-0 overflow-hidden shadow-[0_0_0_1px_#000,0_10px_40px_rgba(0,0,0,0.6)]', fundoVisible ? 'bg-white' : 'bg-[repeating-conic-gradient(#d4d4d4_0_25%,#ffffff_0_50%)] bg-[length:16px_16px]')}
              style={size ? { width: size.width * zoom, height: size.height * zoom } : undefined}
            >
              <canvas ref={imageRef} className={cx('absolute inset-0 h-full w-full', !fundoVisible && 'invisible')} style={{ imageRendering: zoom >= 2 ? 'pixelated' : 'auto' }} />
              {layers.map((l) => (
                <div
                  key={l.id}
                  ref={(el) => mountCanvas(el, l.canvas)}
                  className={cx('pointer-events-none absolute', (!l.visible || comparing) && 'invisible')}
                  style={{ left: l.x * zoom, top: l.y * zoom, width: l.canvas.width * zoom, height: l.canvas.height * zoom, opacity: l.opacity, imageRendering: zoom >= 2 ? 'pixelated' : 'auto' }}
                />
              ))}
              {comparing && sourceUrl && sourceSize && (
                <img src={sourceUrl} alt="" className="pointer-events-none absolute max-w-none" style={{ left: -origin.x * zoom, top: -origin.y * zoom, width: sourceSize.width * zoom, height: sourceSize.height * zoom }} />
              )}
              <canvas
                ref={maskRef}
                className={cx(
                  'absolute inset-0 h-full w-full touch-none opacity-55',
                  comparing && 'invisible',
                  handActive ? (panning ? 'cursor-grabbing' : 'cursor-grab') : tool === 'wand' || tool === 'lasso' ? 'cursor-crosshair' : tool === 'move' ? 'cursor-move' : tool === 'crop' ? '' : 'cursor-none',
                )}
                style={tool === 'crop' && !handActive ? { cursor: cropCursor } : undefined}
                onPointerDown={onPointerDown}
                onDoubleClick={() => tool === 'lasso' && closeLasso()}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerEnter={() => cursorRef.current?.classList.remove('hidden')}
                onPointerLeave={() => {
                  cursorRef.current?.classList.add('hidden')
                  if (coordsRef.current) coordsRef.current.textContent = ''
                }}
              />
              {showBrushCursor && (
                <div
                  ref={cursorRef}
                  className="pointer-events-none absolute left-0 top-0 hidden rounded-full border border-white mix-blend-difference"
                  style={{ width: cursorSize, height: cursorSize, marginLeft: -cursorSize / 2, marginTop: -cursorSize / 2 }}
                />
              )}
              {selectedLayer && selectedLayer.visible && !comparing && (
                <div
                  className="pointer-events-none absolute outline outline-1 outline-offset-0 outline-sky-400 [outline-style:dashed]"
                  style={{ left: selectedLayer.x * zoom, top: selectedLayer.y * zoom, width: selectedLayer.canvas.width * zoom, height: selectedLayer.canvas.height * zoom }}
                />
              )}
              {lasso && size && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none" aria-hidden>
                  {lasso.closed && <polygon points={lasso.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(56,189,248,0.15)" />}
                  {(() => {
                    const pts = [...lasso.points, ...(!lasso.closed && lassoHover ? [lassoHover] : [])].map((p) => `${p.x},${p.y}`).join(' ')
                    const Shape = lasso.closed ? 'polygon' : 'polyline'
                    return (
                      <>
                        <Shape points={pts} fill="none" stroke="#000" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                        <Shape points={pts} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                      </>
                    )
                  })()}
                  {!lasso.closed &&
                    lasso.points.map((p, i) => (
                      <rect key={i} x={p.x - 4 / zoom} y={p.y - 4 / zoom} width={8 / zoom} height={8 / zoom} fill={i === 0 && lasso.points.length >= 3 ? '#38bdf8' : '#fff'} stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    ))}
                </svg>
              )}
              {crop && crop.w > 0 && crop.h > 0 && (
                <div
                  className="pointer-events-none absolute border border-white shadow-[0_0_0_100000px_rgba(0,0,0,0.6)]"
                  style={{ left: crop.x * zoom, top: crop.y * zoom, width: crop.w * zoom, height: crop.h * zoom }}
                >
                  <span className="absolute inset-x-0 top-1/3 border-t border-white/30" />
                  <span className="absolute inset-x-0 top-2/3 border-t border-white/30" />
                  <span className="absolute inset-y-0 left-1/3 border-l border-white/30" />
                  <span className="absolute inset-y-0 left-2/3 border-l border-white/30" />
                  {(['left-0 top-0', 'right-0 top-0', 'left-0 bottom-0', 'right-0 bottom-0'] as const).map((pos) => (
                    <span key={pos} className={cx('absolute size-2.5 border border-[#222] bg-white', pos, pos.includes('left') ? '-ml-[5px]' : '-mr-[5px]', pos.includes('top') ? '-mt-[5px]' : '-mb-[5px]')} />
                  ))}
                  {(['left-1/2 top-0 -ml-[5px] -mt-[5px]', 'left-1/2 bottom-0 -ml-[5px] -mb-[5px]', 'top-1/2 left-0 -mt-[5px] -ml-[5px]', 'top-1/2 right-0 -mt-[5px] -mr-[5px]'] as const).map((pos) => (
                    <span key={pos} className={cx('absolute size-2.5 border border-[#222] bg-white', pos)} />
                  ))}
                  <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[11px] tabular-nums text-white">
                    {crop.w} × {crop.h}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-[#111] bg-[#2b2b2b] lg:flex">
          <section className="border-b border-[#1a1a1a]">
            <header className="flex items-center justify-between bg-[#323232] px-3 py-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#c4c4c4]">Camadas</h3>
              <span className="text-[10px] text-[#888]">{layers.length + 1}</span>
            </header>
            <LayersPanel
              layers={layers}
              activeId={activeId}
              base={() => imageRef.current}
              baseVisible={fundoVisible}
              disabled={!ready || saving}
              onSelect={setActiveId}
              onToggleBase={() => setFundoVisible(!fundoVisible)}
              onChange={changeLayer}
              onAdd={() => layerFileRef.current?.click()}
              onDuplicate={duplicateLayer}
              onMove={reorderLayer}
              onMerge={mergeLayer}
              onRemove={removeLayer}
            />
            <input
              ref={layerFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void addLayer(file)
              }}
            />
          </section>
          <Panel title="Remoção">
            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between gap-2">
                <span className="text-[#a8a8a8]">Método</span>
                <select className="w-40 rounded border border-[#3f3f3f] bg-[#1d1d1d] px-2 py-1 text-xs outline-none focus:border-brand" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                  {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end">
                <Opt label="Raio" value={radius} min={1} max={25} disabled={method === 'fill'} onChange={setRadius} />
              </div>
              <div className="flex justify-end">
                <Opt label="Expandir" value={dilate} min={0} max={12} suffix="px" onChange={setDilate} />
              </div>
              <div className="flex items-center justify-between rounded border border-[#3a3a3a] bg-[#232323] px-2.5 py-1.5">
                <span className="text-[#a8a8a8]">Máscara</span>
                <span className={cx('tabular-nums', maskPixels ? 'text-white' : 'text-[#777]')}>{maskPixels.toLocaleString('pt-BR')} px</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" disabled={!ready || !maskPixels} title="Enter" onClick={apply}>
                  Remover
                </button>
                <button type="button" className="rounded-md border border-[#444] px-3 py-1.5 text-[#d6d6d6] hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-40" disabled={!maskPixels} title="Esc" onClick={clearMask}>
                  Limpar máscara
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Histórico" right={<span className="text-[10px] text-[#888]">até {HISTORY_LIMIT} passos</span>}>
            <ol className="-mx-1 space-y-0.5 text-xs">
              <li>
                <button
                  type="button"
                  disabled={history.dropped}
                  onClick={() => jumpTo(0)}
                  className={cx('flex w-full items-center gap-2 rounded px-2 py-1 text-left', history.done.length === 0 ? 'bg-[#3d4b63] text-white' : 'hover:bg-[#363636]', history.dropped && 'cursor-not-allowed opacity-40')}
                  title={history.dropped ? 'Passos antigos descartados para economizar memória' : 'Voltar ao início'}
                >
                  <span className="size-6 shrink-0 overflow-hidden rounded-sm border border-[#555] bg-[#1d1d1d]">{sourceUrl && <img src={sourceUrl} alt="" className="size-full object-cover object-top" />}</span>
                  Base aberta
                </button>
              </li>
              {history.done.map((label, i) => (
                <li key={`d${i}`}>
                  <button type="button" onClick={() => jumpTo(i + 1)} className={cx('flex w-full items-center gap-2 rounded px-2 py-1 text-left', i === history.done.length - 1 ? 'bg-[#3d4b63] text-white' : 'hover:bg-[#363636]')}>
                    <Svg className="size-4 shrink-0 text-[#a8a8a8]">{stepIcon(label)}</Svg>
                    {label}
                  </button>
                </li>
              ))}
              {history.undone.map((label, i) => (
                <li key={`u${i}`}>
                  <button type="button" onClick={() => jumpTo(history.done.length + i + 1)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[#777] hover:bg-[#363636]">
                    <Svg className="size-4 shrink-0">{stepIcon(label)}</Svg>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Informações">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-[#9a9a9a]">Arquivo</dt>
              <dd className="truncate text-right" title={page.file}>
                {page.file}
              </dd>
              <dt className="text-[#9a9a9a]">Tamanho</dt>
              <dd className="text-right tabular-nums">{size ? `${size.width} × ${size.height} px` : '—'}</dd>
              <dt className="text-[#9a9a9a]">Salva como</dt>
              <dd className="text-right">{ext || 'PNG'} · versão nova da base</dd>
              {(origin.x > 0 || origin.y > 0) && (
                <>
                  <dt className="text-[#9a9a9a]">Recorte</dt>
                  <dd className="text-right tabular-nums">
                    a partir de X {origin.x} · Y {origin.y}
                  </dd>
                </>
              )}
            </dl>
            {sourceSize && size && (size.width !== sourceSize.width || size.height !== sourceSize.height) && (
              <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
                O tamanho mudou ({sourceSize.width} × {sourceSize.height} → {size.width} × {size.height}).{origin.x || origin.y ? ' As caixas de texto vão ser movidas junto com o recorte.' : ' Confira as caixas de texto depois de salvar.'}
              </p>
            )}
          </Panel>

          <Panel
            title="Atalhos"
            right={
              <button type="button" className="text-[10px] text-[#9a9a9a] hover:text-white" onClick={() => setShowKeys(!showKeys)}>
                {showKeys ? 'esconder' : 'mostrar'}
              </button>
            }
          >
            {showKeys ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>
                      <kbd className="rounded border border-[#4a4a4a] bg-[#1d1d1d] px-1 text-[10px] text-[#d6d6d6]">{k}</kbd>
                    </dt>
                    <dd className="text-[#a8a8a8]">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-[#888]">B, E, W, H trocam a ferramenta; Enter remove; Ctrl+Z desfaz.</p>
            )}
          </Panel>
        </aside>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 border-t border-[#111] bg-[#252525] px-2 text-[11px] text-[#a8a8a8]">
        <IconButton icon={ICONS.zoomOut} label="Diminuir zoom (Ctrl −)" className="size-6" disabled={!ready} onClick={() => zoomTo(zoom / 1.25)} />
        <span className="w-12 text-center tabular-nums text-[#d6d6d6]">{Math.round(zoom * 100)}%</span>
        <IconButton icon={ICONS.zoomIn} label="Aumentar zoom (Ctrl +)" className="size-6" disabled={!ready} onClick={() => zoomTo(zoom * 1.25)} />
        <IconButton icon={ICONS.fit} label="Ajustar à tela (Ctrl+0)" className="size-6" disabled={!ready} onClick={() => size && fitZoom(size.width, size.height)} />
        <button type="button" className="rounded px-1.5 py-0.5 hover:bg-[#3a3a3a] hover:text-white disabled:opacity-40" disabled={!ready} onClick={() => zoomTo(1)} title="Tamanho real (Ctrl+1)">
          100%
        </button>
        <Divider />
        <span className="tabular-nums">{size ? `${size.width} × ${size.height}` : '—'}</span>
        <Divider />
        <span ref={coordsRef} className="w-28 tabular-nums" />
        <span className={cx('ml-auto truncate', status?.error ? 'text-failed' : 'text-[#a8a8a8]')}>{status?.text ?? (ready ? 'Pronto' : 'Carregando…')}</span>
      </div>
    </div>,
    document.body,
  )
}
