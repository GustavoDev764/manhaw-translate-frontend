import type { CV } from './opencv'

type Mat = InstanceType<CV['Mat']>

export type Method = 'auto' | 'patchmatch' | 'telea' | 'ns' | 'fill'

type ResolvedMethod = Exclude<Method, 'auto' | 'patchmatch'>

export const METHOD_LABEL: Record<Method, string> = {
  auto: 'Automático',
  patchmatch: 'PatchMatch (inteligente)',
  telea: 'Telea',
  ns: 'Navier-Stokes',
  fill: 'Cor da borda',
}

const FLAT_RING_STDDEV = 2

export interface RemoveOptions {
  method: Method
  radius: number
  dilate: number
}

export interface WandOptions {
  threshold: number
  closeSize: number
  dilate: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export const MASK_COLOR: [number, number, number] = [255, 0, 80]

function ctx2d(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d', { willReadFrequently: true })!
}

function ellipse(cv: CV, radius: number): Mat {
  const size = radius * 2 + 1
  return cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(size, size))
}

function dilateInPlace(cv: CV, mat: Mat, radius: number) {
  if (radius <= 0) return
  const kernel = ellipse(cv, radius)
  cv.dilate(mat, mat, kernel)
  kernel.delete()
}

function nonZeroBox(mat: Mat): Box | null {
  const { rows, cols } = mat
  const data = mat.data as Uint8Array
  let minX = cols
  let minY = rows
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < rows; y++) {
    const row = y * cols
    for (let x = 0; x < cols; x++) {
      if (data[row + x] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function padBox(box: Box, pad: number, cols: number, rows: number): Box {
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  return {
    x,
    y,
    width: Math.min(cols, box.x + box.width + pad) - x,
    height: Math.min(rows, box.y + box.height + pad) - y,
  }
}

function readMask(cv: CV, maskCanvas: HTMLCanvasElement): Mat {
  const rgba = cv.imread(maskCanvas)
  const channels = new cv.MatVector()
  cv.split(rgba, channels)
  const alpha = channels.get(3)
  const mask = new cv.Mat()
  cv.threshold(alpha, mask, 0, 255, cv.THRESH_BINARY)
  alpha.delete()
  channels.delete()
  rgba.delete()
  return mask
}

function writeMask(maskCanvas: HTMLCanvasElement, box: Box, data: Uint8Array, stride: number, offsetX = 0, offsetY = 0) {
  const ctx = ctx2d(maskCanvas)
  const region = ctx.getImageData(box.x, box.y, box.width, box.height)
  let pixels = 0
  for (let row = 0; row < box.height; row++) {
    const srcRow = (offsetY + row) * stride + offsetX
    for (let col = 0; col < box.width; col++) {
      if (data[srcRow + col] === 0) continue
      const i = (row * box.width + col) * 4
      region.data[i] = MASK_COLOR[0]
      region.data[i + 1] = MASK_COLOR[1]
      region.data[i + 2] = MASK_COLOR[2]
      region.data[i + 3] = 255
      pixels++
    }
  }
  ctx.putImageData(region, box.x, box.y)
  return pixels
}

function grayOf(cv: CV, imageCanvas: HTMLCanvasElement): Mat {
  const src = cv.imread(imageCanvas)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
  src.delete()
  return gray
}

function balloonLetters(cv: CV, interior: Mat, closeSize: number, dilate: number) {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const scratch = interior.clone()
  cv.findContours(scratch, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
  const filled = cv.Mat.zeros(interior.rows, interior.cols, cv.CV_8UC1)
  cv.drawContours(filled, contours, -1, new cv.Scalar(255), cv.FILLED)
  contours.delete()
  hierarchy.delete()
  scratch.delete()

  if (closeSize > 0) {
    const closed = new cv.Mat()
    const kernel = ellipse(cv, closeSize)
    cv.morphologyEx(interior, closed, cv.MORPH_CLOSE, kernel)
    cv.bitwise_or(filled, closed, filled)
    closed.delete()
    kernel.delete()
  }

  const letters = new cv.Mat()
  cv.subtract(filled, interior, letters)
  if (dilate > 0) {
    dilateInPlace(cv, letters, dilate)
    cv.bitwise_and(letters, filled, letters)
  }
  return { letters, filled }
}

function removeInRect(cv: CV, imageCanvas: HTMLCanvasElement, mask: Mat, box: Box, method: Method, radius: number) {
  const ctx = ctx2d(imageCanvas)
  const rgba = cv.matFromImageData(ctx.getImageData(box.x, box.y, box.width, box.height))
  const rgb = new cv.Mat()
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB)

  const ring = new cv.Mat()
  const kernel = ellipse(cv, 2)
  cv.dilate(mask, ring, kernel)
  cv.subtract(ring, mask, ring)
  kernel.delete()

  let used: ResolvedMethod = method === 'auto' || method === 'patchmatch' ? 'telea' : method
  if (method === 'auto') {
    const mean = new cv.Mat()
    const stddev = new cv.Mat()
    cv.meanStdDev(rgb, mean, stddev, ring)
    const spread = Math.max(...Array.from(stddev.data64F as Float64Array))
    if (spread < FLAT_RING_STDDEV) used = 'fill'
    mean.delete()
    stddev.delete()
  }

  if (used === 'fill') {
    const mean = cv.mean(rgb, ring)
    rgb.setTo(new cv.Scalar(mean[0], mean[1], mean[2]), mask)
  } else {
    const out = new cv.Mat()
    cv.inpaint(rgb, mask, out, radius, used === 'telea' ? cv.INPAINT_TELEA : cv.INPAINT_NS)
    out.copyTo(rgb)
    out.delete()
  }
  ring.delete()

  const outRgba = new cv.Mat()
  cv.cvtColor(rgb, outRgba, cv.COLOR_RGB2RGBA)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(outRgba.data), box.width, box.height), box.x, box.y)
  const pixels = cv.countNonZero(mask)
  ;[outRgba, rgb, rgba].forEach((m) => m.delete())
  return { pixels, used }
}

export function maskPixelCount(cv: CV, maskCanvas: HTMLCanvasElement): number {
  const mask = readMask(cv, maskCanvas)
  const count = cv.countNonZero(mask)
  mask.delete()
  return count
}

export interface RemoveResult {
  ms: number
  pixels: number
  box: Box
}

export function applyRemoval(
  cv: CV,
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  options: RemoveOptions,
): RemoveResult | null {
  const started = performance.now()
  const mask = readMask(cv, maskCanvas)
  dilateInPlace(cv, mask, options.dilate)
  const found = nonZeroBox(mask)
  if (!found) {
    mask.delete()
    return null
  }
  const box = padBox(found, Math.max(16, options.radius * 4), mask.cols, mask.rows)
  const roi = mask.roi(new cv.Rect(box.x, box.y, box.width, box.height))
  const { pixels } = removeInRect(cv, imageCanvas, roi, box, options.method, options.radius)
  roi.delete()
  mask.delete()
  return { ms: performance.now() - started, pixels, box }
}

export function readMaskRegion(cv: CV, maskCanvas: HTMLCanvasElement, dilate: number, margin: (box: Box) => number): { box: Box; hole: Uint8Array; pixels: number } | null {
  const mask = readMask(cv, maskCanvas)
  dilateInPlace(cv, mask, dilate)
  const found = nonZeroBox(mask)
  if (!found) {
    mask.delete()
    return null
  }
  const box = padBox(found, margin(found), mask.cols, mask.rows)
  const data = mask.data as Uint8Array
  const hole = new Uint8Array(box.width * box.height)
  let pixels = 0
  for (let row = 0; row < box.height; row++) {
    const src = (box.y + row) * mask.cols + box.x
    for (let col = 0; col < box.width; col++) {
      if (!data[src + col]) continue
      hole[row * box.width + col] = 1
      pixels++
    }
  }
  mask.delete()
  return { box, hole, pixels }
}

export interface WandResult {
  ms: number
  pixels: number
}

export class WandError extends Error {}

export function magicWand(
  cv: CV,
  imageCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  options: WandOptions,
): WandResult {
  const started = performance.now()
  const gray = grayOf(cv, imageCanvas)
  const cleanup: Mat[] = [gray]
  const done = () => cleanup.forEach((m) => m.delete())

  if ((gray.ucharPtr(y, x)[0] ?? 0) <= options.threshold) {
    done()
    throw new WandError('Clique na parte clara do balão, não em cima da letra ou da borda.')
  }

  const bin = new cv.Mat()
  cleanup.push(bin)
  cv.threshold(gray, bin, options.threshold, 255, cv.THRESH_BINARY)

  const flood = cv.Mat.zeros(bin.rows + 2, bin.cols + 2, cv.CV_8UC1)
  cleanup.push(flood)
  cv.floodFill(
    bin,
    flood,
    new cv.Point(x, y),
    new cv.Scalar(255),
    new cv.Rect(),
    new cv.Scalar(0),
    new cv.Scalar(0),
    4 | cv.FLOODFILL_MASK_ONLY | (255 << 8),
  )
  const interiorView = flood.roi(new cv.Rect(1, 1, bin.cols, bin.rows))
  const interior = interiorView.clone()
  interiorView.delete()
  cleanup.push(interior)

  if (cv.countNonZero(interior) > interior.rows * interior.cols * 0.4) {
    done()
    throw new WandError(
      'A seleção vazou para fora do balão. Aumente o limiar ou verifique se o contorno do balão está fechado.',
    )
  }

  const { letters, filled } = balloonLetters(cv, interior, options.closeSize, options.dilate)
  cleanup.push(letters, filled)

  const box = nonZeroBox(letters)
  if (!box) {
    done()
    throw new WandError('Nenhum texto encontrado dentro desse balão.')
  }

  const pixels = writeMask(maskCanvas, box, letters.data as Uint8Array, letters.cols, box.x, box.y)
  done()
  return { ms: performance.now() - started, pixels }
}
