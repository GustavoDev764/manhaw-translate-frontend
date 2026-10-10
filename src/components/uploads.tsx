import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { num } from '../lib/format'
import { useJobs } from './jobsContext'
import { Button, Dialog } from './ui'
import { chapterNumberOf, UPLOAD_DONE_EVENT, UploadsContext, type ExistingChapter, type Upload } from './uploadsContext'

const PARALLEL = 2

interface Conflict {
  drafts: Upload[]
  existing: Map<number, ExistingChapter>
  numbers: number[]
  index: number
  overwrite: Set<number>
}

function send(u: Upload, file: File, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/library/series/${u.seriesId}/chapters/import?name=${encodeURIComponent(u.fileName)}${u.overwrite ? '&overwrite=1' : ''}`)
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

function ConflictDialog({ conflict, onDecide, onCancel }: { conflict: Conflict; onDecide: (overwrite: boolean, rest: boolean) => void; onCancel: () => void }) {
  const [rest, setRest] = useState(false)
  const number = conflict.numbers[conflict.index]
  const info = conflict.existing.get(number)
  const remaining = conflict.numbers.slice(conflict.index + 1)
  const file = conflict.drafts.find((d) => d.number === number)?.fileName ?? `${number}.zip`
  const decide = (overwrite: boolean) => {
    onDecide(overwrite, rest)
    setRest(false)
  }
  return (
    <Dialog
      open
      onClose={onCancel}
      title={`Substituir capítulo ${number}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar envio
          </Button>
          <Button onClick={() => decide(false)}>Pular</Button>
          <Button variant="danger" onClick={() => decide(true)} data-testid="overwrite-chapter">
            Apagar e substituir
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm" data-testid="chapter-conflict">
        {conflict.numbers.length > 1 && <p className="text-xs text-slate-500">Conflito {conflict.index + 1} de {conflict.numbers.length}</p>}
        <p>
          O capítulo {number} já existe
          {info ? ` (${num(info.pages)} páginas, ${num(info.translated)} traduzidas, ${num(info.rendered)} publicadas)` : ''}. Tudo dele será apagado — imagens, escaneamento, textos, versões e comentários — e substituído pelo conteúdo de <b>{file}</b>.
        </p>
        {remaining.length > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 accent-brand" checked={rest} onChange={(e) => setRest(e.target.checked)} data-testid="conflict-rest" />
            <span>
              Fazer isso para os próximos {remaining.length} {remaining.length === 1 ? 'capítulo que já existe' : 'capítulos que já existem'}
              <span className="block text-xs text-slate-500">{remaining.length === 1 ? 'cap.' : 'caps.'} {remaining.join(', ')}</span>
            </span>
          </label>
        )}
      </div>
    </Dialog>
  )
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const { toast } = useJobs()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [conflict, setConflict] = useState<Conflict | null>(null)
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

  const enqueue = useCallback((drafts: Upload[]) => {
    queue.current = [...queue.current, ...drafts]
    pump.current()
  }, [])

  const drop = useCallback((drafts: Upload[]) => {
    for (const d of drafts) files.current.delete(d.id)
  }, [])

  const add = useCallback(
    (seriesId: string, picked: File[], existing: ExistingChapter[] = []) => {
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
      const withPages = new Map(existing.filter((c) => c.pages > 0).map((c) => [c.number, c]))
      const numbers = [...new Set(fresh.map((u) => u.number!).filter((n) => withPages.has(n)))]
      if (!numbers.length) return enqueue(fresh)
      setConflict({ drafts: fresh, existing: withPages, numbers, index: 0, overwrite: new Set() })
    },
    [toast, enqueue],
  )

  const decide = (overwrite: boolean, rest: boolean) => {
    if (!conflict) return
    const targets = rest ? conflict.numbers.slice(conflict.index) : [conflict.numbers[conflict.index]]
    const chosen = new Set(conflict.overwrite)
    for (const n of targets) if (overwrite) chosen.add(n)
    const next = rest ? conflict.numbers.length : conflict.index + 1
    if (next < conflict.numbers.length) {
      setConflict({ ...conflict, index: next, overwrite: chosen })
      return
    }
    const conflicted = new Set(conflict.numbers)
    const keep = conflict.drafts.filter((d) => !conflicted.has(d.number!) || chosen.has(d.number!)).map((d) => (chosen.has(d.number!) ? { ...d, overwrite: true } : d))
    const skipped = conflict.drafts.filter((d) => !keep.some((k) => k.id === d.id))
    drop(skipped)
    if (skipped.length) toast('done', `${skipped.length} ${skipped.length === 1 ? 'capítulo pulado' : 'capítulos pulados'} (já existiam).`)
    setConflict(null)
    enqueue(keep)
  }

  const cancel = () => {
    if (conflict) drop(conflict.drafts)
    setConflict(null)
  }

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

  return (
    <UploadsContext.Provider value={{ uploads, add, dismiss }}>
      {children}
      {conflict && <ConflictDialog key={conflict.numbers[conflict.index]} conflict={conflict} onDecide={decide} onCancel={cancel} />}
    </UploadsContext.Provider>
  )
}
