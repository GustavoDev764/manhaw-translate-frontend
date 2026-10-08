import { useState } from 'react'
import { useAuth } from '../auth/authCtx'
import { useJobs } from '../components/jobsContext'
import { Badge, Button, Card, Dialog, EmptyState, Notice, Spinner, Tabs, type Tone } from '../components/ui'
import { ago, chaptersLabel, num, approxUsd, when } from '../lib/format'
import { href, usePolling } from '../lib/hooks'
import { useWorkflowEvents } from '../lib/workflowEvents'
import { WF_STATUS } from '../lib/workflowStatus'
import { workflowsApi, type ItemError, type ItemStatus, type WorkflowType } from '../workflowsApi'

const ITEM_STATUS: Record<ItemStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Aguardando', tone: 'pending' },
  queued: { label: 'Na fila', tone: 'pending' },
  running: { label: 'Em andamento', tone: 'queued' },
  succeeded: { label: 'Concluído', tone: 'done' },
  failed: { label: 'Falhou', tone: 'failed' },
  skipped: { label: 'Ignorado', tone: 'neutral' },
  canceled: { label: 'Cancelado', tone: 'pending' },
  waiting_key: { label: 'Pausado: sem API key', tone: 'failed' },
}

type Filter = 'active' | 'all' | 'failed' | 'mine'

const PROGRESS_VERB: Partial<Record<WorkflowType, string>> = { scan: 'Escaneando página', render: 'Desenhando página', delete: 'Apagando arquivo', import: 'Importando página' }

export function ProgressLine({ verb, done, total, prefix }: { verb: string; done: number; total: number; prefix?: string }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <span className="mt-1 block" data-testid="item-progress">
      <span className="block text-xs font-medium text-queued">
        {prefix ? `${prefix} · ` : ''}
        {verb} {num(Math.min(done + 1, total))} de {num(total)}
      </span>
      <span className="mt-0.5 block h-1 w-full max-w-64 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span className="block h-full bg-queued transition-all" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

export function WorkflowsPage({ openId }: { openId?: number }) {
  const [filter, setFilter] = useState<Filter>('active')
  const query = filter === 'active' ? { status: 'active' } : filter === 'failed' ? { status: 'failed' } : filter === 'mine' ? { mine: true } : {}
  const list = usePolling(() => workflowsApi.list({ ...query, take: 50 }), 0, [filter])
  const detail = usePolling(() => (openId ? workflowsApi.get(openId) : Promise.resolve(null)), 0, [openId])
  useWorkflowEvents((e) => {
    void list.reload()
    if (openId && (!e || e.workflowId === openId)) void detail.reload()
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Workflows</h1>
        <p className="text-sm text-slate-500">Cada etapa iniciada vira um workflow. Esta tela se atualiza sozinha quando algo muda.</p>
      </div>
      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: 'active', label: 'Em andamento' },
          { value: 'failed', label: 'Com falha' },
          { value: 'mine', label: 'Meus' },
          { value: 'all', label: 'Todos' },
        ]}
      />
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      {!list.data && !list.error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}
      {list.data && !list.data.rows.length && <EmptyState>{filter === 'active' ? 'Nenhum workflow em andamento.' : 'Nenhum workflow.'}</EmptyState>}
      {list.data && list.data.rows.length > 0 && (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.data.rows.map((w) => {
            const done = (w.counts.succeeded ?? 0) + (w.counts.skipped ?? 0)
            const pct = w.items ? Math.round((done / w.items) * 100) : 0
            return (
              <a key={w.id} href={href('workflows', String(w.id))} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${openId === w.id ? 'bg-brand/5' : ''}`}>
                <span className="w-14 font-mono text-xs text-slate-500">#{w.id}</span>
                <span className="min-w-40 flex-1">
                  <b>{w.label}</b>
                  {w.force && <span className="ml-1 text-xs text-slate-500">(de novo)</span>}
                  <span className="block text-xs text-slate-500">
                    {w.series?.title} · {chaptersLabel(w.chapters)} · {num(w.pages)} pág.
                  </span>
                  {PROGRESS_VERB[w.type] && w.progress.map((p) => <ProgressLine key={p.label} verb={PROGRESS_VERB[w.type]!} done={p.done} total={p.total} prefix={p.label} />)}
                </span>
                <span className="w-32">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span className="block h-full bg-done" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {done}/{w.items} itens{w.counts.failed ? ` · ${w.counts.failed} com erro` : ''}
                  </span>
                </span>
                <span className="w-36 text-xs text-slate-500">
                  {w.createdBy}
                  <span className="block">{ago(w.createdAt)}</span>
                </span>
                <Badge tone={WF_STATUS[w.status].tone}>{WF_STATUS[w.status].label}</Badge>
              </a>
            )
          })}
        </Card>
      )}
      {openId && <WorkflowDetailPanel id={openId} detail={detail.data} error={detail.error} reload={detail.reload} />}
    </div>
  )
}

export function WorkflowDetailPanel({ id, detail, error, reload, backTo = href('workflows') }: { id: number; detail: Awaited<ReturnType<typeof workflowsApi.get>> | null; error: string | null; reload: () => Promise<void>; backTo?: string }) {
  const { toast } = useJobs()
  const { me } = useAuth()
  const [errorOf, setErrorOf] = useState<ItemError | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast('done', ok)
      await reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }
  const close = () => {
    window.location.hash = backTo
  }

  return (
    <Dialog open onClose={close} wide title={detail ? `Workflow #${id} · ${detail.label}` : `Workflow #${id}`}
      footer={
        <>
          {detail && ['pending', 'running'].includes(detail.status) && (
            <Button variant="danger" disabled={busy === 'cancel'} onClick={() => act('cancel', () => workflowsApi.cancel(id), `Workflow #${id} cancelado.`)}>
              Cancelar workflow
            </Button>
          )}
          <Button onClick={close}>Fechar</Button>
        </>
      }
    >
      {error && <Notice tone="failed">{error}</Notice>}
      {!detail && !error && <Spinner />}
      {detail && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={WF_STATUS[detail.status].tone}>{WF_STATUS[detail.status].label}</Badge>
            <span className="text-slate-500">
              {detail.series?.title ?? detail.params.title} · criado por {detail.createdBy} em {when(detail.createdAt)}
              {detail.finishedAt ? ` · terminou ${ago(detail.finishedAt)}` : ''}
            </span>
          </div>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {detail.items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="flex-1">
                  {it.label}
                  <span className="block text-xs text-slate-500">
                    {it.attempts > 1 ? `${it.attempts} tentativas · ` : ''}
                    {it.translationModel ? `${it.translationModel} · ` : ''}
                    {it.costUsd ? `${approxUsd(it.costUsd)} (estimado) · ${num(it.inputTokens + it.outputTokens)} tokens` : ''}
                    {it.errorMessage && it.status !== 'failed' ? `falha na tentativa anterior: ${it.errorMessage}` : ''}
                  </span>
                  {it.status === 'running' && it.progress && detail && PROGRESS_VERB[detail.type] && <ProgressLine verb={PROGRESS_VERB[detail.type]!} done={it.progress.done} total={it.progress.total} />}
                </span>
                <Badge tone={ITEM_STATUS[it.status].tone}>{ITEM_STATUS[it.status].label}</Badge>
                {it.hasError && (
                  <Button size="sm" variant="ghost" onClick={async () => setErrorOf(await workflowsApi.error(it.id))}>
                    Ver detalhes do erro
                  </Button>
                )}
                {['failed', 'canceled'].includes(it.status) && (
                  <Button size="sm" disabled={busy === it.id} onClick={() => act(it.id, () => workflowsApi.retry(it.id), `${it.label}: voltou para a fila.`)}>
                    Tentar de novo
                  </Button>
                )}
                {it.status === 'failed' && (
                  <Button size="sm" variant="ghost" disabled={busy === `s${it.id}`} onClick={() => act(`s${it.id}`, () => workflowsApi.skip(it.id), `${it.label}: ignorado; o workflow segue sem ele.`)}>
                    Ignorar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <Dialog open={!!errorOf} onClose={() => setErrorOf(null)} wide title={errorOf ? `Erro · ${errorOf.label}` : 'Erro'}>
        {errorOf?.error && (
          <div className="space-y-3 text-sm">
            <Notice tone="failed">{errorOf.error.message}</Notice>
            {errorOf.error.hint && (
              <p>
                <b>O que fazer:</b> {errorOf.error.hint}
              </p>
            )}
            <p className="text-xs text-slate-500">
              {when(errorOf.error.at)}
              {errorOf.error.attempt ? ` · tentativa ${errorOf.error.attempt} de ${errorOf.error.attempts}` : ''}
              {errorOf.error.exitCode != null ? ` · código ${errorOf.error.exitCode}` : ''}
            </p>
            {errorOf.error.pages?.length ? <p>Páginas: {errorOf.error.pages.join(', ')}</p> : null}
            {errorOf.error.tail?.length ? (
              <details open={me?.role !== 'redator'}>
                <summary className="cursor-pointer text-xs text-slate-500">Últimas linhas do processo</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">{errorOf.error.tail.join('\n')}</pre>
              </details>
            ) : null}
          </div>
        )}
      </Dialog>
    </Dialog>
  )
}
