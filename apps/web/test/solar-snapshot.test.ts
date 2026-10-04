import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { snapshotsMatch } from '../../../scripts/lib/snapshot-comparison.ts'
import { buildSiteSolarSnapshot } from '../src/lib/solar-snapshot.ts'
import { getSolarPosition } from '../src/lib/solar.ts'

const snapshot = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))

test('shared interactive solar builder preserves the canonical snapshot across platforms', () => {
  const { date, selected } = snapshot.solar
  const solar = buildSiteSolarSnapshot(snapshot.site, { date, minutes: selected.minutes, disambiguation: selected.disambiguation })
  // Use the scene verifier's narrowly scoped ULP tolerance for computed solar
  // angles/vectors. Structure, dates, sampling and authored values stay exact.
  assert.ok(snapshotsMatch({ solar }, { solar: snapshot.solar }), 'Interactive solar output must match the canonical scene under the scene verifier policy')
})

test('day/night edits use the saved site and produce a valid persisted scene', () => {
  for (const minutes of [0, 720]) {
    const solar = buildSiteSolarSnapshot(snapshot.site, { date: '2026-06-21', minutes })
    assert.equal(solar.selected.isDaylight, minutes === 720)
    assert.deepEqual(solar.selected.direction, getSolarPosition(new Date(solar.selected.utc), snapshot.site.latitude, snapshot.site.longitude).direction)
    assert.equal(ProjectSnapshotSchema.safeParse({ ...snapshot, solar }).success, true)
  }
  const otherSite = { latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }
  const solar = buildSiteSolarSnapshot(otherSite, { date: '2026-06-21', minutes: 720 })
  assert.equal(solar.timeZone, otherSite.timeZone)
  assert.deepEqual(solar.selected.direction, getSolarPosition(new Date(solar.selected.utc), otherSite.latitude, otherSite.longitude).direction)
})

test('clock changes retain exact repeated instants and reject missing local times', () => {
  assert.throws(() => buildSiteSolarSnapshot(snapshot.site, { date: '2026-03-29', minutes: 150 }), /does not exist/)
  assert.throws(() => buildSiteSolarSnapshot(snapshot.site, { date: '2026-10-25', minutes: 150 }), /occurs twice/)
  const first = buildSiteSolarSnapshot(snapshot.site, { date: '2026-10-25', minutes: 150, disambiguation: 'earlier' })
  const second = buildSiteSolarSnapshot(snapshot.site, { date: '2026-10-25', minutes: 150, disambiguation: 'later' })
  assert.equal(Date.parse(second.selected.utc) - Date.parse(first.selected.utc), 3_600_000)
  assert.equal(first.samples.length, 100)
  assert.notEqual(first.defaultFrame, second.defaultFrame)
})
