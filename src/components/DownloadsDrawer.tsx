import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { href, usePolling } from '../lib/hooks'
import { num, when } from '../lib/format'
import { useWorkflowEvents } from '../lib/workflowEvents'
import { DOWNLOADS_CHANGED, exportsApi, type ChapterExport } from '../workflowsApi'
import { useConfirm } from './confirm'
import { useJobs } from './jobsContext'
import { Badge, Button, EmptyState, Spinner } from './ui'

export const OPEN_DOWNLOADS = 'downloads:open'

function size(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`
}

function expiresIn(iso: string): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000))
  if (minutes < 60) return `expira em ${minutes} min`
  return `expira em ${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function DownloadsDrawer({ seriesId }: { seriesId: string }) {
  const { toast } = useJobs()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [ask, confirmDialog] = useConfirm()
  const list = usePolling(exportsApi.list, 0, [])
  const reload = list.reload
  const items = (list.data ?? []).filter((e) => e.series?.id === seriesId)
  const ready = items.filter((e) => e.status === 'ready').length
  const generating = items.filter((e) => e.status === 'pending').length

  useWorkflowEvents(() => void reload())
  useEffect(() => {
    const show = () => {
      setOpen(true)
      void reload()
    }
    const refresh = () => void reload()
    window.addEventListener(OPEN_DOWNLOADS, show)
    window.addEventListener(DOWNLOADS_CHANGED, refresh)
    return () => {
      window.removeEventListener(OPEN_DOWNLOADS, show)
      window.removeEventListener(DOWNLOADS_CHANGED, refresh)
    }
  }, [reload])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const remove = async (e: ChapterExport) => {
    const ok = await ask({ title: 'Apagar zip', message: <p>Apagar “{e.fileName}”? O arquivo sai do armazenamento e ninguém mais consegue baixar.</p>, confirmLabel: 'Apagar', danger: true })
    if (!ok) return
    setBusy(e.id)
    try {
      await exportsApi.remove(e.id)
      toast('done', 'Zip apagado.')
      await list.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {confirmDialog}
      <Button
        size="sm"
        onClick={() => {
          setOpen(true)
          void list.reload()
        }}
        title="Zips gerados desta obra, prontos para baixar"
      >
        Downloads
        {generating > 0 && <Spinner className="ml-1.5 size-3" />}
        {ready > 0 && <span className="ml-1.5 rounded-full bg-brand/15 px-1.5 text-xs text-brand">{ready}</span>}
      </Button>
      {createPortal(
        <>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        aria-label="Downloads"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold">Downloads</h2>
            <p className="text-xs text-slate-500">Cada zip fica disponível por 24 horas e depois é apagado.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Fechar">
            ✕
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {list.data === null && !list.error && (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          )}
          {list.error && <p className="text-sm text-failed">{list.error}</p>}
          {list.data !== null && !items.length && <EmptyState>Nenhum zip desta obra. Selecione capítulos e use “Baixar .zip”.</EmptyState>}
          {items.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium" title={e.fileName}>
                    {e.fileName}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {e.chapters === 1 ? 'cap.' : 'caps.'} {e.spec} · {e.kind === 'original' ? 'originais' : 'traduzidas'}
                  </div>
                </div>
                {e.status === 'ready' ? <Badge tone="done">pronto</Badge> : e.status === 'pending' ? <Badge tone="queued">gerando</Badge> : <Badge tone="failed">falhou</Badge>}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                Gerado por <b className="font-medium text-slate-700 dark:text-slate-200">{e.by}</b> em {when(e.createdAt)}
              </div>
              {e.status === 'ready' && (
                <div className="text-xs text-slate-500">
                  {num(e.pages ?? 0)} páginas · {size(e.sizeBytes)} · {expiresIn(e.expiresAt)}
                  {e.missing ? ` · ${e.missing} páginas não puderam ser lidas` : ''}
                </div>
              )}
              {e.status === 'failed' && e.error && <div className="text-xs text-failed">{e.error}</div>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.status === 'ready' && (
                  <a href={exportsApi.downloadUrl(e.id)} className="inline-flex items-center rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                    Baixar
                  </a>
                )}
                {e.status === 'pending' && e.workflowId && (
                  <a href={href('workflows', String(e.workflowId))} onClick={() => setOpen(false)} className="inline-flex items-center rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    Ver andamento
                  </a>
                )}
                {e.canDelete && e.status !== 'pending' && (
                  <Button size="sm" variant="ghost" className="text-failed" disabled={busy === e.id} onClick={() => remove(e)}>
                    {busy === e.id ? <Spinner /> : 'Apagar'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
        </>,
        document.body,
      )}
    </>
  )
}
