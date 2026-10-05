import { polygonCentroid } from '@t3-designer/geometry'
import { getAssetMobility, isFixtureMovable, type Fixture, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { addFixture, removeFixture, updateFixture } from '../editor/model.ts'

export type FixtureEdit = Pick<Fixture, 'position' | 'rotation' | 'roomId'>

/** A scene edit changes instances, never a shared model or the source template. */
export function updateProjectFixture(snapshot: ProjectSnapshot, fixtureId: string, patch: Partial<FixtureEdit>): ProjectSnapshot {
  if (snapshot.editor) return updateFixture(snapshot, fixtureId, patch)
  const original = snapshot.fixtures.find(fixture => fixture.id === fixtureId)
  if (!original) throw new Error('Unknown object')
  if (!isFixtureMovable(original, snapshot.assets.find(asset => asset.id === original.assetId))) throw new Error('Fixed objects cannot be rearranged')
  if (patch.position && (!patch.position.every(Number.isFinite) || patch.position[1] < 0)) throw new Error('Invalid position')
  if (patch.rotation !== undefined && !Number.isFinite(patch.rotation)) throw new Error('Invalid rotation')
  if (patch.roomId !== undefined && !snapshot.apartment.rooms.some(room => room.id === patch.roomId)) throw new Error('Unknown room')
  return { ...snapshot, fixtures: snapshot.fixtures.map(fixture => fixture.id === fixtureId
    ? { ...fixture, ...patch, ...(patch.position ? { position: [...patch.position] as Fixture['position'] } : {}) }
    : fixture) }
}

export function removeProjectFixture(snapshot: ProjectSnapshot, fixtureId: string): ProjectSnapshot {
  if (snapshot.editor) return removeFixture(snapshot, fixtureId)
  const original = snapshot.fixtures.find(fixture => fixture.id === fixtureId)
  if (!original) throw new Error('Unknown object')
  if (!isFixtureMovable(original, snapshot.assets.find(asset => asset.id === original.assetId))) throw new Error('Fixed objects cannot be rearranged')
  return { ...snapshot, fixtures: snapshot.fixtures.filter(fixture => fixture.id !== fixtureId) }
}

export function addProjectFixture(snapshot: ProjectSnapshot, assetId: string, fixtureId: string, roomId = snapshot.apartment.rooms[0].id): ProjectSnapshot {
  if (snapshot.editor) return addFixture(snapshot, assetId, fixtureId, roomId)
  const asset = snapshot.assets.find(item => item.id === assetId)
  const room = snapshot.apartment.rooms.find(item => item.id === roomId)
  if (!asset || !room || !fixtureId || snapshot.fixtures.some(item => item.id === fixtureId)) throw new Error('Invalid object instance')
  if (getAssetMobility(asset) !== 'movable') throw new Error('Fixed objects cannot be added as furniture')
  const [x, z] = polygonCentroid(room.polygon)
  const fixture: Fixture = {
    id: fixtureId, assetId, roomId, label: asset.label, position: [x, .015, z], rotation: 0,
    evidence: asset.evidence, placementStatus: 'estimated', mobility: getAssetMobility(asset),
  }
  return { ...snapshot, fixtures: [...snapshot.fixtures, fixture] }
}

/** Inverse of the persisted local-to-site rigid transform. No T3 globals. */
export function siteDirectionInProject(snapshot: Pick<ProjectSnapshot, 'placement'>, direction: readonly [number, number, number]): [number, number, number] {
  const c = Math.cos(snapshot.placement.rotationY), s = Math.sin(snapshot.placement.rotationY)
  return [c * direction[0] - s * direction[2], direction[1], s * direction[0] + c * direction[2]]
}

/** The renderer never turns an arbitrary scene URL into a browser request. */
export function projectModelUrl(url: string, projectId: string): string | null {
  if (/^\/models\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.glb$/.test(url)) return url
  if (/^\/demo-assets\/[a-zA-Z0-9_-]+-v\d+\/model\.glb$/.test(url)) return url
  const privateModel = /^\/api\/projects\/([a-f0-9-]{36})\/assets\/([a-f0-9-]{36})\/files\/model\.glb$/.exec(url)
  if (privateModel?.[1] === projectId) return url
  return null
}
