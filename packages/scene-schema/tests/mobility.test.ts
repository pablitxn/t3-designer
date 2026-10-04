import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetSchema, FixtureSchema, getAssetMobility, getFixtureMobility, isFixtureMovable } from '@t3-designer/scene-schema'

const asset = AssetSchema.parse({ id: 'custom-chair', label: 'Chair', url: '/models/chair.glb', dimensions: [.5, .8, .5], evidence: 'Authored model', dimensionalStatus: 'estimated', mobility: 'movable' })
const fixture = FixtureSchema.parse({ id: 'chair-one', assetId: asset.id, roomId: 'living', label: 'Chair', position: [0, 0, 0], rotation: 0, evidence: 'Authored placement', placementStatus: 'estimated' })

test('mobility survives serialization and an installed fixture overrides its reusable model', () => {
  assert.equal(AssetSchema.parse(JSON.parse(JSON.stringify(asset))).mobility, 'movable')
  assert.equal(getFixtureMobility(fixture, asset), 'movable')
  assert.equal(isFixtureMovable({ ...fixture, mobility: 'fixed' }, asset), false)
  assert.equal(isFixtureMovable({ ...fixture, mobility: 'movable' }, { ...asset, mobility: 'fixed' }), true)
  assert.equal(isFixtureMovable({ ...fixture, assetId: 'toilet' }, asset), false, 'an unrelated movable model cannot unlock a fixture')
  assert.equal(FixtureSchema.safeParse({ ...fixture, mobility: 'maybe' }).success, false)
  assert.equal(AssetSchema.safeParse({ ...asset, mobility: 'unknown' }).success, false)
})

test('legacy catalog classifications do not depend on display labels or require migrating JSON', () => {
  const toilet = { ...fixture, assetId: 'toilet', label: 'Translated or renamed object' }
  const before = JSON.stringify(toilet)
  assert.equal(isFixtureMovable(toilet), false)
  assert.equal(isFixtureMovable({ ...fixture, assetId: 'fridge-freezer' }), true)
  assert.equal(isFixtureMovable({ ...fixture, assetId: 'low-table' }), true)
  assert.equal(isFixtureMovable({ ...fixture, assetId: 'washing-machine' }), false)
  assert.equal(JSON.stringify(toilet), before)
  assert.equal(FixtureSchema.parse(toilet).mobility, undefined)
})

test('unclassified models stay fixed while exact legacy private furniture routes remain usable', () => {
  assert.equal(getAssetMobility({ id: 'unknown-chair' }), 'fixed')
  assert.equal(getAssetMobility({ id: 'toString' }), 'fixed')
  const projectId = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222'
  const url = `/api/projects/${projectId}/assets/${id}/files/model.glb`
  assert.equal(getAssetMobility({ id, url }), 'movable')
  assert.equal(getAssetMobility({ id, url, mobility: 'fixed' }), 'fixed')
  assert.equal(getAssetMobility({ id: projectId, url }), 'fixed')
  assert.equal(getAssetMobility({ id, url: `${url}?token=anything` }), 'fixed')
})
