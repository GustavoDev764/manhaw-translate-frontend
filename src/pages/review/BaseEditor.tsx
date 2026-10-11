import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useConfirm } from '../../components/confirm'
import { Button, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { applyRemoval, magicWand, maskPixelCount, MASK_COLOR, METHOD_LABEL, WandError, type Method } from '../../lib/opencv/inpaint'
import { loadOpenCv, type CV } from '../../lib/opencv/opencv'
import { reviewApi, type ReviewPage } from '../../reviewApi'

type Tool = 'brush' | 'eraser' | 'wand'
type Point = { x: number; y: number }

const HISTORY_LIMIT = 8
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const TOOLS: [Tool, string, string, string][] = [
  ['brush', 'Pincel', 'B', 'Pinte por cima do que quer remover'],
  ['eraser', 'Borracha', 'E', 'Apaga partes da máscara pintada'],
  ['wand', 'Caneta mágica', 'W', 'Clique na parte clara de um balão: marca só as letras dele'],
]

const mimeOf = (file: string) => MIME[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png'

function Slider({ label, value, min, max, step = 1, suffix = '', disabled, onChange, title }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onChange: (v: number) => void; title?: string }) {
  return (
    <label className={cx('block space-y-1 text-xs', disabled && 'opacity-50')} title={title}>
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-slate-400">
          {value}
          {suffix}
        </span>
      </span>
      <input type="range" className="w-full accent-brand" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function BaseEditor({ page, onClose, onSaved }: { page: ReviewPage; onClose: () => void; onSaved: (message: string) => void }) {
  const [cv, setCv] = useState<CV | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('brush')
  const [brush, setBrush] = useState(24)
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
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [ask, confirmDialog] = useConfirm()
  const imageRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const undoStack = useRef<ImageData[]>([])
  const redoStack = useRef<ImageData[]>([])
  const drawing = useRef<Point | null>(null)
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined)

  const imageCtx = () => imageRef.current!.getContext('2d', { willReadFrequently: true })!
  const maskCtx = () => maskRef.current!.getContext('2d', { willReadFrequently: true })!

  const fitZoom = useCallback((width: number) => {
    const available = (viewportRef.current?.clientWidth ?? width) - 48
    setZoom(Math.max(0.1, Math.min(1, available / width)))
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
        setSize({ width: image.width, height: image.height })
        fitZoom(image.width)
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

  const syncHistory = () => setHistory({ undo: undoStack.current.length, redo: redoStack.current.length })

  const fullImage = () => {
    const canvas = imageRef.current!
    return imageCtx().getImageData(0, 0, canvas.width, canvas.height)
  }

  const pushUndo = (before: ImageData) => {
    undoStack.current.push(before)
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
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
    const before = fullImage()
    const result = applyRemoval(cv, imageRef.current, maskRef.current, { method, radius, dilate })
    if (!result) {
      setStatus({ text: 'Pinte uma máscara (ou use a caneta mágica) antes de remover.', error: true })
      return
    }
    pushUndo(before)
    clearMask()
    setStatus({ text: `${METHOD_LABEL[method]}${method === 'fill' ? '' : ` · raio ${radius}`} · ${result.pixels.toLocaleString('pt-BR')} px removidos em ${result.ms.toFixed(0)} ms` })
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous || !imageRef.current) return
    redoStack.current.push(fullImage())
    imageCtx().putImageData(previous, 0, 0)
    syncHistory()
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (!next || !imageRef.current) return
    undoStack.current.push(fullImage())
    imageCtx().putImageData(next, 0, 0)
    syncHistory()
  }

  const dirty = history.undo > 0

  const close = async () => {
    if (saving) return
    if (dirty && !(await ask({ title: 'Descartar edição da base', message: 'As remoções feitas aqui ainda não foram salvas e vão ser perdidas.', confirmLabel: 'Descartar', danger: true }))) return
    onClose()
  }

  const save = async () => {
    const canvas = imageRef.current
    if (!canvas || !dirty) return
    setSaving(true)
    setStatus({ text: 'Enviando a base editada…' })
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui gerar a imagem.'))), mimeOf(page.file), 0.95))
      const r = await reviewApi.saveBase(page.id, blob)
      onSaved(`Base salva (limpa v${r.version}). As caixas de texto vão ser desenhadas por cima numa versão nova.`)
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

  const strokeTo = (from: Point, to: Point) => {
    const ctx = maskCtx()
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = `rgb(${MASK_COLOR.join(',')})`
    ctx.lineWidth = brush
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !cv || !imageRef.current || !maskRef.current || saving) return
    const point = toImagePoint(e)
    if (tool === 'wand') {
      try {
        const result = magicWand(cv, imageRef.current, maskRef.current, point.x, point.y, { threshold, closeSize: wandClose, dilate: wandDilate })
        refreshMaskCount()
        setStatus({ text: `Caneta mágica: ${result.pixels.toLocaleString('pt-BR')} px de texto em ${result.ms.toFixed(0)} ms` })
        if (autoApply) apply()
      } catch (err) {
        if (!(err instanceof WandError)) throw err
        setStatus({ text: err.message, error: true })
      }
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = point
    strokeTo(point, point)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cursor = cursorRef.current
    if (cursor) {
      const rect = e.currentTarget.getBoundingClientRect()
      cursor.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`
    }
    if (!drawing.current) return
    const point = toImagePoint(e)
    strokeTo(drawing.current, point)
    drawing.current = point
  }

  const onPointerUp = () => {
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
      if ((e.ctrlKey || e.metaKey) && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        undo()
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      } else if (k === 'b') setTool('brush')
      else if (k === 'e') setTool('eraser')
      else if (k === 'w') setTool('wand')
      else if (k === '[') setBrush((b) => Math.max(2, b - 4))
      else if (k === ']') setBrush((b) => Math.min(160, b + 4))
      else if (k === 'enter') apply()
      else if (k === 'escape' || k === 'delete') clearMask()
      else if (k === 'c' && !e.repeat) setComparing(true)
    }
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e)
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') setComparing(false)
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const ready = !!cv && !!size
  const cursorSize = brush * zoom

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950 text-slate-100" data-testid="base-editor">
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h2 className="text-base font-semibold">
          Edição de base <span className="font-normal text-slate-400">· página {page.position}</span>
        </h2>
        <span className="text-xs text-slate-400">roda no seu navegador com OpenCV: não usa CPU nem GPU do servidor</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" disabled={saving} onClick={() => void close()}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" disabled={!ready || !dirty || saving} title={dirty ? 'Salva a imagem base como uma versão nova e redesenha as caixas de texto por cima' : 'Remova algo antes de salvar'} onClick={() => void save()}>
            {saving && <Spinner className="size-3" />} Salvar base
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 space-y-4 overflow-y-auto border-r border-slate-800 p-3 text-sm">
          <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ferramenta</div>
            <div className="grid gap-1" role="radiogroup" aria-label="Ferramenta">
              {TOOLS.map(([t, label, key, hint]) => (
                <Button key={t} size="sm" role="radio" aria-checked={tool === t} variant={tool === t ? 'primary' : 'ghost'} className={cx('justify-between', tool !== t && 'text-slate-300 hover:bg-slate-800')} title={hint} onClick={() => setTool(t)}>
                  {label} <kbd className="text-[10px] opacity-70">{key}</kbd>
                </Button>
              ))}
            </div>
          </div>

          {tool !== 'wand' ? (
            <Slider label="Tamanho do pincel" value={brush} min={2} max={160} suffix=" px" onChange={setBrush} title="Atalhos: [ e ]" />
          ) : (
            <div className="space-y-3">
              <Slider label="Limiar do branco" value={threshold} min={60} max={250} onChange={setThreshold} title="Quanto mais alto, mais clara a área precisa ser para contar como fundo do balão" />
              <Slider label="Expandir texto" value={wandDilate} min={0} max={10} suffix=" px" onChange={setWandDilate} />
              <Slider label="Fechar letras na borda" value={wandClose} min={0} max={30} onChange={setWandClose} title="Use quando letras encostadas no contorno do balão ficam de fora" />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" className="accent-brand" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} /> Remover ao clicar
              </label>
            </div>
          )}

          <div className="space-y-3 border-t border-slate-800 pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Remoção</div>
            <label className="block space-y-1 text-xs">
              <span>Método</span>
              <select className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <Slider label="Raio do inpaint" value={radius} min={1} max={25} disabled={method === 'fill'} onChange={setRadius} />
            <Slider label="Expandir máscara" value={dilate} min={0} max={12} suffix=" px" onChange={setDilate} />
            <div className="grid grid-cols-2 gap-1">
              <Button size="sm" variant="primary" disabled={!ready || !maskPixels} title="Enter" onClick={apply}>
                Remover
              </Button>
              <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" disabled={!maskPixels} title="Esc" onClick={clearMask}>
                Limpar máscara
              </Button>
            </div>
            <div className="text-xs text-slate-400 tabular-nums">Máscara: {maskPixels.toLocaleString('pt-BR')} px</div>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="grid grid-cols-2 gap-1">
              <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" disabled={!history.undo} title="Ctrl+Z" onClick={undo}>
                Desfazer
              </Button>
              <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" disabled={!history.redo} title="Ctrl+Y" onClick={redo}>
                Refazer
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-slate-300 hover:bg-slate-800"
              disabled={!ready}
              title="Segure (ou segure C) para ver a base antes da edição"
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
            >
              Comparar com a base atual
            </Button>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <Slider label="Zoom" value={Math.round(zoom * 100)} min={10} max={200} step={5} suffix="%" onChange={(v) => setZoom(v / 100)} />
            <div className="grid grid-cols-2 gap-1">
              <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" disabled={!size} onClick={() => size && fitZoom(size.width)}>
                Ajustar
              </Button>
              <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-slate-800" onClick={() => setZoom(1)}>
                100%
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {status && <div className={cx('border-b border-slate-800 px-4 py-1.5 text-xs', status.error ? 'text-failed' : 'text-slate-400')}>{status.text}</div>}
          <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto bg-[#0b0b0f] p-6">
            {!ready && (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
                {loadError ? <span className="text-failed">Não consegui abrir o editor: {loadError}</span> : (
                  <>
                    <Spinner /> Carregando o OpenCV (~10 MB, só na primeira vez) e a imagem base…
                  </>
                )}
              </div>
            )}
            <div className={cx('relative mx-auto', !ready && 'hidden')} style={size ? { width: size.width * zoom, height: size.height * zoom } : undefined}>
              <canvas ref={imageRef} className="absolute inset-0 h-full w-full select-none" />
              {comparing && sourceUrl && <img src={sourceUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" />}
              <canvas
                ref={maskRef}
                className={cx('absolute inset-0 h-full w-full touch-none opacity-55', comparing && 'invisible', tool === 'wand' ? 'cursor-crosshair' : 'cursor-none')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerEnter={() => cursorRef.current?.classList.remove('hidden')}
                onPointerLeave={() => cursorRef.current?.classList.add('hidden')}
              />
              {tool !== 'wand' && (
                <div
                  ref={cursorRef}
                  className="pointer-events-none absolute left-0 top-0 hidden rounded-full border border-white/90 mix-blend-difference"
                  style={{ width: cursorSize, height: cursorSize, marginLeft: -cursorSize / 2, marginTop: -cursorSize / 2 }}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
