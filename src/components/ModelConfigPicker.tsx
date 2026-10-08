import { keysApi, type ModelConfig } from '../keysApi'
import { cx } from '../lib/cx'
import { usePolling } from '../lib/hooks'
import { Spinner } from './ui'

const PRESET_HELP: Record<string, string> = {
  economy: 'Mais barata. Boa para rascunho e capítulos simples.',
  balanced: 'O Haiku lê os textos e o Sonnet traduz. Melhor relação qualidade/preço.',
  top: 'O Sonnet faz tudo. Mais caro, melhor em textos difíceis.',
}

const selectClass = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950'

export function ModelConfigPicker({ value, onChange, models, disabled }: { value: ModelConfig; onChange: (config: ModelConfig) => void; models: string[]; disabled?: boolean }) {
  const presets = usePolling(keysApi.presets, 0, [])
  const list = presets.data ?? []
  const fallback = list.find((p) => p.key === 'balanced') ?? list[0]
  const options = [...new Set([...models, ...list.flatMap((p) => [p.ocr, p.translation]), value.ocr, value.translation].filter((m): m is string => !!m))].sort()
  const card = (active: boolean) => cx('rounded-xl border-2 p-3 text-left', active ? 'border-brand' : 'border-slate-200 hover:border-brand/40 dark:border-slate-800', disabled && 'cursor-not-allowed opacity-70')
  const custom = value.preset === 'custom'
  if (!presets.data) return presets.error ? <p className="text-sm text-failed">{presets.error}</p> : <Spinner />
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Combinação de modelos">
        {list.map((p) => {
          const key = p.key
          return (
            <button key={key} type="button" role="radio" aria-checked={value.preset === key} disabled={disabled} onClick={() => onChange({ preset: key })} className={card(value.preset === key)}>
              <b>{p.label}</b>
              <div className="mt-1 text-xs text-slate-500">
                OCR: {p.ocr}
                <br />
                Tradução: {p.translation}
              </div>
              {PRESET_HELP[key] && <div className="mt-2 text-xs">{PRESET_HELP[key]}</div>}
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          disabled={disabled}
          onClick={() => onChange({ preset: 'custom', ocr: value.ocr ?? fallback?.ocr, translation: value.translation ?? fallback?.translation })}
          className={card(custom)}
        >
          <b>Personalizada</b>
          <div className="mt-1 text-xs text-slate-500">Escolha um modelo para o OCR e outro para a tradução.</div>
        </button>
      </div>
      {custom && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Modelo do OCR (leitura do texto)</span>
            <select className={selectClass} value={value.ocr} disabled={disabled} onChange={(e) => onChange({ ...value, ocr: e.target.value })} aria-label="Modelo do OCR">
              {options.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Modelo da tradução</span>
            <select className={selectClass} value={value.translation} disabled={disabled} onChange={(e) => onChange({ ...value, translation: e.target.value })} aria-label="Modelo da tradução">
              {options.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

export function ModelSummary({ models }: { models: { label: string; ocr: string; translation: string } }) {
  return (
    <span className="text-xs text-slate-500">
      <b className="font-medium text-slate-700 dark:text-slate-300">{models.label}</b> · OCR {models.ocr} · tradução {models.translation}
    </span>
  )
}
