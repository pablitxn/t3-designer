import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { foundationInputFingerprintValue, type FoundationCandidate, type FoundationVersion } from '@t3-designer/scene-schema'
import { AccountError, createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { createProjects, type ProjectDocument } from '../src/projects.ts'
import { buildGeneratedProjectScene } from '../src/project-generation-model.ts'

const errorStatus = (status: number) => (error: unknown) => error instanceof AccountError && error.status === status
function version(project: ProjectDocument, target: 'dwelling' | 'building'): FoundationVersion {
  const scene = buildGeneratedProjectScene(project.id, { name: 'Fixture', prompt: 'Dos plantas con cotas de prueba', kind: 'apartment', width: 8, depth: 6, storeyHeight: 2.8, floors: 2, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }, { summary: 'Modelo de prueba', assumptions: [], rooms: [{ name: 'Ambiente', x: 0, z: 0, width: 8, depth: 6 }] })
  const common = { summary: 'Propuesta estimada', assumptions: ['Registro horizontal estimado'], unknowns: [], sources: [] }
  const candidate: FoundationCandidate = target === 'dwelling'
    ? { ...common, target, levels: project.foundations!.dwelling.levels.map(level => ({ levelId: level.id, name: level.name, levelIndex: level.levelIndex, elevation: level.levelIndex * 3, ceilingHeight: 2.8, scaleEvidence: 'Ancho indicado: 8 metros.', apartment: structuredClone(scene.apartment) })), connections: [] }
    : { ...common, target, site: scene.site, buildings: scene.buildings, roads: scene.roads, parcel: scene.parcel }
  return { id: randomUUID(), runId: randomUUID(), projectId: project.id, target, parentVersionId: null, sourceRevision: project.revision, foundationsFingerprint: createHash('sha256').update(foundationInputFingerprintValue(project.foundations)).digest('hex'), createdAt: new Date().toISOString(), status: 'ready', candidate, summary: candidate.summary, questions: [], iterations: [{ index: 1, candidate, review: { passed: true, summary: 'Revisado', issues: [] } }] }
}

test('setup input edits invalidate only the changed foundation and preserve the other accepted base', async t => {
  const database = openAppDatabase()
  t.after(() => database.close())
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const id = randomUUID(), owner: User = { id, email: `${id}@example.test`, name: 'Tester', role: 'user' }
  await database.db.insertInto('user').values({ ...owner, image: null, emailVerified: database.bool(false), suspended: database.bool(false), createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
  const planReferenceId = randomUUID()
  const projects = await createProjects({ database, accounts, validatePlanReference: async (_user, _projectId, referenceId) => referenceId === planReferenceId })
  for (const acceptedTarget of ['building', 'dwelling'] as const) {
    for (const changedTargets of [['dwelling'], ['building'], ['dwelling', 'building']] as const) {
      await t.test(`accepted ${acceptedTarget}; changed ${changedTargets.join(' and ')}`, async () => {
        let project = await projects.create(owner, { name: 'Bases independientes' })
        const accepted = version(project, acceptedTarget)
        if (accepted.candidate?.target === 'building') {
          const building = accepted.candidate.buildings[0]
          accepted.candidate.buildingCorrections = {
            baseBuildings: [structuredClone(building)],
            operations: [{ type: 'set_height', buildingId: building.id, value: 18, quote: 'Cambiá la altura del cuerpo sin cubierta a 18 m.' }],
          }
          building.height = 18; building.source = 'estimated'
        }
        project = await projects.applyFoundationVersion(owner, project.id, accepted, project.revision)
        const acceptedModel = structuredClone(project.foundationModels![acceptedTarget])
        const foundations = structuredClone(project.foundations!)
        if (changedTargets.some(target => target === 'dwelling')) {
          foundations.dwelling.levels.push({ ...structuredClone(foundations.dwelling.levels[0]), id: 'upper-floor', name: 'Planta alta', levelIndex: 1, planReferences: [{ id: planReferenceId, name: 'Plano planta alta' }] })
        }
        if (changedTargets.some(target => target === 'building')) foundations.building.address = 'Otra dirección 123'
        const saved = await projects.save(owner, project.id, { revision: project.revision, foundations })
        assert.equal(saved.stage, 'setup'); assert.equal(saved.scene, null)
        assert.equal(saved.foundationModels?.levels.length ?? 0, 0)
        const acceptedChanged = changedTargets.some(target => target === acceptedTarget)
        assert.equal(saved.foundations![acceptedTarget].status, acceptedChanged ? 'draft' : 'ready')
        if (acceptedChanged) assert.equal(saved.foundationModels, null)
        else assert.deepEqual(saved.foundationModels![acceptedTarget], acceptedModel, 'the unchanged model retains its version, geometry and correction provenance')
        for (const target of changedTargets) {
          assert.equal(saved.foundations![target].status, 'draft')
          assert.equal(saved.foundationModels?.[target] ?? null, null)
        }
        assert.deepEqual(await projects.get(owner, project.id), saved, 'the independent states survive persistence')
        if (!acceptedChanged) {
          const remainingTarget = acceptedTarget === 'building' ? 'dwelling' : 'building'
          const complete = await projects.applyFoundationVersion(owner, project.id, version(saved, remainingTarget), saved.revision)
          assert.equal(complete.stage, 'ready')
          assert.equal(complete.foundationModels!.levels.length, saved.foundations!.dwelling.levels.length)
          assert.deepEqual(complete.foundationModels![acceptedTarget], acceptedModel, 'accepting the remaining base uses the preserved model')
        }
      })
    }
  }
})

test('reviewed foundations unlock independent floors, preserve checkpoints, restore and clone safely', async t => {
  const database = openAppDatabase()
  t.after(() => database.close())
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  const addUser = async (): Promise<User> => {
    const id = randomUUID(), user: User = { id, email: `${id}@example.test`, name: 'Tester', role: 'user' }
    await database.db.insertInto('user').values({ ...user, image: null, emailVerified: database.bool(false), suspended: database.bool(false), createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
    return user
  }
  const owner = await addUser(), outsider = await addUser()
  const projects = await createProjects({ database, accounts })
  let project = await projects.create(owner, { name: 'Casa con subsuelo' })
  const foundations = structuredClone(project.foundations!)
  foundations.dwelling.levels.push({ ...structuredClone(foundations.dwelling.levels[0]), id: 'basement', name: 'Subsuelo', levelIndex: -1 })
  project = await projects.save(owner, project.id, { revision: project.revision, foundations })
  const home = version(project, 'dwelling'), building = version(project, 'building')
  await assert.rejects(projects.applyFoundationVersion(outsider, project.id, home, project.revision), errorStatus(404))
  await assert.rejects(projects.applyFoundationVersion(owner, project.id, { ...home, status: 'needs_input' }, project.revision), errorStatus(400))
  await assert.rejects(projects.applyFoundationVersion(owner, project.id, { ...home, foundationsFingerprint: 'stale' }, project.revision), errorStatus(409))
  project = await projects.applyFoundationVersion(owner, project.id, home, project.revision)
  assert.equal(project.scene, null); assert.equal(project.stage, 'setup')
  assert.equal(project.foundations!.dwelling.status, 'ready')
  await assert.rejects(projects.applyFoundationVersion(owner, project.id, building, 2), errorStatus(409))
  project = await projects.applyFoundationVersion(owner, project.id, building, project.revision)
  assert.equal(project.stage, 'ready'); assert.equal(project.foundationModels!.levels.length, 2)
  assert.equal(project.foundationModels!.levels[1].scene.placement.floorIndex, -1)
  assert.equal((await projects.listCheckpoints(owner, project.id)).length, 0)
  const changedInputs = structuredClone(project.foundations!)
  changedInputs.building.address = 'Una dirección distinta después de materializar'
  await assert.rejects(projects.save(owner, project.id, { revision: project.revision, foundations: changedInputs }), errorStatus(409))
  assert.deepEqual(await projects.get(owner, project.id), project, 'materialized foundations still require the agent correction workflow')

  const floors = structuredClone(project.foundationModels!.levels)
  floors[0].scene.apartment.metadata.description = 'Ajuste manual de planta baja'
  floors[1].scene.apartment.metadata.description = 'Ajuste manual del subsuelo'
  project = await projects.save(owner, project.id, { revision: project.revision, name: 'Casa revisada', scene: floors[1].scene, levels: floors, activeLevelId: 'basement' })
  assert.equal(project.scene!.apartment.metadata.description, 'Ajuste manual del subsuelo')
  assert.equal(project.foundationModels!.levels[0].scene.project.name, 'Casa revisada')
  await assert.rejects(projects.save(owner, project.id, { revision: project.revision, scene: project.scene, levels: [floors[0]], activeLevelId: 'ground-floor' }), errorStatus(400))
  const beforeReplacement = structuredClone(project)
  const replacement = version(project, 'dwelling')
  project = await projects.applyFoundationVersion(owner, project.id, replacement, project.revision)
  assert.notEqual(project.scene!.apartment.metadata.description, 'Ajuste manual del subsuelo')
  const checkpoints = await projects.listCheckpoints(owner, project.id)
  assert.equal(checkpoints.length, 1); assert.equal(checkpoints[0].revision, beforeReplacement.revision)
  await assert.rejects(projects.listCheckpoints(outsider, project.id), errorStatus(404))
  await database.db.insertInto('t3_project_member').values({ projectId: project.id, userId: outsider.id, role: 'viewer', createdAt: new Date().toISOString() }).execute()
  assert.equal((await projects.listCheckpoints(outsider, project.id)).length, 1)
  await assert.rejects(projects.restoreCheckpoint(outsider, project.id, checkpoints[0].id, project.revision), errorStatus(403))
  await assert.rejects(projects.restoreCheckpoint(owner, project.id, checkpoints[0].id, project.revision - 1), errorStatus(409))
  project = await projects.restoreCheckpoint(owner, project.id, checkpoints[0].id, project.revision)
  assert.deepEqual(project.foundationModels, beforeReplacement.foundationModels)
  assert.deepEqual(project.scene, beforeReplacement.scene)
  assert.equal((await projects.listCheckpoints(owner, project.id)).length, 2)
  const clone = await projects.create(owner, { name: 'Copia de casa' }, project.id)
  assert.equal(clone.foundationModels!.levels.length, 2)
  assert.equal(clone.foundationModels!.activeLevelId, 'basement')
  for (const floor of clone.foundationModels!.levels) { assert.equal(floor.scene.project.id, clone.id); assert.equal(floor.scene.project.name, clone.name) }
  assert.equal((await projects.listCheckpoints(owner, clone.id)).length, 0)
  await assert.rejects(projects.restoreCheckpoint(owner, clone.id, checkpoints[0].id, clone.revision), errorStatus(404))
  await database.migrateApp()
  assert.equal((await projects.listCheckpoints(owner, project.id)).length, 2)
})
