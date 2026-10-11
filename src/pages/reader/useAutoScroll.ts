import { useEffect, useRef, type RefObject } from 'react'
import type { AutoSettings } from './readerStore'

const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2
const glideMs = (interval: number) => Math.min(1500, Math.max(400, interval * 600))
const END_GRACE_MS = 1500

export function useAutoScroll(scroller: RefObject<HTMLDivElement | null>, playing: boolean, settings: AutoSettings, onEnd: () => void) {
  const live = useRef(settings)
  const ended = useRef(onEnd)
  useEffect(() => {
    live.current = settings
    ended.current = onEnd
  })

  useEffect(() => {
    const el = scroller.current
    if (!playing || !el) return
    let frame = 0
    let last = performance.now()
    let pos = el.scrollTop
    let set = pos
    let waited = 0
    let glide: { from: number; to: number; t: number } | null = null
    let stuck = 0

    const tick = (now: number) => {
      const dt = Math.min(100, now - last)
      last = now
      if (Math.abs(el.scrollTop - set) > 3) {
        pos = el.scrollTop
        glide = null
        waited = 0
      }
      const { interval, speed } = live.current
      if (interval === 0) {
        pos += (speed * dt) / 1000
      } else if (glide) {
        glide.t = Math.min(1, glide.t + dt / glideMs(interval))
        pos = glide.from + (glide.to - glide.from) * ease(glide.t)
        if (glide.t >= 1) glide = null
      } else {
        waited += dt
        if (waited >= interval * 1000) {
          waited = 0
          glide = { from: pos, to: pos + speed * interval, t: 0 }
        }
      }
      const max = el.scrollHeight - el.clientHeight
      if (pos >= max) {
        pos = max
        stuck += dt
        if (stuck >= END_GRACE_MS) {
          ended.current()
          return
        }
      } else {
        stuck = 0
      }
      el.scrollTop = pos
      set = el.scrollTop
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, scroller])
}
