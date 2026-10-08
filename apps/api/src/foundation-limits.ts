export const DEFAULT_FOUNDATION_TIMEOUT_MS = 30 * 60_000
export const MAX_FOUNDATION_TIMEOUT_MS = 2 * 60 * 60_000

/** Whole workflow deadline; individual model calls retain their own bounds. */
export function validateFoundationTimeoutMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_FOUNDATION_TIMEOUT_MS) {
    throw new Error('T3_FOUNDATION_TIMEOUT_MS debe ser un entero entre 1 ms y 2 horas.')
  }
  return value
}
