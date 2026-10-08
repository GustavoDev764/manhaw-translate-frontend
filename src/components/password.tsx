import { useState } from 'react'
import { cx } from '../lib/cx'
import { generatePassword, passwordStrength } from '../lib/password'
import { inputClass } from './ui'

export function PasswordField({
  id,
  value,
  onChange,
  visible,
  onVisibleChange,
  autoComplete = 'new-password',
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  visible?: boolean
  onVisibleChange?: (v: boolean) => void
  autoComplete?: string
  placeholder?: string
}) {
  const [own, setOwn] = useState(false)
  const shown = visible ?? own
  const toggle = () => (onVisibleChange ? onVisibleChange(!shown) : setOwn(!shown))
  return (
    <span className="relative block">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        className={cx(inputClass, 'pr-10 font-mono')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={shown}
        className="absolute inset-y-0 right-1 my-auto grid h-7 w-8 place-items-center rounded text-slate-500 hover:text-brand"
      >
        {shown ? (
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            <path d="M3 3l18 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}

export function PasswordGenerator({ value, onGenerate }: { value: string; onGenerate: (pw: string) => void }) {
  const [length, setLength] = useState(16)
  const [msg, setMsg] = useState('')
  const s = passwordStrength(value)
  const gen = (len = length) => {
    onGenerate(generatePassword(len))
    setMsg('')
  }
  const copy = async () => {
    if (!value) return setMsg('Gere ou digite uma senha primeiro.')
    try {
      await navigator.clipboard.writeText(value)
      setMsg('Copiada.')
    } catch {
      setMsg('Não consegui copiar; selecione e use Ctrl+C.')
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => gen()} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-brand dark:border-slate-700 dark:bg-slate-900">
          Gerar senha
        </button>
        <button type="button" onClick={copy} className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          Copiar
        </button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-500" htmlFor="pw-len">Tamanho</label>
        <input
          id="pw-len"
          type="range"
          min={5}
          max={50}
          value={length}
          onChange={(e) => {
            const n = Number(e.target.value)
            setLength(n)
            gen(n)
          }}
          className="min-w-36 flex-1 accent-brand"
        />
        <span className="w-24 text-xs font-semibold tabular-nums">{length} caracteres</span>
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
        <span>5</span>
        <span>arraste para a esquerda diminui · para a direita aumenta</span>
        <span>50</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-500">Força</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span className={cx('block h-full', s.color)} style={{ width: `${s.pct}%` }} />
        </span>
        <b className="w-20">{s.label}</b>
      </div>
    </div>
  )
}
