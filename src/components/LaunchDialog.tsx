import { useEffect, useState } from 'react'
import { ApiError } from '../api'
import { num } from '../lib/format'
import { STAGE_HELP, STAGE_LABEL, workflowsApi, type ExcludeReason, type LaunchInput, type LaunchType, type Plan, type PlanChapter } from '../workflowsApi'
import { useJobs } from './jobsContext'
import { Button, Dialog, Notice, Spinner } from './ui'

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'brand' | 'muted' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === 'brand' ? 'border-brand/60 bg-brand/5' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className={`text-2xl font-semibold tabular-nums ${tone === 'brand' ? 'text-brand' : tone === 'muted' ? 'text-slate-500' : ''}`}>{num(value)}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

const REASON_TEXT: Record<Exclude<ExcludeReason, 'busy'>, string> = {
  not_scanned: 'precisa escanear antes',
  no_pages: 'importe ou baixe as páginas',
  no_layers: 'traduza antes (sem caixas de texto)',
}

function caps(list: PlanChapter[]) {
  const names = list.map((c) => c.number)
  if (names.length === 1) return `Cap. ${names[0]}`
  return `Caps. ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

const DONE_WORD: Record<LaunchType, string> = {
  download: 'baixados',
  scan: 'escaneadas',
  translate: 'traduzidas',
  cleanup: 'limpas',
  render: 'desenhadas',
}

export function LaunchDialog({
  input,
  onClose,
  onCreated,
}: {
  input: Omit<LaunchInput, 'force' | 'includeDrafts' | 'confirmApproved'> | null
  onClose: () => void
  onCreated?: (id: number) => void
}) {
  const { toast } = useJobs()
  const [force, setForce] = useState(false)
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [confirmApproved, setConfirmApproved] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!input) return
    let alive = true
    workflowsApi
      .plan({ ...input, force, includeDrafts })
      .then((p) => {
        if (!alive) return
        setPlan(p)
        setError(null)
      })
      .catch((err: Error) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [input, force, includeDrafts])

  const close = () => {
    setPlan(null)
    setForce(false)
    setIncludeDrafts(false)
    setConfirmApproved(false)
    setError(null)
    onClose()
  }

  const start = async () => {
    if (!input) return
    setBusy(true)
    try {
      const r = await workflowsApi.create({ ...input, force, includeDrafts, confirmApproved })
      const out = r.excluded?.length ? ` · ${r.excluded.length} ${r.excluded.length === 1 ? 'capítulo ficou' : 'capítulos ficaram'} de fora` : ''
      toast('done', `Workflow #${r.id} criado: ${STAGE_LABEL[input.type]} · ${num(r.totals.willRun)} ${input.type === 'download' ? 'capítulos' : 'páginas'}${out}`)
      onCreated?.(r.id)
      close()
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!input) return null
  const t = plan?.totals
  const unit = input.type === 'download' ? 'capítulos' : 'páginas'
  const busyChapters = plan?.chapters.filter((c) => c.busy) ?? []
  const allBusy = !!plan && busyChapters.length === plan.chapters.length
  const busyGroups = [...new Map(busyChapters.map((c) => [c.busy!.workflowId, { label: c.busy!.label, list: busyChapters.filter((x) => x.busy!.workflowId === c.busy!.workflowId) }])).values()]
  const reasonGroups = (['not_scanned', 'no_pages', 'no_layers'] as const).map((r) => ({ reason: r, list: plan?.chapters.filter((c) => c.reason === r) ?? [] })).filter((g) => g.list.length)
  const approved = t?.approved ?? 0
  const drafts = t?.drafts ?? 0
  const needsConfirm = approved > 0 && !confirmApproved
  const done = DONE_WORD[input.type]
  const scanWidened = input.type === 'scan' && !!input.pageIds?.length && !!t && t.willRun > t.selected
  const widenedChapters = plan?.chapters.filter((c) => c.willRun > 0).map((c) => `Cap. ${c.number}`).join(', ') ?? ''

  return (
    <Dialog
      open={!!input}
      onClose={close}
      title={STAGE_LABEL[input.type]}
      footer={
        <>
          <Button onClick={close}>Fechar</Button>
          <Button variant="primary" onClick={start} disabled={busy || !t || t.willRun === 0 || needsConfirm}>
            {busy ? <Spinner /> : t ? `Iniciar · ${num(t.willRun)} ${unit}` : 'Iniciar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{STAGE_HELP[input.type]}</p>
        {plan && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{plan.series.title}</div>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {plan.chapters.map((c) => (
                <span
                  key={c.number}
                  title={c.busy ? `Em ${c.busy.label}: fica de fora` : c.reason && c.reason !== 'busy' ? `Fica de fora: ${REASON_TEXT[c.reason]}` : `${c.willRun} de ${c.selected}`}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${c.busy ? 'border-failed/60 text-failed line-through' : c.willRun ? 'border-brand/50 bg-brand/10 text-brand' : 'border-slate-300 text-slate-500 dark:border-slate-700'}`}
                >
                  Cap. {c.number}
                  {input.type !== 'download' && input.pageIds?.length ? ` · ${c.selected} pág.` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
        {!plan && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Calculando…
          </div>
        )}
        {t && (
          <div className="grid grid-cols-3 gap-2">
            <Tile label={input.type === 'download' ? 'capítulos selecionados' : 'páginas selecionadas'} value={t.selected} />
            <Tile label={`já ${done}`} value={t.done} tone="muted" />
            <Tile label={`serão ${done}`} value={t.willRun} tone="brand" />
          </div>
        )}
        {scanWidened && t && (
          <Notice tone="queued">
            Você escolheu {num(t.selected)} {t.selected === 1 ? 'página' : 'páginas'}, mas o escaneamento sempre roda no capítulo inteiro: serão escaneadas <b>{num(t.willRun)} páginas</b> ({widenedChapters}). O detector precisa das páginas vizinhas para achar balões que passam de uma imagem para outra.
          </Notice>
        )}
        {input.type !== 'download' && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={force} onChange={(e) => setForce(e.target.checked)} />
            <span>
              <b>Fazer de novo</b>
              <span className="block text-xs text-slate-500">
                Inclui as {t ? num(t.done) : '—'} já {done}. {input.type === 'translate' ? 'Gasta API de novo. ' : ''}As versões atuais continuam no histórico.
              </span>
            </span>
          </label>
        )}
        {input.type === 'download' && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Baixar de novo os já baixados (só acrescenta páginas que faltam)
          </label>
        )}
        {t && t.noText > 0 && (
          <Notice tone="neutral">
            {num(t.noText)} {t.noText === 1 ? 'página sem texto fica' : 'páginas sem texto ficam'} de fora automaticamente: não há o que {input.type === 'translate' ? 'traduzir' : input.type === 'cleanup' ? 'limpar' : 'desenhar'}.
          </Notice>
        )}
        {t && t.missing > 0 && (
          <Notice tone="queued">
            {num(t.missing)} {unit} ainda não {t.missing === 1 ? 'está' : 'estão'} {plan?.needs} e {t.missing === 1 ? 'ficará' : 'ficarão'} de fora.
          </Notice>
        )}
        {busyGroups.length > 0 && (
          <Notice tone={allBusy ? 'failed' : 'queued'}>
            {allBusy ? 'Todos os capítulos escolhidos estão em outro processo: ' : ''}
            {busyGroups.map((g, i) => (
              <span key={g.label}>
                {i > 0 ? '; ' : ''}
                {caps(g.list)} {g.list.length === 1 ? 'está' : 'estão'} em <b>{g.label}</b>
              </span>
            ))}
            {allBusy ? '.' : ` e ${busyChapters.length === 1 ? 'fica' : 'ficam'} de fora. Os outros seguem.`}
          </Notice>
        )}
        {reasonGroups.map((g) => (
          <Notice key={g.reason} tone="queued">
            {caps(g.list)} {g.list.length === 1 ? 'fica' : 'ficam'} de fora: {REASON_TEXT[g.reason]}.
          </Notice>
        ))}
        {t && t.locked > 0 && !busyChapters.length && <Notice tone="queued">{num(t.locked)} {unit} em outro processo ficarão de fora.</Notice>}
        {input.type === 'translate' && drafts > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-queued/50 bg-queued/5 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} data-testid="include-drafts" />
            <span>
              <b>Incluir e descartar os rascunhos</b>
              <span className="block text-xs text-slate-500">
                {num(drafts)} {drafts === 1 ? 'página tem' : 'páginas têm'} alterações nas caixas de texto que ainda não foram publicadas. {includeDrafts ? 'Elas serão traduzidas de novo e as alterações serão substituídas.' : 'Por padrão elas ficam de fora para não perder essas alterações.'}
              </span>
            </span>
          </label>
        )}
        {approved > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-failed/50 bg-failed/5 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={confirmApproved} onChange={(e) => setConfirmApproved(e.target.checked)} data-testid="confirm-approved" />
            <span>
              <b>Vai desfazer a aprovação de {num(approved)} {approved === 1 ? 'página' : 'páginas'}</b>
              <span className="block text-xs text-slate-500">Essas páginas já foram aprovadas na revisão. Marque para confirmar que elas precisam ser revisadas de novo.</span>
            </span>
          </label>
        )}
        {input.type === 'translate' && plan?.provider === 'gpu' && (
          <Notice tone="neutral">
            A tradução vai para a GPU (Gemma 3 27B), sem gastar créditos da Anthropic. Costuma levar poucos minutos por capítulo. Se o Gemma estiver fora do ar, o item falha com o motivo e você escolhe em Workflows: desligar o Gemma e tentar de novo (vai para o Claude) ou corrigir a GPU e tentar de novo.
          </Notice>
        )}
        {input.type === 'translate' && plan?.provider !== 'gpu' && (
          <Notice tone="neutral">
            A tradução vai pela fila da Anthropic, que custa metade do preço. Costuma ficar pronta em minutos, mas pode levar até 24 horas. Acompanhe em Workflows › Na Anthropic.
          </Notice>
        )}
        {plan?.keyMissing && (
          <Notice tone="failed">A scan está sem API key: o workflow será criado, mas fica pausado até a chave ser configurada.</Notice>
        )}
        {error && <Notice tone="failed">{error}</Notice>}
      </div>
    </Dialog>
  )
}
