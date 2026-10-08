import { useState } from 'react'
import { useJobs } from '../../components/jobsContext'
import { Button, Dialog, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { num } from '../../lib/format'
import { libraryApi } from '../../workflowsApi'

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ')
const deletePhrase = (title: string) => `${normalize(title)} excluir`

export function RenameSeriesDialog({ open, series, onClose, onSaved }: { open: boolean; series: { id: string; title: string }; onClose: () => void; onSaved: () => void }) {
  const { toast } = useJobs()
  const [title, setTitle] = useState(series.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = normalize(title)

  const close = () => {
    setTitle(series.title)
    setError(null)
    onClose()
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await libraryApi.renameSeries(series.id, clean)
      toast('done', `Título alterado para “${clean}”.`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Editar título"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" type="submit" form="rename-series" disabled={busy || !clean || clean === series.title}>
            {busy ? <Spinner /> : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="rename-series" onSubmit={save} className="space-y-3">
        <Field label="Título" hint="O endereço da série não muda; só o nome exibido.">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </Field>
        {error && <Notice tone="failed">{error}</Notice>}
      </form>
    </Dialog>
  )
}

export function DeleteSeriesDialog({ open, series, chapters, pages, onClose, onDeleted }: { open: boolean; series: { id: string; title: string }; chapters: number; pages: number; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useJobs()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phrase = deletePhrase(series.title)
  const matches = normalize(typed).toLowerCase() === phrase.toLowerCase()

  const close = () => {
    setTyped('')
    setError(null)
    onClose()
  }

  const remove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!matches) return
    setBusy(true)
    setError(null)
    try {
      const r = await libraryApi.deleteSeries(series.id, typed)
      toast('done', `${series.title} excluído: ${num(r.chapters)} capítulos e ${num(r.pages)} páginas. Os arquivos são apagados em segundo plano.`)
      setTyped('')
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Excluir manhwa"
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="danger" type="submit" form="delete-series" disabled={busy || !matches}>
            {busy ? <Spinner /> : 'Excluir de vez'}
          </Button>
        </>
      }
    >
      <form id="delete-series" onSubmit={remove} className="space-y-4">
        <Notice tone="failed">
          Esta ação não tem volta. Serão apagados <b>{series.title}</b>, {num(chapters)} capítulos, {num(pages)} páginas, todas as versões das imagens, o glossário e os workflows desta série, junto com os arquivos no armazenamento.
        </Notice>
        <div className="space-y-1">
          <label htmlFor="delete-series-confirm" className="text-sm">
            Para confirmar, digite <b className="select-all font-mono">{phrase}</b>
          </label>
          <input id="delete-series-confirm" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus placeholder={phrase} />
        </div>
        {error && <Notice tone="failed">{error}</Notice>}
      </form>
    </Dialog>
  )
}
