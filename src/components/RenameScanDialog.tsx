import { useState } from 'react'
import { adminApi } from '../adminApi'
import { useJobs } from './jobsContext'
import { Button, Dialog, Field, inputClass, Notice, Spinner } from './ui'

export function RenameScanDialog({ scan, onClose, onSaved }: { scan: { id: string; name: string; slug: string } | null; onClose: () => void; onSaved: (name: string) => void }) {
  const { toast } = useJobs()
  const [name, setName] = useState(scan?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = name.trim().replace(/\s+/g, ' ')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scan) return
    setBusy(true)
    setError(null)
    try {
      const r = await adminApi.renameScan(scan.id, clean)
      toast('done', `Scan renomeada para “${r.name}”.`)
      onSaved(r.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!scan}
      onClose={onClose}
      title="Renomear scan"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rename-scan" disabled={busy || !clean || clean === scan?.name}>
            {busy ? <Spinner /> : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="rename-scan" onSubmit={save} className="space-y-3">
        <Field label="Nome da scan" hint={`O identificador (${scan?.slug ?? ''}) não muda: ele é usado nos endereços e arquivos.`}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        </Field>
        {error && <Notice tone="failed">{error}</Notice>}
      </form>
    </Dialog>
  )
}
