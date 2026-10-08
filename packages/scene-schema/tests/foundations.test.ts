import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectFoundations, projectFoundationReadiness, ProjectFoundationsSchema } from '../src/foundations.ts'

test('foundation intake starts without invented geometry, location or completed models', () => {
  const foundations = createProjectFoundations()
  assert.deepEqual(ProjectFoundationsSchema.parse(foundations), foundations)
  assert.equal(foundations.dwelling.levels[0].elevation, null)
  assert.equal(foundations.dwelling.levels[0].width, null)
  assert.equal(foundations.building.countryCode, '')
  assert.equal(foundations.building.address, '')
  assert.equal(projectFoundationReadiness(foundations, false).ready, false)
  assert.equal(projectFoundationReadiness(foundations, true).ready, false)
  assert.equal(projectFoundationReadiness(null, false).ready, false)
  assert.equal(projectFoundationReadiness(null, true).ready, true)
  foundations.dwelling.status = 'ready'
  foundations.building.status = 'ready'
  assert.equal(projectFoundationReadiness(foundations, false).ready, false)
  assert.equal(projectFoundationReadiness(foundations, true).ready, true)
})

test('levels preserve independent names, numbers and heights and reject ambiguous identities', () => {
  const foundations = createProjectFoundations()
  foundations.dwelling.kind = 'house'
  foundations.dwelling.levels[0].name = 'Acceso desde la calle'
  foundations.dwelling.levels.push({ ...structuredClone(foundations.dwelling.levels[0]), id: 'upstairs', name: 'Dormitorios', levelIndex: 1, elevation: 3.2, ceilingHeight: 2.5 })
  assert.equal(ProjectFoundationsSchema.safeParse(foundations).success, true)
  for (const change of [
    { id: 'ground-floor' }, { levelIndex: 0 }, { levelIndex: .5 }, { ceilingHeight: 0 }, { elevation: Infinity },
  ]) {
    const invalid = structuredClone(foundations)
    Object.assign(invalid.dwelling.levels[1], change)
    assert.equal(ProjectFoundationsSchema.safeParse(invalid).success, false)
  }
})

test('source declarations and private plan metadata cannot smuggle model state or unsafe URLs', () => {
  const foundations = createProjectFoundations()
  foundations.building.countryCode = 'AR'
  foundations.building.region = 'Buenos Aires'
  foundations.building.sources.push({ id: 'parcel-record', title: 'Registro aportado por el usuario', kind: 'official', url: 'https://example.test/parcel', retrievedAt: '2026-10-07' })
  assert.equal(ProjectFoundationsSchema.safeParse(foundations).success, true)
  for (const url of ['javascript:alert(1)', 'file:///private/plan', 'data:text/html,hello']) {
    foundations.building.sources[0].url = url
    assert.equal(ProjectFoundationsSchema.safeParse(foundations).success, false)
  }
  foundations.building.sources[0].url = ''
  const reference = { id: '12b732c0-e7ed-478b-ae12-70b51a0734ac', name: 'Plano planta baja' }
  foundations.dwelling.levels[0].planReferences = [reference]
  assert.equal(ProjectFoundationsSchema.safeParse(foundations).success, true)
  assert.equal(ProjectFoundationsSchema.safeParse({ ...foundations, scene: {} }).success, false)
  foundations.dwelling.levels[0].planReferences.push(reference)
  assert.equal(ProjectFoundationsSchema.safeParse(foundations).success, false)
})
