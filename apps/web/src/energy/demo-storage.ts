import { BuildingEnergySchema, type BuildingEnergy } from '@t3-designer/scene-schema'

export const DEMO_ENERGY_KEY = 't3-designer.building-energy.v1'
type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>
export type EnergyStorageStatus = 'default' | 'saved' | 'invalid' | 'unavailable'

/** Public demo scenarios are browser-local. Private projects never use this store. */
export function readDemoEnergy(storage: StorageReader, fallback: BuildingEnergy): { value: BuildingEnergy; status: EnergyStorageStatus } {
  try {
    const raw = storage.getItem(DEMO_ENERGY_KEY)
    if (raw === null) return { value: fallback, status: 'default' }
    const envelope: unknown = JSON.parse(raw)
    if (!envelope || typeof envelope !== 'object' || !('version' in envelope) || envelope.version !== 1 || !('value' in envelope)) {
      return { value: fallback, status: 'invalid' }
    }
    const result = BuildingEnergySchema.safeParse(envelope.value)
    return result.success && result.data.buildingId === fallback.buildingId
      ? { value: result.data, status: 'saved' }
      : { value: fallback, status: 'invalid' }
  } catch (reason) {
    return { value: fallback, status: reason instanceof SyntaxError ? 'invalid' : 'unavailable' }
  }
}

export function saveDemoEnergy(storage: StorageWriter, value: BuildingEnergy): 'saved' | 'unavailable' {
  try {
    const validated = BuildingEnergySchema.parse(value)
    storage.setItem(DEMO_ENERGY_KEY, JSON.stringify({ version: 1, value: validated }))
    return 'saved'
  } catch { return 'unavailable' }
}
