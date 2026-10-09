import { cx } from '../lib/cx'

export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo.svg" alt="ManhwaLab" className={cx('w-auto dark:hidden', className)} />
      <img src="/logo-dark.svg" alt="ManhwaLab" className={cx('hidden w-auto dark:block', className)} />
    </>
  )
}
