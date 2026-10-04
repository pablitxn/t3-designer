import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonCentroid, wallLength } from '@t3-designer/geometry'
import { ProjectSnapshotSchema, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { addFixture, addPartition, duplicateArchitecture, duplicateFixture, duplicateLayout, ensureEditor, getActiveArchitecture, getActiveLayout, pointInPolygon, rebuildApartmentGeometry, removeFixture, removePartition, renameArchitecture, renameLayout, rotateFixture, selectArchitecture, selectLayout, syncActiveScene, updateFixture, type EditorSnapshot } from '../src/editor/model.ts'

const baseline = buildProjectSnapshot()
const originalArchitecture = 'architecture-original', originalLayout = 'layout-original'
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen) }
  return value
}
function scene() { return structuredClone(baseline) }
function bedroomPosition(snapshot: ProjectSnapshot): [number, number, number] {
  const [x, z] = polygonCentroid(snapshot.apartment.rooms.find(room => room.id === 'bedroom-1')!.polygon)
  return [x, 0, z]
}
function partition(snapshot: ProjectSnapshot, id = 'dressing-divider') {
  const [x, , z] = bedroomPosition(snapshot)
  return { id, from: [x - .5, z] as [number, number], to: [x + .5, z] as [number, number], height: 2.4, thickness: .1 }
}

test('legacy snapshots acquire a deterministic optional editor without altering the source scene', () => {
  const input = frozen(scene()), serialized = JSON.stringify(input)
  const next = ensureEditor(input)
  assert.equal(input.editor, undefined)
  assert.equal(JSON.stringify(input), serialized)
  assert.deepEqual(next.apartment, input.apartment)
  assert.deepEqual(next.fixtures, input.fixtures)
  assert.deepEqual(next.geometry, input.geometry)
  assert.equal(next.assets, input.assets)
  assert.equal(getActiveArchitecture(next).id, originalArchitecture)
  assert.equal(getActiveLayout(next).id, originalLayout)
  assert.deepEqual(ensureEditor(input), next)
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(serialized)), input)
})

test('furniture alternatives stay isolated when switching and reloading a saved snapshot', () => {
  const input = frozen(ensureEditor(scene()))
  let next = duplicateLayout(input, 'three-items', '  Three items  ')
  next = addFixture(next, 'fridge-freezer', 'new-fridge', 'bedroom-1')
  next = updateFixture(next, 'new-fridge', { position: bedroomPosition(next), rotation: Math.PI / 2 })
  next = removeFixture(next, 'k-fridge')
  const editedFixtures = structuredClone(next.fixtures)
  assert.equal(getActiveLayout(next).name, 'Three items')
  assert.equal(next.assets, input.assets, 'placement edits retain the pinned catalogue')
  assert.equal(next.geometry, input.geometry, 'furniture does not rebuild architecture')
  next = selectLayout(next, originalLayout)
  assert.deepEqual(next.fixtures, input.fixtures)
  next = ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(next))) as EditorSnapshot
  next = selectLayout(next, 'three-items')
  assert.deepEqual(next.fixtures, editedFixtures)
  assert.deepEqual(getActiveLayout(input).fixtures, baseline.fixtures)
})

test('private generated assets retain their exact pinned URL across placement, variants and saved reloads', () => {
  const projectId = 'ae280d8b-2082-49b6-8a45-a5649fda1145', assetId = 'ae280d8b-2082-49b6-8a45-a5649fda1146'
  const input = scene()
  input.project.id = projectId
  const generated = { ...input.assets.find(asset => asset.id === 'low-table')!, id: assetId, label: 'Generated dressing cabinet', url: `/api/projects/${projectId}/assets/${assetId}/files/model.glb`, repoPath: `private/${assetId}/model.glb` }
  input.assets.push(generated)
  const original = frozen(input)
  let next = ensureEditor(original)
  next = addFixture(next, assetId, 'generated-cabinet', 'bedroom-1')
  next = duplicateLayout(next, 'three-cabinets', 'Three cabinets')
  next = duplicateFixture(next, 'generated-cabinet', 'generated-copy')
  const position = bedroomPosition(next)
  position[0] += .3
  next = updateFixture(next, 'generated-copy', { position, rotation: Math.PI / 2 })
  next = duplicateArchitecture(next, 'dressing', 'Dressing room')
  next = addPartition(next, partition(next))
  next = selectArchitecture(next, originalArchitecture)
  next = selectLayout(next, originalLayout)
  assert.equal(next.fixtures.filter(fixture => fixture.assetId === assetId).length, 1)
  const reloaded = ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(next)))
  next = selectArchitecture(reloaded, 'dressing')
  assert.equal(getActiveLayout(next).id, 'three-cabinets')
  assert.deepEqual(next.fixtures.find(fixture => fixture.id === 'generated-copy')!.position, position)
  assert.equal(next.fixtures.filter(fixture => fixture.assetId === assetId).length, 2)
  assert.deepEqual(next.assets.find(asset => asset.id === assetId), generated)
  assert.equal(next.assets.filter(asset => asset.id === assetId).length, 1, 'layouts share one pinned model')
  assert.deepEqual(original.assets.find(asset => asset.id === assetId), generated)
  assert.equal(original.fixtures.some(fixture => fixture.assetId === assetId), false)
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(next))), next)
  const otherId = 'ae280d8b-2082-49b6-8a45-a5649fda1147'
  for (const url of [
    `/api/projects/${otherId}/assets/${assetId}/files/model.glb`,
    `/api/projects/${projectId}/assets/${otherId}/files/model.glb`,
  ]) {
    const mismatched = structuredClone(next)
    mismatched.assets.find(asset => asset.id === assetId)!.url = url
    const parsed = ProjectSnapshotSchema.safeParse(mismatched)
    assert.equal(parsed.success, false, 'valid URL syntax still needs to match the pinned asset and project')
    if (!parsed.success) assert.ok(parsed.error.issues.some(issue => issue.message === 'Private model URL must match its project and asset IDs'))
  }
  const serverCandidate = structuredClone(next)
  serverCandidate.assets.find(asset => asset.id === assetId)!.url = `/models/__private/${assetId}.glb`
  assert.equal(ProjectSnapshotSchema.safeParse(serverCandidate).success, true, 'backend grant-checked placeholders remain compatible')
})

test('unplaced catalogue assets may be taller than this apartment without blocking a save', () => {
  const input = scene()
  input.assets.push({ ...input.assets[0], id: 'tall-catalogue-model', dimensions: [1, 12, 1] })
  const next = ensureEditor(input)
  assert.equal(ProjectSnapshotSchema.safeParse(next).success, true)
  assert.throws(() => addFixture(next, 'tall-catalogue-model', 'too-tall', 'bedroom-1'), /above the ceiling/)
})

test('architectural copies keep all furniture alternatives and their own active layout', () => {
  let next = duplicateLayout(scene(), 'alternative', 'Alternative')
  const source = frozen(next)
  next = duplicateArchitecture(source, 'with-dressing', 'With dressing room')
  assert.equal(getActiveArchitecture(next).layouts.length, 2)
  assert.notEqual(getActiveArchitecture(next).apartment, getActiveArchitecture(source).apartment)
  next = addPartition(next, partition(next))
  next = addFixture(next, 'low-table', 'dressing-table', 'bedroom-1')
  next = selectLayout(next, originalLayout)
  assert.ok(!next.fixtures.some(fixture => fixture.id === 'dressing-table'))
  assert.ok(next.apartment.walls.some(wall => wall.id === 'dressing-divider'), 'both furniture layouts share their variant walls')
  next = selectArchitecture(next, originalArchitecture)
  assert.equal(getActiveLayout(next).id, 'alternative')
  assert.deepEqual(next.apartment, source.apartment)
  assert.deepEqual(next.fixtures, source.fixtures)
  next = selectArchitecture(next, 'with-dressing')
  assert.equal(getActiveLayout(next).id, originalLayout)
  assert.ok(next.geometry.walls.some(wall => wall.wallId === 'dressing-divider'))
})

test('partitions rebuild valid exported solids and only authored partitions are removable', () => {
  const source = frozen(ensureEditor(scene())), wall = partition(source)
  let next = addPartition(source, wall)
  const added = next.apartment.walls.find(item => item.id === wall.id)!
  assert.equal(added.kind, 'interior')
  assert.equal(added.estimated, true)
  assert.deepEqual(next.apartment.metadata, source.apartment.metadata, 'reported areas and evidence remain source values')
  assert.deepEqual(next.apartment.rooms, source.apartment.rooms)
  const solids = next.geometry.walls.find(item => item.wallId === wall.id)!.solids
  const volume = solids.reduce((sum, solid) => sum + solid.scale[0] * solid.scale[1] * solid.scale[2], 0)
  assert.ok(Math.abs(volume - wallLength(wall) * wall.height * wall.thickness) < 1e-8)
  assert.deepEqual(rebuildApartmentGeometry(source), source.geometry, 'rebuilding retains doorway/window apertures')
  assert.throws(() => removePartition(next, 'bedroom-divider'), /Only editor partitions/)
  next = removePartition(next, wall.id)
  assert.deepEqual(next.apartment, source.apartment)
  assert.deepEqual(next.geometry, source.geometry)
  assert.equal(ProjectSnapshotSchema.safeParse(next).success, true)
})

test('new partitions reject non-finite, out-of-plan, tiny and conflicting geometry', () => {
  const source = ensureEditor(scene()), wall = partition(source)
  for (const invalid of [
    { ...wall, from: [NaN, 1] as [number, number] },
    { ...wall, to: [100, 100] as [number, number] },
    { ...wall, to: wall.from },
    { ...wall, height: 10 },
    { ...wall, thickness: .001 },
    { ...wall, id: source.apartment.walls[0].id },
  ]) assert.throws(() => addPartition(source, invalid))
  const bedroom = source.apartment.rooms.find(room => room.id === 'bedroom-1')!
  const minX = Math.min(...bedroom.polygon.map(point => point[0]))
  assert.throws(() => addPartition(source, { ...wall, from: [minX + .01, .01], to: [.01, 3.6] }), /inside the apartment/, 'endpoints inside a concave plan cannot bridge an exterior notch')
})

test('furniture moves update room membership, normalize turns, and reject invalid placement', () => {
  const source = frozen(ensureEditor(scene()))
  const next = updateFixture(source, 'k-fridge', { position: bedroomPosition(source) })
  assert.equal(next.fixtures.find(item => item.id === 'k-fridge')!.roomId, 'bedroom-1')
  const rotated = rotateFixture(next, 'k-fridge', 3 * Math.PI)
  assert.equal(rotated.fixtures.find(item => item.id === 'k-fridge')!.rotation, 0)
  assert.deepEqual(source.fixtures, baseline.fixtures)
  for (const patch of [
    { position: [NaN, 0, 1] as [number, number, number] },
    { position: [1, -1, 1] as [number, number, number] },
    { position: [100, 0, 100] as [number, number, number] },
    { position: [bedroomPosition(source)[0], 2, 1] as [number, number, number] },
    { roomId: 'missing' }, { rotation: Infinity }, { label: ' ' },
  ]) assert.throws(() => updateFixture(source, 'k-fridge', patch))
  assert.throws(() => updateFixture(source, 'missing', { rotation: 0 }), /Unknown object/)
})

test('object copies and removal affect only their selected layout and never assets', () => {
  const source = frozen(ensureEditor(scene()))
  const duplicated = duplicateFixture(source, 'k-fridge', 'fridge-copy')
  const first = duplicated.fixtures.find(item => item.id === 'k-fridge')!, second = duplicated.fixtures.find(item => item.id === 'fridge-copy')!
  assert.deepEqual(second, { ...first, id: 'fridge-copy' })
  assert.notEqual(second.position, first.position)
  assert.deepEqual(removeFixture(duplicated, 'fridge-copy').fixtures, source.fixtures)
  assert.equal(duplicated.assets, source.assets)
  assert.throws(() => duplicateFixture(source, 'k-fridge', 'k-fridge'))
  assert.throws(() => addFixture(source, 'missing', 'new-object'))
  assert.throws(() => addFixture(source, 'low-table', 'new-object', 'missing'))
})

test('names, IDs and active references are validated without mutating existing versions', () => {
  const source = frozen(ensureEditor(scene()))
  const named = renameLayout(renameArchitecture(source, originalArchitecture, 'Main apartment'), originalLayout, 'As photographed')
  assert.equal(getActiveArchitecture(named).name, 'Main apartment')
  assert.equal(getActiveLayout(named).name, 'As photographed')
  assert.equal(getActiveArchitecture(source).name, 'Original')
  for (const operation of [
    () => duplicateArchitecture(source, originalArchitecture, 'Duplicate'),
    () => duplicateLayout(source, originalLayout, 'Duplicate'),
    () => duplicateLayout(source, ' ', 'Duplicate'),
    () => renameLayout(source, originalLayout, ' '),
    () => selectArchitecture(source, 'missing'),
    () => selectLayout(source, 'missing'),
    () => renameArchitecture(source, 'missing', 'Valid'),
  ]) assert.throws(operation)
})

test('snapshot validation covers inactive layouts and rejects root divergence', () => {
  const source = duplicateArchitecture(duplicateLayout(scene(), 'alternative', 'Alternative'), 'second-architecture', 'Second')
  const cases = [
    (snapshot: EditorSnapshot) => { snapshot.editor.activeArchitectureId = 'missing' },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].activeLayoutId = 'missing' },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].layouts[0].fixtures[0].assetId = 'missing' },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].layouts[0].fixtures[0].roomId = 'missing' },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].layouts[0].fixtures[0].position = [100, 0, 100] },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].layouts[0].fixtures[0].position[1] = 10 },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].layouts.push(snapshot.editor.architectures[0].layouts[0]) },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].partitionWallIds.push('exterior-north') },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures[0].layouts = [] },
    (snapshot: EditorSnapshot) => { snapshot.editor.architectures = [] },
    (snapshot: EditorSnapshot) => { snapshot.fixtures = [] },
    (snapshot: EditorSnapshot) => { snapshot.apartment = { ...snapshot.apartment, name: 'Root differs' } },
  ]
  for (const mutate of cases) {
    const snapshot = structuredClone(source)
    mutate(snapshot)
    assert.equal(ProjectSnapshotSchema.safeParse(snapshot).success, false)
  }
})

test('legacy scene adapters synchronize the active pair and rebuild changed architecture', () => {
  const source = duplicateLayout(scene(), 'alternative', 'Alternative')
  const changed = { ...source, fixtures: source.fixtures.slice(1), apartment: { ...source.apartment, walls: source.apartment.walls.map(wall => wall.id === 'bedroom-divider' ? { ...wall, thickness: .2 } : wall) } }
  const next = syncActiveScene(changed)
  assert.deepEqual(getActiveLayout(next).fixtures, changed.fixtures)
  assert.equal(getActiveArchitecture(next).apartment.walls.find(wall => wall.id === 'bedroom-divider')!.thickness, .2)
  assert.ok(next.geometry.walls.find(wall => wall.wallId === 'bedroom-divider')!.solids.every(solid => solid.scale[2] === .2))
  assert.deepEqual(selectLayout(next, originalLayout).fixtures, baseline.fixtures)
  assert.equal(ProjectSnapshotSchema.safeParse(next).success, true)
})

test('inclusive containment honors room boundaries and concave cutouts', () => {
  const polygon: [number, number][] = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]
  assert.equal(pointInPolygon([0, 0], polygon), true)
  assert.equal(pointInPolygon([1, 2], polygon), true)
  assert.equal(pointInPolygon([.5, 2], polygon), true)
  assert.equal(pointInPolygon([2, 2], polygon), false)
})

test('fixed installations cannot be transformed, duplicated, removed or added as furniture', () => {
  const source = frozen(ensureEditor(scene()))
  const original = source.fixtures.find(fixture => fixture.id === 'wc-toilet')!
  for (const operation of [
    () => updateFixture(source, original.id, { position: bedroomPosition(source) }),
    () => updateFixture(source, original.id, { roomId: 'bedroom-1' }),
    () => rotateFixture(source, original.id, Math.PI / 2),
    () => duplicateFixture(source, original.id, 'extra-toilet'),
    () => removeFixture(source, original.id),
    () => addFixture(source, original.assetId, 'extra-toilet', 'bedroom-1'),
    () => syncActiveScene({ ...source, fixtures: source.fixtures.filter(fixture => fixture.id !== original.id) }),
  ]) assert.throws(operation, /Fixed objects/)
  const renamed = updateFixture(source, original.id, { label: 'Renamed installation' })
  assert.deepEqual(renamed.fixtures.find(fixture => fixture.id === original.id)?.position, original.position)
  const variant = duplicateArchitecture(duplicateLayout(source, 'copy-layout', 'Copy'), 'copy-architecture', 'Copy')
  assert.deepEqual(variant.fixtures.find(fixture => fixture.id === original.id), original)
})

test('legacy saved installations remain fixed and placement overrides apply to reusable movable models', () => {
  const legacy = scene()
  for (const asset of legacy.assets) delete asset.mobility
  for (const fixture of legacy.fixtures) delete fixture.mobility
  assert.equal(ProjectSnapshotSchema.safeParse(legacy).success, true)
  assert.throws(() => updateFixture(legacy, 'wc-toilet', { position: bedroomPosition(legacy) }), /Fixed objects/)
  assert.equal(updateFixture(legacy, 'k-fridge', { position: bedroomPosition(legacy) }).fixtures.find(fixture => fixture.id === 'k-fridge')?.roomId, 'bedroom-1')
  const installed = scene()
  installed.fixtures.find(fixture => fixture.id === 'k-fridge')!.mobility = 'fixed'
  assert.throws(() => rotateFixture(installed, 'k-fridge', Math.PI / 2), /Fixed objects/)
})
