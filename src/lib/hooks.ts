import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[],
): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const reload = useCallback(async () => {
    try {
      setData(await fetcherRef.current())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(reload, 0)
    const timer = intervalMs
      ? setInterval(() => {
          if (!document.hidden) void reload()
        }, intervalMs)
      : undefined
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, reload }
}

export function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const NAVIGATE = 'app:navigate'

function fromLegacyHash() {
  if (window.location.hash.startsWith('#/')) window.history.replaceState(null, '', `/${window.location.hash.slice(2).replace(/^\/+/, '')}`)
}

export function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState(null, '', to)
  else {
    window.history.pushState(null, '', to)
    window.scrollTo(0, 0)
  }
  window.dispatchEvent(new Event(NAVIGATE))
}

function onLinkClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = (e.target as Element | null)?.closest?.('a')
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
  const url = new URL(a.href, window.location.href)
  if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return
  e.preventDefault()
  navigate(`${url.pathname}${url.search}${url.hash}`)
  fromLegacyHash()
}

export function useRoute(): string[] {
  const read = () => {
    fromLegacyHash()
    return window.location.pathname
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('popstate', onChange)
    window.addEventListener('hashchange', onChange)
    window.addEventListener(NAVIGATE, onChange)
    document.addEventListener('click', onLinkClick)
    return () => {
      window.removeEventListener('popstate', onChange)
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener(NAVIGATE, onChange)
      document.removeEventListener('click', onLinkClick)
    }
  }, [])
  return route
}

export const href = (...parts: string[]) => `/${parts.map(encodeURIComponent).join('/')}`

export function useDebounced<T>(value: T, ms = 300): T {
  const [current, setCurrent] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setCurrent(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return current
}
