import { DimensionsSchema, type AnswersInput, type Asset, type CreateJobInput, type Health, type Job, type JobEvent, type ReferenceImage, type RevisionInput } from '@t3-designer/asset-schema'

/** The form displays centimetres; the API and all models use X/Y/Z metres. */
export function dimensionsFromCentimetres(values: readonly string[]): [number, number, number] | undefined {
  if (values.every(value => !value.trim())) return undefined
  if (values.length !== 3 || values.some(value => !value.trim())) throw new Error('Incomplete dimensions')
  return DimensionsSchema.parse(values.map(value => Number(value) / 100))
}

export class AssetApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AssetApiError'
    this.status = status
  }
}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal, idempotencyKey?: string): Promise<T> {
  const timeout = AbortSignal.timeout(15_000)
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('t3:session-expired'))
  if (!response.headers.get('content-type')?.includes('application/json')) throw new AssetApiError('The workshop service is unavailable. Try again later or contact the administrator.', response.status)
  const value: unknown = await response.json()
  if (!response.ok) {
    const error = value && typeof value === 'object' && 'error' in value ? value.error : undefined
    throw new AssetApiError(typeof error === 'string' ? error.slice(0, 1000) : 'The request failed', response.status)
  }
  return value as T
}

export const assetApi = {
  health: (signal?: AbortSignal) => request<Health>('/health', undefined, signal),
  jobs: (signal?: AbortSignal) => request<{ jobs: Job[] }>('/jobs', undefined, signal),
  events: (id: string, after = 0, signal?: AbortSignal) => request<{ events: JobEvent[] }>(`/jobs/${encodeURIComponent(id)}/events?after=${after}`, undefined, signal),
  assets: (signal?: AbortSignal) => request<{ assets: Asset[] }>('/assets', undefined, signal),
  create: (input: CreateJobInput, key: string = crypto.randomUUID()) => request<{ job: Job }>('/jobs', input, undefined, key),
  reference: (id: string, signal?: AbortSignal) => request<{ reference: ReferenceImage }>(`/references/${encodeURIComponent(id)}`, undefined, signal),
  uploadReference: (name: string, dataUrl: string, signal?: AbortSignal) => request<{ reference: ReferenceImage }>('/references', { name, dataUrl }, signal),
  revise: (id: string, input: RevisionInput, key: string = crypto.randomUUID()) => request<{ job: Job }>(`/assets/${encodeURIComponent(id)}/revisions`, input, undefined, key),
  cancel: (id: string) => request<{ job: Job }>(`/jobs/${encodeURIComponent(id)}/cancel`, {}),
  retry: (id: string, key: string = crypto.randomUUID()) => request<{ job: Job }>(`/jobs/${encodeURIComponent(id)}/retry`, {}, undefined, key),
  answer: (id: string, input: AnswersInput) => request<{ job: Job }>(`/jobs/${encodeURIComponent(id)}/answers`, input, undefined, crypto.randomUUID()),
}
