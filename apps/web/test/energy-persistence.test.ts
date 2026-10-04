import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { buildProjectSnapshot } from '../../../scripts/lib/project-snapshot.ts'
import { duplicateArchitecture, duplicateLayout, selectArchitecture } from '../src/editor/model.ts'
import { createDefaultBuildingEnergy } from '../src/energy/model.ts'
import { DEMO_ENERGY_KEY, readDemoEnergy, saveDemoEnergy } from '../src/energy/demo-storage.ts'

test('a building installation survives apartment variants and JSON without becoming a fixture', () => {
  const snapshot = buildProjectSnapshot()
  const legacy = ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))
  assert.equal(legacy.buildingEnergy, undefined, 'legacy projects stay valid')
  snapshot.buildingEnergy = createDefaultBuildingEnergy(snapshot.site.targetId)
  const fixtures = structuredClone(snapshot.fixtures)
  let edited = duplicateArchitecture(snapshot, 'second', 'Second apartment')
  edited = duplicateLayout(edited, 'new-layout', 'Another furniture layout')
  edited = selectArchitecture(edited, 'architecture-original')
  const reloaded = ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(edited)))
  assert.deepEqual(reloaded.buildingEnergy, snapshot.buildingEnergy)
  assert.deepEqual(reloaded.fixtures, fixtures)
  assert.ok(reloaded.editor!.architectures.every(variant => !Object.hasOwn(variant, 'buildingEnergy')))
  const foreign = { ...reloaded, buildingEnergy: { ...reloaded.buildingEnergy!, buildingId: 'other-building' } }
  assert.equal(ProjectSnapshotSchema.safeParse(foreign).success, false)
  const invalidZone = structuredClone(reloaded)
  invalidZone.site.timeZone = 'invalid/time-zone'
  invalidZone.solar.timeZone = 'invalid/time-zone'
  assert.equal(ProjectSnapshotSchema.safeParse(invalidZone).success, false, 'saved projects cannot crash geographic calculations with an unsupported time zone')
  for (const date of ['1800-01-01', '2101-01-01']) {
    const invalidDate = { ...reloaded, solar: { ...reloaded.solar, date } }
    assert.equal(ProjectSnapshotSchema.safeParse(invalidDate).success, false, 'persisted solar study dates must be supported by the calculation engine')
  }
})

test('public demo persistence is versioned, bounded and local to the target building', () => {
  const defaults = createDefaultBuildingEnergy('building-one')
  const storage = new Map<string, string>()
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) } }
  assert.equal(readDemoEnergy(adapter, defaults).status, 'default')
  const edited = { ...defaults, installation: { ...defaults.installation, panelCount: 4 } }
  assert.equal(saveDemoEnergy(adapter, edited), 'saved')
  assert.deepEqual(readDemoEnergy(adapter, defaults), { value: edited, status: 'saved' })
  assert.equal(readDemoEnergy(adapter, createDefaultBuildingEnergy('building-two')).status, 'invalid')
  for (const raw of ['{', 'null', JSON.stringify({ version: 2, value: edited }), JSON.stringify({ version: 1, value: { ...edited, installation: { ...edited.installation, panelCount: 100000 } } })]) {
    storage.set(DEMO_ENERGY_KEY, raw)
    assert.deepEqual(readDemoEnergy(adapter, defaults), { value: defaults, status: 'invalid' })
  }
})

test('blocked storage and quota errors preserve the caller draft and report unavailable', () => {
  const value = createDefaultBuildingEnergy('building')
  const original = JSON.stringify(value)
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
  assert.deepEqual(readDemoEnergy(blocked, value), { value, status: 'unavailable' })
  assert.equal(saveDemoEnergy(blocked, value), 'unavailable')
  assert.equal(JSON.stringify(value), original)
})
