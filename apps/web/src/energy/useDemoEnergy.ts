import { useState } from 'react'
import type { BuildingEnergy } from '@t3-designer/scene-schema'
import { BUILDING_SITE } from '../data/building-site'
import { createDefaultBuildingEnergy } from './model'
import { readDemoEnergy, saveDemoEnergy, type EnergyStorageStatus } from './demo-storage'

const defaults = () => createDefaultBuildingEnergy(BUILDING_SITE.targetId, BUILDING_SITE.latitude, BUILDING_SITE.longitude)
function initial() {
  const fallback = defaults()
  try { return readDemoEnergy(window.localStorage, fallback) }
  catch { return { value: fallback, status: 'unavailable' as const } }
}

/** Explicit save: exploring a scenario never silently overwrites the saved one. */
export function useDemoEnergy() {
  const [loaded] = useState(initial)
  const [value, setValue] = useState(loaded.value)
  const [saved, setSaved] = useState(loaded.value)
  const [status, setStatus] = useState<EnergyStorageStatus>(loaded.status)
  const dirty = JSON.stringify(value) !== JSON.stringify(saved)
  function save() {
    let result: 'saved' | 'unavailable'
    try { result = saveDemoEnergy(window.localStorage, value) } catch { result = 'unavailable' }
    setStatus(result)
    if (result === 'saved') setSaved(value)
  }
  function change(next: BuildingEnergy) { setValue(next) }
  return { value, change, status, dirty, save, reset: () => setValue(defaults()), revert: () => setValue(saved) }
}

export type DemoEnergy = ReturnType<typeof useDemoEnergy>
