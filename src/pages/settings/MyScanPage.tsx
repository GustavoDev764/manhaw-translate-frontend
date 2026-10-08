import { useState } from 'react'
import { useAuth } from '../../auth/authCtx'
import { RenameScanDialog } from '../../components/RenameScanDialog'
import { Button, Card, Notice } from '../../components/ui'
import { SettingsLayout } from './SettingsLayout'

export function MyScanPage() {
  const { me, refresh } = useAuth()
  const [editing, setEditing] = useState(false)
  const scan = me?.scan ?? null

  return (
    <SettingsLayout active="scan">
      <div>
        <h1 className="text-2xl font-semibold">Minha scan</h1>
        <p className="text-sm text-slate-500">Dados da scan que aparecem para toda a equipe.</p>
      </div>
      {!scan ? (
        <Notice tone="neutral">Seu usuário não pertence a uma scan. O admin do sistema renomeia as scans em Configurações › Scans.</Notice>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Nome</div>
            <div className="text-lg font-semibold" data-testid="scan-name">{scan.name}</div>
            <div className="text-xs text-slate-500">identificador: {scan.slug}</div>
          </div>
          <Button onClick={() => setEditing(true)}>Renomear</Button>
        </Card>
      )}
      <RenameScanDialog
        key={scan?.name}
        scan={editing ? scan : null}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false)
          await refresh()
        }}
      />
    </SettingsLayout>
  )
}
