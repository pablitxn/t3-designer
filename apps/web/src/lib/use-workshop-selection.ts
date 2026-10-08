import { useEffect, useState } from 'react'
import { AssetApiError } from './asset-api'

type Resolution<T> = { id: string; value?: T; error?: 'missing' | 'unavailable' }

/** Resolve an exact historical selection without replacing it with a recent item. */
export function useWorkshopSelection<T extends { id: string }>(id: string | null, entries: T[], load: (id: string, signal: AbortSignal) => Promise<T>, enabled: boolean, pollMs?: number) {
  const existing = entries.find(entry => entry.id === id)
  const [resolved, setResolved] = useState<Resolution<T> | null>(null)
  useEffect(() => {
    if (!id || existing || !enabled) return
    const abort = new AbortController()
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const value = await load(id, abort.signal)
        if (!abort.signal.aborted) setResolved({ id, value })
      } catch (reason) {
        if (!abort.signal.aborted) setResolved({ id, error: reason instanceof AssetApiError && [403, 404].includes(reason.status) ? 'missing' : 'unavailable' })
      } finally { pending = false }
    }
    void refresh()
    const interval = pollMs ? setInterval(() => { if (!document.hidden) void refresh() }, pollMs) : undefined
    return () => { abort.abort(); if (interval) clearInterval(interval) }
  }, [id, existing, load, enabled, pollMs])
  const result = resolved?.id === id ? resolved : null
  return { value: id ? existing ?? result?.value : entries[0], error: existing ? undefined : result?.error }
}
