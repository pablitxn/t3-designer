import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { polygonArea, wallLength } from '../../../packages/geometry/src/index.ts'
import { buildGeneratedProjectScene, generateProjectScene, ProjectGenerationInputSchema, ProjectGenerationModelError, type ProjectGenerationInput, type ProjectLayoutPlan } from '../src/project-generation-model.ts'

const projectId = '91ca1154-8dc6-4b0f-b078-64026c67654c'
const input: ProjectGenerationInput = { name: 'Patio concept', prompt: 'Quiero un living amplio y dos habitaciones sencillas', kind: 'project', width: 8, depth: 6, storeyHeight: 2.8, floors: 3, latitude: -34.6037, longitude: -58.3816, timeZone: 'America/Argentina/Buenos_Aires' }
const plan: ProjectLayoutPlan = { summary: 'Distribución conceptual con living y dos dormitorios.', assumptions: ['Acceso por el norte.'], rooms: [
  { name: 'Living', x: 0, z: 0, width: 4, depth: 6 },
  { name: 'Dormitorio 1', x: 4, z: 0, width: 4, depth: 3 },
  { name: 'Dormitorio 2', x: 4, z: 3, width: 4, depth: 3 },
] }
const date = new Date('2026-10-04T12:00:00.000Z')

test('generated snapshots preserve user dimensions and build valid solids around connected schematic openings', () => {
  const scene = buildGeneratedProjectScene(projectId, input, plan, date)
  assert.deepEqual(ProjectSnapshotSchema.parse(scene), scene)
  assert.deepEqual(buildGeneratedProjectScene(projectId, input, plan, date), scene)
  assert.equal(scene.project.id, projectId)
  assert.equal(polygonArea(scene.apartment.perimeter), 48)
  assert.equal(scene.apartment.rooms.reduce((sum, room) => sum + polygonArea(room.polygon), 0), 48)
  assert.equal(scene.buildings[0].height, input.floors * input.storeyHeight)
  assert.equal(scene.buildings[0].floors, 3)
  assert.ok(scene.apartment.walls.every(wall => wall.estimated))
  assert.ok(scene.apartment.doors.every(door => door.estimated && door.locationConfidence === 'schematic'))
  assert.ok(scene.apartment.windows.every(window => window.estimated && window.locationConfidence === 'inferred'))
  assert.equal(scene.apartment.walls.filter(wall => wall.kind === 'interior').length, 3, 'T-junction is split into three unique shared boundaries')
  assert.equal(scene.apartment.doors.length, 4, 'each shared boundary plus one exterior entry has a usable doorway')
  assert.ok(scene.apartment.doors.every(door => door.width >= .8 && door.height >= 2))
  for (const wall of scene.apartment.walls) {
    const solids = scene.geometry.walls.find(item => item.wallId === wall.id)!.solids
    assert.ok(solids.length > 0)
    assert.ok(solids.every(solid => solid.scale.every(value => Number.isFinite(value) && value > 0)))
    const wallVolume = solids.reduce((sum, solid) => sum + solid.scale[0] * solid.scale[1] * solid.scale[2], 0)
    const openings = [...scene.apartment.doors, ...scene.apartment.windows].filter(opening => opening.wallId === wall.id)
    const expectedVolume = wallLength(wall) * wall.height * wall.thickness - openings.reduce((sum, opening) => sum + opening.width * opening.height * wall.thickness, 0)
    assert.ok(Math.abs(wallVolume - expectedVolume) < 1e-8, 'wall solids remove exactly the doors and windows')
  }
})

test('concept scenes carry no inherited models, real-property claims, parcel identifiers or observed provenance', () => {
  const scene = buildGeneratedProjectScene(projectId, input, plan, date)
  assert.deepEqual(scene.assets, []); assert.deepEqual(scene.fixtures, []); assert.deepEqual(scene.roads, [])
  assert.equal(scene.site.latitude, input.latitude); assert.equal(scene.site.longitude, input.longitude)
  assert.equal(scene.site.rnbId, null); assert.equal(scene.site.rnbUrl, null); assert.equal(scene.buildings[0].rnbId, null)
  assert.equal(scene.buildings[0].groundAltitude, null)
  assert.equal(scene.buildings[0].source, 'estimated')
  assert.match(scene.apartment.metadata.description, /NO RELEVAMIENTO/)
  assert.ok(scene.apartment.metadata.assumptions.some(value => /reportedCarrezArea.*geométricas.*no superficies relevadas/.test(value)))
  assert.match(scene.parcel.label, /no parcela catastral/)
  assert.equal(scene.solar.timeZone, input.timeZone)
  assert.ok(scene.solar.samples.length >= 92)
  const serialized = JSON.stringify(scene)
  for (const unrelated of ['demo-reference-', 'demo-building-', 'ign-bdtopo', '"observed"', '/models/current/']) assert.ok(!serialized.includes(unrelated), unrelated)
  assert.deepEqual(scene.geometry.contextSections.before, [])
  assert.deepEqual(scene.geometry.contextSections.after, [])
})

test('input requires explicit bounded dimensions and valid location instead of a default city', () => {
  for (const patch of [{ width: 2 }, { depth: 101 }, { storeyHeight: 1 }, { floors: 31 }, { floors: 1.5 }, { latitude: 91 }, { longitude: Infinity }, { timeZone: 'Not/AZone' }, { prompt: 'short' }, { unknown: true }]) assert.equal(ProjectGenerationInputSchema.safeParse({ ...input, ...patch }).success, false)
  const missing = { ...input } as Partial<ProjectGenerationInput>; delete missing.latitude
  assert.equal(ProjectGenerationInputSchema.safeParse(missing).success, false)
  for (const kind of ['apartment', 'building', 'project'] as const) assert.equal(buildGeneratedProjectScene(projectId, { ...input, kind }, plan, date).project.name, input.name)
})

test('model output cannot introduce overlaps, missing space, out-of-bounds rooms or arbitrary scene properties', async () => {
  for (const rooms of [
    [{ name: 'Outside', x: 0, z: 0, width: 9, depth: 6 }],
    [{ name: 'Gap', x: 0, z: 0, width: 7, depth: 6 }],
    [{ name: 'One', x: 0, z: 0, width: 5, depth: 6 }, { name: 'Two', x: 4, z: 0, width: 3, depth: 6 }],
  ]) assert.throws(() => buildGeneratedProjectScene(projectId, input, { ...plan, rooms }, date), ProjectGenerationModelError)
  for (const text of ['not JSON sk-test-secret-do-not-show', JSON.stringify({ ...plan, assets: [{ url: 'https://evil.test/model.glb' }] }), JSON.stringify({ ...plan, rooms: Array(21).fill(plan.rooms[0]) })]) {
    await assert.rejects(generateProjectScene(projectId, input, { signal: new AbortController().signal }, async () => text), error => error instanceof ProjectGenerationModelError && !error.message.includes('sk-test-secret'))
  }
})

test('hosted generation requests a strict layout schema without search, files or executable tools', async () => {
  let requests = 0, inference = 0
  const progress: string[] = []
  const scene = await generateProjectScene(projectId, input, { signal: new AbortController().signal, onInference: () => { inference++ }, onProgress: message => progress.push(message) }, async (request, schema, options, search) => {
    requests++
    assert.equal(search, false)
    assert.ok(request.every(item => item.type === 'text'))
    assert.match(request[0].type === 'text' ? request[0].text : '', /untrusted JSON/)
    const contract = schema as { additionalProperties: boolean; properties: Record<string, unknown>; required: string[] }
    assert.equal(contract.additionalProperties, false)
    assert.deepEqual(contract.required.sort(), ['assumptions', 'rooms', 'summary'])
    assert.deepEqual(Object.keys(contract.properties).sort(), ['assumptions', 'rooms', 'summary'])
    options.onInference?.()
    return JSON.stringify(plan)
  })
  assert.equal(requests, 1); assert.equal(inference, 1)
  assert.equal(scene.project.id, projectId)
  assert.ok(progress.some(message => /geometría/.test(message)))
})

test('cancellation stops before a request and discards a result arriving after abort', async () => {
  const before = new AbortController(); before.abort()
  let calls = 0
  await assert.rejects(generateProjectScene(projectId, input, { signal: before.signal }, async () => { calls++; return JSON.stringify(plan) }), { name: 'AbortError' })
  assert.equal(calls, 0)
  const during = new AbortController()
  await assert.rejects(generateProjectScene(projectId, input, { signal: during.signal }, async () => { during.abort(); return JSON.stringify(plan) }), { name: 'AbortError' })
})
