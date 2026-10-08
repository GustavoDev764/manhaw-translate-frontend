import { useEffect } from 'react'
import { useJobs } from './jobsContext'
import { API_KEY_EVENT, WORKFLOW_EVENT } from '../lib/workflowEvents'

export function EventsBridge() {
  const { toast } = useJobs()
  useEffect(() => {
    const source = new EventSource('/api/events')
    const onNotification = (e: MessageEvent) => {
      const n = JSON.parse(e.data) as { title: string; body: string; severity: string }
      toast(n.severity === 'info' ? 'done' : 'failed', `${n.title}${n.body ? ` · ${n.body}` : ''}`)
    }
    const onWorkflow = (e: MessageEvent) => {
      window.dispatchEvent(new CustomEvent(WORKFLOW_EVENT, { detail: JSON.parse(e.data) }))
    }
    const onKey = () => window.dispatchEvent(new Event(API_KEY_EVENT))
    source.addEventListener('notification', onNotification)
    source.addEventListener('workflow.updated', onWorkflow)
    source.addEventListener('api_key.changed', onKey)
    return () => source.close()
  }, [toast])
  return null
}
