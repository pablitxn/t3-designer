export type UsageMeasurement = 'complete' | 'partial' | 'unknown'
export type UsageStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted' | 'invalid' | 'unknown'
export type UsageOperationStatus = UsageStatus | 'needs_input'
export type UsageKind = 'asset' | 'revision' | 'apartment' | 'building' | 'project'
export type UsageTokens = {
  inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null; reasoningOutputTokens: number | null;
}
export type UsageCall = UsageTokens & {
  id: string; operationId: string; stage: 'analysis' | 'generation' | 'review' | 'correction'; iteration: number;
  provider: 'codex-local' | 'openai'; authMode: 'chatgpt' | 'api-key'; requestedModel: string | null; effectiveModel: string | null;
  startedAt: string; endedAt: string | null; durationMs: number | null; status: UsageStatus;
  measurement: UsageMeasurement; source: 'codex.turn.completed' | 'openai.responses' | null;
}
export type UsageOperation = {
  id: string; kind: UsageKind; userId: string; projectId: string | null; projectLabel: string | null;
  jobId: string | null; runId: string | null; assetId: string | null; attempt: number | null; parentId: string | null;
  createdAt: string; status: UsageOperationStatus; credits: { consumed: number; reserved: number; refunded: number; state: string };
  calls: UsageCall[];
}
export type UsageResponse = {
  totals: UsageTokens & {
    creditsConsumed: number; creditsReserved: number; creditsRefunded: number; calls: number; attempts: number;
    durationMs: number | null; measuredCalls: number; partialCalls: number; unknownCalls: number; measurement: UsageMeasurement;
  };
  operations: UsageOperation[]; projects: { id: string; label: string }[];
  pagination: { limit: number; offset: number; total: number };
}

export type UsageFilters = { from: string; to: string; projectId: string; operationType: string; provider: string; status: string }

/** Calendar dates are local dates; the API's end boundary is exclusive. */
export function usageQuery(filters: UsageFilters, offset = 0, limit = 20) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  for (const key of ['from', 'to'] as const) {
    if (!filters[key]) continue
    const date = new Date(`${filters[key]}T00:00:00`)
    if (key === 'to') date.setDate(date.getDate() + 1)
    if (!Number.isNaN(date.getTime())) query.set(key, date.toISOString())
  }
  for (const key of ['projectId', 'operationType', 'provider', 'status'] as const) if (filters[key]) query.set(key, filters[key])
  return `/api/usage?${query.toString()}`
}

export function localUsageDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function usagePeriod(period: string, now = new Date()): Pick<UsageFilters, 'from' | 'to'> {
  if (period === 'all') return { from: '', to: '' }
  const from = new Date(now)
  if (period === 'month') from.setDate(1)
  else if (period === 'last30') from.setDate(from.getDate() - 29)
  return { from: localUsageDate(from), to: localUsageDate(now) }
}

/** This only summarizes a row. Period totals always come from the server. */
export function operationTokens(calls: UsageCall[], key: 'inputTokens' | 'outputTokens') {
  const observed = calls.map(call => call[key]).filter((value): value is number => value !== null)
  return observed.length ? observed.reduce((sum, value) => sum + value, 0) : null
}

export function usageLinks(operation: Pick<UsageOperation, 'projectId' | 'jobId' | 'runId' | 'assetId'>) {
  return {
    project: operation.projectId ? `/app/projects/${encodeURIComponent(operation.projectId)}` : null,
    job: operation.jobId ? `/app/assets?jobId=${encodeURIComponent(operation.jobId)}` : operation.projectId && operation.runId ? `/app/projects/${encodeURIComponent(operation.projectId)}?runId=${encodeURIComponent(operation.runId)}#foundation-agents` : null,
    asset: operation.assetId ? `/app/assets?assetId=${encodeURIComponent(operation.assetId)}` : null,
  }
}
