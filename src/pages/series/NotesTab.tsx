import { useMemo, useState } from 'react'
import { api, imageUrl, type LocalChapter, type Note, type NoteKind } from '../../api'
import { Button, Card, EmptyState, Notice, Spinner } from '../../components/ui'
import { cx } from '../../lib/cx'
import { ago, chapterNo } from '../../lib/format'
import { href, navigate, usePolling } from '../../lib/hooks'
import { byPosition, KIND_ORDER, NOTE_KINDS } from '../../lib/notes'

type Show = 'open' | 'resolved' | 'all'

export function NotesTab({ slug, chapters }: { slug: string; chapters: LocalChapter[] }) {
  const { data, error, reload } = usePolling(() => api.notes(slug), 30000, [slug])
  const [show, setShow] = useState<Show>('open')
  const [kinds, setKinds] = useState<Set<NoteKind>>(new Set(KIND_ORDER))
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const notes = useMemo(() => [...(data ?? [])].sort(byPosition), [data])
  const list = notes.filter(
    (n) =>
      kinds.has(n.kind) &&
      (show === 'all' || (show === 'open' ? !n.resolvedAt : Boolean(n.resolvedAt))),
  )
  const groups = useMemo(() => {
    const m = new Map<string, Note[]>()
    for (const n of list) m.set(n.chapter, [...(m.get(n.chapter) ?? []), n])
    return [...m]
  }, [list])
  const open = notes.filter((n) => !n.resolvedAt)
  const countOf = (k: NoteKind) => open.filter((n) => n.kind === k).length

  const firstRead = chapters.find((c) => c.done > 0)?.name

  const resolve = async (n: Note) => {
    setBusy(n.id)
    setActionError(null)
    try {
      await api.editNote(slug, n.chapter, n.id, { resolved: !n.resolvedAt })
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {KIND_ORDER.map((k) => {
            const on = kinds.has(k)
            return (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setKinds((s) => {
                    const next = new Set(s)
                    if (on) next.delete(k)
                    else next.add(k)
                    return next.size ? next : new Set(KIND_ORDER)
                  })
                }
                className={cx(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  on ? NOTE_KINDS[k].chip : 'border-slate-200 text-slate-400 dark:border-slate-700',
                )}
              >
                {NOTE_KINDS[k].label} ({countOf(k)})
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          {(
            [
              ['open', `Abertas (${open.length})`],
              ['resolved', `Resolvidas (${notes.length - open.length})`],
              ['all', 'Todas'],
            ] as [Show, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setShow(v)}
              className={cx(
                'rounded-md px-2.5 py-1 text-xs font-medium',
                show === v
                  ? 'bg-brand text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {firstRead && (
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            onClick={() => navigate(href('series', slug, 'read', firstRead))}
          >
            Ler o manhwa
          </Button>
        )}
      </Card>

      {(error || actionError) && <Notice tone="failed">{error ?? actionError}</Notice>}
      {!data && !error && (
        <EmptyState>
          <Spinner /> Carregando…
        </EmptyState>
      )}
      {data && !list.length && (
        <EmptyState>
          {notes.length
            ? 'Nenhuma anotação com esses filtros.'
            : 'Nenhuma anotação ainda. Abra um capítulo no leitor, ligue “Anotar” e clique no ponto da página com problema.'}
        </EmptyState>
      )}

      {groups.map(([chapter, items]) => (
        <Card key={chapter} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <strong className="text-sm">Capítulo {chapterNo(chapter)}</strong>
            <a href={href('series', slug, 'read', chapter)} className="text-xs font-medium text-brand hover:underline">
              Ler capítulo →
            </a>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 p-3">
                <a
                  href={href('series', slug, 'read', chapter, n.id)}
                  className="relative h-28 w-40 shrink-0 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800"
                  title="Abrir no leitor"
                >
                  <img
                    src={imageUrl('translated', slug, chapter, n.page)}
                    alt=""
                    loading="lazy"
                    className="absolute top-1/2 left-1/2 max-w-none"
                    style={{ width: 480, transform: `translate(-${n.x * 100}%, -${n.y * 100}%)` }}
                  />
                  <span
                    className={cx(
                      'absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white',
                      NOTE_KINDS[n.kind].pin,
                    )}
                  />
                </a>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cx('rounded-full border px-2 py-0.5 font-medium', NOTE_KINDS[n.kind].chip)}>
                      {NOTE_KINDS[n.kind].label}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      pág. {n.page.replace(/\.\w+$/, '')} · {ago(n.createdAt)}
                      {n.resolvedAt && ` · resolvida ${ago(n.resolvedAt)}`}
                    </span>
                  </div>
                  <p className={cx('text-sm break-words', n.resolvedAt && 'line-through opacity-60')}>
                    {n.comment || <em className="text-slate-400">sem comentário</em>}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => navigate(href('series', slug, 'read', chapter, n.id))}>
                      Abrir no leitor
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === n.id} onClick={() => resolve(n)}>
                      {n.resolvedAt ? 'Reabrir' : '✓ Resolvida'}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
