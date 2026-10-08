import { useEffect, useState } from 'react'
import { DISABLED_REASON, useAuth } from '../../auth/authCtx'
import { useJobs } from '../../components/jobsContext'
import { Badge, Button, Card, EmptyState, inputClass, Notice, Spinner, Tabs } from '../../components/ui'
import { num } from '../../lib/format'
import { usePolling } from '../../lib/hooks'
import { glossaryApi, type GlossaryTerm } from '../../reviewApi'

type Filter = 'all' | 'new' | 'approved'
const PAGE = 100

export function GlossaryPanel({ seriesId }: { seriesId: string }) {
  const { can } = useAuth()
  const { toast } = useJobs()
  const editable = can('glossary_edit')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [skip, setSkip] = useState(0)
  const list = usePolling(() => glossaryApi.list(seriesId, { q: query, status: filter === 'all' ? undefined : filter, skip, take: PAGE }), 0, [seriesId, query, filter, skip])
  const [adding, setAdding] = useState({ term: '', translation: '', note: '' })

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q)
      setSkip(0)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('done', ok)
      await list.reload()
      return true
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
      return false
    }
  }
  const d = list.data
  const news = d?.counts.new ?? 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs<Filter>
          value={filter}
          onChange={(f) => {
            setFilter(f)
            setSkip(0)
          }}
          tabs={[
            { value: 'all', label: `Todos (${num((d?.counts.new ?? 0) + (d?.counts.approved ?? 0))})` },
            { value: 'new', label: `Novos para revisar (${num(news)})` },
            { value: 'approved', label: `Aprovados (${num(d?.counts.approved ?? 0)})` },
          ]}
        />
        <div className="flex gap-2">
          <input className={`${inputClass} w-56`} placeholder="Buscar termo ou tradução" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar no glossário" />
          {news > 0 && (
            <Button size="sm" disabled={!editable} title={editable ? '' : DISABLED_REASON} onClick={() => confirm(`Aprovar os ${news} termos novos como estão?`) && run(() => glossaryApi.approveAll(seriesId), `${news} termos aprovados.`)}>
              Aprovar todos os novos
            </Button>
          )}
        </div>
      </div>
      {editable && (
        <Card className="flex flex-wrap items-end gap-2 p-3">
          <input className={`${inputClass} w-48 flex-1`} placeholder="Termo (como está em inglês)" value={adding.term} onChange={(e) => setAdding({ ...adding, term: e.target.value })} aria-label="Termo" />
          <input className={`${inputClass} w-48 flex-1`} placeholder="Tradução" value={adding.translation} onChange={(e) => setAdding({ ...adding, translation: e.target.value })} aria-label="Tradução" />
          <input className={`${inputClass} w-48 flex-1`} placeholder="Nota (personagem, lugar, técnica…)" value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} aria-label="Nota" />
          <Button
            variant="primary"
            disabled={!adding.term.trim() || !adding.translation.trim()}
            onClick={async () => {
              if (await run(() => glossaryApi.create(seriesId, adding), `"${adding.term}" adicionado.`)) setAdding({ term: '', translation: '', note: '' })
            }}
          >
            Adicionar
          </Button>
        </Card>
      )}
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      {!d && <EmptyState><Spinner /> Carregando…</EmptyState>}
      {d && !d.rows.length && <EmptyState>{query ? `Nada com “${query}”.` : 'Glossário vazio. Os termos aparecem conforme os capítulos são traduzidos.'}</EmptyState>}
      {d && d.rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="p-2.5">Termo</th>
                <th className="p-2.5">Tradução</th>
                <th className="p-2.5">Nota</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody>
              {d.rows.map((t) => (
                <TermRow key={t.id} t={t} editable={editable} run={run} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {d && d.total > PAGE && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}>Anteriores</Button>
          <span className="text-slate-500">{num(skip + 1)}–{num(Math.min(skip + PAGE, d.total))} de {num(d.total)}</span>
          <Button size="sm" disabled={skip + PAGE >= d.total} onClick={() => setSkip(skip + PAGE)}>Próximos</Button>
        </div>
      )}
    </div>
  )
}

function TermRow({ t, editable, run }: { t: GlossaryTerm; editable: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false)
  const [d, setD] = useState({ term: t.term, translation: t.translation, note: t.note ?? '' })
  if (edit) {
    return (
      <tr className="border-b border-slate-100 bg-brand/5 last:border-0 dark:border-slate-800/60">
        <td className="p-2"><input className={inputClass} value={d.term} onChange={(e) => setD({ ...d, term: e.target.value })} aria-label="Termo" /></td>
        <td className="p-2"><input className={inputClass} value={d.translation} onChange={(e) => setD({ ...d, translation: e.target.value })} aria-label="Tradução" autoFocus /></td>
        <td className="p-2"><input className={inputClass} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} aria-label="Nota" /></td>
        <td className="whitespace-nowrap p-2 text-right">
          <Button size="sm" variant="primary" onClick={async () => { if (await run(() => glossaryApi.update(t.id, { ...d, status: 'approved' }), 'Termo salvo.')) setEdit(false) }}>Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancelar</Button>
        </td>
      </tr>
    )
  }
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td className="p-2.5 font-medium">
        {t.term}
        {t.status === 'new' && <Badge tone="queued">novo</Badge>}
        {t.locked && <span className="ml-1 text-xs text-slate-500" title="Travado">🔒</span>}
      </td>
      <td className="p-2.5">{t.translation}</td>
      <td className="p-2.5 text-slate-500">{t.note}{t.firstChapter != null && <span className="block text-xs">desde o cap. {t.firstChapter}</span>}</td>
      <td className="whitespace-nowrap p-2.5 text-right">
        {editable && (
          <>
            {t.status === 'new' && <Button size="sm" onClick={() => run(() => glossaryApi.update(t.id, { status: 'approved' }), `"${t.term}" aprovado.`)}>Aprovar</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>Editar</Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => glossaryApi.update(t.id, { locked: !t.locked }), t.locked ? 'Destravado.' : 'Travado: não pode ser removido.')}>{t.locked ? 'Destravar' : 'Travar'}</Button>
            {!t.locked && <Button size="sm" variant="ghost" className="text-failed" onClick={() => confirm(`Remover "${t.term}" do glossário?`) && run(() => glossaryApi.remove(t.id), 'Termo removido.')}>Remover</Button>}
          </>
        )}
      </td>
    </tr>
  )
}
