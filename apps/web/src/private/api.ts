import type { ProjectSnapshot } from '@t3-designer/scene-schema'

export type AccountUser = { id: string; name: string; email: string; role: 'user' | 'admin'; tier?: 'standard' | 'premium'; canInvite?: boolean; suspended?: boolean }
export type ProjectSummary = { id: string; name: string; notes: string; ownerId: string; role: 'owner' | 'editor' | 'viewer'; revision: number; createdAt: string; updatedAt: string }
export type Project = ProjectSummary & { scene: ProjectSnapshot }
export type ProjectMember = { userId: string; name: string; email: string; role: 'viewer' | 'editor' }
export class PrivateApiError extends Error {
  constructor(readonly status: number) { super(`Request failed (${status})`); this.name = 'PrivateApiError' }
}
export async function request<T>(path: string, options: RequestInit = {}, notifyUnauthorized = true): Promise<T> {
  const timeout = AbortSignal.timeout(15_000)
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  if (!response.ok) {
    if (response.status === 401 && notifyUnauthorized) window.dispatchEvent(new Event('t3:session-expired'))
    throw new PrivateApiError(response.status)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
export function mutate<T>(path: string, body: unknown, method = 'POST', notifyUnauthorized = true): Promise<T> {
  return request<T>(path, { method, body: JSON.stringify(body) }, notifyUnauthorized)
}
export function goTo(path: string, replace = false, force = false) {
  if (!force && !window.dispatchEvent(new CustomEvent('t3:before-navigate', { cancelable: true }))) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
