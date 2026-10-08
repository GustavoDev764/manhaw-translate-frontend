import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cx } from '../lib/cx'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 border-transparent',
  secondary:
    'bg-white text-slate-800 border-slate-300 hover:border-brand hover:text-brand dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700',
  danger: 'bg-failed text-white hover:brightness-110 border-transparent',
  ghost:
    'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {children}
    </div>
  )
}

export type Tone = 'done' | 'queued' | 'failed' | 'pending' | 'neutral' | 'brand'

const TONES: Record<Tone, string> = {
  done: 'text-done border-done/50 bg-done/10',
  queued: 'text-queued border-queued/50 bg-queued/10',
  failed: 'text-failed border-failed/50 bg-failed/10',
  pending: 'text-slate-500 border-slate-300 bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:bg-slate-800',
  neutral: 'text-slate-600 border-slate-300 dark:text-slate-300 dark:border-slate-700',
  brand: 'text-brand border-brand/50 bg-brand/10',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

export interface BarPart {
  value: number
  color: string
  label: string
}

export function StatusBar({ parts, total, className }: { parts: BarPart[]; total: number; className?: string }) {
  return (
    <div className={cx('flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span
            key={p.label}
            className={cx('h-full', p.color)}
            style={{ width: `${(p.value / Math.max(total, 1)) * 100}%` }}
            title={`${p.label}: ${p.value}`}
          />
        ))}
    </div>
  )
}

export function Dot({ color }: { color: string }) {
  return <span className={cx('inline-block size-2.5 rounded-full', color)} />
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
      aria-label="carregando"
    />
  )
}

export function Stat({ label, value, sub, dot }: { label: string; value: ReactNode; sub?: ReactNode; dot?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {dot && <Dot color={dot} />}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  )
}

export function Notice({ tone = 'neutral', children }: { tone?: 'failed' | 'queued' | 'neutral'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-lg border px-3 py-2 text-sm',
        tone === 'failed' && 'border-failed/40 bg-failed/10 text-failed',
        tone === 'queued' && 'border-queued/40 bg-queued/10 text-amber-800 dark:text-queued',
        tone === 'neutral' && 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300',
      )}
    >
      {children}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
            t.value === value
              ? 'border-brand text-brand'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50',
        'dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
        wide ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <h2 className="text-base font-semibold">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
              ✕
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-950'

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{children}</div>
}
