import { useEffect, useRef, useState } from 'react'
import { type Job, type JobEvent } from '@t3-designer/asset-schema'
import { assetApi } from './asset-api'

export type ActivityConnection = 'connecting' | 'live' | 'polling' | 'offline' | 'history'
const activeStatuses = new Set<Job['status']>(['queued', 'analyzing', 'needs_input', 'generating'])

/** Persisted history first, then push updates; bounded polling survives a dropped stream. */
export function useJobActivity(job: Job) {
  const [events, setEvents] = useState<JobEvent[]>([])
  const [connection, setConnection] = useState<ActivityConnection>('connecting')
  const cursor = useRef(0)
  const jobId = useRef(job.id)
  useEffect(() => {
    const controller = new AbortController()
    let stream: EventSource | undefined
    let interval: ReturnType<typeof setInterval> | undefined
    let pending = false
    const isActive = activeStatuses.has(job.status)
    if (jobId.current !== job.id) {
      jobId.current = job.id
      cursor.current = 0
      setEvents([])
    }
    setConnection('connecting')
    function append(incoming: JobEvent[]) {
      if (controller.signal.aborted) return
      const valid = [...new Map(incoming.filter(event => event.jobId === job.id && Number.isSafeInteger(event.seq) && event.seq > cursor.current).map(event => [event.seq, event])).values()]
      if (!valid.length) return
      cursor.current = Math.max(cursor.current, ...valid.map(event => event.seq))
      setEvents(previous => [...previous, ...valid].sort((a, b) => a.seq - b.seq).slice(-500))
    }
    async function fetchEvents() {
      if (pending || controller.signal.aborted) return false
      pending = true
      try {
        const result = await assetApi.events(job.id, cursor.current, controller.signal)
        append(result.events ?? [])
        return !controller.signal.aborted
      } catch {
        if (!controller.signal.aborted) setConnection('offline')
        return false
      } finally { pending = false }
    }
    function poll() {
      stream?.close()
      if (interval || controller.signal.aborted) return
      const update = async () => { if (await fetchEvents()) setConnection(isActive ? 'polling' : 'history') }
      void update()
      interval = setInterval(() => { if (!document.hidden) void update() }, 1500)
    }
    async function start() {
      const fetched = await fetchEvents()
      if (controller.signal.aborted) return
      if (!isActive) { if (fetched) setConnection('history'); else poll(); return }
      if (!fetched || typeof EventSource === 'undefined') { poll(); return }
      stream = new EventSource(`/api/jobs/${encodeURIComponent(job.id)}/events/stream?after=${cursor.current}`)
      stream.onopen = () => { if (!controller.signal.aborted) setConnection('live') }
      stream.addEventListener('activity', event => {
        try { append([JSON.parse((event as MessageEvent<string>).data) as JobEvent]) }
        catch { poll() }
      })
      stream.onerror = poll
    }
    void start()
    return () => { controller.abort(); stream?.close(); clearInterval(interval) }
  }, [job.id, job.status])
  return { events, connection }
}
