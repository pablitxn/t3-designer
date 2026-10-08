import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { createProjectFoundations, defaultDesignCustomization, foundationInputFingerprintValue, FoundationCandidateSchema, ProjectSnapshotSchema, type FoundationCandidate, type FoundationVersion } from '@t3-designer/scene-schema'
import { polygonCentroid, segmentWall, wallLength } from '../../../packages/geometry/src/index.ts'
import { assembleFoundationScenes, rebaseBuildingFoundation, updateFoundationFloor } from '../../web/src/private/foundation-scenes.ts'
import { buildSiteSolarSnapshot } from '../../web/src/lib/solar-snapshot.ts'
import { AccountError, createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { buildGeneratedProjectScene } from '../src/project-generation-model.ts'
import { createProjects, type ProjectDocument } from '../src/projects.ts'

const projectId = '91ca1154-8dc6-4b0f-b078-64026c67654c'
const date = new Date('2026-10-07T12:00:00.000Z')
function candidates() {
  const original = buildGeneratedProjectScene(projectId, { name: 'Casa', prompt: 'Dos ambientes de prueba con medidas conocidas.', kind: 'apartment', width: 8, depth: 6, storeyHeight: 2.8, floors: 3, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }, {
    summary: 'Datos de prueba.', assumptions: [], rooms: [{ name: 'Estar', x: 0, z: 0, width: 4, depth: 6 }, { name: 'Dormitorio', x: 4, z: 0, width: 4, depth: 6 }],
  }, date)
  const common = { summary: 'Reconstrucción de prueba estimada.', assumptions: ['Registro en el edificio estimado.'], unknowns: ['Detalle de escaleras pendiente.'], sources: [] }
  const dwelling: Extract<FoundationCandidate, { target: 'dwelling' }> = {
    ...common, target: 'dwelling', levels: [
      { levelId: 'ground-floor', name: 'Planta baja', levelIndex: 0, elevation: 0, ceilingHeight: 2.6, scaleEvidence: 'Medidas aportadas de 8 × 6 metros.', apartment: structuredClone(original.apartment) },
      { levelId: 'upper-floor', name: 'Planta alta', levelIndex: 1, elevation: 2.8, ceilingHeight: 2.6, scaleEvidence: 'Plano acotado.', apartment: structuredClone(original.apartment) },
      { levelId: 'basement', name: 'Subsuelo', levelIndex: -1, elevation: -2.8, ceilingHeight: 2.6, scaleEvidence: 'Plano acotado.', apartment: structuredClone(original.apartment) },
    ], connections: [{ fromLevelId: 'ground-floor', toLevelId: 'upper-floor', kind: 'stairs', notes: 'Conexión indicada, sin geometría transitable.' }],
  }
  const building: Extract<FoundationCandidate, { target: 'building' }> = { ...common, target: 'building', site: original.site, buildings: original.buildings, roads: [], parcel: original.parcel }
  building.buildings[0].footprint = building.buildings[0].footprint.map(([x, z]) => [x + 12, z - 5])
  return { dwelling, building }
}
function version(project: ProjectDocument, candidate: FoundationCandidate): FoundationVersion {
  return {
    id: randomUUID(), projectId: project.id, target: candidate.target, runId: randomUUID(), parentVersionId: null,
    sourceRevision: project.revision, foundationsFingerprint: createHash('sha256').update(foundationInputFingerprintValue(project.foundations)).digest('hex'), createdAt: date.toISOString(),
    status: 'ready', summary: 'Versión revisada.', questions: [], candidate,
    iterations: [{ index: 1, candidate, review: { passed: true, summary: 'Datos de prueba revisados.', issues: [] } }],
  }
}

function asymmetricCandidates() {
  const result = candidates(), apartment = result.dwelling.levels[0].apartment
  apartment.perimeter = [[-6, -2], [0, -2], [0, 0], [8, 0], [8, 6], [0, 6], [0, 2], [-6, 2]]
  const evidence = { confidence: 'inferred' as const, note: 'Anexo bajo de prueba en el mismo origen que el cuerpo principal.' }
  apartment.floorRegions = [
    { id: 'main', polygon: [[0, 0], [8, 0], [8, 6], [0, 6]], floorElevation: 0, ceilingElevation: 2.6, evidence },
    { id: 'annex', polygon: [[-6, -2], [0, -2], [0, 2], [-6, 2]], floorElevation: -.25, ceilingElevation: 2.35, evidence },
  ]
  result.building.buildings[0].footprint = [[0, 0], [8, 0], [8, 6], [0, 6]]
  return result
}

function registration(position: [number, number, number]) {
  return { dwellingVersionId: '859d2581-e3eb-4dfb-a190-5b793cf2def1', position, evidence: { confidence: 'inferred' as const, note: 'Registro estimado de prueba con ejes comunes, sin giro ni escala.' } }
}

test('explicit shared origin preserves an asymmetric annex; absence keeps the exact legacy centering', () => {
  const { dwelling, building } = asymmetricCandidates(), before = structuredClone({ dwelling, building })
  const legacy = assembleFoundationScenes(projectId, 'Casa asimétrica', dwelling, building, date)
  assert.deepEqual(legacy.map(level => level.scene.placement.position), [[3, 0, 1], [3, 2.8, 1], [3, -2.8, 1]])
  assert.deepEqual({ dwelling, building }, before)

  building.dwellingRegistration = registration([0, 0, 0])
  const registeredBefore = structuredClone(building)
  const registered = assembleFoundationScenes(projectId, 'Casa asimétrica', dwelling, building, date)
  assert.deepEqual(registered.map(level => level.scene.placement.position), [[0, 0, 0], [0, 2.8, 0], [0, -2.8, 0]])
  for (const [index, level] of registered.entries()) {
    assert.deepEqual(level.scene.geometry.contextSections.apartmentBand, dwelling.levels[index].apartment.perimeter)
    assert.deepEqual(level.scene.apartment, dwelling.levels[index].apartment)
    assert.equal(level.scene.placement.rotationY, 0)
    assert.match(level.scene.placement.assumption, /Registro explícito por traslación común/)
    assert.match(level.scene.placement.assumption, /Registro estimado de prueba/)
  }
  assert.deepEqual(building, registeredBefore); assert.deepEqual(dwelling, before.dwelling)
  delete building.dwellingRegistration
  assert.deepEqual(assembleFoundationScenes(projectId, 'Casa asimétrica', dwelling, building, date), legacy)
})

test('registration translates every floor and context band while preserving local split-level heights', () => {
  const { dwelling, building } = asymmetricCandidates()
  building.dwellingRegistration = registration([-7, 1.25, 11])
  const levels = assembleFoundationScenes(projectId, 'Casa trasladada', dwelling, building, date)
  assert.deepEqual(levels.map(level => level.scene.placement.position), [[-7, 1.25, 11], [-7, 4.05, 11], [-7, -1.5499999999999998, 11]])
  assert.deepEqual(levels[0].scene.geometry.contextSections.apartmentBand, [[-13, 9], [-7, 9], [-7, 11], [1, 11], [1, 17], [-7, 17], [-7, 13], [-13, 13]])
  assert.deepEqual(levels[1].scene.geometry.contextSections.apartmentBand, [[-7, 11], [1, 11], [1, 17], [-7, 17]])
  assert.equal(levels[0].scene.geometry.floor.elevation, -.25)
  assert.equal(levels[0].scene.geometry.ceiling.elevation, 2.6)
  assert.equal(levels[0].scene.geometry.contextSections.belowTop, .85)
  assert.equal(levels[0].scene.geometry.contextSections.ceilingBase, 3.85)
  for (const [index, level] of levels.entries()) {
    assert.equal(level.scene.placement.floorElevation, dwelling.levels[index].elevation + 1.25)
    assert.deepEqual(level.scene.apartment, dwelling.levels[index].apartment)
    assert.deepEqual(ProjectSnapshotSchema.parse(level.scene), level.scene)
  }
})

test('a new explicit registration corrects saved placement without rebuilding furniture, variants or energy', () => {
  const { dwelling, building } = asymmetricCandidates()
  const levels = assembleFoundationScenes(projectId, 'Casa con variantes', dwelling, building, date)
  const models = { dwelling: { versionId: registration([0, 0, 0]).dwellingVersionId, candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'upper-floor' }
  for (const { scene } of levels) {
    scene.apartment.name += ' editada'
    scene.assets.push({ id: 'table', label: 'Mesa', url: '/models/table.glb', repoPath: 'assets/table.glb', dimensions: [1, .7, 1], evidence: 'Test asset.', dimensionalStatus: 'estimated' })
    scene.fixtures.push({ id: 'placed-table', assetId: 'table', roomId: scene.apartment.rooms[0].id, label: 'Mesa propia', position: [2, 0, 2], rotation: 0, evidence: 'Posición del usuario.', placementStatus: 'estimated' })
    scene.customization = defaultDesignCustomization()
    scene.customization.lighting.naturalEnabled = false
    scene.editor = { schemaVersion: 1, activeArchitectureId: 'original', architectures: [{
      id: 'original', name: 'Original', apartment: structuredClone(scene.apartment), partitionWallIds: [], activeLayoutId: 'active', layouts: [
        { id: 'active', name: 'Con mesa', fixtures: structuredClone(scene.fixtures), customization: structuredClone(scene.customization) },
        { id: 'empty', name: 'Sin mesa', fixtures: [], customization: defaultDesignCustomization() },
      ],
    }] }
    scene.buildingEnergy = { buildingId: building.site.targetId, currency: 'EUR', installation: { panelCount: 4, panelWattPeak: 400, tiltDeg: 25, azimuthDeg: 180, inverterKw: 2, systemLossPct: 14, shadingLossPct: 5, monthlyTransmission: Array(12).fill(.7), climateSource: 'custom' }, finance: { annualConsumptionKwh: 3000, selfConsumptionPct: 60, importTariffPerKwh: .25, exportTariffPerKwh: .08, capex: 2500, incentive: 100, annualMaintenance: 20, degradationPct: .5, discountRatePct: 3, horizonYears: 20 } }
  }
  const before = structuredClone(models), registeredBuilding = structuredClone(building)
  registeredBuilding.dwellingRegistration = registration([-7, 1.25, 11])
  const assembled = assembleFoundationScenes(projectId, 'Casa con variantes', dwelling, registeredBuilding, date)
  const rebased = rebaseBuildingFoundation(models, assembled, registeredBuilding.dwellingRegistration)
  for (const [index, { scene }] of rebased.entries()) {
    const original = levels[index].scene
    assert.deepEqual(scene.placement.position, assembled[index].scene.placement.position, 'new registration wins although the target footprint did not move')
    assert.equal(scene.placement.floorElevation, assembled[index].scene.placement.floorElevation)
    assert.equal(scene.placement.assumption, assembled[index].scene.placement.assumption)
    assert.deepEqual(scene.geometry.contextSections.apartmentBand, assembled[index].scene.geometry.contextSections.apartmentBand)
    assert.equal(scene.geometry.contextSections.belowTop, original.geometry.contextSections.belowTop + 1.25)
    assert.equal(scene.geometry.contextSections.ceilingBase, original.geometry.contextSections.ceilingBase + 1.25)
    assert.deepEqual(scene.apartment, original.apartment)
    assert.deepEqual(scene.geometry.walls, original.geometry.walls)
    assert.deepEqual(scene.geometry.floor, original.geometry.floor); assert.deepEqual(scene.geometry.ceiling, original.geometry.ceiling)
    assert.deepEqual(scene.assets, original.assets); assert.deepEqual(scene.fixtures, original.fixtures)
    assert.deepEqual(scene.editor, original.editor); assert.deepEqual(scene.customization, original.customization)
    assert.deepEqual(scene.buildingEnergy, original.buildingEnergy)
    assert.deepEqual(ProjectSnapshotSchema.parse(scene), scene)
  }
  assert.deepEqual(models, before)
  const corrected = structuredClone(registeredBuilding)
  corrected.buildings[0].height += 1
  const afterHeightEdit = rebaseBuildingFoundation({ ...models, levels: rebased, building: { versionId: randomUUID(), candidate: registeredBuilding } }, assembleFoundationScenes(projectId, 'Casa con variantes', dwelling, corrected, date), corrected.dwellingRegistration)
  assert.deepEqual(afterHeightEdit.map(level => level.scene.placement), rebased.map(level => level.scene.placement))
})

test('assembly materializes simultaneous floors and basement as valid independent scenes', () => {
  const { dwelling, building } = candidates(), before = JSON.stringify({ dwelling, building })
  const levels = assembleFoundationScenes(projectId, 'Casa', dwelling, building, date)
  assert.equal(levels.length, 3)
  for (const [index, level] of levels.entries()) {
    assert.deepEqual(ProjectSnapshotSchema.parse(level.scene), level.scene)
    assert.equal(level.scene.placement.floorIndex, dwelling.levels[index].levelIndex)
    assert.equal(level.scene.placement.floorElevation, dwelling.levels[index].elevation)
    assert.equal(level.scene.placement.position[1], dwelling.levels[index].elevation)
    assert.equal(level.scene.geometry.contextSections.ceilingBase, dwelling.levels[index].elevation + dwelling.levels[index].ceilingHeight)
    assert.equal(level.scene.geometry.floor.elevation, 0, 'interior geometry remains in local floor coordinates')
    assert.deepEqual(level.scene.assets, []); assert.deepEqual(level.scene.fixtures, [])
    const center = polygonCentroid(level.scene.geometry.contextSections.apartmentBand)
    assert.deepEqual(center, polygonCentroid(building.buildings[0].footprint))
    assert.match(level.scene.placement.assumption, /orientación estimadas/)
    assert.match(level.scene.placement.assumption, /no habilitan tránsito/)
  }
  assert.equal(levels[2].scene.placement.floorIndex, -1)
  assert.ok(Math.abs(levels[2].scene.geometry.contextSections.belowTop + 2.95) < 1e-8)
  levels[0].scene.apartment.name = 'Modificada'
  levels[0].scene.site.address = 'Modificada'
  assert.notEqual(levels[1].scene.apartment.name, 'Modificada')
  assert.notEqual(levels[1].scene.site.address, 'Modificada')
  assert.equal(JSON.stringify({ dwelling, building }), before)
})

test('materialized wall solids remove exactly the source door and window apertures on every floor', () => {
  const { dwelling, building } = candidates()
  for (const { scene } of assembleFoundationScenes(projectId, 'Casa', dwelling, building, date)) {
    for (const wall of scene.apartment.walls) {
      const solids = scene.geometry.walls.find(item => item.wallId === wall.id)!.solids
      const openings = [...scene.apartment.doors, ...scene.apartment.windows].filter(item => item.wallId === wall.id)
      const expected = wallLength(wall) * wall.height * wall.thickness - openings.reduce((sum, opening) => sum + opening.width * opening.height * wall.thickness, 0)
      const actual = solids.reduce((sum, solid) => sum + solid.scale[0] * solid.scale[1] * solid.scale[2], 0)
      assert.ok(Math.abs(actual - expected) < 1e-8)
    }
  }
})

test('local floor regions, apertures and raised thresholds materialize and survive a building rebase', () => {
  const { dwelling, building } = candidates(), apartment = dwelling.levels[0].apartment
  const evidence = { confidence: 'inferred' as const, note: 'Desnivel y alturas de prueba, pendientes de verificación.' }
  apartment.floorRegions = [
    { id: 'main', polygon: [[0, 0], [6, 0], [6, 6], [0, 6]], floorElevation: -.3, ceilingElevation: 2.6, evidence },
    { id: 'annex', polygon: [[6, 0], [8, 0], [8, 6], [6, 6]], floorElevation: .45, ceilingElevation: 3.3, evidence },
  ]
  apartment.floorOpenings = [{ id: 'floor-void', polygon: [[1, 1], [2, 1], [2, 2], [1, 2]], evidence }]
  apartment.ceilingOpenings = [{ id: 'ceiling-void', polygon: [[1, 1], [2, 1], [2, 2], [1, 2]], evidence }]
  const door = apartment.doors[0], wall = apartment.walls.find(item => item.id === door.wallId)!
  wall.baseElevation = -.3; door.thresholdHeight = .45
  const levels = assembleFoundationScenes(projectId, 'Casa con anexo', dwelling, building, date), scene = levels[0].scene
  assert.deepEqual(scene.apartment.floorRegions, apartment.floorRegions)
  assert.deepEqual(scene.apartment.floorOpenings, apartment.floorOpenings)
  assert.deepEqual(scene.apartment.ceilingOpenings, apartment.ceilingOpenings)
  assert.equal(scene.geometry.floor.elevation, -.3); assert.equal(scene.geometry.ceiling.elevation, 3.3)
  assert.ok(Math.abs(scene.geometry.contextSections.belowTop + .45) < 1e-8)
  assert.equal(scene.geometry.contextSections.ceilingBase, 3.3)
  const segments = segmentWall(wall, [...apartment.doors, ...apartment.windows])
  const solids = scene.geometry.walls.find(item => item.wallId === wall.id)!.solids
  segments.forEach((segment, index) => assert.ok(Math.abs(solids[index].position[1] - (-.3 + segment.bottom + segment.height / 2)) < 1e-8))
  assert.ok(segments.some(segment => segment.offset === door.offset && segment.bottom === 0 && segment.height === .45))
  const model = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'ground-floor' }
  const revised = structuredClone(building); revised.buildings[0].groundOffset += 1.2
  const rebased = rebaseBuildingFoundation(model, assembleFoundationScenes(projectId, 'Casa con anexo', dwelling, revised, date))
  assert.deepEqual(rebased[0].scene.apartment, scene.apartment)
  assert.deepEqual(rebased[0].scene.geometry.walls, scene.geometry.walls)
  assert.equal(rebased[0].scene.placement.floorElevation, 1.2)
  assert.ok(Math.abs(rebased[0].scene.geometry.contextSections.ceilingBase - 4.5) < 1e-8)
  assert.deepEqual(model.dwelling.candidate, dwelling, 'stair and surface coordinates remain in the immutable dwelling frame')
})

test('an explicit stair remains in the accepted dwelling frame while floor snapshots retain their openings', () => {
  const { dwelling, building } = candidates()
  dwelling.levels = dwelling.levels.slice(0, 2)
  const evidence = { confidence: 'inferred' as const, note: 'Escalera de retorno de prueba.' }
  dwelling.connections = [{ id: 'return-stair', fromLevelId: 'ground-floor', toLevelId: 'upper-floor', kind: 'stairs', notes: 'Giro de 180 grados.', geometry: {
    width: .8, flights: [{ from: [1, 0, 1], to: [4, 1.4, 1], steps: 8 }, { from: [4, 1.4, 2], to: [1, 2.8, 2], steps: 8 }],
    landings: [{ polygon: [[4, .5], [5, .5], [5, 2.5], [4, 2.5]], elevation: 1.4 }], evidence,
  } }]
  const polygon: [number, number][] = [[1, .5], [5, .5], [5, 2.5], [1, 2.5]]
  dwelling.levels[0].apartment.ceilingOpenings = [{ id: 'lower-ceiling', polygon, connectionId: 'return-stair', evidence }]
  dwelling.levels[1].apartment.floorOpenings = [{ id: 'upper-floor', polygon, connectionId: 'return-stair', evidence }]
  assert.equal(FoundationCandidateSchema.safeParse(dwelling).success, true)
  const before = structuredClone(dwelling), levels = assembleFoundationScenes(projectId, 'Casa conectada', dwelling, building, date)
  assert.match(levels[0].scene.placement.assumption, /geometría explícita permiten recorrer/)
  assert.deepEqual(levels[0].scene.apartment.ceilingOpenings, dwelling.levels[0].apartment.ceilingOpenings)
  assert.deepEqual(levels[1].scene.apartment.floorOpenings, dwelling.levels[1].apartment.floorOpenings)
  assert.deepEqual(dwelling, before)
  const model = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'ground-floor' }
  const changed = structuredClone(levels[0].scene); changed.apartment.name = 'Planta revisada'
  assert.deepEqual(updateFoundationFloor(model, changed).dwelling!.candidate, before)
})

test('unequal storey outlines preserve one horizontal frame before and after building corrections', () => {
  const { dwelling, building } = candidates()
  dwelling.levels = dwelling.levels.slice(0, 2)
  const upper = dwelling.levels[1].apartment
  const point = ([x, z]: [number, number]): [number, number] => [x / 2 + 4, z]
  upper.perimeter = upper.perimeter.map(point)
  upper.rooms = upper.rooms.map(room => ({ ...room, polygon: room.polygon.map(point), reportedArea: room.reportedArea / 2 }))
  upper.walls = upper.walls.map(wall => ({ ...wall, from: point(wall.from), to: point(wall.to) }))
  upper.doors = []; upper.windows = []
  const levels = assembleFoundationScenes(projectId, 'Casa con retranqueo', dwelling, building, date)
  const [lowerPosition, upperPosition] = levels.map(level => level.scene.placement.position)
  assert.equal(upperPosition[0], lowerPosition[0]); assert.equal(upperPosition[2], lowerPosition[2])
  const centers = levels.map(level => polygonCentroid(level.scene.geometry.contextSections.apartmentBand))
  assert.equal(centers[1][0] - centers[0][0], 2, 'upper floor remains on the right half; it is not independently recentered')
  const models = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'upper-floor' }
  const changed = structuredClone(building)
  changed.buildings[0].footprint = changed.buildings[0].footprint.map(([x, z]) => [x + 7, z - 3])
  const updated = rebaseBuildingFoundation(models, assembleFoundationScenes(projectId, 'Casa con retranqueo', dwelling, changed, date))
  for (const [index, level] of updated.entries()) {
    assert.equal(level.scene.placement.position[0], levels[index].scene.placement.position[0] + 7)
    assert.equal(level.scene.placement.position[2], levels[index].scene.placement.position[2] - 3)
    assert.deepEqual(level.scene.apartment, levels[index].scene.apartment)
  }
  assert.equal(updated[0].scene.placement.position[0], updated[1].scene.placement.position[0])
})

test('updating the active floor preserves the inactive floors and original model', () => {
  const { dwelling, building } = candidates(), levels = assembleFoundationScenes(projectId, 'Casa', dwelling, building, date)
  const models = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'upper-floor' }
  const changed = structuredClone(levels[1].scene); changed.apartment.name = 'Planta alta editada'
  const next = updateFoundationFloor(models, changed)
  assert.equal(next.levels[1].scene.apartment.name, 'Planta alta editada')
  assert.notEqual(models.levels[1].scene.apartment.name, 'Planta alta editada')
  assert.deepEqual(next.levels[0].scene.apartment, models.levels[0].scene.apartment); assert.deepEqual(next.levels[2].scene.apartment, models.levels[2].scene.apartment)
})

test('changing the solar moment shares it across floors without replacing their layouts', () => {
  const { dwelling, building } = candidates(), levels = assembleFoundationScenes(projectId, 'Casa', dwelling, building, date)
  const models = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'upper-floor' }
  for (const [index, { scene }] of levels.entries()) {
    scene.assets.push({ id: 'table', label: 'Mesa', url: '/models/table.glb', repoPath: 'assets/table.glb', dimensions: [1, .7, 1], evidence: 'Test asset.', dimensionalStatus: 'estimated' })
    scene.fixtures.push({ id: 'placed-table', assetId: 'table', roomId: scene.apartment.rooms[0].id, label: `Mesa planta ${index}`, position: [2, 0, 2], rotation: 0, evidence: 'Posición del usuario.', placementStatus: 'estimated' })
    scene.editor = { schemaVersion: 1, activeArchitectureId: 'original', architectures: [{ id: 'original', name: 'Original', apartment: structuredClone(scene.apartment), partitionWallIds: [], activeLayoutId: 'active', layouts: [
      { id: 'active', name: 'Con mesa', fixtures: structuredClone(scene.fixtures) }, { id: 'empty', name: 'Sin mesa', fixtures: [] },
    ] }] }
  }
  const before = structuredClone(models), changed = structuredClone(levels[1].scene)
  changed.solar = buildSiteSolarSnapshot(changed.site, { date: '2026-12-01', minutes: 1439 })
  const next = updateFoundationFloor(models, changed)
  for (const [index, { scene }] of next.levels.entries()) {
    assert.deepEqual(scene.solar, changed.solar)
    assert.notEqual(scene.solar, changed.solar)
    assert.deepEqual(scene.apartment, before.levels[index].scene.apartment)
    assert.deepEqual(scene.fixtures, before.levels[index].scene.fixtures)
    assert.deepEqual(scene.editor, before.levels[index].scene.editor)
    assert.deepEqual(ProjectSnapshotSchema.parse(scene), scene)
  }
  assert.notEqual(next.levels[0].scene.solar, next.levels[1].scene.solar)
  assert.deepEqual(models, before)
})

test('building rebase preserves the selected solar instant and recomputes for the new site, including repeated clock hours', () => {
  const { dwelling, building } = candidates(), levels = assembleFoundationScenes(projectId, 'Casa', dwelling, building, date)
  const models = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'upper-floor' }
  // 06:30 UTC falls in New York's second 01:30 when DST ends on this date.
  const selected = buildSiteSolarSnapshot(building.site, { date: '2026-11-01', minutes: 210 })
  assert.equal(selected.selected.utc, '2026-11-01T06:30:00.000Z')
  for (const { scene } of levels) scene.solar = structuredClone(selected)
  const before = structuredClone(models), sameSite = structuredClone(building)
  sameSite.buildings[0].height += 1
  const heightEdit = rebaseBuildingFoundation(models, assembleFoundationScenes(projectId, 'Casa', dwelling, sameSite, date))
  assert.ok(heightEdit.every(level => level.scene.solar.selected.utc === selected.selected.utc))
  assert.ok(heightEdit.every(level => level.scene.solar.date === '2026-11-01' && level.scene.solar.selected.minutes === 210))

  const changedSite = structuredClone(building)
  changedSite.site.latitude = 40.7128; changedSite.site.longitude = -74.006; changedSite.site.timeZone = 'America/New_York'
  const relocated = rebaseBuildingFoundation(models, assembleFoundationScenes(projectId, 'Casa', dwelling, changedSite, date))
  const expected = buildSiteSolarSnapshot(changedSite.site, { date: '2026-11-01', minutes: 90, disambiguation: 'later' })
  for (const { scene } of relocated) {
    assert.deepEqual(scene.solar, expected)
    assert.equal(scene.solar.selected.utc, selected.selected.utc)
    assert.notDeepEqual(scene.solar.selected.direction, selected.selected.direction)
    assert.deepEqual(ProjectSnapshotSchema.parse(scene), scene)
  }
  assert.deepEqual(models, before)
})

test('building-only revisions preserve interior edits, assets and financial scenarios on every floor', () => {
  const { dwelling, building } = candidates(), levels = assembleFoundationScenes(projectId, 'Casa', dwelling, building, date)
  const models = { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, levels, activeLevelId: 'upper-floor' }
  for (const level of models.levels) {
    level.scene.apartment.name = `${level.name} editada`
    level.scene.assets.push({ id: 'table', label: 'Mesa', url: '/models/table.glb', repoPath: 'assets/table.glb', dimensions: [1, .7, 1], evidence: 'Test asset.', dimensionalStatus: 'estimated' })
    level.scene.fixtures.push({ id: 'placed-table', assetId: 'table', roomId: level.scene.apartment.rooms[0].id, label: 'Mesa propia', position: [2, 0, 2], rotation: 0, evidence: 'Posición del usuario.', placementStatus: 'estimated' })
    level.scene.buildingEnergy = { buildingId: building.site.targetId, currency: 'EUR', installation: { panelCount: 4, panelWattPeak: 400, tiltDeg: 25, azimuthDeg: 180, inverterKw: 2, systemLossPct: 14, shadingLossPct: 5, monthlyTransmission: Array(12).fill(.7), climateSource: 'custom' }, finance: { annualConsumptionKwh: 3000, selfConsumptionPct: 60, importTariffPerKwh: .25, exportTariffPerKwh: .08, capex: 2500, incentive: 100, annualMaintenance: 20, degradationPct: .5, discountRatePct: 3, horizonYears: 20 } }
  }
  const before = JSON.stringify(models), revisedBuilding = structuredClone(building)
  revisedBuilding.site.targetId = 'corrected-target'; revisedBuilding.site.address = 'Dirección corregida'
  revisedBuilding.buildings[0].id = 'corrected-target'
  revisedBuilding.buildings[0].footprint = revisedBuilding.buildings[0].footprint.map(([x, z]) => [x + 10, z + 20])
  const rebased = rebaseBuildingFoundation(models, assembleFoundationScenes(projectId, 'Casa', dwelling, revisedBuilding, date))
  for (const [index, level] of rebased.entries()) {
    const original = models.levels[index].scene
    assert.deepEqual(level.scene.apartment, original.apartment)
    assert.deepEqual(level.scene.assets, original.assets); assert.deepEqual(level.scene.fixtures, original.fixtures)
    assert.deepEqual(level.scene.geometry.walls, original.geometry.walls)
    assert.equal(level.scene.site.address, 'Dirección corregida')
    assert.equal(level.scene.buildingEnergy?.buildingId, 'corrected-target')
    assert.deepEqual(level.scene.buildingEnergy?.finance, original.buildingEnergy?.finance)
    assert.equal(level.scene.placement.position[0], original.placement.position[0] + 10)
    assert.equal(level.scene.placement.position[2], original.placement.position[2] + 20)
  }
  assert.equal(JSON.stringify(models), before)
  const active = structuredClone(rebased[1].scene)
  active.buildingEnergy!.installation.panelCount = 8
  const synchronized = updateFoundationFloor({ ...models, levels: rebased }, active)
  assert.ok(synchronized.levels.every(level => level.scene.buildingEnergy?.installation.panelCount === 8))
  assert.equal(models.levels[0].scene.buildingEnergy?.installation.panelCount, 4)
  assert.equal(synchronized.levels[0].scene.apartment.name, rebased[0].scene.apartment.name)
  delete active.buildingEnergy
  assert.ok(updateFoundationFloor(synchronized, active).levels.every(level => level.scene.buildingEnergy === undefined))
})

test('reviewed bases unlock together, save floors with revision checks and clone independently', async t => {
  const database = openAppDatabase(), accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  t.after(() => database.close())
  const owner: User = { id: randomUUID(), email: 'foundations@example.test', name: 'Owner', role: 'user' }
  await database.db.insertInto('user').values({ ...owner, image: null, emailVerified: database.bool(false), suspended: database.bool(false), createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
  const projects = await createProjects({ database, accounts, bundledScenePath: '/no-demo-read-is-needed.json' })
  let project = await projects.create(owner, { name: 'Casa' })
  const { dwelling, building } = candidates(), foundations = createProjectFoundations()
  building.buildings[0].roofRidgeAzimuthDeg = 0
  foundations.dwelling.kind = 'house'
  foundations.dwelling.levels = dwelling.levels.map(level => ({ id: level.levelId, name: level.name, levelIndex: level.levelIndex, elevation: level.elevation, ceilingHeight: level.ceilingHeight, width: 8, depth: 6, notes: '', planReferences: [] }))
  project = await projects.save(owner, project.id, { revision: project.revision, foundations })
  project = await projects.applyFoundationVersion(owner, project.id, version(project, dwelling), project.revision)
  assert.equal(project.scene, null); assert.equal(project.stage, 'setup'); assert.equal(project.foundations?.dwelling.status, 'ready')
  const buildingVersion = version(project, building)
  await assert.rejects(projects.applyFoundationVersion(owner, project.id, buildingVersion, project.revision - 1), error => error instanceof AccountError && error.status === 409)
  project = await projects.applyFoundationVersion(owner, project.id, buildingVersion, project.revision)
  assert.equal(project.stage, 'ready'); assert.equal(project.foundationModels!.levels.length, 3)
  assert.equal(project.foundationModels!.activeLevelId, 'ground-floor')
  const persisted = await projects.get(owner, project.id)
  const persistedBuilding = persisted.foundationModels!.building!.candidate
  assert.ok(persistedBuilding.target === 'building')
  assert.equal(persistedBuilding.buildings[0].roofRidgeAzimuthDeg, 0)
  assert.ok(persisted.foundationModels!.levels.every(level => level.scene.buildings[0].roofRidgeAzimuthDeg === 0))
  const levels = structuredClone(project.foundationModels!.levels)
  levels[1].scene.apartment.name = 'Dormitorios personalizados'
  project = await projects.save(owner, project.id, { revision: project.revision, levels, activeLevelId: 'upper-floor' })
  assert.equal(project.scene!.apartment.name, 'Dormitorios personalizados')
  assert.notEqual(project.foundationModels!.levels[0].scene.apartment.name, 'Dormitorios personalizados')
  const copy = await projects.create(owner, { name: 'Mi copia' }, project.id)
  assert.equal(copy.stage, 'ready'); assert.equal(copy.foundationModels!.activeLevelId, 'upper-floor')
  assert.equal(copy.scene!.apartment.name, 'Dormitorios personalizados')
  assert.ok(copy.foundationModels!.levels.every(level => level.scene.project.id === copy.id && level.scene.project.name === 'Mi copia'))
  assert.equal((await projects.get(owner, project.id)).name, 'Casa')
  const editedCopy = structuredClone(copy.scene!); editedCopy.apartment.name = 'Solo en copia'
  await projects.saveScene(owner, copy.id, editedCopy, copy.revision)
  assert.equal((await projects.get(owner, project.id)).scene!.apartment.name, 'Dormitorios personalizados')
  const priorAddress = project.scene!.site.address, correctedBuilding = structuredClone(building)
  correctedBuilding.site.address = 'Dirección corregida desde el chat'
  correctedBuilding.buildings[0].roofRidgeAzimuthDeg = 90
  project = await projects.applyFoundationVersion(owner, project.id, version(project, correctedBuilding), project.revision)
  assert.equal(project.scene!.site.address, correctedBuilding.site.address)
  assert.ok(project.foundationModels!.levels.every(level => level.scene.buildings[0].roofRidgeAzimuthDeg === 90))
  assert.equal(project.scene!.apartment.name, 'Dormitorios personalizados', 'building revision preserves the edited active interior')
  assert.equal(project.foundationModels!.activeLevelId, 'upper-floor')
  const checkpoints = await projects.listCheckpoints(owner, project.id)
  assert.equal(checkpoints.length, 1); assert.equal(checkpoints[0].reason, 'building')
  await assert.rejects(projects.restoreCheckpoint(owner, project.id, checkpoints[0].id, project.revision - 1), error => error instanceof AccountError && error.status === 409)
  project = await projects.restoreCheckpoint(owner, project.id, checkpoints[0].id, project.revision)
  assert.equal(project.scene!.site.address, priorAddress)
  assert.ok(project.foundationModels!.levels.every(level => level.scene.buildings[0].roofRidgeAzimuthDeg === 0))
  assert.equal(project.scene!.apartment.name, 'Dormitorios personalizados')
  assert.equal((await projects.listCheckpoints(owner, project.id)).length, 2, 'restoration itself is recoverable')
  project = await projects.applyFoundationVersion(owner, project.id, version(project, dwelling), project.revision)
  assert.notEqual(project.scene!.apartment.name, 'Dormitorios personalizados', 'dwelling regeneration replaces the base interior')
  const dwellingCheckpoint = (await projects.listCheckpoints(owner, project.id)).find(checkpoint => checkpoint.reason === 'dwelling')!
  project = await projects.restoreCheckpoint(owner, project.id, dwellingCheckpoint.id, project.revision)
  assert.equal(project.scene!.apartment.name, 'Dormitorios personalizados', 'checkpoint recovers prior interior edits')
})
