import { cx } from '../lib/cx'

export function AlertTriangle({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-4', className)} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" stroke={filled ? 'white' : 'currentColor'} />
      <path d="M12 17h.01" stroke={filled ? 'white' : 'currentColor'} />
    </svg>
  )
}
