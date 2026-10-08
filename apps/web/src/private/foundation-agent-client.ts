import type { FoundationAgentRun, FoundationAgentVersion, FoundationTarget } from '@t3-designer/scene-schema'
import { request, type Project } from './api'

export type FoundationAgentHistory = { runs: FoundationAgentRun[]; versions: FoundationAgentVersion[] }
export type FoundationAgentInput = { target: FoundationTarget; revision: number; message: string; parentVersionId?: string }
const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/foundation-agent`

export function getFoundationAgentHistory(projectId: string, signal?: AbortSignal) {
  return request<FoundationAgentHistory>(base(projectId), { signal })
}
export function startFoundationAgent(projectId: string, input: FoundationAgentInput, key: string, signal?: AbortSignal) {
  return request<{ run: FoundationAgentRun }>(base(projectId), { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': key }, signal })
}
export function cancelFoundationAgent(projectId: string, runId: string, signal?: AbortSignal) {
  return request<{ run: FoundationAgentRun }>(`${base(projectId)}/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: '{}', signal })
}
export function acceptFoundationVersion(projectId: string, versionId: string, revision: number, signal?: AbortSignal) {
  return request<{ project: Project }>(`${base(projectId)}/versions/${encodeURIComponent(versionId)}/accept`, { method: 'POST', body: JSON.stringify({ revision }), signal })
}
