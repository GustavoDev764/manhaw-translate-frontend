import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../api'
import { authApi, type FeatureKey, type Me } from '../adminApi'
import { navigate } from '../lib/hooks'
import { AuthCtx } from './authCtx'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMe(await authApi.me())
      setOffline(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null)
      else setOffline(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0)
    const onUnauthorized = () => setMe(null)
    window.addEventListener('mt:unauthorized', onUnauthorized)
    return () => {
      clearTimeout(first)
      window.removeEventListener('mt:unauthorized', onUnauthorized)
    }
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setMe(null)
      navigate('/')
    }
  }, [])

  const can = useCallback((key: FeatureKey) => !!me?.features[key], [me])

  return <AuthCtx.Provider value={{ me, loading, offline, refresh, logout, can }}>{children}</AuthCtx.Provider>
}
