import { createContext, useContext } from 'react'
import type { Job, JobStatus } from '../api'
import type { Tone } from './ui'

export interface Toast {
  id: number
  tone: 'done' | 'failed'
  text: string
}

export interface JobsContextValue {
  jobs: Job[]
  start: (run: () => Promise<Job>) => Promise<Job | null>
  openJob: (id: string | null) => void
  toast: (tone: Toast['tone'], text: string) => void
  finishedCount: number
}

export const JobsContext = createContext<JobsContextValue | null>(null)

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext)
  if (!ctx) throw new Error('useJobs fora do JobsProvider')
  return ctx
}

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  running: { label: 'Em andamento', tone: 'queued' },
  succeeded: { label: 'Concluída', tone: 'done' },
  failed: { label: 'Falhou', tone: 'failed' },
  canceled: { label: 'Cancelada', tone: 'pending' },
}
