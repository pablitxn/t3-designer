import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonCentroid } from '@t3-designer/geometry'
import { DesignCustomizationSchema, LightSourceSchema, MAX_DESIGN_LIGHTS, ProjectSnapshotSchema, defaultDesignCustomization, fixtureLightPosition, type DesignCustomization, type LightSource, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { addFixedLight, addFixture, addPartition, duplicateArchitecture, duplicateFixture, duplicateLayout, ensureEditor, getActiveArchitecture, getActiveLayout, removeFixedLight, removePartition, selectArchitecture, selectLayout, setFixtureLight, syncActiveScene, updateCustomization, updateFixedLight, updateFixture } from '../src/editor/model.ts'

const baseline = buildProjectSnapshot()
const originalArchitecture = 'architecture-original', originalLayout = 'layout-original'
const emission: LightSource = { enabled: true, kelvin: 2700, lumens: 800, offset: [.2, 1, .1] }
function scene() { return structuredClone(baseline) }
function customization(snapshot: ProjectSnapshot): DesignCustomization {
  return {
    wallColors: { [snapshot.apartment.walls[0].id]: '#aca0b2' },
    floors: { [snapshot.apartment.rooms[0].id]: { material: 'parquet', color: '#ad8459' } },
    doors: { [snapshot.apartment.doors[0].id]: { style: 'glazed', color: '#eeffee', openness: .7 } },
    windows: { [snapshot.apartment.windows[0].id]: { style: 'sliding', frameColor: '#111111', covering: 'curtain', coveringColor: '#ded0b8', closure: .6 } },
    lighting: { naturalEnabled: false, artificialEnabled: true, lights: [] },
  }
}
function bedroomPosition(snapshot: ProjectSnapshot): [number, number, number] {
  const [x, z] = polygonCentroid(snapshot.apartment.rooms.find(room => room.id === 'bedroom-1')!.polygon)
  return [x, 0, z]
}

test('legacy snapshots stay byte compatible and root-only customization acquires an editor without losing its design', () => {
  const legacy = scene()
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(legacy))), legacy)
  assert.equal('customization' in ensureEditor(legacy), false)
  assert.equal('customization' in getActiveLayout(ensureEditor(legacy)), false)
  const imported = { ...legacy, customization: customization(legacy) }
  const next = ensureEditor(ProjectSnapshotSchema.parse(imported))
  assert.deepEqual(next.customization, imported.customization)
  assert.deepEqual(getActiveLayout(next).customization, imported.customization)
  const first = defaultDesignCustomization(), second = defaultDesignCustomization()
  first.wallColors.example = '#000000'
  first.lighting.naturalEnabled = false
  assert.deepEqual(second.wallColors, {})
  assert.equal(second.lighting.naturalEnabled, true)
})

test('wall, floor, opening and lighting alternatives persist independently across architecture copies and JSON reloads', () => {
  const original = ensureEditor(scene()), saved = JSON.stringify(original)
  let next = duplicateLayout(original, 'evening', 'Evening')
  next = updateCustomization(next, customization(next))
  next = addFixedLight(next, 'bedroom-1', 'reading-light')
  next = updateFixedLight(next, 'reading-light', { kelvin: 2200, lumens: 450 })
  const evening = structuredClone(next.customization)
  assert.deepEqual(next.apartment, original.apartment, 'evidence and measured/source dimensions remain separate from design choices')
  assert.equal(next.geometry, original.geometry)
  next = duplicateArchitecture(next, 'renovated', 'Renovated')
  next = updateCustomization(next, { ...next.customization!, wallColors: {} })
  assert.notDeepEqual(next.customization, evening)
  next = ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(next))) as ReturnType<typeof ensureEditor>
  next = selectArchitecture(next, originalArchitecture)
  assert.deepEqual(next.customization, evening)
  next = selectLayout(next, originalLayout)
  assert.equal('customization' in next, false)
  assert.equal(JSON.stringify(original), saved, 'previous history entries remain valid undo targets')
  next = selectLayout(next, 'evening')
  assert.deepEqual(next.customization, evening)
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(next))), next)
})

test('appearance and light settings reject partial, malformed and out-of-range values', () => {
  const design = customization(scene())
  const wall = Object.keys(design.wallColors)[0], door = Object.keys(design.doors)[0], window = Object.keys(design.windows)[0]
  for (const invalid of [
    { ...design, floors: undefined },
    { ...design, wallColors: { [wall]: 'red' } },
    { ...design, doors: { [door]: { ...design.doors[door], openness: 1.1 } } },
    { ...design, windows: { [window]: { ...design.windows[window], closure: -.1 } } },
    { ...design, lighting: { naturalEnabled: true, lights: [] } },
  ]) assert.equal(DesignCustomizationSchema.safeParse(invalid).success, false)
  for (const patch of [{ kelvin: 1799 }, { kelvin: 6501 }, { kelvin: Infinity }, { lumens: -1 }, { lumens: 3001 }, { offset: [0, NaN, 0] }, { offset: [10.1, 0, 0] }]) {
    assert.equal(LightSourceSchema.safeParse({ ...emission, ...patch }).success, false)
  }
})

test('root imports and inactive alternatives validate architectural references, unique light IDs and light bounds', () => {
  let root = updateCustomization(scene(), customization(scene()))
  root = addFixedLight(root, 'bedroom-1', 'fixed')
  const source = duplicateArchitecture(duplicateLayout(root, 'second', 'Second'), 'other', 'Other')
  const invalidDesigns: ((design: DesignCustomization) => void)[] = [
    design => { design.wallColors.missing = '#aaaaaa' },
    design => { design.floors.missing = { material: 'slate', color: '#aaaaaa' } },
    design => { design.doors.missing = { style: 'panel', color: '#aaaaaa', openness: 0 } },
    design => { design.windows.missing = { style: 'fixed', frameColor: '#aaaaaa', covering: 'none', coveringColor: '#aaaaaa', closure: 0 } },
    design => { design.lighting.lights[0].roomId = 'missing' },
    design => { design.lighting.lights[0].position = [100, 1, 100] },
    design => { design.lighting.lights[0].position[1] = baseline.geometry.ceiling.elevation + .1 },
    design => { design.lighting.lights.push(structuredClone(design.lighting.lights[0])) },
  ]
  for (const mutate of invalidDesigns) {
    const imported: ProjectSnapshot = { ...scene(), customization: structuredClone(root.customization) }
    mutate(imported.customization!)
    assert.equal(ProjectSnapshotSchema.safeParse(imported).success, false)
    const inactive = structuredClone(source)
    mutate(inactive.editor.architectures[0].layouts[0].customization!)
    assert.equal(ProjectSnapshotSchema.safeParse(inactive).success, false)
  }
  const divergent = structuredClone(source)
  divergent.customization = defaultDesignCustomization()
  const result = ProjectSnapshotSchema.safeParse(divergent)
  assert.equal(result.success, false)
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.message === 'Root customization must match the active layout'))
})

test('fixture emission follows local translation and rotation and rejects moves placing emission outside the apartment envelope', () => {
  let next = addFixture(scene(), 'low-table', 'lamp', 'bedroom-1')
  next = setFixtureLight(next, 'lamp', emission)
  const initial = next.fixtures.find(fixture => fixture.id === 'lamp')!
  assert.deepEqual(fixtureLightPosition(initial), [initial.position[0] + .2, 1, initial.position[2] + .1])
  const position = bedroomPosition(next)
  position[0] += .2
  next = updateFixture(next, 'lamp', { position, rotation: Math.PI / 2 })
  const lightPosition = fixtureLightPosition(next.fixtures.find(fixture => fixture.id === 'lamp')!)!
  assert.ok(Math.abs(lightPosition[0] - position[0] - .1) < 1e-8)
  assert.equal(lightPosition[1], 1)
  assert.ok(Math.abs(lightPosition[2] - position[2] + .2) < 1e-8)
  assert.deepEqual(initial.light, emission)
  for (const offset of [[0, -.1, 0], [0, next.geometry.ceiling.elevation + .1, 0], [10, 0, 10]] as [number, number, number][]) {
    assert.throws(() => setFixtureLight(next, 'lamp', { ...emission, enabled: false, offset }), /Fixture light must stay inside/)
  }
  const elevated = setFixtureLight(next, 'lamp', { ...emission, offset: [0, next.geometry.ceiling.elevation, 0] })
  assert.throws(() => updateFixture(elevated, 'lamp', { position: [position[0], .01, position[2]] }), /Fixture light must stay inside/)
  next = setFixtureLight(next, 'lamp', undefined)
  assert.equal(fixtureLightPosition(next.fixtures.find(fixture => fixture.id === 'lamp')!), undefined)
  assert.equal('light' in next.fixtures.find(fixture => fixture.id === 'lamp')!, false)
})

test('asset-authored emission is cloned on placement while lamp-like names alone never create light', () => {
  const source = scene(), asset = source.assets.find(item => item.id === 'low-table')!
  asset.light = structuredClone(emission)
  let next = addFixture(source, asset.id, 'new-lamp', 'bedroom-1')
  const placed = next.fixtures.find(fixture => fixture.id === 'new-lamp')!
  assert.deepEqual(placed.light, asset.light)
  assert.notEqual(placed.light, asset.light)
  assert.notEqual(placed.light!.offset, asset.light.offset)
  next = setFixtureLight(next, placed.id, { ...emission, kelvin: 6500 })
  assert.equal(next.assets.find(item => item.id === asset.id)!.light!.kelvin, 2700)
  const unmarked = scene()
  unmarked.assets.find(item => item.id === 'low-table')!.label = 'Warm lamp light'
  assert.equal(addFixture(unmarked, asset.id, 'unmarked', 'bedroom-1').fixtures.find(fixture => fixture.id === 'unmarked')!.light, undefined)
})

test('one per-layout light budget includes disabled fixed sources and copied fixture emitters', () => {
  let next = addFixture(scene(), 'low-table', 'lamp', 'bedroom-1')
  next = setFixtureLight(next, 'lamp', { ...emission, enabled: false })
  for (let index = 0; index < MAX_DESIGN_LIGHTS - 1; index++) next = addFixedLight(next, 'bedroom-1', `fixed-${index}`)
  next = updateFixedLight(next, 'fixed-0', { enabled: false })
  assert.equal(ProjectSnapshotSchema.safeParse(next).success, true)
  assert.throws(() => addFixedLight(next, 'bedroom-1', 'overflow'), /at most 8 light sources/)
  assert.throws(() => duplicateFixture(next, 'lamp', 'overflow-lamp'), /at most 8 light sources/)
  next = removeFixedLight(next, 'fixed-0')
  next = duplicateFixture(next, 'lamp', 'second-lamp')
  const inactive = duplicateLayout(next, 'copy', 'Copy')
  inactive.editor.architectures[0].layouts[0].fixtures.push({ ...structuredClone(next.fixtures.find(item => item.id === 'lamp')!), id: 'overflow' })
  assert.equal(ProjectSnapshotSchema.safeParse(inactive).success, false)
})

test('fixed light edits preserve previous history and reject invalid IDs, room references and geometry', () => {
  const before = addFixedLight(scene(), 'bedroom-1', 'first'), serialized = JSON.stringify(before)
  const after = updateFixedLight(before, 'first', { name: '  Reading  ', lumens: 0, kelvin: 6500, enabled: false })
  assert.equal(after.customization!.lighting.lights[0].name, 'Reading')
  assert.equal(JSON.stringify(before), serialized)
  for (const operation of [
    () => addFixedLight(before, 'bedroom-1', 'first'),
    () => addFixedLight(before, 'missing', 'second'),
    () => updateFixedLight(before, 'first', { position: [0, -1, 0] }),
    () => updateFixedLight(before, 'first', { roomId: 'missing' }),
    () => updateFixedLight(before, 'first', { name: ' ' }),
    () => removeFixedLight(before, 'missing'),
  ]) assert.throws(operation)
  assert.deepEqual(removeFixedLight(after, 'first').customization!.lighting.lights, [])
})

test('removing a partition clears its appearance override in every layout of that architecture', () => {
  const [x, , z] = bedroomPosition(scene())
  let next = addPartition(scene(), { id: 'partition', from: [x - .5, z], to: [x + .5, z], thickness: .1, height: 2.4 })
  next = updateCustomization(next, { ...defaultDesignCustomization(), wallColors: { partition: '#112233' } })
  next = duplicateLayout(next, 'other', 'Other')
  next = duplicateArchitecture(next, 'keeps-partition', 'Keeps partition')
  next = selectArchitecture(next, originalArchitecture)
  next = removePartition(next, 'partition')
  for (const layout of getActiveArchitecture(next).layouts) assert.equal('partition' in layout.customization!.wallColors, false)
  next = selectArchitecture(next, 'keeps-partition')
  assert.equal(next.customization!.wallColors.partition, '#112233')
  assert.ok(next.apartment.walls.some(wall => wall.id === 'partition'))
})

test('root-scene adapters synchronize customization and can restore an untouched design', () => {
  const source = updateCustomization(scene(), customization(scene()))
  const changed = { ...source, customization: defaultDesignCustomization() }
  const synced = syncActiveScene(changed)
  assert.deepEqual(getActiveLayout(synced).customization, changed.customization)
  const restored: ProjectSnapshot = { ...synced }
  delete restored.customization
  const next = syncActiveScene(restored)
  assert.equal('customization' in next, false)
  assert.equal('customization' in getActiveLayout(next), false)
  assert.equal(ProjectSnapshotSchema.safeParse(next).success, true)
})
