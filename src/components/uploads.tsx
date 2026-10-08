import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useJobs } from './jobsContext'
import { chapterNumberOf, UPLOAD_DONE_EVENT, UploadsContext, type Upload } from './uploadsContext'

const PARALLEL = 2

function send(u: Upload, file: File, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/library/series/${u.seriesId}/chapters/import?name=${encodeURIComponent(u.fileName)}`)
    xhr.setRequestHeader('content-type', 'application/zip')
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      if (xhr.status === 401) window.dispatchEvent(new Event('mt:unauthorized'))
      let message = `Erro ${xhr.status}`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string | string[] }
        if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message
      } catch {
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Falha de conexão no envio.'))
    xhr.send(file)
  })
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const { toast } = useJobs()
  const [uploads, setUploads] = useState<Upload[]>([])
  const queue = useRef<Upload[]>([])
  const files = useRef(new Map<string, File>())
  const active = useRef(0)
  const pump = useRef<() => void>(() => undefined)
  const toastRef = useRef(toast)

  useEffect(() => {
    const publish = () => setUploads(queue.current.map((u) => ({ ...u })))
    const update = (id: string, patch: Partial<Upload>) => {
      queue.current = queue.current.map((u) => (u.id === id ? { ...u, ...patch } : u))
      publish()
    }
    toastRef.current = toast
    pump.current = () => {
      for (const u of queue.current) {
        if (active.current >= PARALLEL) break
        const file = files.current.get(u.id)
        if (u.status !== 'waiting' || !file) continue
        active.current++
        u.status = 'uploading'
        send(u, file, (loaded) => update(u.id, { loaded }))
          .then(() => {
            queue.current = queue.current.filter((x) => x.id !== u.id)
            publish()
            window.dispatchEvent(new CustomEvent(UPLOAD_DONE_EVENT, { detail: { seriesId: u.seriesId } }))
          })
          .catch((err: Error) => {
            update(u.id, { status: 'failed', error: err.message })
            toastRef.current('failed', `${u.fileName}: ${err.message}`)
          })
          .finally(() => {
            files.current.delete(u.id)
            active.current--
            pump.current()
          })
      }
      publish()
    }
  })

  const add = useCallback(
    (seriesId: string, picked: File[]) => {
      const fresh: Upload[] = []
      for (const file of picked) {
        const number = chapterNumberOf(file.name)
        if (!/\.zip$/i.test(file.name) || number === null) {
          toast('failed', `${file.name}: envie um .zip com o número do capítulo no nome (ex.: 12.zip).`)
          continue
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        files.current.set(id, file)
        fresh.push({ id, seriesId, fileName: file.name, number, loaded: 0, total: file.size, status: 'waiting' })
      }
      fresh.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      queue.current = [...queue.current, ...fresh]
      pump.current()
    },
    [toast],
  )

  const dismiss = useCallback((id: string) => {
    files.current.delete(id)
    queue.current = queue.current.filter((u) => u.id !== id || u.status === 'uploading')
    setUploads(queue.current.map((u) => ({ ...u })))
  }, [])

  const sending = uploads.some((u) => u.status !== 'failed')
  useEffect(() => {
    if (!sending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [sending])

  return <UploadsContext.Provider value={{ uploads, add, dismiss }}>{children}</UploadsContext.Provider>
}
