export interface Box {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface Handle {
  ax: -1 | 0 | 1
  ay: -1 | 0 | 1
}

export const HANDLES: Handle[] = [
  { ax: -1, ay: -1 },
  { ax: 0, ay: -1 },
  { ax: 1, ay: -1 },
  { ax: 1, ay: 0 },
  { ax: 1, ay: 1 },
  { ax: 0, ay: 1 },
  { ax: -1, ay: 1 },
  { ax: -1, ay: 0 },
]

const SNAP_DEGREES = 5
const STEP_DEGREES = 15
const rad = (deg: number) => (deg * Math.PI) / 180

export function normalizeAngle(deg: number): number {
  const a = ((Math.round(deg) % 360) + 360) % 360
  return a > 180 ? a - 360 : a
}

export function visualSize(b: Box): { width: number; height: number } {
  const c = Math.abs(Math.cos(rad(b.rotation)))
  const s = Math.abs(Math.sin(rad(b.rotation)))
  return { width: b.w * c + b.h * s, height: b.w * s + b.h * c }
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

const keepInside = (center: number, half: number, from: number, to: number) => (half * 2 >= to - from ? (from + to) / 2 : Math.min(to - half, Math.max(from + half, center)))

export function moveBox(b: Box, dx: number, dy: number, bounds: Bounds): Box {
  const v = visualSize(b)
  const cx = keepInside(b.x + b.w / 2 + dx, v.width / 2, bounds.left, bounds.right)
  const cy = keepInside(b.y + b.h / 2 + dy, v.height / 2, bounds.top, bounds.bottom)
  return { ...b, x: cx - b.w / 2, y: cy - b.h / 2 }
}

export function resizeBox(b: Box, handle: Handle, dx: number, dy: number, opts: { square: boolean; min: number }): Box {
  const c = Math.cos(rad(b.rotation))
  const s = Math.sin(rad(b.rotation))
  const lx = dx * c + dy * s
  const ly = -dx * s + dy * c
  let w = Math.max(opts.min, b.w + handle.ax * lx)
  let h = Math.max(opts.min, b.h + handle.ay * ly)
  if (opts.square) {
    const side = handle.ax && handle.ay ? Math.max(w, h) : handle.ax ? w : h
    w = side
    h = side
  }
  const shiftX = (handle.ax * (w - b.w)) / 2
  const shiftY = (handle.ay * (h - b.h)) / 2
  const cx = b.x + b.w / 2 + shiftX * c - shiftY * s
  const cy = b.y + b.h / 2 + shiftX * s + shiftY * c
  return { ...b, w, h, x: cx - w / 2, y: cy - h / 2 }
}

export function rotationTo(b: Box, point: { x: number; y: number }, freeSteps: boolean): number {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const raw = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90
  if (freeSteps) return normalizeAngle(Math.round(raw / STEP_DEGREES) * STEP_DEGREES)
  const right = Math.round(raw / 90) * 90
  return normalizeAngle(Math.abs(raw - right) <= SNAP_DEGREES ? right : raw)
}

export function handleCursor(handle: Handle, rotation: number): string {
  const angle = (Math.atan2(handle.ay, handle.ax) * 180) / Math.PI + rotation
  const a = ((Math.round(angle / 45) % 4) + 4) % 4
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][a]
}

export const roundBox = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), rotation: normalizeAngle(b.rotation) })
