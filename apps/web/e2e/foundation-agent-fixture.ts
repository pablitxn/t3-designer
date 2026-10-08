import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { createProjectFoundations, FoundationModelsSchema, ProjectSnapshotSchema, type FoundationAgentRun, type FoundationAgentVersion, type FoundationCandidate, type FoundationTarget, type FoundationOfficialResearch } from '@t3-designer/scene-schema'
import type { FoundationAgentInput } from '../src/private/foundation-agent-client'
import { assembleFoundationScenes, rebaseBuildingFoundation } from '../src/private/foundation-scenes'
import type { Project } from '../src/private/api'
import { creditFixture } from './credit-fixture'

const projectId = '8a38d6b3-178b-4b6d-96e5-bb1e249ee672'
export const projectPath = `/app/projects/${projectId}`
const agentPath = `/api/projects/${projectId}/foundation-agent`
const scene = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))

function candidate(target: FoundationTarget = 'dwelling'): FoundationCandidate {
  if (target === 'building') {
    const site = structuredClone(scene.site)
    delete site.datasetKind
    return { target, summary: 'Edificio y parcela reconstruidos.', assumptions: ['Altura del edificio estimada.'], unknowns: ['Confirmar cantidad de plantas.'], sources: [{ title: 'Catastro de referencia', url: 'https://example.test/catastro', kind: 'official', claims: ['Límite aproximado de la parcela.'], retrievedAt: '2026-10-07' }], site, buildings: scene.buildings.map(building => ({ ...structuredClone(building), source: 'estimated' })), roads: structuredClone(scene.roads), parcel: structuredClone(scene.parcel) }
  }
  return { target: 'dwelling', summary: 'Dos plantas reconstruidas a partir de los planos.', assumptions: ['Altura de techo estimada en 2,7 m.'], unknowns: ['Confirmar el ancho de la escalera.'], sources: [], connections: [], levels: [
    { levelId: 'ground', name: 'Planta baja', levelIndex: 0, elevation: 0, ceilingHeight: 2.7, scaleEvidence: 'Ancho indicado en el plano: 6,7 m.', apartment: structuredClone(scene.apartment) },
    { levelId: 'upper', name: 'Dormitorios', levelIndex: 1, elevation: 2.9, ceilingHeight: 2.7, scaleEvidence: 'Ancho indicado en el plano: 6,7 m.', apartment: { ...structuredClone(scene.apartment), id: 'upper' } },
  ] }
}

export async function foundationAgentFixture(page: Page, role: Project['role'] = 'owner') {
  const foundations = createProjectFoundations()
  foundations.dwelling.levels = [
    { ...foundations.dwelling.levels[0], id: 'ground', name: 'Planta baja', width: 6.7, depth: 8.32, planReferences: [{ id: randomUUID(), name: 'planta-baja.png' }] },
    { ...foundations.dwelling.levels[0], id: 'upper', name: 'Dormitorios', levelIndex: 1, elevation: 2.9, width: 6.7, depth: 8.32, planReferences: [{ id: randomUUID(), name: 'dormitorios.png' }] },
  ]
  foundations.building = { ...foundations.building, countryCode: 'AR', address: 'Calle del Parque 100, Córdoba' }
  let project: Project = { id: projectId, name: 'Casa de Juan', ownerId: 'owner', role, revision: 1, notes: '', stage: 'setup', scene: null, foundations, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  let runs: FoundationAgentRun[] = []
  const versions: FoundationAgentVersion[] = []
  const starts: { body: FoundationAgentInput; key: string }[] = []
  const accepts: { versionId: string; revision: number }[] = []
  const writes: Record<string, unknown>[] = []
  const restores: { checkpointId: string; revision: number }[] = []
  const checkpoints: { id: string; revision: number; createdAt: string; reason: 'dwelling'; project: Project }[] = []
  const confirmations: string[] = []
  let loseResponse = false
  let acceptanceConflict = false
  let balance = 500
  page.on('dialog', dialog => { confirmations.push(dialog.message()); void dialog.accept() })
  function complete(target: FoundationTarget = 'dwelling', needsInput = false) {
    const run = runs.find(item => item.target === target)!
    const model = candidate(target)
    const version: FoundationAgentVersion = { id: randomUUID(), projectId, target, runId: run.id, parentVersionId: run.parentVersionId, sourceRevision: run.sourceRevision, foundationsFingerprint: 'fixture', createdAt: new Date(Date.now() + versions.length * 1000).toISOString(), status: needsInput ? 'needs_input' : 'ready', candidate: needsInput ? null : model, summary: needsInput ? 'Necesito una medida para reconstruir esta planta.' : target === 'dwelling' ? 'Corregí la posición de la puerta y revisé las dos plantas.' : 'Corregí la altura del edificio y revisé la parcela y las construcciones vecinas.', questions: needsInput ? ['¿Cuánto mide la pared junto a la escalera?'] : [], iterations: model && !needsInput ? [
      { index: 1, candidate: model, review: { passed: false, summary: target === 'dwelling' ? 'La primera revisión detectó una puerta fuera del muro.' : 'La primera revisión detectó una altura incoherente con las plantas.', issues: [target === 'dwelling' ? 'Ajustar la puerta de la cocina.' : 'Revisar la altura del edificio.'] } },
      { index: 2, candidate: model, review: { passed: true, summary: target === 'dwelling' ? 'Puerta corregida. Las aberturas coinciden con los muros.' : 'Altura corregida. Parcela y edificios revisados; quedan estimaciones por confirmar.', issues: [] } },
    ] : [] }
    versions.unshift(version)
    run.status = needsInput ? 'needs_input' : 'completed'; run.versionId = version.id; run.iterations = version.iterations; run.updatedAt = new Date().toISOString()
    run.events.push({ id: 2, createdAt: run.updatedAt, kind: needsInput ? 'question' : 'review', message: needsInput ? 'Falta una medida de escala.' : 'Revisión completada después de dos iteraciones.' })
    return version
  }
  await page.route('**/api/**', route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'owner', name: 'Juan', email: 'juan@example.test', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance } })
    if (path === '/api/health') return route.fulfill({ json: { foundationAgentEnabled: true } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [project] } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === `/api/projects/${projectId}/members`) return route.fulfill({ json: { members: [] } })
    if (path === `/api/projects/${projectId}` && request.method() === 'GET') return route.fulfill({ json: { project } })
    if (path === `/api/projects/${projectId}` && request.method() === 'PUT') {
      const body = request.postDataJSON()
      writes.push(structuredClone(body))
      if (body.revision !== project.revision) return route.fulfill({ status: 409, json: { error: 'Conflict' } })
      const models = body.levels && project.foundationModels ? FoundationModelsSchema.parse({ ...project.foundationModels, levels: body.levels, activeLevelId: body.activeLevelId }) : project.foundationModels
      const savedScene = body.scene ? ProjectSnapshotSchema.parse(body.scene) : project.scene
      if (models?.levels.length && JSON.stringify(models.levels.find(level => level.id === models.activeLevelId)?.scene) !== JSON.stringify(savedScene)) return route.fulfill({ status: 400, json: { error: 'Active scene mismatch' } })
      project = { ...project, name: body.name ?? project.name, notes: body.notes ?? project.notes, foundations: body.foundations ?? project.foundations, scene: savedScene, foundationModels: models, revision: project.revision + 1 }
      return route.fulfill({ json: { project } })
    }
    if (path === `/api/projects/${projectId}/checkpoints`) return route.fulfill({ json: { checkpoints: checkpoints.map(({ id, revision, createdAt, reason }) => ({ id, revision, createdAt, reason })) } })
    if (path.endsWith('/restore')) { const checkpointId = path.split('/').at(-2)!; const checkpoint = checkpoints.find(item => item.id === checkpointId)!; restores.push({ checkpointId, revision: request.postDataJSON().revision }); project = { ...structuredClone(checkpoint.project), revision: project.revision + 1 }; return route.fulfill({ json: { project } }) }
    if (path === agentPath && request.method() === 'GET') return route.fulfill({ json: { runs, versions } })
    if (path === agentPath && request.method() === 'POST') {
      const body = request.postDataJSON() as FoundationAgentInput
      const key = request.headers()['idempotency-key']
      starts.push({ body, key })
      const existingIndex = starts.slice(0, -1).findIndex(item => item.key === key)
      if (existingIndex >= 0) return route.fulfill({ json: { run: runs.find(run => run.target === body.target) } })
      const run: FoundationAgentRun = { id: randomUUID(), projectId, target: body.target, status: 'running', message: body.message, parentVersionId: body.parentVersionId ?? null, sourceRevision: body.revision, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null, versionId: null, iterations: [], events: [{ id: 1, kind: 'analysis', message: body.target === 'dwelling' ? 'Leyendo los planos de ambas plantas.' : 'Investigando la parcela y las fuentes públicas.', createdAt: new Date().toISOString() }] }
      runs.unshift(run)
      if (loseResponse) { loseResponse = false; balance = 0; return route.abort('failed') }
      return route.fulfill({ status: 202, json: { run } })
    }
    if (path.endsWith('/cancel')) { const id = path.split('/').at(-2); const run = runs.find(item => item.id === id)!; run.status = 'cancelled'; return route.fulfill({ json: { run } }) }
    if (path.endsWith('/accept')) {
      const versionId = path.split('/').at(-2)!
      accepts.push({ versionId, revision: request.postDataJSON().revision })
      if (acceptanceConflict) return route.fulfill({ status: 409, json: { error: 'Conflict' } })
      const version = versions.find(item => item.id === versionId)!
      const previousModels = project.foundationModels
      project = { ...project, revision: project.revision + 1, foundationModels: { ...(project.foundationModels ?? { dwelling: null, building: null, activeLevelId: null, levels: [] }), [version.target]: { versionId, candidate: version.candidate } } }
      if (project.foundations) project.foundations = { ...project.foundations, [version.target]: { ...project.foundations[version.target], status: 'ready' } }
      const dwelling = project.foundationModels?.dwelling?.candidate, building = project.foundationModels?.building?.candidate
      if (dwelling?.target === 'dwelling' && building?.target === 'building') {
        let levels = assembleFoundationScenes(projectId, project.name, dwelling, building)
        if (version.target === 'building' && previousModels?.levels.length) levels = rebaseBuildingFoundation(previousModels, levels)
        const activeLevelId = levels.some(level => level.id === previousModels?.activeLevelId) ? previousModels!.activeLevelId! : levels[0].id
        project = { ...project, stage: 'ready', scene: levels.find(level => level.id === activeLevelId)!.scene, foundationModels: { ...project.foundationModels!, levels, activeLevelId } }
      }
      return route.fulfill({ json: { project } })
    }
    if (/\/references\/[^/]+\/image$/.test(path)) return route.fulfill({ status: 204 })
    return route.fulfill({ status: 404, json: { error: `Unexpected ${request.method()} ${path}` } })
  })
  return { starts, versions, accepts, confirmations, complete, restores, checkpoints, writes, saved: () => structuredClone(project), makeReady: (multipleFloors = false) => {
    const dwelling = candidate(), building = candidate('building')
    if (dwelling.target !== 'dwelling' || building.target !== 'building') throw new Error('Invalid fixture targets')
    const levels = assembleFoundationScenes(projectId, project.name, dwelling, building).slice(0, multipleFloors ? 2 : 1)
    levels.forEach((level, index) => {
      level.scene.assets = structuredClone(scene.assets)
      level.scene.fixtures = [{ ...structuredClone(scene.fixtures[0]), position: [index ? 3 : 2, .015, 7] }]
    })
    project = { ...project, scene: levels[0].scene, foundations: { ...foundations, dwelling: { ...foundations.dwelling, status: 'ready' }, building: { ...foundations.building, status: 'ready' } }, foundationModels: { dwelling: { versionId: randomUUID(), candidate: dwelling }, building: { versionId: randomUUID(), candidate: building }, activeLevelId: 'ground', levels } }
    checkpoints.push({ id: randomUUID(), revision: 1, createdAt: new Date().toISOString(), reason: 'dwelling', project: { ...structuredClone(project), notes: 'Distribución anterior recuperada.' } })
  }, setAcceptedResearch: (research: FoundationOfficialResearch) => {
    if (project.foundationModels?.building?.candidate.target === 'building') project.foundationModels.building.candidate.officialResearch = structuredClone(research)
  }, loseNextResponse: () => { loseResponse = true }, conflictOnAccept: () => { acceptanceConflict = true }, runs: () => runs, seedRun: (target: FoundationTarget) => {
    const run: FoundationAgentRun = { id: randomUUID(), projectId, target, status: 'running', message: 'Revisá los planos y las medidas.', parentVersionId: null, sourceRevision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null, versionId: null, iterations: [], events: [] }
    runs = [run, ...runs]; return run
  } }
}
