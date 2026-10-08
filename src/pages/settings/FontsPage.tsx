import { useEffect, useMemo, useRef, useState } from 'react'
import { FileLinks } from '../../components/FileLinks'
import { useJobs } from '../../components/jobsContext'
import { Badge, Button, Card, EmptyState, Field, inputClass, Notice, Spinner } from '../../components/ui'
import { when } from '../../lib/format'
import { usePolling } from '../../lib/hooks'
import { loadFont, reviewApi, type FontNameCheck } from '../../reviewApi'
import { SettingsLayout } from './SettingsLayout'

interface Picked {
  file: File
  family: string | null
  style: string | null
  problem: string | null
  state: 'ready' | 'sending' | 'done' | 'failed'
  error?: string
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Não consegui ler o arquivo.'))
    r.readAsDataURL(file)
  })
}

export function FontsPage() {
  const { toast } = useJobs()
  const list = usePolling(reviewApi.fonts, 0, [])
  const rules = usePolling(reviewApi.fontRules, 0, [])
  const [picked, setPicked] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [sample, setSample] = useState('Ei! O que você pensa que está fazendo?!')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    for (const f of list.data ?? []) void loadFont(f)
  }, [list.data])

  const existing = useMemo(() => new Set((list.data ?? []).map((f) => `${f.family}|${f.style}`.toLowerCase())), [list.data])

  const choose = async (files: File[]) => {
    if (!files.length) return
    let checks: FontNameCheck[]
    try {
      checks = await reviewApi.checkFontNames(files.map((f) => f.name))
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
      return
    }
    const maxBytes = rules.data?.maxBytes ?? 0
    const seen = new Set<string>()
    setPicked(
      files.map((file, i) => {
        const check = checks[i]
        const parsed = check?.ok ? check : null
        const key = parsed ? `${parsed.family}|${parsed.style}`.toLowerCase() : ''
        const problem = !parsed
          ? (check && !check.ok ? check.error : 'Não consegui validar o nome.')
          : maxBytes && file.size > maxBytes
            ? `Arquivo maior que ${Math.round(maxBytes / 1024 / 1024)} MB.`
            : existing.has(key)
              ? `Já existe a fonte ${parsed.family} (${parsed.style}).`
              : seen.has(key)
                ? 'Arquivo repetido nesta seleção.'
                : null
        seen.add(key)
        return { file, family: parsed?.family ?? null, style: parsed?.style ?? null, problem, state: 'ready' }
      }),
    )
  }

  const valid = picked.filter((p) => !p.problem && p.state !== 'done')

  const upload = async () => {
    setBusy(true)
    let ok = 0
    let failed = 0
    for (const p of valid) {
      setPicked((all) => all.map((x) => (x.file === p.file ? { ...x, state: 'sending' } : x)))
      try {
        await reviewApi.uploadFont({ fileName: p.file.name, data: await readBase64(p.file) })
        ok++
        setPicked((all) => all.map((x) => (x.file === p.file ? { ...x, state: 'done' } : x)))
      } catch (err) {
        failed++
        setPicked((all) => all.map((x) => (x.file === p.file ? { ...x, state: 'failed', error: err instanceof Error ? err.message : String(err) } : x)))
      }
    }
    setBusy(false)
    await list.reload()
    toast(failed ? 'failed' : 'done', `${ok} ${ok === 1 ? 'fonte importada' : 'fontes importadas'}${failed ? `, ${failed} com erro` : ''}.`)
  }

  return (
    <SettingsLayout active="fonts">
      <div>
        <h1 className="text-2xl font-semibold">Fontes</h1>
        <p className="text-sm text-slate-500">Fontes para as caixas de texto da revisão. Valem para todas as scans.</p>
      </div>
      <Card className="space-y-3 p-4">
        {rules.data && <Notice tone="neutral">{rules.data.rule}</Notice>}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            multiple
            accept={(rules.data?.extensions ?? []).map((e) => `.${e}`).join(',')}
            className="hidden"
            data-testid="font-input"
            onChange={(e) => {
              void choose(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <Button onClick={() => input.current?.click()} disabled={busy}>Escolher arquivos</Button>
          <Button variant="primary" disabled={busy || !valid.length} onClick={upload}>
            {busy ? <Spinner /> : `Importar ${valid.length} ${valid.length === 1 ? 'fonte' : 'fontes'}`}
          </Button>
          {picked.length > 0 && !busy && <Button variant="ghost" onClick={() => setPicked([])}>Limpar lista</Button>}
        </div>
        {picked.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {picked.map((p) => (
              <li key={p.file.name + p.file.size} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-testid="font-row">
                <span className="font-mono text-xs">{p.file.name}</span>
                {p.family && <span className="text-slate-500">→ {p.family} · {p.style}</span>}
                <span className="ml-auto">
                  {p.problem ? (
                    <Badge tone="failed">{p.problem}</Badge>
                  ) : p.state === 'done' ? (
                    <Badge tone="done">importada</Badge>
                  ) : p.state === 'failed' ? (
                    <Badge tone="failed">{p.error}</Badge>
                  ) : p.state === 'sending' ? (
                    <Spinner />
                  ) : (
                    <Badge tone="neutral">pronta para importar</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Field label="Texto de exemplo"><input className={inputClass} value={sample} onChange={(e) => setSample(e.target.value)} /></Field>
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      {!list.data && <EmptyState><Spinner /> Carregando…</EmptyState>}
      {list.data && !list.data.length && <EmptyState>Nenhuma fonte importada. Sem elas, as caixas usam a Comic Neue.</EmptyState>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.data?.map((f) => (
          <Card key={f.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <b>{f.family}</b> <span className="text-xs text-slate-500">{f.style} · .{f.format} · {when(f.uploadedAt)}</span>
              </div>
              <span className="flex items-center gap-1">
                <FileLinks assetId={f.assetId} label={`fonte ${f.family}`} />
                <Button size="sm" variant="ghost" className="text-failed" onClick={async () => {
                  if (!confirm(`Remover a fonte ${f.family} (${f.style})?`)) return
                  try {
                    await reviewApi.removeFont(f.id)
                    toast('done', 'Fonte removida.')
                    await list.reload()
                  } catch (err) {
                    toast('failed', err instanceof Error ? err.message : String(err))
                  }
                }}>Remover</Button>
              </span>
            </div>
            <p className="break-words text-2xl" style={{ fontFamily: `"mt-${f.id}", sans-serif` }}>{sample}</p>
          </Card>
        ))}
      </div>
    </SettingsLayout>
  )
}
