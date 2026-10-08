import { Button } from './ui'

export function Pagination({ page, pages, total, noun, onChange }: { page: number; pages: number; total: number; noun: [string, string]; onChange: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-sm text-slate-500 dark:border-slate-800">
      <span className="tabular-nums">{total} {total === 1 ? noun[0] : noun[1]} · página {Math.min(page, pages)} de {pages}</span>
      <div className="flex gap-1">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima</Button>
      </div>
    </div>
  )
}
