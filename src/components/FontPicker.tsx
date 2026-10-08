import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../lib/cx'
import { loadFont, type FontRow } from '../reviewApi'
import { inputClass } from './ui'

export function FontPicker({ fonts, value, onChange, id }: { fonts: FontRow[]; value: string | null; onChange: (id: string | null) => void; id?: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const current = fonts.find((f) => f.id === value)
  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list: (FontRow | null)[] = [null, ...fonts]
    return q ? list.filter((f) => (f ? `${f.family} ${f.style}` : 'padrão comic neue').toLowerCase().includes(q)) : list
  }, [fonts, query])

  useEffect(() => {
    if (!open) return
    for (const f of options) if (f) void loadFont(f)
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, options])

  const pick = (f: FontRow | null) => {
    onChange(f?.id ?? null)
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
        className={inputClass}
        value={open ? query : current ? `${current.family} · ${current.style}` : 'Padrão (Comic Neue)'}
        placeholder="Buscar fonte…"
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
          else if (e.key === 'Enter' && options[active] !== undefined) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nenhuma fonte com “{query}”.</li>}
          {options.map((f, i) => (
            <li
              key={f?.id ?? 'default'}
              role="option"
              aria-selected={(f?.id ?? null) === value}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(f)
              }}
              onMouseEnter={() => setActive(i)}
              className={cx('cursor-pointer px-3 py-1.5', i === active && 'bg-brand/10')}
            >
              <span className="block text-base" style={{ fontFamily: f ? `"mt-${f.id}", sans-serif` : '"Comic Neue", "Comic Sans MS", sans-serif' }}>
                {f ? f.family : 'Padrão (Comic Neue)'}
              </span>
              {f && <span className="text-xs text-slate-500">{f.style}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
