import { useMemo, useState } from 'react'
import { api, type Pace, type SeriesDetail, type SiteChapter } from '../../api'
import { ChapterSelector, type SelectableChapter } from '../../components/ChapterSelector'
import { useJobs } from '../../components/jobsContext'
import { Button, Card, Dialog, Dot, EmptyState, Field, inputClass, Notice } from '../../components/ui'
import { ago, chaptersLabel, duration } from '../../lib/format'
import { usePolling } from '../../lib/hooks'

const PACE_LABEL: Record<string, string> = {
  normal: 'Normal: ~3 s entre capítulos',
  careful: 'Cuidadosa: ~10 s entre capítulos, pausa de 2 min a cada 25',
  blocksOfFive: 'Em blocos de 5: ~15 s entre capítulos, pausa de 1 min a cada 5',
  veryCareful: 'Muito cuidadosa: ~20 s entre capítulos, pausa de 5 min a cada 15',
}

const suggestedPace = (count: number) => (count > 50 ? 'veryCareful' : count > 10 ? 'careful' : 'normal')

function waitMs(count: number, pace: Pace): number {
  const rests = pace.restEvery ? Math.floor(count / pace.restEvery) : 0
  return count * pace.chapterDelayMs + rests * pace.restMs
}

const groupFor = (c: SiteChapter, group: string | null) =>
  group && c.groups.includes(group) ? group : c.group

export function DownloadTab({ series, onChanged }: { series: SeriesDetail; onChanged: () => void }) {
  const { start, toast } = useJobs()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [group, setGroup] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'download' | 'delete' | null>(null)
  const chapters = series.siteChapters

  const groups = useMemo(() => {
    const by = new Map<string, number[]>()
    for (const c of chapters) for (const g of c.groups) by.set(g, [...(by.get(g) ?? []), c.number])
    return [...by].sort((a, b) => b[1].length - a[1].length)
  }, [chapters])

  const items: SelectableChapter[] = chapters.map((c) => {
    const shown = c.downloaded ? c.downloadedGroup : groupFor(c, group)
    const others = c.groups.filter((g) => g !== shown)
    return {
      number: c.number,
      mark: c.downloaded ? '✓' : '',
      title:
        `Capítulo ${c.number}: ${c.downloaded ? 'baixado' : 'falta'} · ${shown ?? 'sem grupo'}` +
        (others.length ? `\nTambém: ${others.join(', ')}` : ''),
      barTotal: 1,
      bar: [{ value: 1, color: c.downloaded ? 'bg-done' : 'bg-pending', label: c.downloaded ? 'Baixado' : 'Falta' }],
    }
  })
  const missing = chapters.filter((c) => !c.downloaded).map((c) => c.number)
  const downloaded = chapters.filter((c) => c.downloaded).map((c) => c.number)
  const picked = chapters.filter((c) => selected.has(c.number))

  if (!series.url) {
    return <EmptyState>Não sei o link deste manhwa no site: adicione-o pela lista de manhwas.</EmptyState>
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="font-medium">Lista do site</div>
          <div className="text-slate-500 dark:text-slate-400">
            {series.site
              ? `${chapters.length} capítulos, ${downloaded.length} baixados, ${missing.length} faltando · lida ${ago(series.site.listedAt)}`
              : 'Ainda não lida: busque a lista para ver os capítulos.'}
            {' · '}
            <a className="text-brand underline" href={series.url} target="_blank" rel="noreferrer">
              abrir no site
            </a>
          </div>
        </div>
        {groups.length > 1 && (
          <div className="w-full sm:w-80">
            <Field label="Grupo de scan" hint="Capítulos que ele não tem seguem o padrão do .env.">
              <select
                className={inputClass}
                value={group ?? ''}
                onChange={(e) => setGroup(e.target.value || null)}
              >
                <option value="">Padrão do .env</option>
                {groups.map(([g, ns]) => (
                  <option key={g} value={g}>
                    {g} ({ns.length === 1 ? `só o cap. ${ns[0]}` : `${ns.length} caps., ${ns[0]} a ${ns.at(-1)}`})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Button
          onClick={() => start(() => api.refreshList(series.slug))}
          title="Lê a lista inteira de novo no site; leva alguns minutos"
        >
          Buscar capítulos novos
        </Button>
      </Card>

      {chapters.length ? (
        <Card className="p-4">
          <div className="mb-3 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><Dot color="bg-done" /> baixado</span>
            <span className="flex items-center gap-1.5"><Dot color="bg-pending" /> falta</span>
          </div>
          <ChapterSelector
            items={items}
            selected={selected}
            onChange={setSelected}
            presets={[
              { label: 'Os que faltam', numbers: missing },
              { label: 'Todos', numbers: chapters.map((c) => c.number) },
            ]}
          />
        </Card>
      ) : (
        <EmptyState>Nenhum capítulo na lista salva. Clique em "Buscar capítulos novos".</EmptyState>
      )}

      <div className="sticky bottom-4 z-10">
        <Card className="flex flex-wrap items-center gap-2 p-3 shadow-lg">
          <span className="mr-auto text-sm">
            {selected.size ? (
              <>
                <strong>{chaptersLabel([...selected])}</strong>
                <span className="text-slate-500 dark:text-slate-400">
                  {' '}· {picked.filter((c) => !c.downloaded).length} faltando, {picked.filter((c) => c.downloaded).length} já baixados
                </span>
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">Selecione capítulos para baixar ou apagar</span>
            )}
          </span>
          <Button
            variant="danger"
            disabled={!picked.some((c) => c.downloaded)}
            onClick={() => setDialog('delete')}
          >
            Apagar baixados
          </Button>
          <Button variant="primary" disabled={!selected.size} onClick={() => setDialog('download')}>
            Baixar
          </Button>
        </Card>
      </div>

      <DownloadDialog
        open={dialog === 'download'}
        onClose={() => setDialog(null)}
        series={series}
        chapters={picked}
        group={group}
      />
      <DeleteDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        series={series}
        numbers={picked.filter((c) => c.downloaded).map((c) => c.number)}
        onDeleted={(n) => {
          toast('done', `Apagado: ${chaptersLabel(n)}`)
          setSelected(new Set())
          onChanged()
        }}
      />
    </div>
  )
}

function DownloadDialog({
  open,
  onClose,
  series,
  chapters,
  group,
}: {
  open: boolean
  onClose: () => void
  series: SeriesDetail
  chapters: SiteChapter[]
  group: string | null
}) {
  const { start } = useJobs()
  const config = usePolling(api.config, 0, [])
  const [redownload, setRedownload] = useState(false)
  const [paceKey, setPaceKey] = useState<string | null>(null)
  const already = chapters.filter((c) => c.downloaded)
  const todo = redownload ? chapters : chapters.filter((c) => !c.downloaded)
  const pace = paceKey ?? suggestedPace(todo.length)
  const paceInfo = config.data?.paces.find((p) => p.key === pace)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Baixar capítulos"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!todo.length}
            onClick={async () => {
              const job = await start(() =>
                api.download(series.slug, {
                  chapters: todo.map((c) => c.number),
                  group,
                  pace,
                  redownload,
                }),
              )
              if (job) onClose()
            }}
          >
            Baixar {todo.length ? chaptersLabel(todo.map((c) => c.number)) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>
          Salva em <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">downloads/{series.slug}</code>
          {group ? `, preferindo ${group}` : ', com o grupo padrão do .env'}.
        </p>
        {already.length > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={redownload} onChange={(e) => setRedownload(e.target.checked)} />
            <span>
              Baixar de novo os {already.length} já baixados ({chaptersLabel(already.map((c) => c.number))})
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Apaga a cópia atual de cada um antes. Sem marcar, eles são pulados.
              </span>
            </span>
          </label>
        )}
        {todo.length > 1 && config.data && (
          <Field label="Velocidade" hint="Muitos capítulos seguidos podem bloquear o IP: vá mais devagar.">
            <select className={inputClass} value={pace} onChange={(e) => setPaceKey(e.target.value)}>
              {config.data.paces.map((p) => (
                <option key={p.key} value={p.key}>
                  {PACE_LABEL[p.key] ?? p.key}
                  {p.key === suggestedPace(todo.length) ? ' (recomendado)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {todo.length ? (
          paceInfo && todo.length > 1 && <Notice>Só de pausas: ~{duration(waitMs(todo.length, paceInfo))}, mais o tempo de baixar as imagens.</Notice>
        ) : (
          <Notice tone="queued">Todos os selecionados já estão baixados.</Notice>
        )}
      </div>
    </Dialog>
  )
}

function DeleteDialog({
  open,
  onClose,
  series,
  numbers,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  series: SeriesDetail
  numbers: number[]
  onDeleted: (n: number[]) => void
}) {
  const { toast } = useJobs()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const word = 'APAGAR'

  return (
    <Dialog
      open={open}
      onClose={() => {
        setTyped('')
        onClose()
      }}
      title="Apagar capítulos baixados"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={typed !== word || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.deleteChapters(series.slug, numbers)
                onDeleted(numbers)
                setTyped('')
                onClose()
              } catch (err) {
                toast('failed', err instanceof Error ? err.message : String(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Apagar {chaptersLabel(numbers)}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <Notice tone="failed">
          As imagens de {chaptersLabel(numbers)} saem de <strong>downloads/{series.slug}</strong> e não dá para desfazer.
          As traduções em translated/ não são apagadas.
        </Notice>
        <Field label={`Digite ${word} para confirmar`}>
          <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Dialog>
  )
}
