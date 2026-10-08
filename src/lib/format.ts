export const num = (v: number) => v.toLocaleString('pt-BR')

export const usd = (v: number) =>
  `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const approxUsd = (v: number) => `≈ ${usd(v)}`

export const ESTIMATE_NOTE =
  'Valor aproximado: o sistema multiplica os tokens que a Anthropic informa em cada resposta pela tabela de preços de cada modelo, com os descontos oficiais de cache e da fila em lote. A cobrança real está no Console da Anthropic e pode ser diferente (mudança de preço, uso da mesma chave fora do sistema, impostos).'

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `há ${s}s`
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${(s / 3600).toFixed(1).replace('.', ',')} h`
  return `há ${Math.round(s / 86400)} dias`
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function chaptersLabel(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b)
  if (!sorted.length) return 'nenhum capítulo'
  if (sorted.length === 1) return `cap. ${sorted[0]}`
  if (sorted.length <= 4) return `caps. ${sorted.slice(0, -1).join(', ')} e ${sorted.at(-1)}`
  const contiguous = sorted.every((n, i) => i === 0 || n - sorted[i - 1] <= 1)
  return contiguous
    ? `caps. ${sorted[0]}–${sorted.at(-1)} (${sorted.length})`
    : `${sorted.length} caps. de ${sorted[0]} a ${sorted.at(-1)}`
}

export const chapterNo = (name: string) => Number(name.replace('chapter-', ''))

export const chapterFolder = (n: number) => {
  const [int, dec] = String(n).split('.')
  return `chapter-${int.padStart(3, '0')}${dec ? `.${dec}` : ''}`
}
