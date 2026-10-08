import { useEffect, useRef } from 'react'

export const WORKFLOW_EVENT = 'mt:workflow'
export const API_KEY_EVENT = 'mt:apikey'

export interface WorkflowEvent {
  workflowId: number
  status: string
  finished?: boolean
}

export function useWorkflowEvents(onChange: (e: WorkflowEvent | null) => void) {
  const cb = useRef(onChange)
  useEffect(() => {
    cb.current = onChange
  })
  useEffect(() => {
    let missed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let last: WorkflowEvent | null = null
    const fire = (e: WorkflowEvent | null) => {
      last = e
      clearTimeout(timer)
      timer = setTimeout(() => cb.current(last), 300)
    }
    const onEvent = (ev: Event) => {
      if (document.hidden) missed = true
      else fire((ev as CustomEvent<WorkflowEvent>).detail)
    }
    const onVisible = () => {
      if (!document.hidden && missed) {
        missed = false
        fire(null)
      }
    }
    window.addEventListener(WORKFLOW_EVENT, onEvent)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(WORKFLOW_EVENT, onEvent)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
