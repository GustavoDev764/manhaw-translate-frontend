import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_FONT_FAMILY, drawTextBox } from '../../lib/textLayout'
import { FontPicker } from '../../components/FontPicker'
import { Badge, Button, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { loadDefaultFont, loadFont, type FontRow, type ReviewPage, type TextLayer } from '../../reviewApi'
import type { SaveState } from './useLayerDraft'
import { normalizeAngle } from './boxGeometry'

const familyOf = (l: TextLayer) => (l.fontId ? `mt-${l.fontId}` : DEFAULT_FONT_FAMILY)

export function LayerCanvas({ width, height, layers, fonts }: { width: number; height: number; layers: TextLayer[]; fonts: FontRow[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [fontsReady, setFontsReady] = useState(0)
  const wanted = useMemo(() => [...new Set(layers.map((l) => l.fontId).filter((x): x is string => !!x))].join(), [layers])

  useEffect(() => {
    let alive = true
    const jobs = [loadDefaultFont(DEFAULT_FONT_FAMILY), ...wanted.split(',').filter(Boolean).map((id) => {
      const font = fonts.find((f) => f.id === id)
      return font ? loadFont(font) : Promise.resolve()
    })]
    void Promise.all(jobs).then(() => alive && setFontsReady((n) => n + 1))
    return () => {
      alive = false
    }
  }, [wanted, fonts])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !fontsReady) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const l of layers) {
      if (!l.text.trim()) continue
      drawTextBox(
        ctx,
        { x: l.region.x, y: l.region.y, w: l.region.w, h: l.region.h, rotation: l.region.rotation ?? 0 },
        { text: l.text, size: l.fontSize, lineHeight: l.lineHeight, align: l.align, color: l.color, strokeColor: l.strokeColor, strokeWidth: l.strokeWidth },
        familyOf(l),
      )
    }
  }, [layers, fontsReady])

  return <canvas ref={ref} width={width} height={height} data-testid="layer-canvas" className="pointer-events-none absolute left-0 top-0" style={{ width, height }} />
}

const SAVE_TEXT: Record<SaveState, string> = { idle: '', saving: 'Salvando…', saved: 'Todas as alterações salvas', error: 'Não consegui salvar a última alteração' }

export function TextPanel({
  page,
  layers,
  linked = {},
  fonts,
  selected,
  onSelect,
  onChange,
  onRemove,
  onApply,
  saveState,
  canEdit,
  readOnlyReason,
  busy,
}: {
  page: ReviewPage
  layers: TextLayer[]
  linked?: Record<string, number[]>
  fonts: FontRow[]
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<TextLayer>) => void
  onRemove: (id: string) => void
  onApply: () => void
  saveState: SaveState
  canEdit: boolean
  readOnlyReason: string | null
  busy: boolean
}) {
  if (!page.editable) {
    return (
      <Notice tone="neutral">
        {page.status === 'no_text'
          ? 'Esta página não tem texto. Se precisar escrever nela, rode “Limpar balões” neste capítulo para liberar as caixas de texto.'
          : 'Esta página ainda não tem a página limpa (sem o texto em inglês). Na lista de capítulos, rode “Limpar balões” para traduzir à mão ou “Traduzir” para usar a IA; depois as caixas de texto ficam liberadas.'}
      </Notice>
    )
  }
  const layer = layers.find((l) => l.id === selected) ?? null
  return (
    <div className="space-y-3">
      {readOnlyReason && <Notice tone="queued">{readOnlyReason}</Notice>}
      {!layers.length && <p className="py-4 text-center text-sm text-slate-500">Nenhuma caixa. Use “Caixa de texto” e arraste sobre a imagem.</p>}
      {layers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {layers.map((l, i) => (
            <button key={l.id} type="button" onClick={() => onSelect(l.id)} className={cx('max-w-full truncate rounded-md border px-2 py-1 text-xs', selected === l.id ? 'border-brand bg-brand/10 text-brand' : 'border-slate-300 dark:border-slate-700')}>
              {i + 1}. {l.text.slice(0, 24) || '(vazia)'}
            </button>
          ))}
        </div>
      )}
      {layer && linked[layer.id]?.length ? (
        <Notice tone="neutral">
          Esta caixa continua na página {linked[layer.id].join(' e ')}: a caixa de lá foi alinhada junto (posição, tamanho, rotação, texto e estilo). Abra a página {linked[layer.id].join(' e ')} e clique em “Aplicar alteração” para publicar.
        </Notice>
      ) : null}
      {layer && <LayerEditor key={layer.id} layer={layer} fonts={fonts} disabled={!canEdit} onChange={(patch) => onChange(layer.id, patch)} onRemove={() => onRemove(layer.id)} />}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cx(saveState === 'error' ? 'text-failed' : 'text-slate-500')} data-testid="save-state">{SAVE_TEXT[saveState]}</span>
        {page.unpublished && <Badge tone="queued">Alterações não publicadas</Badge>}
      </div>
      <Button variant="primary" className="w-full" disabled={busy || !canEdit} onClick={onApply}>
        {busy ? <Spinner /> : 'Aplicar alteração'}
      </Button>
    </div>
  )
}

function LayerEditor({ layer, fonts, disabled, onChange, onRemove }: { layer: TextLayer; fonts: FontRow[]; disabled: boolean; onChange: (patch: Partial<TextLayer>) => void; onRemove: () => void }) {
  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
      <Field label="Texto">
        <textarea className={`${inputClass} h-20`} value={layer.text} onChange={(e) => onChange({ text: e.target.value })} disabled={disabled} />
      </Field>
      <div className="space-y-1">
        <label htmlFor={`font-${layer.id}`} className="text-sm font-medium">Fonte</label>
        <FontPicker id={`font-${layer.id}`} fonts={fonts} value={layer.fontId} onChange={(fontId) => onChange({ fontId })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Tamanho"><input type="number" min={6} max={300} className={inputClass} value={layer.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) || layer.fontSize })} disabled={disabled} /></Field>
        <Field label="Cor"><input type="color" className="h-9 w-full rounded-md border border-slate-300 dark:border-slate-700" value={layer.color} onChange={(e) => onChange({ color: e.target.value })} disabled={disabled} /></Field>
        <Field label="Entrelinha"><input type="number" step={0.05} min={0.6} max={3} className={inputClass} value={layer.lineHeight} onChange={(e) => onChange({ lineHeight: Number(e.target.value) || layer.lineHeight })} disabled={disabled} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Contorno">
          <span className="flex gap-1.5">
            <input type="color" className="h-9 w-12 rounded-md border border-slate-300 dark:border-slate-700" value={layer.strokeColor ?? '#ffffff'} onChange={(e) => onChange({ strokeColor: e.target.value })} disabled={disabled} />
            <input type="number" min={0} max={20} className={inputClass} value={layer.strokeWidth} onChange={(e) => onChange({ strokeWidth: Number(e.target.value), strokeColor: layer.strokeColor ?? '#ffffff' })} disabled={disabled} aria-label="Espessura do contorno" />
          </span>
        </Field>
        <Field label="Alinhamento">
          <select className={inputClass} value={layer.align} onChange={(e) => onChange({ align: e.target.value as TextLayer['align'] })} disabled={disabled}>
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex gap-1" role="radiogroup" aria-label="Formato da caixa">
          {(['rect', 'square'] as const).map((s) => (
            <Button key={s} size="sm" role="radio" aria-checked={layer.boxShape === s} variant={layer.boxShape === s ? 'primary' : 'ghost'} disabled={disabled} onClick={() => onChange({ boxShape: s, region: s === 'square' ? { ...layer.region, h: layer.region.w } : layer.region })}>
              {s === 'rect' ? 'Retângulo' : 'Quadrado'}
            </Button>
          ))}
        </span>
      </div>
      <div className="space-y-1">
        <label htmlFor={`rot-${layer.id}`} className="text-sm font-medium">Rotação</label>
        <span className="flex flex-wrap items-center gap-1.5">
          <input
            id={`rot-${layer.id}`}
            type="number"
            min={-180}
            max={180}
            step={1}
            className={`${inputClass} w-24`}
            value={layer.region.rotation ?? 0}
            onChange={(e) => onChange({ region: { ...layer.region, rotation: normalizeAngle(Number(e.target.value) || 0) } })}
            disabled={disabled}
          />
          <span className="text-sm text-slate-500">°</span>
          {[0, 90, -90, 180].map((deg) => (
            <Button key={deg} size="sm" variant={(layer.region.rotation ?? 0) === deg ? 'secondary' : 'ghost'} disabled={disabled} onClick={() => onChange({ region: { ...layer.region, rotation: deg } })}>
              {deg}°
            </Button>
          ))}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {Math.round(layer.region.w)}×{Math.round(layer.region.h)} px · arraste a caixa para mover, os quadradinhos dos cantos e lados para mudar o tamanho e a bolinha de cima para girar (Shift gira de 15 em 15°).
      </p>
      <Button size="sm" variant="ghost" className="text-failed!" disabled={disabled} onClick={onRemove}>Remover caixa</Button>
    </div>
  )
}
