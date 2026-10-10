import { createContext, useContext } from 'react'

export interface Upload {
  id: string
  seriesId: string
  fileName: string
  number: number | null
  loaded: number
  total: number
  status: 'waiting' | 'uploading' | 'failed'
  error?: string
  overwrite?: boolean
}

export interface ExistingChapter {
  number: number
  pages: number
  translated: number
  rendered: number
}

export interface UploadsState {
  uploads: Upload[]
  add: (seriesId: string, files: File[], existing?: ExistingChapter[]) => void
  dismiss: (id: string) => void
}

export const UploadsContext = createContext<UploadsState>({ uploads: [], add: () => {}, dismiss: () => {} })
export const useUploads = () => useContext(UploadsContext)

export const UPLOAD_DONE_EVENT = 'mt:upload-done'

export function chapterNumberOf(fileName: string): number | null {
  const all = fileName.replace(/\.zip$/i, '').match(/\d+(?:[.,]\d+)?/g)
  if (!all) return null
  const n = Number(all[all.length - 1].replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : null
}
