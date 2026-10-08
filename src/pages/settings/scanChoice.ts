import { useEffect, useState } from 'react'
import { adminApi, type ScanRow } from '../../adminApi'
import { useAuth } from '../../auth/authCtx'

export type ScanChoice = ReturnType<typeof useScanChoice>

export function useScanChoice(): { scanId: string | undefined; scans: ScanRow[]; setScanId: (id: string) => void; needsChoice: boolean } {
  const { me } = useAuth()
  const sys = me?.role === 'system_admin'
  const [scans, setScans] = useState<ScanRow[]>([])
  const [scanId, setScanIdState] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('mt:scan') ?? undefined
    } catch {
      return undefined
    }
  })
  useEffect(() => {
    if (!sys) return
    adminApi.scans().then((list) => {
      setScans(list)
      setScanIdState((cur) => (cur && list.some((s) => s.id === cur) ? cur : list[0]?.id))
    }, () => undefined)
  }, [sys])
  const setScanId = (id: string) => {
    setScanIdState(id)
    try {
      localStorage.setItem('mt:scan', id)
    } catch {
    }
  }
  return { scanId: sys ? scanId : me?.scan?.id, scans, setScanId, needsChoice: sys }
}

