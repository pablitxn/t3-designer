import type { TFunction } from 'i18next'

type WorkspaceT = TFunction<'workspace'>

function hasOwnKey<T extends object>(record: T, key: PropertyKey): key is keyof T {
  return Object.hasOwn(record, key)
}

const roomKeys = {
  'bedroom-1': 'rooms.bedroom-1',
  'bedroom-2': 'rooms.bedroom-2',
  living: 'rooms.living',
  entrance: 'rooms.entrance',
  wc: 'rooms.wc',
  bathroom: 'rooms.bathroom',
  kitchen: 'rooms.kitchen',
  closet: 'rooms.closet',
  balcony: 'rooms.balcony',
} as const

export type WorkspaceRoomId = keyof typeof roomKeys

export function roomLabel(t: WorkspaceT, id: string): string {
  return hasOwnKey(roomKeys, id) ? t(roomKeys[id]) : t('rooms.unknown')
}

const assetLabelKeys = {
  'fridge-freezer': 'assets.fridge-freezer.label',
  'washing-machine': 'assets.washing-machine.label',
  'oven-cooktop': 'assets.oven-cooktop.label',
  microwave: 'assets.microwave.label',
  'extractor-hood': 'assets.extractor-hood.label',
  boiler: 'assets.boiler.label',
  'base-cabinet': 'assets.base-cabinet.label',
  'sink-cabinet': 'assets.sink-cabinet.label',
  'wall-cabinet': 'assets.wall-cabinet.label',
  'bathroom-vanity': 'assets.bathroom-vanity.label',
  toilet: 'assets.toilet.label',
  radiator: 'assets.radiator.label',
  'towel-rail': 'assets.towel-rail.label',
  'glass-block-screen': 'assets.glass-block-screen.label',
  'shower-tray': 'assets.shower-tray.label',
  'electrical-panel': 'assets.electrical-panel.label',
  'low-table': 'assets.low-table.label',
  'wall-mirror': 'assets.wall-mirror.label',
} as const

const assetEvidenceKeys = {
  'fridge-freezer': 'assets.fridge-freezer.evidence',
  'washing-machine': 'assets.washing-machine.evidence',
  'oven-cooktop': 'assets.oven-cooktop.evidence',
  microwave: 'assets.microwave.evidence',
  'extractor-hood': 'assets.extractor-hood.evidence',
  boiler: 'assets.boiler.evidence',
  'base-cabinet': 'assets.base-cabinet.evidence',
  'sink-cabinet': 'assets.sink-cabinet.evidence',
  'wall-cabinet': 'assets.wall-cabinet.evidence',
  'bathroom-vanity': 'assets.bathroom-vanity.evidence',
  toilet: 'assets.toilet.evidence',
  radiator: 'assets.radiator.evidence',
  'towel-rail': 'assets.towel-rail.evidence',
  'glass-block-screen': 'assets.glass-block-screen.evidence',
  'shower-tray': 'assets.shower-tray.evidence',
  'electrical-panel': 'assets.electrical-panel.evidence',
  'low-table': 'assets.low-table.evidence',
  'wall-mirror': 'assets.wall-mirror.evidence',
} as const

export type WorkspaceAssetId = keyof typeof assetLabelKeys

export function assetLabel(t: WorkspaceT, id: string, fallback?: string): string {
  return hasOwnKey(assetLabelKeys, id) ? t(assetLabelKeys[id]) : fallback ?? t('apartment.unknownAsset')
}

export function assetEvidence(t: WorkspaceT, id: string): string {
  return hasOwnKey(assetEvidenceKeys, id) ? t(assetEvidenceKeys[id]) : ''
}
