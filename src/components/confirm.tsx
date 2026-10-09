import { useCallback, useState, type ReactNode } from 'react'

import { Button, Dialog } from './ui'

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...options, resolve })), [])
  const close = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }
  const dialog = (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      title={state?.title ?? ''}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} autoFocus onClick={() => close(true)}>
            {state?.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">{state?.message}</div>
    </Dialog>
  )
  return [ask, dialog] as const
}
