import { assetDownloadUrl, assetViewUrl } from '../lib/assets'
import { cx } from '../lib/cx'

export function FileLinks({ assetId, className, label }: { assetId: string; className?: string; label?: string }) {
  const link = 'rounded px-1.5 py-0.5 font-medium text-brand hover:bg-brand/10'
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs', className)}>
      <a href={assetViewUrl(assetId)} target="_blank" rel="noreferrer" className={link} aria-label={label ? `Ver ${label}` : undefined}>
        Ver
      </a>
      <a href={assetDownloadUrl(assetId)} download className={link} aria-label={label ? `Baixar ${label}` : undefined}>
        Baixar
      </a>
    </span>
  )
}
