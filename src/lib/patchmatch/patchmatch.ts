export interface PatchMatchOptions {
  patch?: number
  maxLevels?: number
  seed?: number
}

interface Level {
  w: number
  h: number
  img: Float32Array
  hole: Uint8Array
}

interface Field {
  w: number
  nx: Int32Array
  ny: Int32Array
}

const MIN_SOURCES = 24

function rng(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function fromRgba(rgba: Uint8ClampedArray, w: number, h: number, hole: Uint8Array): Level {
  const img = new Float32Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    img[i * 3] = rgba[i * 4]
    img[i * 3 + 1] = rgba[i * 4 + 1]
    img[i * 3 + 2] = rgba[i * 4 + 2]
  }
  return { w, h, img, hole: hole.slice() }
}

function downsample(l: Level): Level {
  const w = Math.max(1, l.w >> 1)
  const h = Math.max(1, l.h >> 1)
  const img = new Float32Array(w * h * 3)
  const hole = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0
      let r = 0
      let g = 0
      let b = 0
      let any = 0
      for (let dy = 0; dy < 2; dy++) {
        const sy = y * 2 + dy
        if (sy >= l.h) continue
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx
          if (sx >= l.w) continue
          const i = sy * l.w + sx
          if (l.hole[i]) {
            any = 1
            continue
          }
          r += l.img[i * 3]
          g += l.img[i * 3 + 1]
          b += l.img[i * 3 + 2]
          n++
        }
      }
      const o = y * w + x
      hole[o] = any
      if (n) {
        img[o * 3] = r / n
        img[o * 3 + 1] = g / n
        img[o * 3 + 2] = b / n
      }
    }
  }
  return { w, h, img, hole }
}

function integral(l: Level): Int32Array {
  const W = l.w + 1
  const sum = new Int32Array(W * (l.h + 1))
  for (let y = 0; y < l.h; y++) {
    let row = 0
    for (let x = 0; x < l.w; x++) {
      row += l.hole[y * l.w + x]
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row
    }
  }
  return sum
}

function boxSum(sum: Int32Array, W: number, x0: number, y0: number, x1: number, y1: number) {
  return sum[(y1 + 1) * W + x1 + 1] - sum[y0 * W + x1 + 1] - sum[(y1 + 1) * W + x0] + sum[y0 * W + x0]
}

function analyse(l: Level, r: number) {
  const sum = integral(l)
  const W = l.w + 1
  const valid = new Uint8Array(l.w * l.h)
  const isTarget = new Uint8Array(l.w * l.h)
  const validList: number[] = []
  const targets: number[] = []
  for (let y = 0; y < l.h; y++) {
    for (let x = 0; x < l.w; x++) {
      const i = y * l.w + x
      if (x >= r && y >= r && x < l.w - r && y < l.h - r && boxSum(sum, W, x - r, y - r, x + r, y + r) === 0) {
        valid[i] = 1
        validList.push(i)
      }
      if (boxSum(sum, W, Math.max(0, x - r), Math.max(0, y - r), Math.min(l.w - 1, x + r), Math.min(l.h - 1, y + r)) > 0) {
        isTarget[i] = 1
        targets.push(i)
      }
    }
  }
  return { valid, validList: Int32Array.from(validList), isTarget, targets: Int32Array.from(targets) }
}

function countValid(l: Level, r: number) {
  const sum = integral(l)
  const W = l.w + 1
  let n = 0
  for (let y = r; y < l.h - r; y++) for (let x = r; x < l.w - r; x++) if (boxSum(sum, W, x - r, y - r, x + r, y + r) === 0) n++
  return n
}

function onionFill(l: Level) {
  const { w, h, img, hole } = l
  const filled = new Uint8Array(w * h)
  let pending: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (hole[i]) pending.push(i)
    else filled[i] = 1
  }
  if (pending.length === w * h) {
    img.fill(128)
    return
  }
  while (pending.length) {
    const ring: [number, number, number, number][] = []
    const rest: number[] = []
    for (const i of pending) {
      const x = i % w
      const y = (i / w) | 0
      let n = 0
      let r = 0
      let g = 0
      let b = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if ((!dx && !dy) || xx < 0 || xx >= w) continue
          const j = yy * w + xx
          if (!filled[j]) continue
          r += img[j * 3]
          g += img[j * 3 + 1]
          b += img[j * 3 + 2]
          n++
        }
      }
      if (n) ring.push([i, r / n, g / n, b / n])
      else rest.push(i)
    }
    if (!ring.length) break
    for (const [i, r, g, b] of ring) {
      img[i * 3] = r
      img[i * 3 + 1] = g
      img[i * 3 + 2] = b
      filled[i] = 1
    }
    pending = rest
  }
}

function upsampleInto(coarse: Level, fine: Level) {
  for (let y = 0; y < fine.h; y++) {
    const cy = Math.min(coarse.h - 1, y >> 1)
    for (let x = 0; x < fine.w; x++) {
      const i = y * fine.w + x
      if (!fine.hole[i]) continue
      const c = cy * coarse.w + Math.min(coarse.w - 1, x >> 1)
      fine.img[i * 3] = coarse.img[c * 3]
      fine.img[i * 3 + 1] = coarse.img[c * 3 + 1]
      fine.img[i * 3 + 2] = coarse.img[c * 3 + 2]
    }
  }
}

export function inpaintPatchMatch(rgba: Uint8ClampedArray, width: number, height: number, holeIn: Uint8Array, options: PatchMatchOptions = {}, onProgress?: (done: number) => void): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba)
  if (!holeIn.some((v) => v)) return out
  const patch = Math.max(3, (options.patch ?? 7) | 1)
  const r = patch >> 1
  const area = patch * patch
  const random = rng(options.seed ?? 1234567)

  const levels: Level[] = [fromRgba(rgba, width, height, holeIn)]
  while (levels.length < (options.maxLevels ?? 7)) {
    const last = levels[levels.length - 1]
    if (Math.min(last.w, last.h) < patch * 4) break
    const next = downsample(last)
    if (countValid(next, r) < MIN_SOURCES) break
    levels.push(next)
  }

  const plan = levels.map((_, li) => Math.min(5, 2 + (levels.length - 1 - li === 0 ? 2 : li)))
  const total = plan.reduce((a, b) => a + b, 0)
  let progress = 0

  onionFill(levels[levels.length - 1])
  let prev: Field | null = null

  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li]
    const { w, h, img } = L
    if (li < levels.length - 1) upsampleInto(levels[li + 1], L)
    const { valid, validList, isTarget, targets } = analyse(L, r)
    if (!validList.length) {
      onionFill(L)
      prev = null
      progress += plan[li]
      onProgress?.(progress / total)
      continue
    }
    const nx = new Int32Array(w * h).fill(-1)
    const ny = new Int32Array(w * h).fill(-1)
    const dd = new Float32Array(w * h)

    const randomSource = (i: number) => {
      const s = validList[(random() * validList.length) | 0]
      nx[i] = s % w
      ny[i] = (s / w) | 0
    }

    for (let k = 0; k < targets.length; k++) {
      const i = targets[k]
      const x = i % w
      const y = (i / w) | 0
      if (prev) {
        const pi = Math.min(prev.nx.length / prev.w - 1, y >> 1) * prev.w + Math.min(prev.w - 1, x >> 1)
        if (prev.nx[pi] >= 0) {
          const cx = Math.min(w - 1, prev.nx[pi] * 2 + (x & 1))
          const cy = Math.min(h - 1, prev.ny[pi] * 2 + (y & 1))
          if (valid[cy * w + cx]) {
            nx[i] = cx
            ny[i] = cy
            continue
          }
        }
      }
      randomSource(i)
    }

    const dist = (tx: number, ty: number, sx: number, sy: number, best: number) => {
      let d = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = ty + dy
        if (yy < 0 || yy >= h) continue
        const trow = yy * w
        const srow = (sy + dy) * w
        for (let dx = -r; dx <= r; dx++) {
          const xx = tx + dx
          if (xx < 0 || xx >= w) continue
          const ti = (trow + xx) * 3
          const si = (srow + sx + dx) * 3
          const a = img[ti] - img[si]
          const b = img[ti + 1] - img[si + 1]
          const c = img[ti + 2] - img[si + 2]
          d += a * a + b * b + c * c
        }
        if (d >= best) return d
      }
      return d
    }

    const refreshDistances = () => {
      for (let k = 0; k < targets.length; k++) {
        const i = targets[k]
        dd[i] = dist(i % w, (i / w) | 0, nx[i], ny[i], Infinity)
      }
    }

    const pass = (forward: boolean) => {
      const n = targets.length
      const step = forward ? -1 : 1
      for (let k = 0; k < n; k++) {
        const i = targets[forward ? k : n - 1 - k]
        const x = i % w
        const y = (i / w) | 0
        let bx = nx[i]
        let by = ny[i]
        let bd = dd[i]
        const xn = x + step
        if (xn >= 0 && xn < w) {
          const j = y * w + xn
          if (isTarget[j]) {
            const cx = nx[j] - step
            const cy = ny[j]
            if (cx >= 0 && cx < w && valid[cy * w + cx] && (cx !== bx || cy !== by)) {
              const d = dist(x, y, cx, cy, bd)
              if (d < bd) {
                bx = cx
                by = cy
                bd = d
              }
            }
          }
        }
        const yn = y + step
        if (yn >= 0 && yn < h) {
          const j = yn * w + x
          if (isTarget[j]) {
            const cx = nx[j]
            const cy = ny[j] - step
            if (cy >= 0 && cy < h && valid[cy * w + cx] && (cx !== bx || cy !== by)) {
              const d = dist(x, y, cx, cy, bd)
              if (d < bd) {
                bx = cx
                by = cy
                bd = d
              }
            }
          }
        }
        for (let rad = Math.max(w, h); rad >= 1; rad >>= 1) {
          const cx = Math.max(r, Math.min(w - 1 - r, bx + Math.round((random() * 2 - 1) * rad)))
          const cy = Math.max(r, Math.min(h - 1 - r, by + Math.round((random() * 2 - 1) * rad)))
          if (!valid[cy * w + cx] || (cx === bx && cy === by)) continue
          const d = dist(x, y, cx, cy, bd)
          if (d < bd) {
            bx = cx
            by = cy
            bd = d
          }
        }
        nx[i] = bx
        ny[i] = by
        dd[i] = bd
      }
    }

    const holes: number[] = []
    for (let i = 0; i < w * h; i++) if (L.hole[i]) holes.push(i)
    const next = new Float32Array(holes.length * 3)

    const vote = () => {
      for (let k = 0; k < holes.length; k++) {
        const p = holes[k]
        const x = p % w
        const y = (p / w) | 0
        let sr = 0
        let sg = 0
        let sb = 0
        let sw = 0
        for (let dy = -r; dy <= r; dy++) {
          const qy = y + dy
          if (qy < 0 || qy >= h) continue
          for (let dx = -r; dx <= r; dx++) {
            const qx = x + dx
            if (qx < 0 || qx >= w) continue
            const q = qy * w + qx
            if (!isTarget[q]) continue
            const si = ((ny[q] - dy) * w + nx[q] - dx) * 3
            const wt = 1 / (1 + dd[q] / (area * 3 * 64))
            sr += img[si] * wt
            sg += img[si + 1] * wt
            sb += img[si + 2] * wt
            sw += wt
          }
        }
        if (sw > 0) {
          next[k * 3] = sr / sw
          next[k * 3 + 1] = sg / sw
          next[k * 3 + 2] = sb / sw
        } else {
          next[k * 3] = img[p * 3]
          next[k * 3 + 1] = img[p * 3 + 1]
          next[k * 3 + 2] = img[p * 3 + 2]
        }
      }
      for (let k = 0; k < holes.length; k++) {
        const p = holes[k]
        img[p * 3] = next[k * 3]
        img[p * 3 + 1] = next[k * 3 + 1]
        img[p * 3 + 2] = next[k * 3 + 2]
      }
    }

    for (let e = 0; e < plan[li]; e++) {
      refreshDistances()
      const iterations = e === 0 ? (prev ? 3 : 5) : 2
      for (let it = 0; it < iterations; it++) pass(it % 2 === 0)
      vote()
      progress++
      onProgress?.(progress / total)
    }
    prev = { w, nx, ny }
  }

  const final = levels[0]
  for (let i = 0; i < width * height; i++) {
    if (!holeIn[i]) continue
    out[i * 4] = final.img[i * 3]
    out[i * 4 + 1] = final.img[i * 3 + 1]
    out[i * 4 + 2] = final.img[i * 3 + 2]
    out[i * 4 + 3] = 255
  }
  return out
}
