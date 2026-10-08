import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api'
import { reviewApi, type Rect, type ReviewPage, type TextLayer } from '../../reviewApi'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const SAVE_DELAY_MS = 800
const RETRY_MS = 3000
const UNDO_LIMIT = 50
const UNDO_GROUP_MS = 1000
const LOCK_RENEW_MS = 45_000

const payloadOf = (l: TextLayer) => ({
  region: l.region,
  boxShape: l.boxShape,
  text: l.text,
  fontId: l.fontId,
  fontSize: l.fontSize,
  color: l.color,
  strokeColor: l.strokeColor,
  strokeWidth: l.strokeWidth,
  align: l.align,
  lineHeight: l.lineHeight,
})

export function useLayerDraft(page: ReviewPage | null, reload: () => Promise<void>, onError: (message: string) => void) {
  const [layers, setLayers] = useState<TextLayer[]>(page?.layers ?? [])
  const [state, setState] = useState<SaveState>('idle')
  const current = useRef(layers)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const inFlight = useRef(new Set<Promise<void>>())
  const history = useRef<TextLayer[][]>([])
  const lastChange = useRef({ id: '', at: 0 })
  const [canUndo, setCanUndo] = useState(false)
  const [linked, setLinked] = useState<Record<string, number[]>>({})
  const retry = useRef<(id: string) => void>(() => undefined)

  useEffect(() => {
    if (page && !timers.current.size && !inFlight.current.size) {
      current.current = page.layers
      setLayers(page.layers)
    }
  }, [page])

  const saveNow = useCallback(
    (id: string) => {
      timers.current.delete(id)
      const layer = current.current.find((l) => l.id === id)
      if (!layer) return Promise.resolve()
      setState('saving')
      const job = reviewApi
        .updateLayer(id, payloadOf(layer))
        .then(
          (r) => {
            if (!timers.current.size) setState('saved')
            const positions = (r.twins ?? []).map((t) => t.position)
            if (positions.length) setLinked((prev) => ({ ...prev, [id]: positions }))
          },
          (err: Error) => {
            setState('error')
            if (err instanceof ApiError && err.status >= 400 && err.status < 500) onError(err.message)
            else if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => retry.current(id), RETRY_MS))
          },
        )
        .finally(() => {
          inFlight.current.delete(job)
          if (!timers.current.size && !inFlight.current.size) void reload()
        })
      inFlight.current.add(job)
      return job
    },
    [onError, reload],
  )

  useEffect(() => {
    retry.current = (id) => void saveNow(id)
  }, [saveNow])

  const schedule = useCallback(
    (id: string) => {
      clearTimeout(timers.current.get(id))
      timers.current.set(id, setTimeout(() => void saveNow(id), SAVE_DELAY_MS))
      setState('saving')
    },
    [saveNow],
  )

  const update = useCallback(
    (id: string, patch: Partial<TextLayer>) => {
      const now = Date.now()
      if (lastChange.current.id !== id || now - lastChange.current.at > UNDO_GROUP_MS) {
        history.current = [...history.current.slice(-(UNDO_LIMIT - 1)), current.current]
        setCanUndo(true)
      }
      lastChange.current = { id, at: now }
      current.current = current.current.map((l) => (l.id === id ? { ...l, ...patch, region: { ...l.region, ...(patch.region ?? {}) } } : l))
      setLayers(current.current)
      schedule(id)
    },
    [schedule],
  )

  const undo = useCallback(() => {
    const previous = history.current.at(-1)
    if (!previous) return
    history.current = history.current.slice(0, -1)
    setCanUndo(history.current.length > 0)
    lastChange.current = { id: '', at: 0 }
    const changed = previous.filter((p) => {
      const now = current.current.find((l) => l.id === p.id)
      return now && JSON.stringify(now) !== JSON.stringify(p)
    })
    const ids = new Set(current.current.map((l) => l.id))
    current.current = previous.filter((p) => ids.has(p.id))
    setLayers(current.current)
    for (const l of changed) schedule(l.id)
  }, [schedule])

  const flush = useCallback(async () => {
    const ids = [...timers.current.keys()]
    for (const id of ids) clearTimeout(timers.current.get(id))
    await Promise.all([...ids.map((id) => saveNow(id)), ...inFlight.current])
  }, [saveNow])

  const add = useCallback(
    async (pageId: string, region: Rect, square: boolean) => {
      await flush()
      const created = await reviewApi.addLayer(pageId, { region: square ? { ...region, h: region.w } : region, boxShape: square ? 'square' : 'rect', text: 'Texto', fontSize: 28, color: '#161616', align: 'center', lineHeight: 1.12 })
      await reload()
      return created.id
    },
    [flush, reload],
  )

  const remove = useCallback(
    async (id: string) => {
      clearTimeout(timers.current.get(id))
      timers.current.delete(id)
      await reviewApi.removeLayer(id)
      await reload()
    },
    [reload],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const id of [...pending.keys()]) {
        clearTimeout(pending.get(id))
        const layer = current.current.find((l) => l.id === id)
        if (layer) void reviewApi.updateLayer(id, payloadOf(layer))
      }
    }
  }, [])

  return { layers, state, update, undo, canUndo, flush, add, remove, linked, dirty: state === 'saving' }
}

export function useEditLock(pageId: string, active: boolean) {
  const [holder, setHolder] = useState<string | null>(null)
  const [mine, setMine] = useState(false)

  useEffect(() => {
    if (!active) return
    let stopped = false
    const take = () =>
      reviewApi.takeEditLock(pageId).then(
        () => {
          if (stopped) return
          setMine(true)
          setHolder(null)
        },
        (err: unknown) => {
          if (stopped) return
          setMine(false)
          setHolder(err instanceof ApiError && err.status === 409 ? err.message : null)
        },
      )
    void take()
    const timer = setInterval(() => void take(), LOCK_RENEW_MS)
    const release = () => void reviewApi.releaseEditLock(pageId).catch(() => undefined)
    window.addEventListener('beforeunload', release)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('beforeunload', release)
      setMine(false)
      release()
    }
  }, [pageId, active])

  return { mine, holder }
}
