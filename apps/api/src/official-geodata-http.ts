/** Bounded public-data reads. Callers construct URLs from fixed authority
 * endpoints; redirects must never turn a registry lookup into another host. */
export type OfficialFetchOptions = { signal: AbortSignal; fetcher?: typeof fetch; now?: () => Date }

export async function officialJson(url: URL, options: OfficialFetchOptions): Promise<unknown> {
  options.signal.throwIfAborted()
  const response = await (options.fetcher ?? fetch)(url, {
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]), redirect: 'error', headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`La fuente oficial respondió HTTP ${response.status}.`)
  const maxBytes = 2_000_000
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw new Error('La respuesta oficial excede el tamaño máximo.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('La fuente oficial no devolvió datos.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('La respuesta oficial excede el tamaño máximo.')
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export const officialRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
