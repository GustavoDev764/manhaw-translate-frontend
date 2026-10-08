import type { QueueEntry } from '../api'
import { ago, chapterNo, num, when } from '../lib/format'
import { Badge, EmptyState, StatusBar, type Tone } from './ui'

function entryState(e: QueueEntry): [string, Tone] {
  if (e.collectedAt) return ['desenhado', 'done']
  if (e.status === 'ended') return ['finalizado, baixando', 'queued']
  if (e.status === 'canceling') return ['cancelando', 'failed']
  return ['em andamento', 'queued']
}

export function QueueEntries({ entries }: { entries: QueueEntry[] }) {
  if (!entries.length) return <EmptyState>Nada enviado para a fila ainda.</EmptyState>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th className="px-2 py-2 font-medium">Lote</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">Progresso</th>
            <th className="px-2 py-2 font-medium">Pedidos</th>
            <th className="px-2 py-2 font-medium">Capítulos</th>
            <th className="px-2 py-2 font-medium">Modelo</th>
            <th className="px-2 py-2 font-medium">Enviado</th>
          </tr>
        </thead>
        <tbody>
          {entries
            .slice()
            .reverse()
            .map((e) => {
              const c = e.counts
              const failed = c.errored + c.expired + c.canceled
              const [label, tone] = entryState(e)
              const chapters =
                e.chapters.length > 2
                  ? `${chapterNo(e.chapters[0])}–${chapterNo(e.chapters.at(-1)!)} (${e.chapters.length})`
                  : e.chapters.map(chapterNo).join(', ')
              return (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-2 py-2 font-mono text-xs whitespace-nowrap" title={e.id}>
                    …{e.id.slice(-10)}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={tone}>{label}</Badge>
                  </td>
                  <td className="w-1/4 min-w-32 px-2 py-2">
                    <StatusBar
                      total={e.total}
                      parts={[
                        { value: c.succeeded, color: 'bg-done', label: 'Prontos' },
                        { value: failed, color: 'bg-failed', label: 'Com erro' },
                      ]}
                    />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {num(c.succeeded + failed)}/{num(e.total)}
                    {failed > 0 && <span className="text-failed"> ({failed} erro)</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{chapters}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{e.kind === 'read' ? `leitura · ${e.model}` : e.model}</td>
                  <td className="px-2 py-2 whitespace-nowrap" title={e.createdAt}>
                    {when(e.createdAt)}
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}· {e.endedAt ? `terminou ${ago(e.endedAt)}` : `enviado ${ago(e.createdAt)}`}
                    </span>
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}
