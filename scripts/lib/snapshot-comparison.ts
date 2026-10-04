// V8/libm can differ by a few ULPs across CPU/OS combinations. Limit tolerance
// to computed solar angles/vectors; authored geometry and time remain exact.
const computedSolarFloat = /^solar\.(?:selected|samples\.\d+)\.(?:altitude|azimuth|direction\.[0-2])$/

export function snapshotsMatch(actual: unknown, expected: unknown, path = ''): boolean {
  if (actual === expected) return true
  if (typeof actual === 'number' && typeof expected === 'number') {
    return computedSolarFloat.test(path) && Number.isFinite(actual) && Number.isFinite(expected)
      && Math.abs(actual - expected) <= 8 * Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected))
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length
      && actual.every((item, index) => snapshotsMatch(item, expected[index], `${path}.${index}`))
  }
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false
  const left = actual as Record<string, unknown>
  const right = expected as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.hasOwn(right, key) && snapshotsMatch(left[key], right[key], path ? `${path}.${key}` : key))
}
