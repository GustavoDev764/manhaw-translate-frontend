import { useState } from 'react'
import { api } from '../api'
import { useJobs } from '../components/jobsContext'
import { Badge, Button, Card, EmptyState, inputClass, Notice, Spinner, StatusBar } from '../components/ui'
import { ago, num } from '../lib/format'
import { href, usePolling } from '../lib/hooks'

export function SeriesListPage() {
  const { finishedCount, toast } = useJobs()
  const { data, error, reload } = usePolling(api.series, 15000, [finishedCount])
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    try {
      const s = await api.addSeries(url)
      setUrl('')
      await reload()
      window.location.hash = href('series', s.slug, 'download')
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Manhwas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Baixe capítulos, escaneie os balões e traduza para português.
          </p>
        </div>
        <form onSubmit={add} className="flex w-full max-w-xl gap-2">
          <input
            className={inputClass}
            placeholder="Colar link do manhwa (ex.: https://comix.to/title/...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <Button type="submit" variant="primary" disabled={adding || !url.trim()}>
            {adding ? <Spinner /> : 'Adicionar'}
          </Button>
        </form>
      </div>

      {error && <Notice tone="failed">{error}</Notice>}
      {!data && !error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}
      {data && !data.length && <EmptyState>Nenhum manhwa ainda: cole o link de um acima.</EmptyState>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((s) => {
          const total = s.site?.chapters ?? s.local.chapters
          const translated = s.local.translated
          const downloaded = s.local.chapters
          return (
            <a key={s.slug} href={href('series', s.slug)} className="group">
              <Card className="h-full p-5 transition group-hover:border-brand">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold break-words group-hover:text-brand">{s.slug}</h2>
                  {s.local.queued > 0 && <Badge tone="queued">{s.local.queued} na fila</Badge>}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {s.site ? `${num(s.site.chapters)} capítulos no site · lista ${ago(s.site.listedAt)}` : 'lista do site ainda não lida'}
                </div>
                <StatusBar
                  className="mt-4"
                  total={total}
                  parts={[
                    { value: translated, color: 'bg-done', label: 'Traduzidos' },
                    { value: s.local.queued, color: 'bg-queued', label: 'Na fila' },
                    { value: Math.max(0, downloaded - translated - s.local.queued), color: 'bg-brand/40', label: 'Baixados, sem tradução' },
                  ]}
                />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Baixados</dt>
                    <dd className="text-base font-semibold tabular-nums">{num(downloaded)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Escaneados</dt>
                    <dd className="text-base font-semibold tabular-nums">{num(s.local.scanned)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Traduzidos</dt>
                    <dd className="text-base font-semibold tabular-nums">{num(translated)}</dd>
                  </div>
                </dl>
              </Card>
            </a>
          )
        })}
      </div>
    </div>
  )
}
