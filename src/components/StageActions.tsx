import type { FeatureKey } from '../adminApi'
import { DISABLED_REASON, useAuth } from '../auth/authCtx'
import { STAGE_LABEL, type LaunchType } from '../workflowsApi'
import { Button } from './ui'

const FEATURE: Record<Exclude<LaunchType, 'download'>, FeatureKey> = {
  scan: 'scan',
  translate: 'translate',
  cleanup: 'cleanup_render',
  render: 'cleanup_render',
}

export function StageActions({
  count,
  canRender,
  onLaunch,
  unit,
}: {
  count: number
  canRender: boolean
  onLaunch: (type: LaunchType) => void
  unit: string
}) {
  const { can } = useAuth()
  const stages: Exclude<LaunchType, 'download'>[] = canRender ? ['scan', 'translate', 'cleanup', 'render'] : ['scan', 'translate', 'cleanup']
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">
        {count ? `${count} ${unit}` : `Selecione ${unit}`}
      </span>
      {stages.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === 'translate' ? 'primary' : 'secondary'}
          disabled={!count || !can(FEATURE[s])}
          title={!can(FEATURE[s]) ? DISABLED_REASON : ''}
          onClick={() => onLaunch(s)}
        >
          {STAGE_LABEL[s]}
        </Button>
      ))}
    </div>
  )
}
