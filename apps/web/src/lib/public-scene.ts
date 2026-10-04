import { ProjectSnapshotSchema, type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'
import referenceScene from '../../../../assets/scenes/t3-project.json?raw'
import { assetCatalog } from '../data/current-state'

const reference = ProjectSnapshotSchema.parse(JSON.parse(referenceScene))
export function publicScene(fixtures: Fixture[]): ProjectSnapshot {
  // Publish-time source remains immutable; public preferences cannot import private assets or architecture.
  const snapshot = { ...reference, assets: reference.assets.map(asset => ({ ...asset, ...assetCatalog.find(item => item.id === asset.id) })), fixtures }
  delete snapshot.editor
  return snapshot
}
