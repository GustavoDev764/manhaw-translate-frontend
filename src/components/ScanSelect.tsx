import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScanRow } from '../adminApi'
import { cx } from '../lib/cx'
import { inputClass } from './ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ScanSelect({ scans, value, onChange, id, placeholder = 'Buscar scan…', invalid }: { scans: ScanRow[]; value: string | null; onChange: (id: string) => void; id?: string; placeholder?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const current = scans.find((s) => s.id === value)
  const options = useMemo(() => {
    const q = norm(query.trim())
    const list = [...scans].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    return q ? list.filter((s) => norm(`${s.name} ${s.slug}`).includes(q)) : list
  }, [scans, query])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const pick = (s: ScanRow | undefined) => {
    if (!s || !s.active) return
    onChange(s.id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-invalid={invalid || undefined}
        className={cx(inputClass, invalid && 'border-failed')}
        value={open ? query : current ? current.name : ''}
        placeholder={current && !open ? '' : placeholder}
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter' && open) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nenhuma scan com “{query}”.</li>}
          {options.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              aria-disabled={!s.active || undefined}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={cx('px-3 py-1.5 text-sm', s.active ? 'cursor-pointer' : 'cursor-not-allowed opacity-50', i === active && s.active && 'bg-brand/10')}
            >
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 text-xs text-slate-500">{s.active ? `${s.users} usuários · ${s.series} séries` : 'desativada'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
