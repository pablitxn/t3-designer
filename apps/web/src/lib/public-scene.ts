import { ProjectSnapshotSchema, type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'
import referenceScene from '../../../../assets/scenes/t3-project.json?raw'
import { demoAssets } from '../data/demo-catalog'

const reference = ProjectSnapshotSchema.parse(JSON.parse(referenceScene))
export function publicScene(fixtures: Fixture[]): ProjectSnapshot {
  // Publish-time source remains immutable; public preferences cannot import private assets or architecture.
  const snapshot = { ...reference, assets: demoAssets.map(asset => ({
    ...asset,
    repoPath: reference.assets.find(item => item.id === asset.id)?.repoPath ?? `apps/web/public${asset.url}`,
  })), fixtures }
  delete snapshot.editor
  return snapshot
}
