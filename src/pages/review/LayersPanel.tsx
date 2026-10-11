import { useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { FUNDO, type Layer } from './baseLayers'

function drawThumb(target: HTMLCanvasElement | null, source: HTMLCanvasElement | null) {
  if (!target || !source || !source.width || !source.height) return
  const ctx = target.getContext('2d')!
  ctx.clearRect(0, 0, target.width, target.height)
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const w = source.width * scale
  const h = source.height * scale
  ctx.drawImage(source, (target.width - w) / 2, 0, w, h)
}

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

const EYE = (
  <>
    <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
    <circle cx="12" cy="12" r="3" />
  </>
)

const ACTIONS = {
  add: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="14" height="14" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  up: <path d="m18 15-6-6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  merge: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  remove: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
}

function ActionButton({ action, label, disabled, onClick }: { action: keyof typeof ACTIONS; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded text-[#c8c8c8] hover:bg-[#3a3a3a] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">
      <Icon>{ACTIONS[action]}</Icon>
    </button>
  )
}

function Row({ selected, visible, name, thumb, locked, onSelect, onToggle, onRename }: { selected: boolean; visible: boolean; name: string; thumb: () => HTMLCanvasElement | null; locked?: boolean; onSelect: () => void; onToggle: () => void; onRename?: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <li className={cx('flex items-center gap-2 border-b border-[#232323] px-2 py-1.5', selected ? 'bg-[#3d4b63]' : 'hover:bg-[#333]')} onClick={onSelect}>
      <button
        type="button"
        aria-label={visible ? `Ocultar ${name}` : `Mostrar ${name}`}
        title={visible ? 'Ocultar camada' : 'Mostrar camada'}
        aria-pressed={visible}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={cx('grid size-6 shrink-0 place-items-center rounded hover:bg-black/20', visible ? 'text-[#e6e6e6]' : 'text-[#5a5a5a]')}
      >
        {visible ? <Icon>{EYE}</Icon> : <span className="size-4" />}
      </button>
      <canvas width={36} height={36} ref={(c) => drawThumb(c, thumb())} className={cx('size-9 shrink-0 rounded-sm border bg-[repeating-conic-gradient(#3a3a3a_0_25%,#2a2a2a_0_50%)] bg-[length:8px_8px]', selected ? 'border-white/70' : 'border-[#555]', !visible && 'opacity-40')} />
      {editing && onRename ? (
        <input
          autoFocus
          defaultValue={name}
          className="min-w-0 flex-1 rounded border border-brand bg-[#1d1d1d] px-1 py-0.5 text-xs text-white outline-none"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            onRename(e.target.value.trim() || name)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className={cx('min-w-0 flex-1 truncate text-xs', visible ? 'text-[#e6e6e6]' : 'text-[#8a8a8a]', locked && 'italic')} onDoubleClick={() => onRename && setEditing(true)} title={onRename ? 'Clique duas vezes para renomear' : undefined}>
          {name}
        </span>
      )}
      {locked && (
        <span title="Camada base: Pincel, Caneta mágica e Remover agem nela" className="text-[#8a8a8a]">
          <Icon className="size-3.5">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </Icon>
        </span>
      )}
    </li>
  )
}

export function LayersPanel({
  layers,
  activeId,
  base,
  baseVisible,
  disabled,
  onSelect,
  onToggleBase,
  onChange,
  onAdd,
  onDuplicate,
  onMove,
  onMerge,
  onRemove,
}: {
  layers: Layer[]
  activeId: string
  base: () => HTMLCanvasElement | null
  baseVisible: boolean
  disabled: boolean
  onSelect: (id: string) => void
  onToggleBase: () => void
  onChange: (id: string, patch: Partial<Pick<Layer, 'name' | 'visible' | 'opacity'>>) => void
  onAdd: () => void
  onDuplicate: () => void
  onMove: (dir: 1 | -1) => void
  onMerge: () => void
  onRemove: () => void
}) {
  const index = layers.findIndex((l) => l.id === activeId)
  const active = index >= 0 ? layers[index] : null
  return (
    <div className="text-xs">
      <div className={cx('flex items-center gap-2 px-3 py-2', !active && 'opacity-40')}>
        <span className="text-[#a8a8a8]">Opacidade</span>
        <input type="range" className="min-w-0 flex-1 accent-brand" min={0} max={100} value={Math.round((active?.opacity ?? 1) * 100)} disabled={!active} onChange={(e) => active && onChange(active.id, { opacity: Number(e.target.value) / 100 })} />
        <span className="w-9 text-right tabular-nums">{Math.round((active?.opacity ?? 1) * 100)}%</span>
      </div>
      <ul className="max-h-72 overflow-y-auto border-y border-[#1a1a1a] bg-[#262626]">
        {[...layers].reverse().map((l) => (
          <Row key={l.id} selected={l.id === activeId} visible={l.visible} name={l.name} thumb={() => l.canvas} onSelect={() => onSelect(l.id)} onToggle={() => onChange(l.id, { visible: !l.visible })} onRename={(name) => onChange(l.id, { name })} />
        ))}
        <Row selected={activeId === FUNDO} visible={baseVisible} name="Fundo" thumb={base} locked onSelect={() => onSelect(FUNDO)} onToggle={onToggleBase} />
      </ul>
      <div className="flex items-center justify-end gap-0.5 px-2 py-1">
        <ActionButton action="add" label="Nova camada de imagem: coloca uma imagem por cima" disabled={disabled} onClick={onAdd} />
        <ActionButton action="duplicate" label="Duplicar camada" disabled={disabled || !active} onClick={onDuplicate} />
        <ActionButton action="up" label="Subir camada" disabled={disabled || !active || index === layers.length - 1} onClick={() => onMove(1)} />
        <ActionButton action="down" label="Descer camada" disabled={disabled || !active || index === 0} onClick={() => onMove(-1)} />
        <ActionButton action="merge" label="Mesclar no Fundo: grava a camada na imagem base" disabled={disabled || !active} onClick={onMerge} />
        <ActionButton action="remove" label="Excluir camada" disabled={disabled || !active} onClick={onRemove} />
      </div>
      {layers.length > 0 && <p className="px-3 pb-2 text-[11px] leading-snug text-[#8a8a8a]">Pincel, Caneta mágica e Remover agem no Fundo. Ao salvar, as camadas visíveis viram uma imagem só.</p>}
    </div>
  )
}
