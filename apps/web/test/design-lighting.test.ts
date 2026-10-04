import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { defaultDesignCustomization, ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { activeFixtureLightIds, fixtureLight, kelvinColor, lumensToCandela } from '../src/lib/design-lighting.ts'

const original = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))

test('warm and daylight emitters have bounded RGB and power uses isotropic candela', () => {
  const warm = kelvinColor(2700), daylight = kelvinColor(6500)
  assert.match(warm, /^#[\da-f]{6}$/)
  assert.equal(warm.slice(1, 3), 'ff')
  assert.ok(parseInt(warm.slice(5), 16) < parseInt(daylight.slice(5), 16))
  assert.equal(kelvinColor(0), kelvinColor(1800))
  assert.equal(kelvinColor(10000), daylight)
  assert.equal(lumensToCandela(4 * Math.PI), 1)
  assert.equal(lumensToCandela(0), 0)
})

test('only explicit fixture emission renders; disabling or removing it does not resurrect asset defaults', () => {
  const source = { enabled: true, kelvin: 2700, lumens: 800, offset: [0, 1, 0] as [number, number, number] }
  const fixture = { ...original.fixtures[0], light: source }
  const scene = { ...original, assets: original.assets.map(asset => ({ ...asset, light: source })), fixtures: [fixture] }
  assert.equal(fixtureLight(fixture), source)
  assert.deepEqual([...activeFixtureLightIds(scene)], [fixture.id])
  assert.equal(activeFixtureLightIds({ ...scene, fixtures: [{ ...fixture, light: undefined }] }).size, 0)
  assert.equal(activeFixtureLightIds({ ...scene, fixtures: [{ ...fixture, light: { ...source, enabled: false } }] }).size, 0)
  assert.equal(activeFixtureLightIds({ ...scene, customization: { ...defaultDesignCustomization(), lighting: { naturalEnabled: true, artificialEnabled: false, lights: [] } } }).size, 0)
})

test('fixed and fixture emitters share the rendering budget', () => {
  const fixture = original.fixtures[0]
  const scene = { ...original, fixtures: Array.from({ length: 12 }, (_, i) => ({ ...fixture, id: `lamp-${i}`, light: { enabled: true, kelvin: 4000, lumens: 900, offset: [0, 1, 0] as [number, number, number] } })), customization: defaultDesignCustomization() }
  assert.equal(activeFixtureLightIds(scene).size, 8)
  scene.customization.lighting.lights = Array.from({ length: 3 }, (_, i) => ({ id: `fixed-${i}`, name: 'Ceiling', roomId: fixture.roomId, position: [1, 2, 1] as [number, number, number], enabled: true, kelvin: 4000, lumens: 900 }))
  assert.equal(activeFixtureLightIds(scene).size, 5)
  scene.customization.lighting.lights[0].enabled = false
  assert.equal(activeFixtureLightIds(scene).size, 6)
})
