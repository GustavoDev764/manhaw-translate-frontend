import { useId, useMemo, useRef, useState } from 'react'
import { ROLE_LABEL, type Role } from '../adminApi'
import { cx } from '../lib/cx'
import { inputClass } from './ui'

export interface ComboUser {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? norm(text).indexOf(norm(q)) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-queued/35 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function UserCombobox({
  users,
  exclude,
  onPick,
  placeholder = 'Adicionar membro: buscar por nome ou e-mail',
  inline,
}: {
  users: ComboUser[]
  exclude: string[]
  onPick: (id: string) => void
  placeholder?: string
  inline?: boolean
}) {
  const id = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  const avail = useMemo(() => users.filter((u) => !exclude.includes(u.id)), [users, exclude])
  const shown = useMemo(() => avail.filter((u) => !q || norm(u.name).includes(norm(q)) || norm(u.email).includes(norm(q))), [avail, q])

  const pick = (i: number) => {
    const u = shown[i]
    if (!u || !u.active) return
    onPick(u.id)
    setQ('')
    setCur(-1)
    input.current?.focus()
  }

  return (
    <div className="relative">
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-lb`}
        aria-autocomplete="list"
        aria-activedescendant={cur > -1 ? `${id}-o${cur}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClass}
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value)
          setCur(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setCur((c) => Math.min(shown.length - 1, c + 1)); setOpen(true); e.preventDefault() }
          else if (e.key === 'ArrowUp') { setCur((c) => Math.max(0, c - 1)); e.preventDefault() }
          else if (e.key === 'Enter') { e.preventDefault(); if (cur > -1) pick(cur) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul
          id={`${id}-lb`}
          role="listbox"
          aria-label="Usuários da scan"
          className={cx(
            'z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900',
            inline ? 'relative' : 'absolute inset-x-0 shadow-xl',
          )}
        >
          {shown.length ? (
            shown.map((u, i) => (
              <li
                key={u.id}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={i === cur}
                aria-disabled={!u.active}
                onPointerDown={(e) => {
                  e.preventDefault()
                  pick(i)
                }}
                className={cx(
                  'grid cursor-pointer grid-cols-[30px_1fr_auto] items-center gap-2.5 rounded-md px-2.5 py-2',
                  i === cur && 'bg-brand/10',
                  !u.active && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="grid size-7 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                  {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold"><Mark text={u.name} q={q} /></span>
                  <span className="block truncate text-xs text-slate-500"><Mark text={u.email} q={q} /></span>
                </span>
                <span className={cx('rounded-full border px-2 py-0.5 text-[11px]', !u.active ? 'border-failed/50 text-failed' : u.role === 'scan_admin' ? 'border-queued/50 text-queued' : 'border-slate-300 text-slate-500')}>
                  {u.active ? ROLE_LABEL[u.role] : 'desativado'}
                </span>
              </li>
            ))
          ) : (
            <li className="px-2.5 py-2 text-xs text-slate-500">
              {avail.length ? 'Ninguém da scan com esse nome ou e-mail.' : 'Todas as pessoas da scan já estão aqui.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
