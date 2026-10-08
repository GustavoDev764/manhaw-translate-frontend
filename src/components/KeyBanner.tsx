import { useEffect, useState } from 'react'
import { useAuth } from '../auth/authCtx'
import { href } from '../lib/hooks'
import { keysApi, type KeyStatus } from '../keysApi'
import { API_KEY_EVENT } from '../lib/workflowEvents'
import { Button, Dialog } from './ui'

export function KeyBanner() {
  const { me } = useAuth()
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [details, setDetails] = useState(false)
  const scanned = !!me?.scan

  useEffect(() => {
    if (!scanned) return
    const load = () => keysApi.status().then(setStatus, () => undefined)
    const first = setTimeout(load, 0)
    window.addEventListener(API_KEY_EVENT, load)
    return () => {
      clearTimeout(first)
      window.removeEventListener(API_KEY_EVENT, load)
    }
  }, [scanned])

  if (!me?.scan || !status || status.ok) return null
  const admin = me.role === 'scan_admin'
  return (
    <>
      <div role="alert" className="sticky top-0 z-30 bg-failed text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm">
          <span className="flex-1">
            <b>Scan {me.scan.name}:</b> você não tem configuração de API key.{' '}
            {admin ? 'Para configurar, clique aqui.' : 'Avise o admin da sua scan.'}
            {status.pausedItems ? ` ${status.pausedItems} ${status.pausedItems === 1 ? 'item está pausado' : 'itens estão pausados'}.` : ''}
          </span>
          {admin && (
            <a href={href('settings', 'api-key')} className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-failed hover:bg-white/90">
              Clique aqui
            </a>
          )}
          <button type="button" onClick={() => setDetails(true)} className="rounded-md border border-white/60 px-3 py-1 text-xs font-semibold hover:bg-white/10">
            Mais detalhes
          </button>
        </div>
      </div>
      <Dialog
        open={details}
        onClose={() => setDetails(false)}
        title="Scan sem API key"
        footer={
          <>
            <Button onClick={() => setDetails(false)}>Fechar</Button>
            {admin && (
              <a href={href('settings', 'api-key')} onClick={() => setDetails(false)}>
                <Button variant="primary">Configurar agora</Button>
              </a>
            )}
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Sem uma API key da Anthropic (Claude), a sua scan não consegue usar a IA:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>o OCR (leitura do texto dos balões) e a tradução não serão executados;</li>
            <li>as correções de área com o Claude ficam indisponíveis;</li>
            <li>os workflows que precisam da API ficam <b>pausados</b> até a chave ser inserida, e continuam sozinhos depois.</li>
          </ul>
          <p className="text-slate-500">Baixar, escanear, limpar balões e editar texto continuam funcionando.</p>
          {!admin && <p>Só o admin da scan pode cadastrar a chave.</p>}
        </div>
      </Dialog>
    </>
  )
}
