import assert from 'node:assert/strict'
import test from 'node:test'
import { accessSync, constants } from 'node:fs'
import { ProjectSnapshotSchema } from '../../packages/scene-schema/src/index.ts'
import { wallLength } from '../../packages/geometry/src/index.ts'
import { apartmentToSite } from '../../apps/web/src/data/apartment-placement.ts'
import { getLocalDate } from '../../apps/web/src/lib/solar.ts'
import { buildBuildingSnapshot, buildProjectSnapshot, buildSolarSnapshot } from '../lib/project-snapshot.ts'

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

test('snapshot is deterministic, JSON-safe, independently mutable and fully schema validated', () => {
  const first = buildProjectSnapshot(), second = buildProjectSnapshot()
  assert.deepEqual(first, second)
  assert.deepEqual(ProjectSnapshotSchema.parse(JSON.parse(JSON.stringify(first))), first)
  assert.equal(first.schemaVersion, 1)
  assert.equal(first.units, 'meters')
  assert.equal(first.solar.selected.utc, '2026-09-26T13:00:00.000Z')
  assert.equal(first.solar.defaultFrame, 61)
  assert.equal(first.solar.samples.length, 96)
  first.apartment.rooms[0].polygon[0][0] = 999
  first.placement.position[0] = 999
  first.buildings[0].footprint[0][0] = 999
  assert.deepEqual(buildProjectSnapshot(), second, 'a consumer cannot mutate canonical source data')
})

test('persisted placement and axis mapping can reconstruct world and Blender coordinates', () => {
  const { placement, coordinates } = buildProjectSnapshot()
  const local = [2.4, 1.2, 6.7]
  const c = Math.cos(placement.rotationY), s = Math.sin(placement.rotationY)
  const site = [c * local[0] + s * local[2] + placement.position[0], local[1] + placement.position[1], -s * local[0] + c * local[2] + placement.position[2]]
  const expected = apartmentToSite([2.4, 1.2, 6.7])
  site.forEach((value, index) => close(value, expected[index]))
  const axes = { x: site[0], y: site[1], z: site[2] }
  assert.deepEqual(coordinates.siteToBlender.map(([axis, sign]) => axes[axis] * sign), [site[0], -site[2], site[1]])
})

test('assets are resolvable without Blender running and fixtures retain domain references', () => {
  const snapshot = buildProjectSnapshot()
  for (const asset of snapshot.assets) {
    accessSync(new URL(`../../${asset.repoPath}`, import.meta.url), constants.R_OK)
    assert.equal(asset.repoPath, `apps/web/public${asset.url}`)
  }
  assert.equal(snapshot.assets.length, 18)
  assert.equal(snapshot.fixtures.length, 21)
  for (const fixture of snapshot.fixtures) {
    assert.ok(snapshot.assets.some(asset => asset.id === fixture.assetId))
    assert.ok(snapshot.apartment.rooms.some(room => room.id === fixture.roomId))
  }
})

test('exported wall solids conserve volume and cannot fill any doorway or window aperture', () => {
  const snapshot = buildProjectSnapshot()
  for (const wall of snapshot.apartment.walls) {
    const model = snapshot.geometry.walls.find(item => item.wallId === wall.id)!
    const length = wallLength(wall)
    const ux = (wall.to[0] - wall.from[0]) / length, uz = (wall.to[1] - wall.from[1]) / length
    const openings = [...snapshot.apartment.doors, ...snapshot.apartment.windows].filter(opening => opening.wallId === wall.id)
    const apertureVolume = openings.reduce((sum, opening) => sum + opening.width * opening.height * wall.thickness, 0)
    const solidVolume = model.solids.reduce((sum, solid) => sum + solid.scale[0] * solid.scale[1] * solid.scale[2], 0)
    close(solidVolume + apertureVolume, length * wall.height * wall.thickness)
    for (const solid of model.solids) {
      const center = (solid.position[0] - wall.from[0]) * ux + (solid.position[2] - wall.from[1]) * uz
      const bottom = solid.position[1] - solid.scale[1] / 2, top = bottom + solid.scale[1]
      close(solid.scale[2], wall.thickness)
      close(Math.cos(solid.rotationY), ux)
      close(-Math.sin(solid.rotationY), uz)
      assert.ok(bottom >= -1e-8 && top <= wall.height + 1e-8)
      for (const opening of openings) {
        const sill = 'sillHeight' in opening ? opening.sillHeight : 0
        const xOverlap = Math.min(center + solid.scale[0] / 2, opening.offset + opening.width) - Math.max(center - solid.scale[0] / 2, opening.offset)
        const yOverlap = Math.min(top, sill + opening.height) - Math.max(bottom, sill)
        assert.ok(xOverlap < 1e-8 || yOverlap < 1e-8, `${wall.id} solid fills ${opening.id}`)
      }
    }
  }
  close(snapshot.geometry.contextSections.belowTop + snapshot.geometry.floor.thickness, snapshot.placement.floorElevation)
  close(snapshot.geometry.contextSections.ceilingBase, snapshot.placement.floorElevation + snapshot.geometry.ceiling.elevation)
})

test('daily snapshots preserve spring gaps and both autumn clock occurrences', () => {
  const spring = buildSolarSnapshot({ date: '2026-03-29' })
  const autumn = buildSolarSnapshot({ date: '2026-10-25' })
  assert.equal(spring.samples.length, 92)
  assert.equal(autumn.samples.length, 100)
  assert.equal(spring.samples.filter(sample => sample.minutes >= 120 && sample.minutes < 180).length, 0)
  const repeated = autumn.samples.filter(sample => sample.minutes === 150)
  assert.deepEqual(repeated.map(sample => sample.utc), ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z'])
  for (const day of [spring, autumn]) {
    for (let index = 1; index < day.samples.length; index++) {
      assert.equal(Date.parse(day.samples[index].utc) - Date.parse(day.samples[index - 1].utc), 15 * 60_000)
      assert.equal(getLocalDate(new Date(day.samples[index].utc)), day.date)
    }
  }
  assert.throws(() => buildSolarSnapshot({ date: '2026-03-29', minutes: 150 }), /does not exist/)
  assert.throws(() => buildSolarSnapshot({ date: '2026-10-25', minutes: 150 }), /occurs twice/)
  for (const [disambiguation, expected] of [['earlier', 0], ['later', 1]] as const) {
    const day = buildSolarSnapshot({ date: '2026-10-25', minutes: 150, disambiguation })
    assert.equal(day.selected.utc, repeated[expected].utc)
    assert.equal(day.samples[day.defaultFrame - 1].utc, repeated[expected].utc)
  }
})

test('schema rejects broken cross-references, unsafe paths and invalid solar frames', () => {
  const cases = [
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.fixtures[0].roomId = 'missing-room' },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.fixtures[0].assetId = 'missing-asset' },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.placement.buildingId = 'missing-building' },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.assets[0].repoPath = '../outside.glb' },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.geometry.walls.pop() },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.solar.samples = [] },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.solar.samples[1].utc = snapshot.solar.samples[0].utc },
    (snapshot: ReturnType<typeof buildProjectSnapshot>) => { snapshot.solar.defaultFrame = 999 },
  ]
  for (const mutate of cases) {
    const snapshot = buildProjectSnapshot()
    mutate(snapshot)
    assert.equal(ProjectSnapshotSchema.safeParse(snapshot).success, false)
  }
})

test('legacy building snapshot shares project geography and exact solar computation', () => {
  const options = { date: '2026-12-21', minutes: 901 }
  const legacy = buildBuildingSnapshot(options), project = buildProjectSnapshot(options)
  assert.deepEqual(legacy.site, project.site)
  assert.deepEqual(legacy.buildings, project.buildings)
  assert.deepEqual(legacy.solar, project.solar)
  assert.equal(project.solar.selected.utc, '2026-12-21T14:01:00.000Z')
  assert.equal(project.solar.samples[project.solar.defaultFrame - 1].utc, '2026-12-21T14:00:00.000Z')
})
