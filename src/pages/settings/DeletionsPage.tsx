import { useState } from 'react'
import { Pagination } from '../../components/Pagination'
import { Badge, Card, EmptyState, Notice, Spinner, Tabs } from '../../components/ui'
import { ago, num } from '../../lib/format'
import { href, usePolling } from '../../lib/hooks'
import { useWorkflowEvents } from '../../lib/workflowEvents'
import { workflowsApi, type WorkflowRow } from '../../workflowsApi'
import { WF_STATUS } from '../../lib/workflowStatus'
import { WorkflowDetailPanel } from '../WorkflowsPage'
import { SettingsLayout } from './SettingsLayout'

type Filter = 'active' | 'failed' | 'all'
const PAGE_SIZE = 20

function FilesProgress({ w }: { w: WorkflowRow }) {
  const total = w.total ?? 0
  const done = w.done ?? 0
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100
  return (
    <span className="block w-40">
      <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span className={`block h-full ${w.status === 'failed' || w.status === 'partial' ? 'bg-failed' : 'bg-done'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[11px] tabular-nums text-slate-500">
        {num(done)} de {num(total)} apagados
      </span>
    </span>
  )
}

export function DeletionsPage({ openId }: { openId?: number }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const status = filter === 'all' ? undefined : filter
  const list = usePolling(() => workflowsApi.list({ type: 'delete', status, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }), 0, [filter, page])
  const detail = usePolling(() => (openId ? workflowsApi.get(openId) : Promise.resolve(null)), 0, [openId])
  useWorkflowEvents((e) => {
    void list.reload()
    if (openId && (!e || e.workflowId === openId)) void detail.reload()
  })
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1

  return (
    <SettingsLayout active="deletions">
      <div>
        <h1 className="text-2xl font-semibold">Exclusões</h1>
        <p className="text-sm text-slate-500">
          Quando um manhwa é excluído, ele some da biblioteca na hora e os arquivos são apagados aqui, em segundo plano. Se algo falhar, a exclusão tenta de novo sozinha até 5 vezes; depois disso você pode usar “Tentar de novo”. Só o admin do sistema vê esta tela.
        </p>
      </div>
      <Tabs<Filter>
        value={filter}
        onChange={(f) => {
          setFilter(f)
          setPage(1)
        }}
        tabs={[
          { value: 'all', label: 'Todas' },
          { value: 'active', label: 'Em andamento' },
          { value: 'failed', label: 'Com falha' },
        ]}
      />
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      <Card className="overflow-hidden">
        {!list.data ? (
          <EmptyState>
            <Spinner /> Carregando…
          </EmptyState>
        ) : !list.data.rows.length ? (
          <EmptyState>{filter === 'active' ? 'Nenhuma exclusão em andamento.' : filter === 'failed' ? 'Nenhuma exclusão com falha.' : 'Nenhum manhwa foi excluído ainda.'}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Manhwa</th>
                  <th className="px-4 py-2">Scan</th>
                  <th className="px-4 py-2">Excluído por</th>
                  <th className="px-4 py-2">Arquivos</th>
                  <th className="px-4 py-2">Tentativas</th>
                  <th className="px-4 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((w) => (
                  <tr key={w.id} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40 ${openId === w.id ? 'bg-brand/5' : ''}`} onClick={() => (window.location.hash = href('settings', 'deletions', String(w.id)))}>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      <a href={href('settings', 'deletions', String(w.id))}>#{w.id}</a>
                    </td>
                    <td className="px-4 py-2 font-medium">{w.title ?? '—'}</td>
                    <td className="px-4 py-2">{w.scan}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {w.createdBy}
                      <span className="block">{ago(w.createdAt)}</span>
                    </td>
                    <td className="px-4 py-2">
                      <FilesProgress w={w} />
                    </td>
                    <td className="px-4 py-2 tabular-nums">{w.attempts || '—'}</td>
                    <td className="px-4 py-2">
                      <Badge tone={WF_STATUS[w.status].tone}>{WF_STATUS[w.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pages={pages} total={list.data.total} noun={['exclusão', 'exclusões']} onChange={setPage} />
          </div>
        )}
      </Card>
      {openId && <WorkflowDetailPanel id={openId} detail={detail.data} error={detail.error} reload={detail.reload} backTo={href('settings', 'deletions')} />}
    </SettingsLayout>
  )
}
