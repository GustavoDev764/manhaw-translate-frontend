import { useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Button, inputClass, StatusBar, type BarPart } from './ui'

export interface SelectableChapter {
  number: number
  title: string
  mark?: ReactNode
  bar: BarPart[]
  barTotal: number
}

export interface Preset {
  label: string
  numbers: number[]
}

export function ChapterSelector({
  items,
  selected,
  onChange,
  presets,
  onOpen,
}: {
  items: SelectableChapter[]
  selected: Set<number>
  onChange: (next: Set<number>) => void
  presets: Preset[]
  onOpen?: (n: number) => void
}) {
  const numbers = useMemo(() => items.map((i) => i.number), [items])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const last = useRef<number | null>(null)

  const toggle = (n: number, shift: boolean) => {
    const next = new Set(selected)
    if (shift && last.current !== null) {
      const [a, b] = [last.current, n].sort((x, y) => x - y)
      const add = !selected.has(n)
      for (const m of numbers) {
        if (m < a || m > b) continue
        if (add) next.add(m)
        else next.delete(m)
      }
    } else if (next.has(n)) next.delete(n)
    else next.add(n)
    last.current = n
    onChange(next)
  }

  const applyRange = () => {
    const a = Number(from || numbers[0])
    const b = Number(to || numbers.at(-1))
    onChange(new Set([...selected, ...numbers.filter((n) => n >= a && n <= b)]))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Button
            key={p.label}
            size="sm"
            disabled={!p.numbers.length}
            onClick={() => onChange(new Set(p.numbers))}
          >
            {p.label} ({p.numbers.length})
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => onChange(new Set())}>
          Limpar seleção
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-sm">
          <span className="text-slate-500 dark:text-slate-400">de</span>
          <input
            className={cx(inputClass.replace('w-full', ''), 'w-20')}
            inputMode="decimal"
            placeholder={String(numbers[0] ?? '')}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span className="text-slate-500 dark:text-slate-400">até</span>
          <input
            className={cx(inputClass.replace('w-full', ''), 'w-20')}
            inputMode="decimal"
            placeholder={String(numbers.at(-1) ?? '')}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyRange()}
          />
          <Button size="sm" className="whitespace-nowrap" onClick={applyRange} disabled={!numbers.length}>
            Adicionar intervalo
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1.5">
        {items.map((c) => {
          const on = selected.has(c.number)
          return (
            <button
              key={c.number}
              type="button"
              title={c.title + (onOpen ? '\nDuplo clique: ver as páginas' : '')}
              onClick={(e) => toggle(c.number, e.shiftKey)}
              onDoubleClick={() => onOpen?.(c.number)}
              aria-pressed={on}
              className={cx(
                'rounded-md border px-1.5 pt-1 pb-1.5 text-left text-xs tabular-nums transition select-none',
                on
                  ? 'border-brand bg-brand/10 ring-1 ring-brand'
                  : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600',
              )}
            >
              <div className="mb-1 flex justify-between">
                <span className={cx(on && 'font-semibold text-brand')}>{c.number}</span>
                <span className="text-slate-400">{c.mark}</span>
              </div>
              <StatusBar parts={c.bar} total={c.barTotal} className="h-1.5" />
            </button>
          )
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Clique para marcar · Shift+clique marca um intervalo
        {onOpen ? ' · Duplo clique abre as páginas' : ''}
      </p>
    </div>
  )
}
