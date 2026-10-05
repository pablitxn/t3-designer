export type UnitSystem = 'metric' | 'imperial'
export const UNIT_STORAGE_KEY = 't3-designer.units'
const METERS_PER_FOOT = 0.3048

export function parseUnitSystem(value: unknown): UnitSystem {
  return value === 'imperial' ? 'imperial' : 'metric'
}

export function toDisplayLength(meters: number, system: UnitSystem): number {
  return system === 'imperial' ? meters / METERS_PER_FOOT : meters
}

export function toMeters(value: number, system: UnitSystem): number {
  return system === 'imperial' ? value * METERS_PER_FOOT : value
}

export function toDisplayArea(squareMeters: number, system: UnitSystem): number {
  return system === 'imperial' ? squareMeters / METERS_PER_FOOT ** 2 : squareMeters
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readUnitPreference(storage: Pick<PreferenceStorage, 'getItem'>): UnitSystem {
  try { return parseUnitSystem(storage.getItem(UNIT_STORAGE_KEY)) } catch { return 'metric' }
}

export function saveUnitPreference(storage: Pick<PreferenceStorage, 'setItem'>, system: UnitSystem): boolean {
  try {
    storage.setItem(UNIT_STORAGE_KEY, system)
    return true
  } catch { return false }
}
