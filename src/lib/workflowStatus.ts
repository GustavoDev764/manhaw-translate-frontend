import type { Tone } from '../components/ui'
import type { WorkflowStatus } from '../workflowsApi'

export const WF_STATUS: Record<WorkflowStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Na fila', tone: 'pending' },
  running: { label: 'Em andamento', tone: 'queued' },
  succeeded: { label: 'Concluído', tone: 'done' },
  failed: { label: 'Falhou', tone: 'failed' },
  partial: { label: 'Concluído com pendências', tone: 'failed' },
  canceled: { label: 'Cancelado', tone: 'pending' },
}
