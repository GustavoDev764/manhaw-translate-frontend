import { JOB_STATUS, useJobs } from '../components/jobsContext'
import { Badge, Card, EmptyState, Spinner } from '../components/ui'
import { ago, duration } from '../lib/format'
import { useTick } from '../lib/hooks'

export function JobsPage() {
  const { jobs, openJob } = useJobs()
  const now = useTick(1000)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tarefas</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Downloads, escaneamentos e traduções iniciados por esta página desde que o backend subiu. Clique para ver o log.
        </p>
      </div>
      {!jobs.length && <EmptyState>Nenhuma tarefa ainda.</EmptyState>}
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {jobs.map((j) => {
          const st = JOB_STATUS[j.status]
          const ms = (j.endedAt ? new Date(j.endedAt).getTime() : now) - new Date(j.startedAt).getTime()
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => openJob(j.id)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <Badge tone={st.tone}>
                {j.status === 'running' && <Spinner className="size-3" />}
                {st.label}
              </Badge>
              <span className="min-w-0 flex-1 font-medium">{j.title}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{j.series}</span>
              <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
                {duration(ms)} · {ago(j.startedAt)}
              </span>
            </button>
          )
        })}
      </Card>
    </div>
  )
}
