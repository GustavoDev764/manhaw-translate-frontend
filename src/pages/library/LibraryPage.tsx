import { useEffect, useState } from 'react'
import { adminApi, type ScanRow } from '../../adminApi'
import { useAuth } from '../../auth/authCtx'
import { useJobs } from '../../components/jobsContext'
import { ScanSelect } from '../../components/ScanSelect'
import { Button, Card, Dialog, EmptyState, Field, inputClass, Notice, Spinner, StatusBar } from '../../components/ui'
import { num } from '../../lib/format'
import { href, navigate, usePolling } from '../../lib/hooks'
import { libraryApi } from '../../workflowsApi'

export function LibraryPage() {
  const { me, can } = useAuth()
  const sys = me?.role === 'system_admin'
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [scans, setScans] = useState<ScanRow[]>([])
  const { data, error, reload } = usePolling(() => libraryApi.series({ q: search || undefined, scanId: sys ? (scanId ?? undefined) : undefined }), 0, [search, scanId, sys])
  const [creating, setCreating] = useState(false)
  const filtered = !!search || !!scanId

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (sys) adminApi.scans().then(setScans, () => undefined)
  }, [sys])
  const canCreate = can('download') && (!!me?.scan || me?.role === 'system_admin')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manhwas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Escolha um manhwa para baixar, escanear, traduzir e revisar os capítulos.</p>
        </div>
        {canCreate && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            Nova série
          </Button>
        )}
      </div>
      {sys && (
        <Card className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,320px)_auto] sm:items-end">
          <Field label="Buscar pelo nome">
            <input className={inputClass} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex.: Space Cheon Ma" data-testid="series-search" />
          </Field>
          <div className="space-y-1">
            <label htmlFor="library-scan" className="text-sm font-medium">Scan</label>
            <ScanSelect id="library-scan" scans={scans} value={scanId} onChange={setScanId} placeholder="Todas as scans" />
          </div>
          <Button variant="ghost" disabled={!filtered} onClick={() => { setQuery(''); setSearch(''); setScanId(null) }}>Limpar filtros</Button>
        </Card>
      )}
      {error && <Notice tone="failed">{error}</Notice>}
      {!data && !error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}
      {data && !data.length && <EmptyState>{filtered ? 'Nenhum manhwa encontrado com esses filtros.' : `Nenhum manhwa ainda${canCreate ? ': use “Nova série”.' : '.'}`}</EmptyState>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((s) => (
          <a key={s.id} href={href('s', s.slug)} className="group">
            <Card className="h-full p-5 transition group-hover:border-brand">
              <h2 className="font-semibold break-words group-hover:text-brand">{s.title}</h2>
              <div className="mt-1 text-xs text-slate-500">{sys && <span className="font-medium text-slate-600 dark:text-slate-300">{s.scan.name} · </span>}{num(s.chapters)} capítulos · {num(s.pages)} páginas</div>
              <StatusBar
                className="mt-4"
                total={s.pages}
                parts={[
                  { value: s.rendered, color: 'bg-done', label: 'Desenhadas' },
                  { value: Math.max(0, s.scanned - s.rendered), color: 'bg-brand/40', label: 'Escaneadas' },
                ]}
              />
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-slate-500">Escaneadas</dt>
                  <dd className="text-base font-semibold tabular-nums">{num(s.scanned)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Traduzidas</dt>
                  <dd className="text-base font-semibold tabular-nums">{num(s.translated)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Aprovadas</dt>
                  <dd className="text-base font-semibold tabular-nums">{num(s.approved)}</dd>
                </div>
              </dl>
            </Card>
          </a>
        ))}
      </div>
      <NewSeriesDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (slug) => {
          setCreating(false)
          await reload()
          navigate(href('s', slug))
        }}
      />
    </div>
  )
}

function NewSeriesDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (slug: string) => void }) {
  const { me } = useAuth()
  const { toast } = useJobs()
  const sys = me?.role === 'system_admin'
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [scans, setScans] = useState<ScanRow[]>([])
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (open && sys) adminApi.scans().then(setScans, (err: Error) => toast('failed', err.message))
  }, [open, sys, toast])

  const reset = () => {
    setTitle('')
    setUrl('')
    setScanId(null)
    setTried(false)
  }
  const missingScan = sys && !scanId
  const missingName = !title.trim() && !url.trim()

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (missingScan || missingName) return
    setSaving(true)
    try {
      const s = await libraryApi.addSeries({ title: title.trim() || undefined, url: url.trim() || undefined, scanId: sys ? scanId! : undefined })
      reset()
      onCreated(s.slug)
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Nova série"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="new-series" disabled={saving}>{saving ? <Spinner /> : 'Criar série'}</Button>
        </>
      }
    >
      <form id="new-series" onSubmit={save} className="space-y-4">
        {sys && (
          <div className="space-y-1">
            <label htmlFor="new-series-scan" className="text-sm font-medium">Scan</label>
            <ScanSelect id="new-series-scan" scans={scans} value={scanId} onChange={setScanId} invalid={tried && missingScan} />
            {tried && missingScan && <p className="text-xs text-failed">Escolha a scan da série.</p>}
          </div>
        )}
        <Field label="Título" hint="Os capítulos entram depois, por arquivos .zip (1.zip, 2.zip…).">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder="ex.: Space Cheon Ma" />
        </Field>
        <Field label="Link do site (opcional)" hint="Para também baixar capítulos do site. Sem título, o nome vem do link.">
          <input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://comix.to/title/..." />
        </Field>
        {tried && missingName && <p className="text-xs text-failed">Informe o título ou o link.</p>}
      </form>
    </Dialog>
  )
}
