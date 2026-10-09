import { useMemo, useState } from 'react'
import { api, type LocalChapter, type SeriesDetail, type TranslateMode } from '../../api'
import { ChapterSelector, type SelectableChapter } from '../../components/ChapterSelector'
import { useJobs } from '../../components/jobsContext'
import { Button, Card, Dialog, Dot, EmptyState, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { chaptersLabel, num, usd } from '../../lib/format'
import { href, navigate, usePolling } from '../../lib/hooks'

const STATE_LABEL: Record<LocalChapter['translation'], string> = {
  done: 'traduzido',
  queued: 'na fila',
  partial: 'em andamento',
  pending: 'pendente',
  'no-text': 'sem texto',
}

function toSelectable(c: LocalChapter): SelectableChapter {
  const mark = !c.scanned
    ? '·'
    : c.translation === 'done' || c.translation === 'no-text'
      ? '✓'
      : c.error
        ? '!'
        : c.queued
          ? '…'
          : ''
  return {
    number: c.number,
    mark,
    title:
      `Capítulo ${c.number}: ${c.scanned ? STATE_LABEL[c.translation] : 'não escaneado'}` +
      (c.total
        ? `\n${c.done} lotes prontos, ${c.queued} na fila, ${c.error} com erro, ${c.pending} não enviados`
        : '') +
      (c.scanned ? `\n${c.pagesWithText} de ${c.pages} páginas com texto` : ''),
    barTotal: c.total || 1,
    bar: c.scanned
      ? c.total
        ? [
            { value: c.done, color: 'bg-done', label: 'Prontos' },
            { value: c.queued, color: 'bg-queued', label: 'Na fila' },
            { value: c.error, color: 'bg-failed', label: 'Com erro' },
            { value: c.pending, color: 'bg-pending', label: 'Não enviados' },
          ]
        : [{ value: 1, color: 'bg-notext', label: 'Sem texto' }]
      : [],
  }
}

type DialogKind = 'scan' | 'translate' | 'queue' | null

export function TranslateTab({ series }: { series: SeriesDetail }) {
  const { start } = useJobs()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [dialog, setDialog] = useState<DialogKind>(null)
  const chapters = series.chapters
  const picked = chapters.filter((c) => selected.has(c.number))

  const presets = useMemo(
    () => [
      { label: 'Não escaneados', numbers: chapters.filter((c) => !c.scanned).map((c) => c.number) },
      {
        label: 'Faltam traduzir',
        numbers: chapters
          .filter((c) => c.translation === 'pending' || c.translation === 'partial')
          .map((c) => c.number),
      },
      { label: 'Com erro', numbers: chapters.filter((c) => c.error).map((c) => c.number) },
      { label: 'Todos', numbers: chapters.map((c) => c.number) },
    ],
    [chapters],
  )

  if (!chapters.length) {
    return (
      <EmptyState>
        Nenhum capítulo baixado ainda. Vá em <a className="text-brand underline" href={href('series', series.slug, 'download')}>Baixar do site</a>.
      </EmptyState>
    )
  }

  const unscanned = picked.filter((c) => !c.scanned)
  const run = (mode: TranslateMode) =>
    start(() => api.translate(series.slug, { chapters: [...selected], mode }))

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><Dot color="bg-done" /> pronto</span>
          <span className="flex items-center gap-1.5"><Dot color="bg-queued" /> na fila</span>
          <span className="flex items-center gap-1.5"><Dot color="bg-failed" /> com erro</span>
          <span className="flex items-center gap-1.5"><Dot color="bg-pending" /> não enviado</span>
          <span className="flex items-center gap-1.5"><Dot color="bg-notext" /> sem texto</span>
          <span>· barra vazia = não escaneado</span>
        </div>
        <ChapterSelector
          items={chapters.map(toSelectable)}
          selected={selected}
          onChange={setSelected}
          presets={presets}
          onOpen={(n) => {
            const c = chapters.find((x) => x.number === n)
            if (c) navigate(href('series', series.slug, 'chapter', c.name))
          }}
        />
      </Card>

      <div className="sticky bottom-4 z-10">
        <Card className="flex flex-wrap items-center gap-2 p-3 shadow-lg">
          <span className="mr-auto text-sm">
            {selected.size ? (
              <>
                <strong>{chaptersLabel([...selected])}</strong>
                <span className="text-slate-500 dark:text-slate-400">
                  {' '}· {num(picked.reduce((s, c) => s + c.pagesWithText, 0))} páginas com texto
                  {unscanned.length ? ` · ${unscanned.length} sem escanear` : ''}
                </span>
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">Selecione capítulos para agir</span>
            )}
          </span>
          <Button disabled={!selected.size} onClick={() => setDialog('scan')}>
            Escanear balões
          </Button>
          <Button disabled={!selected.size} onClick={() => run('preview')} title="Gera as imagens com os balões numerados que o Claude veria (sem custo)">
            Prévia
          </Button>
          <Button disabled={!selected.size} onClick={() => run('rerender')} title="Redesenha com as traduções já salvas (sem custo)">
            Redesenhar
          </Button>
          <Button disabled={!selected.size} onClick={() => setDialog('translate')}>
            Traduzir agora
          </Button>
          <Button variant="primary" disabled={!selected.size} onClick={() => setDialog('queue')}>
            Traduzir pela fila (−50%)
          </Button>
        </Card>
      </div>

      <ScanDialog
        open={dialog === 'scan'}
        onClose={() => setDialog(null)}
        slug={series.slug}
        chapters={picked}
      />
      <TranslateDialog
        open={dialog === 'translate' || dialog === 'queue'}
        mode={dialog === 'queue' ? 'queue' : 'direct'}
        onClose={() => setDialog(null)}
        slug={series.slug}
        chapters={picked}
      />
    </div>
  )
}

const SCAN_SECONDS = [0.75, 3]

function ScanDialog({
  open,
  onClose,
  slug,
  chapters,
}: {
  open: boolean
  onClose: () => void
  slug: string
  chapters: LocalChapter[]
}) {
  const { start } = useJobs()
  const [force, setForce] = useState(false)
  const already = chapters.filter((c) => c.scanned)
  const todo = force ? chapters : chapters.filter((c) => !c.scanned)
  const knownImages = todo.reduce((s, c) => s + c.pages, 0)
  const unknown = todo.filter((c) => !c.scanned).length

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Escanear balões"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!todo.length}
            onClick={async () => {
              const job = await start(() => api.scan(slug, todo.map((c) => c.number), force))
              if (job) onClose()
            }}
          >
            Escanear {todo.length ? chaptersLabel(todo.map((c) => c.number)) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>
          Descobre quais imagens têm texto e quais vão juntas. Roda no seu computador, <strong>sem custo</strong>.
        </p>
        {already.length > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={force} onChange={(e) => setForce(e.target.checked)} />
            <span>
              Escanear de novo os {already.length} já escaneados
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Sem marcar, eles são pulados.
              </span>
            </span>
          </label>
        )}
        {todo.length ? (
          <Notice>
            {knownImages > 0 &&
              `${num(knownImages)} imagens conhecidas: ${Math.max(1, Math.round((knownImages * SCAN_SECONDS[0]) / 60))} a ${Math.max(1, Math.round((knownImages * SCAN_SECONDS[1]) / 60))} min. `}
            {unknown > 0 && `${unknown} capítulo(s) ainda sem contagem de imagens (~2 a 8 min cada).`}
          </Notice>
        ) : (
          <Notice tone="queued">Todos os selecionados já foram escaneados.</Notice>
        )}
      </div>
    </Dialog>
  )
}

function TranslateDialog({
  open,
  mode,
  onClose,
  slug,
  chapters,
}: {
  open: boolean
  mode: 'direct' | 'queue'
  onClose: () => void
  slug: string
  chapters: LocalChapter[]
}) {
  const { start } = useJobs()
  const models = usePolling(api.models, 0, [])
  const config = usePolling(api.config, 0, [])
  const [model, setModel] = useState<string | null>(null)
  const [retry, setRetry] = useState(false)
  const [economy, setEconomy] = useState(true)
  const chosen = model ?? models.data?.defaultModel ?? ''
  const info = models.data?.models.find((m) => m.id === chosen)
  const tokens = models.data?.tokensPerPage
  const eco = models.data?.economy

  const pages = chapters.reduce((sum, c) => {
    if (!c.scanned) return sum + c.pagesWithText
    if (!c.total) return sum
    const left = c.pending + (retry ? c.error : 0)
    return sum + (c.pagesWithText * left) / c.total
  }, 0)
  const unscanned = chapters.filter((c) => !c.scanned).length
  const withErrors = chapters.filter((c) => c.error).length
  const perPage = (() => {
    if (!info?.price || !tokens || !eco) return null
    const p = info.price
    if (!economy) return (tokens.input * p.input + tokens.output * p.output) / 1e6
    const t = eco.tokensPerPage
    const reading = (t.readInput * eco.readPrice.input + t.readOutput * eco.readPrice.output) / 1e6
    const input = t.input + t.cacheWrite * 1.25 + t.cacheRead * 0.1
    return reading + (input * p.input + t.output * p.output) / 1e6
  })()
  const cost = perPage != null ? pages * perPage * (mode === 'queue' ? 0.5 : 1) : null
  const listed = models.data?.models ?? []
  const options = listed.some((m) => m.id === chosen) || !chosen ? listed : [{ id: chosen, name: chosen, createdAt: null, price: null }, ...listed]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'queue' ? 'Traduzir pela fila' : 'Traduzir agora'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!chosen || !config.data?.hasApiKey}
            onClick={async () => {
              const job = await start(() =>
                api.translate(slug, {
                  chapters: chapters.map((c) => c.number),
                  mode,
                  model: chosen,
                  retryErrors: retry,
                  economy,
                }),
              )
              if (job) onClose()
            }}
          >
            {mode === 'queue' ? 'Enviar para a fila' : 'Traduzir'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>
          {mode === 'queue'
            ? 'Envia tudo para a fila da Anthropic: metade do preço, fica pronto em até 24h (quase sempre em menos de 1h). As páginas são desenhadas sozinhas enquanto o backend estiver rodando.'
            : 'Chama a API na hora, um lote de cada vez. Mais caro, mas cada lote vê as falas traduzidas antes dele.'}
        </p>
        {config.data && !config.data.hasApiKey && (
          <Notice tone="failed">ANTHROPIC_API_KEY não está definida no .env do backend.</Notice>
        )}
        <Field
          label="Modelo"
          hint={
            models.data?.error ??
            (info?.price
              ? `US$ ${info.price.input} / US$ ${info.price.output} por milhão de tokens (entrada / saída)${mode === 'queue' ? ', metade na fila' : ''}`
              : 'Preço desconhecido para este modelo: sem estimativa de custo.')
          }
        >
          {models.data ? (
            <select className={inputClass} value={chosen} onChange={(e) => setModel(e.target.value)}>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.id === models.data?.defaultModel ? ' (padrão)' : ''}
                  {m.price ? ` · $${m.price.input}/$${m.price.output}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 text-slate-500"><Spinner /> carregando modelos…</div>
          )}
        </Field>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={economy} onChange={(e) => setEconomy(e.target.checked)} />
          <span>
            <strong>Modo econômico</strong> (recomendado)
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              O {eco?.readModel ?? 'Haiku'} lê só os recortes dos balões antes; o modelo escolhido traduz com a página
              reduzida e só os termos do glossário que aparecem. No teste do capítulo 1 custou ~70% menos, com a mesma
              qualidade nas métricas.{mode === 'queue' ? ' Na fila são dois envios: a tradução sai sozinha quando a leitura termina.' : ''}
            </span>
          </span>
        </label>
        {withErrors > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={retry} onChange={(e) => setRetry(e.target.checked)} />
            <span>Tentar de novo os lotes que falharam ({withErrors} capítulo(s) com erro)</span>
          </label>
        )}
        {unscanned > 0 && (
          <Notice tone="queued">
            {unscanned} capítulo(s) ainda não foram escaneados: o escaneamento roda antes, sem custo.
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Páginas a traduzir</div>
            <div className={cx('text-lg font-semibold tabular-nums')}>~{num(Math.round(pages))}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">Custo estimado</div>
            <div className="text-lg font-semibold tabular-nums">{cost != null ? usd(cost) : '—'}</div>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Estimativa pelo consumo medido com o Sonnet 5
          {economy
            ? ' no modo econômico (capítulo 1)'
            : ` (${tokens?.input} tokens de entrada e ${tokens?.output} de saída por página, capítulos 34–50)`}
          . Lotes já prontos ou na fila não são enviados de novo.
        </p>
      </div>
    </Dialog>
  )
}
