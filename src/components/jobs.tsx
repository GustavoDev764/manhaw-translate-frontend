import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type Job } from '../api'
import { useAuth } from '../auth/authCtx'
import { cx } from '../lib/cx'
import { ago, duration } from '../lib/format'
import { useTick } from '../lib/hooks'
import { JOB_STATUS, JobsContext, type Toast } from './jobsContext'
import { Badge, Button, Spinner } from './ui'

const MAX_TOASTS = 3

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [finishedCount, setFinishedCount] = useState(0)
  const running = useRef(new Set<string>())
  const legacy = useAuth().me?.role === 'system_admin'

  const toast = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = await api.jobs()
      setJobs(list)
      let finished = false
      for (const job of list) {
        if (job.status === 'running') running.current.add(job.id)
        else if (running.current.delete(job.id)) {
          finished = true
          toast(
            job.status === 'succeeded' ? 'done' : 'failed',
            `${job.title}: ${JOB_STATUS[job.status].label}`,
          )
        }
      }
      if (finished) setFinishedCount((n) => n + 1)
    } catch {
    }
  }, [toast])

  useEffect(() => {
    if (!legacy) return
    const first = setTimeout(refresh, 0)
    const t = setInterval(refresh, 2000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [refresh, legacy])

  const start = useCallback(
    async (run: () => Promise<Job>) => {
      try {
        const job = await run()
        running.current.add(job.id)
        setOpenId(job.id)
        void refresh()
        return job
      } catch (err) {
        toast('failed', err instanceof Error ? err.message : String(err))
        return null
      }
    },
    [refresh, toast],
  )

  return (
    <JobsContext.Provider value={{ jobs, start, openJob: setOpenId, toast, finishedCount }}>
      {children}
      {openId && <JobDrawer key={openId} id={openId} onClose={() => setOpenId(null)} />}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2">
        {toasts.length > MAX_TOASTS && (
          <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-500 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            e mais {toasts.length - MAX_TOASTS} {toasts.length - MAX_TOASTS === 1 ? 'aviso' : 'avisos'}
          </div>
        )}
        {toasts.slice(-MAX_TOASTS).map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-lg',
              'bg-white dark:bg-slate-900',
              t.tone === 'done' ? 'border-done/50' : 'border-failed/50 text-failed',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </JobsContext.Provider>
  )
}

function JobDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [follow, setFollow] = useState(true)
  const next = useRef(0)
  const box = useRef<HTMLPreElement>(null)
  const now = useTick(1000)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const j = await api.job(id, next.current)
        if (!alive) return
        setJob(j)
        if (j.lines.length) {
          setLines((old) => [...old, ...j.lines].slice(-5000))
          next.current = j.firstLine + j.lines.length
        }
        if (j.status === 'running') timer = setTimeout(load, 1000)
      } catch {
        if (alive) timer = setTimeout(load, 3000)
      }
    }
    let timer = setTimeout(load, 0)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [id])

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines, follow])

  const status = job ? JOB_STATUS[job.status] : null
  const elapsed = job
    ? (job.endedAt ? new Date(job.endedAt).getTime() : now) - new Date(job.startedAt).getTime()
    : 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">{job?.series}</div>
            <h2 className="truncate font-semibold">{job?.title ?? 'Carregando…'}</h2>
            {job && status && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Badge tone={status.tone}>
                  {job.status === 'running' && <Spinner className="size-3" />}
                  {status.label}
                </Badge>
                <span>{duration(elapsed)}</span>
                <span>· iniciada {ago(job.startedAt)}</span>
                {job.exitCode != null && job.exitCode !== 0 && <span>· código {job.exitCode}</span>}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {job?.status === 'running' && (
              <Button
                variant="danger"
                size="sm"
                onClick={async () => setJob(await api.cancelJob(id))}
              >
                Cancelar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
              ✕
            </Button>
          </div>
        </div>
        <pre
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget
            setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
          }}
          className="flex-1 overflow-auto bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-200"
        >
          {lines.length ? lines.join('\n') : job?.status === 'running' ? 'Aguardando saída…' : '(sem saída)'}
        </pre>
        {job && (
          <div className="truncate border-t border-slate-200 px-5 py-2 font-mono text-[11px] text-slate-500 dark:border-slate-800" title={job.command}>
            {job.command}
          </div>
        )}
      </aside>
    </div>
  )
}
