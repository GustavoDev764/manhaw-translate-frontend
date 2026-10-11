
export interface Layer {
  id: string
  name: string
  canvas: HTMLCanvasElement
  x: number
  y: number
  visible: boolean
  opacity: number
}

export type LayerSnap = Omit<Layer, 'canvas'> & { data: ImageData }

export const FUNDO = 'fundo'

let counter = 0
export const newLayerId = () => `layer-${Date.now().toString(36)}-${(counter++).toString(36)}`

export const ctx2d = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!

export function blankCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function snapLayer(l: Layer): LayerSnap {
  const { canvas, ...meta } = l
  return { ...meta, data: ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height) }
}

export function layerFromSnap(s: LayerSnap): Layer {
  const { data, ...meta } = s
  const canvas = blankCanvas(data.width, data.height)
  ctx2d(canvas).putImageData(data, 0, 0)
  return { ...meta, canvas }
}

export function flatten(base: HTMLCanvasElement, baseVisible: boolean, layers: Layer[]): HTMLCanvasElement {
  const out = blankCanvas(base.width, base.height)
  const ctx = ctx2d(out)
  if (baseVisible) ctx.drawImage(base, 0, 0)
  for (const l of layers) {
    if (!l.visible) continue
    ctx.globalAlpha = l.opacity
    ctx.drawImage(l.canvas, l.x, l.y)
  }
  ctx.globalAlpha = 1
  return out
}

export function mountCanvas(el: HTMLDivElement | null, canvas: HTMLCanvasElement) {
  if (!el || el.firstChild === canvas) return
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  el.replaceChildren(canvas)
}

