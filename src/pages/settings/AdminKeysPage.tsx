import { useState } from 'react'
import { useJobs } from '../../components/jobsContext'
import { Badge, Button, Card, EmptyState, Field, inputClass, Notice, Spinner, Tabs } from '../../components/ui'
import { approxUsd, ESTIMATE_NOTE, num, usd } from '../../lib/format'
import { href, usePolling } from '../../lib/hooks'
import { ModelSummary } from '../../components/ModelConfigPicker'
import { keysApi, type KeyRule } from '../../keysApi'
import { SettingsLayout } from './SettingsLayout'

const RULE_LABEL: Record<KeyRule, string> = { inherit: 'Padrão', allow: 'Liberada', block: 'Bloqueada' }
const SOURCE_LABEL = { own: 'chave própria', admin: 'chave do admin', env: '.env', none: 'sem chave' } as const
type Tab = 'keys' | 'scans' | 'spend'
const selectClass = 'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-950'

export function AdminKeysPage() {
  const [tab, setTab] = useState<Tab>('keys')
  return (
    <SettingsLayout active="api-keys">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-sm text-slate-500">Suas chaves da Anthropic, quais scans podem usá-las e quanto cada uma gastou. As scans nunca veem as suas chaves.</p>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'keys', label: 'Chaves' },
          { value: 'scans', label: 'Scans' },
          { value: 'spend', label: 'Gastos (estimados)' },
        ]}
      />
      {tab === 'keys' && <KeysTab />}
      {tab === 'scans' && <ScansTab />}
      {tab === 'spend' && <SpendTab />}
    </SettingsLayout>
  )
}

function KeysTab() {
  const { toast } = useJobs()
  const list = usePolling(keysApi.list, 0, [])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('done', ok)
      await list.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <a href={href('settings', 'api-keys', 'new')}>
          <Button variant="primary">Adicionar chave</Button>
        </a>
      </div>
      {list.error && <Notice tone="failed">{list.error}</Notice>}
      {!list.data && <EmptyState><Spinner /> Carregando…</EmptyState>}
      {list.data && !list.data.length && <EmptyState>Nenhuma chave cadastrada. Use “Adicionar chave”.</EmptyState>}
      {list.data?.map((k) => (
        <Card key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <div className="min-w-48 flex-1">
            <div className="flex items-center gap-2">
              <b>{k.name}</b>
              {k.isDefault && <Badge tone="brand">padrão</Badge>}
              {!k.active && <Badge tone="pending">desativada</Badge>}
            </div>
            <div className="font-mono text-xs text-slate-500">sk-ant-…{k.last4}</div>
            <div className="mt-1"><ModelSummary models={k.models} /></div>
          </div>
          <div className="text-sm">
            <div title={ESTIMATE_NOTE}>{approxUsd(k.spentMonthUsd)} <span className="text-xs text-slate-500">no mês (estimado){k.monthlyAlertUsd ? ` · alerta em ${usd(k.monthlyAlertUsd)}` : ''}</span></div>
            <div className="text-xs text-slate-500">{approxUsd(k.spentUsd)} no total (estimado) · {k.scans} scans atribuídas</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => act(() => keysApi.test(k.id), 'Chave OK: a Anthropic respondeu.')}>Testar</Button>
            {!k.isDefault && <Button size="sm" variant="ghost" onClick={() => act(() => keysApi.setDefaults({ defaultKeyId: k.id }), `"${k.name}" é a padrão agora.`)}>Tornar padrão</Button>}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                act(async () => {
                  const { key } = await keysApi.value(k.id)
                  await navigator.clipboard.writeText(key)
                }, `Chave "${k.name}" copiada.`)
              }
            >
              Copiar chave
            </Button>
            <a href={href('settings', 'api-keys', k.id)}>
              <Button size="sm" variant="ghost">Editar</Button>
            </a>
            <Button size="sm" variant="ghost" onClick={() => act(() => keysApi.update(k.id, { active: !k.active }), k.active ? 'Chave desativada.' : 'Chave ativada.')}>{k.active ? 'Desativar' : 'Ativar'}</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function ScansTab() {
  const { toast } = useJobs()
  const sharing = usePolling(keysApi.sharing, 0, [])
  const keys = usePolling(keysApi.list, 0, [])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [rule, setRule] = useState<KeyRule | ''>('')
  const [keyId, setKeyId] = useState<string>('keep')
  const d = sharing.data
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('done', ok)
      await sharing.reload()
    } catch (err) {
      toast('failed', err instanceof Error ? err.message : String(err))
    }
  }
  const applyBulk = () =>
    act(
      () => keysApi.setSharing({ scanIds: [...picked], ...(rule ? { rule } : {}), ...(keyId !== 'keep' ? { keyId: keyId === 'default' ? null : keyId } : {}) }),
      `${picked.size} scans atualizadas.`,
    ).then(() => setPicked(new Set()))
  if (!d) return <EmptyState><Spinner /> Carregando…</EmptyState>
  const all = d.scans.length > 0 && picked.size === d.scans.length
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand" checked={d.allowAll} onChange={(e) => act(() => keysApi.setDefaults({ allowAll: e.target.checked }), e.target.checked ? 'Todas as scans (padrão) podem usar suas chaves.' : 'Só as scans liberadas usam suas chaves.')} />
          <span>
            <b>Padrão: liberar para todas as scans</b>
            <span className="block text-xs text-slate-500">Vale para as scans com a regra “Padrão”.</span>
          </span>
        </label>
      </Card>
      <Card className="sticky top-14 z-10 flex flex-wrap items-center gap-2 p-3">
        <span className="text-sm text-slate-500">{picked.size ? `${picked.size} selecionadas` : 'Selecione scans para editar em massa'}</span>
        <select className={selectClass} value={rule} onChange={(e) => setRule(e.target.value as KeyRule | '')} aria-label="Regra">
          <option value="">Regra: manter</option>
          <option value="inherit">Padrão</option>
          <option value="allow">Liberar</option>
          <option value="block">Bloquear</option>
        </select>
        <select className={selectClass} value={keyId} onChange={(e) => setKeyId(e.target.value)} aria-label="Chave">
          <option value="keep">Chave: manter</option>
          <option value="default">Chave padrão</option>
          {keys.data?.filter((k) => k.active).map((k) => <option key={k.id} value={k.id}>{k.name} (…{k.last4})</option>)}
        </select>
        <Button size="sm" variant="primary" disabled={!picked.size || (!rule && keyId === 'keep')} onClick={applyBulk}>Aplicar</Button>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="w-10 p-3"><input type="checkbox" className="accent-brand" checked={all} onChange={() => setPicked(all ? new Set() : new Set(d.scans.map((s) => s.scanId)))} aria-label="Selecionar todas" /></th>
              <th className="p-3">Scan</th>
              <th className="p-3">Regra</th>
              <th className="p-3">Chave atribuída</th>
              <th className="p-3">Em uso agora</th>
            </tr>
          </thead>
          <tbody>
            {d.scans.map((s) => (
              <tr key={s.scanId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                <td className="p-3">
                  <input type="checkbox" className="accent-brand" checked={picked.has(s.scanId)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(s.scanId)) n.delete(s.scanId); else n.add(s.scanId); return n })} aria-label={`Selecionar ${s.name}`} />
                </td>
                <td className="p-3 font-medium">{s.name}{!s.active && <span className="ml-1 text-xs text-slate-500">(desativada)</span>}</td>
                <td className="p-3">{RULE_LABEL[s.rule]}</td>
                <td className="p-3">{s.keyId ? keys.data?.find((k) => k.id === s.keyId)?.name ?? '—' : <span className="text-slate-500">padrão</span>}</td>
                <td className="p-3">
                  <Badge tone={s.effective.source === 'none' ? 'failed' : s.effective.source === 'own' ? 'brand' : 'done'}>{SOURCE_LABEL[s.effective.source]}</Badge>
                  {s.effective.keyName && <span className="ml-1 text-xs text-slate-500">{s.effective.keyName}</span>}
                  {s.ownKey && s.effective.source !== 'own' && <span className="ml-1 text-xs text-slate-500">(tem própria {s.ownKey})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function SpendTab() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const [from, setFrom] = useState(first)
  const [to, setTo] = useState('')
  const report = usePolling(() => keysApi.spend(from, to ? new Date(new Date(to).getTime() + 86_400_000).toISOString().slice(0, 10) : undefined), 0, [from, to])
  const total = report.data?.keys.reduce((s, k) => s + k.costUsd, 0) ?? 0
  return (
    <div className="space-y-3">
      <Notice tone="neutral">{ESTIMATE_NOTE}</Notice>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="De"><input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-500">Total estimado no período</div>
          <div className="text-2xl font-semibold" data-testid="spend-total">{approxUsd(total)}</div>
        </div>
      </Card>
      {report.error && <Notice tone="failed">{report.error}</Notice>}
      {report.data && !report.data.keys.length && <EmptyState>Nenhum gasto no período.</EmptyState>}
      {report.data?.keys.map((k) => (
        <Card key={k.key} className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <b>{k.key}</b>
            <span className="text-lg font-semibold">{approxUsd(k.costUsd)}</span>
          </div>
          <div className="text-xs text-slate-500">{num(k.items)} itens · {num(k.inputTokens)} tokens de entrada · {num(k.outputTokens)} de saída</div>
          <div className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {k.scans.map((s) => (
              <div key={s.scan} className="flex justify-between py-1">
                <span>{s.scan}</span>
                <span className="tabular-nums">{approxUsd(s.costUsd)}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
