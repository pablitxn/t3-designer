import { useMemo, useSyncExternalStore } from 'react'
import { useLocale } from '../i18n/useLocale'
import {
  parseUnitSystem, readUnitPreference, saveUnitPreference, toDisplayArea, toDisplayLength, toMeters,
  UNIT_STORAGE_KEY, type UnitSystem,
} from './units'

const subscribers = new Set<() => void>()
let preference: UnitSystem = readStoredPreference()

function readStoredPreference(): UnitSystem {
  try { return readUnitPreference(window.localStorage) } catch { return 'metric' }
}

function publish(next: UnitSystem) {
  if (next === preference) return
  preference = next
  subscribers.forEach(subscriber => subscriber())
}

function storageChanged(event: StorageEvent) {
  if (event.key !== UNIT_STORAGE_KEY && event.key !== null) return
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return
  } catch { return }
  publish(readStoredPreference())
}

function subscribe(subscriber: () => void) {
  if (subscribers.size === 0) window.addEventListener('storage', storageChanged)
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0) window.removeEventListener('storage', storageChanged)
  }
}

/** Changes presentation only; model geometry and saved projects stay in meters. */
export function setUnitPreference(next: UnitSystem): boolean {
  const system = parseUnitSystem(next)
  let saved = false
  try { saved = saveUnitPreference(window.localStorage, system) } catch { /* session-only preference */ }
  publish(system)
  return saved
}

export function useUnits() {
  const system = useSyncExternalStore(subscribe, () => preference, () => 'metric' as const)
  const { formatNumber } = useLocale()
  return useMemo(() => {
    const lengthUnit = system === 'imperial' ? 'ft' : 'm'
    const areaUnit = system === 'imperial' ? 'ft²' : 'm²'
    return {
      system,
      setSystem: setUnitPreference,
      lengthUnit,
      areaUnit,
      toDisplayLength: (meters: number) => toDisplayLength(meters, system),
      toDisplayArea: (squareMeters: number) => toDisplayArea(squareMeters, system),
      toMeters: (value: number) => toMeters(value, system),
      formatLength: (meters: number, digits = 2) => `${formatNumber(toDisplayLength(meters, system), digits)} ${lengthUnit}`,
      formatArea: (squareMeters: number, digits = 2) => `${formatNumber(toDisplayArea(squareMeters, system), digits)} ${areaUnit}`,
      formatDimensions: (meters: readonly number[], digits = 0) => `${meters.map(value => formatNumber(system === 'imperial' ? toDisplayLength(value, system) * 12 : value * 100, digits)).join(' × ')} ${system === 'imperial' ? 'in' : 'cm'}`,
    }
  }, [formatNumber, system])
}
