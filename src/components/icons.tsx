import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

function Icon({ className, strokeWidth = 2, children }: { className?: string; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-4', className)} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

type P = { className?: string }

export function PencilIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  )
}

export function CheckIcon({ className }: P) {
  return (
    <Icon className={className} strokeWidth={3}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

export function CursorIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M4.04 4.04 10.8 20.3l2.4-7.08 7.09-2.4L4.04 4.04Z" />
    </Icon>
  )
}

export function AreaIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M14 3h1" />
      <path d="M9 21h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M3 14v1" />
      <path d="M21 9v1" />
      <path d="M21 14v1" />
    </Icon>
  )
}

export function TextBoxIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M4 7V5h16v2" />
      <path d="M9 19h6" />
      <path d="M12 5v14" />
    </Icon>
  )
}

export function WandIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </Icon>
  )
}

export function EyeOffIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="m2 2 20 20" />
    </Icon>
  )
}

export function LayersIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="m12 2 10 5-10 5L2 7l10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </Icon>
  )
}

export function ExpandIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="m21 3-7 7" />
      <path d="m3 21 7-7" />
    </Icon>
  )
}

export function ShrinkIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="m14 10 7-7" />
      <path d="m3 21 7-7" />
    </Icon>
  )
}

export function PanelRightIcon({ className }: P) {
  return (
    <Icon className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </Icon>
  )
}

export function ChevronLeftIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function ExternalIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
  )
}

export function DownloadIcon({ className }: P) {
  return (
    <Icon className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </Icon>
  )
}
