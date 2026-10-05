import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { addProjectFixture, projectModelUrl, removeProjectFixture, siteDirectionInProject, updateProjectFixture } from '../src/private/project-scene.ts'

const original = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))

test('editing an instance preserves the source template, model, project IDs and architectural/solar context', () => {
  const snapshot = structuredClone(original)
  const fixture = snapshot.fixtures[0]
  const position: [number, number, number] = [2, 1, 3]
  const edited = updateProjectFixture(snapshot, fixture.id, { position, rotation: .7, roomId: snapshot.apartment.rooms[1].id })
  ProjectSnapshotSchema.parse(edited)
  assert.notDeepEqual(edited.fixtures[0].position, fixture.position)
  assert.equal(edited.fixtures[0].id, fixture.id)
  assert.equal(edited.fixtures[0].assetId, fixture.assetId)
  assert.equal(edited.project, snapshot.project)
  assert.equal(edited.apartment, snapshot.apartment)
  assert.equal(edited.geometry, snapshot.geometry)
  assert.equal(edited.site, snapshot.site)
  assert.equal(edited.placement, snapshot.placement)
  assert.equal(edited.solar, snapshot.solar)
  assert.equal(edited.assets, snapshot.assets)
  assert.equal(edited.fixtures[1], snapshot.fixtures[1])
  position[0] = 99
  assert.equal(edited.fixtures[0].position[0], 2)
  assert.deepEqual(snapshot, original)
})

test('adding and removing placements leaves model revisions and the template intact', () => {
  const snapshot = structuredClone(original)
  const assetId = snapshot.assets[0].id
  const withObject = addProjectFixture(snapshot, assetId, 'new-instance', snapshot.apartment.rooms[1].id)
  ProjectSnapshotSchema.parse(withObject)
  assert.equal(withObject.fixtures.length, snapshot.fixtures.length + 1)
  assert.equal(withObject.fixtures.at(-1)?.assetId, assetId)
  assert.equal(withObject.fixtures.at(-1)?.roomId, snapshot.apartment.rooms[1].id)
  assert.equal(withObject.assets, snapshot.assets)
  const removed = removeProjectFixture(withObject, 'new-instance')
  assert.deepEqual(removed, snapshot)
  assert.deepEqual(snapshot, original)
  assert.throws(() => addProjectFixture(withObject, assetId, 'new-instance'))
  assert.throws(() => addProjectFixture(snapshot, 'foreign-asset', 'new-instance'))
})

test('instance edits reject invalid positions and unrelated rooms', () => {
  const id = original.fixtures[0].id
  assert.throws(() => updateProjectFixture(original, 'missing', { rotation: 0 }))
  assert.throws(() => updateProjectFixture(original, id, { position: [0, -1, 0] }))
  assert.throws(() => updateProjectFixture(original, id, { position: [Infinity, 0, 0] }))
  assert.throws(() => updateProjectFixture(original, id, { rotation: NaN }))
  assert.throws(() => updateProjectFixture(original, id, { roomId: 'foreign-room' }))
})

test('legacy scene controls respect installed objects and asset mobility', () => {
  assert.throws(() => updateProjectFixture(original, 'wc-toilet', { rotation: 1 }), /Fixed objects/)
  assert.throws(() => removeProjectFixture(original, 'wc-toilet'), /Fixed objects/)
  assert.throws(() => addProjectFixture(original, 'toilet', 'extra-toilet'), /Fixed objects/)
})

test('saved solar directions use the loaded project transform, not the demo orientation', () => {
  const scene = { placement: { ...original.placement, rotationY: Math.PI / 2, position: [100, 50, 100] as [number, number, number] } }
  const [x, y, z] = siteDirectionInProject(scene, [1, 2, 0])
  assert.ok(Math.abs(x) < 1e-10)
  assert.equal(y, 2)
  assert.ok(Math.abs(z - 1) < 1e-10)
})

test('model requests only use approved local shapes and assets scoped to the current project', () => {
  const project = '11111111-1111-4111-8111-111111111111'
  const asset = '22222222-2222-4222-8222-222222222222'
  const url = `/api/projects/${project}/assets/${asset}/files/model.glb`
  assert.equal(projectModelUrl('/models/current/fridge-freezer.glb', project), '/models/current/fridge-freezer.glb')
  assert.equal(projectModelUrl('/demo-assets/strandmon-v1/model.glb', project), '/demo-assets/strandmon-v1/model.glb')
  assert.equal(projectModelUrl(url, project), url)
  assert.equal(projectModelUrl(url, asset), null)
  for (const value of ['https://example.com/a.glb', '//example.com/a.glb', '/models/../secrets.glb', '/models/a.glb?token=x', '/api/assets/x/files/model.glb', '/models/foo.gltf', '/models/%2e%2e/a.glb']) {
    assert.equal(projectModelUrl(value, project), null, value)
  }
  for (const value of ['/demo-assets/../model.glb', '/demo-assets/strandmon-v1/model.glb?token=x', '/demo-assets/strandmon-v1/other.glb', '/demo-assets/strandmon-v1/nested/model.glb']) {
    assert.equal(projectModelUrl(value, project), null, value)
  }
})
