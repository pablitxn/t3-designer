import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createProjectFoundations } from '@t3-designer/scene-schema'
import { AccountError, createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { createProjects } from '../src/projects.ts'

test('blank projects persist multi-level foundations with private plans, revision conflicts and no demo dependency', async t => {
  const database = openAppDatabase()
  const accounts = await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
  t.after(() => database.close())
  const addUser = async (): Promise<User> => {
    const id = randomUUID(), user: User = { id, email: `${id}@example.test`, name: 'User', role: 'user' }
    await database.db.insertInto('user').values({ ...user, image: null, emailVerified: database.bool(false), suspended: database.bool(false), createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
    return user
  }
  const owner = await addUser(), other = await addUser()
  const references = new Set<string>()
  const projects = await createProjects({ database, accounts, bundledScenePath: '/no-demo-available.json',
    validatePlanReference: async (_user, projectId, referenceId) => references.has(`${projectId}:${referenceId}`),
    clonePlanReferences: async (sourceId, targetId, _user, foundations) => {
      for (const level of foundations.dwelling.levels) for (const reference of level.planReferences) {
        assert.ok(references.has(`${sourceId}:${reference.id}`))
        references.add(`${targetId}:${reference.id}`)
      }
    },
  })
  const draft = await projects.create(owner, { name: 'Casa propia', notes: 'Primer relevamiento' })
  assert.equal(draft.scene, null)
  assert.equal(draft.stage, 'setup')
  assert.deepEqual(draft.foundations, createProjectFoundations())
  assert.equal((await projects.list(owner))[0].stage, 'setup')
  assert.deepEqual(await projects.list(other), [])
  assert.ok(draft.foundations)
  const foundations = structuredClone(draft.foundations)
  foundations.dwelling.kind = 'house'
  foundations.dwelling.levels.push({ ...structuredClone(foundations.dwelling.levels[0]), id: 'bedrooms', name: 'Dormitorios', levelIndex: 1, elevation: 2.9, ceilingHeight: 2.6, notes: 'Escalera junto al acceso' })
  foundations.building = { status: 'draft', address: 'Dirección aportada', countryCode: 'AR', region: 'Provincia de Buenos Aires', notes: 'Parcela pendiente de identificar', sources: [{ id: 'registry', title: 'Ficha a revisar', url: 'https://example.test/record', kind: 'official', retrievedAt: '2026-10-07' }] }
  const planId = randomUUID()
  foundations.dwelling.levels[1].planReferences = [{ id: planId, name: 'Planta alta.png' }]
  const badRequest = (error: unknown) => error instanceof AccountError && error.status === 400
  await assert.rejects(projects.save(owner, draft.id, { revision: 1, foundations }), badRequest)
  references.add(`${draft.id}:${planId}`)
  const saved = await projects.save(owner, draft.id, { revision: 1, foundations })
  assert.equal(saved.revision, 2)
  assert.deepEqual((await projects.get(owner, draft.id)).foundations, foundations)
  assert.equal(saved.stage, 'setup', 'inputs alone never unlock downstream modeling tools')
  assert.equal(saved.scene, null)
  await assert.rejects(projects.save(owner, draft.id, { revision: 1, foundations }), error => error instanceof AccountError && error.status === 409)
  await assert.rejects(projects.save(other, draft.id, { revision: 2, foundations }), error => error instanceof AccountError && error.status === 404)
  await database.db.insertInto('t3_project_member').values({ projectId: draft.id, userId: other.id, role: 'viewer', createdAt: new Date().toISOString() }).execute()
  assert.deepEqual((await projects.get(other, draft.id)).foundations, foundations)
  await assert.rejects(projects.save(other, draft.id, { revision: 2, foundations }), error => error instanceof AccountError && error.status === 403)
  const clone = await projects.create(other, { name: 'Mi copia' }, draft.id)
  assert.equal(clone.scene, null)
  assert.equal(clone.stage, 'setup')
  assert.deepEqual(clone.foundations, foundations)
  assert.ok(references.has(`${clone.id}:${planId}`))
  await assert.rejects(projects.get(owner, clone.id), error => error instanceof AccountError && error.status === 404)
  const completed = structuredClone(foundations)
  completed.dwelling.status = 'ready'; completed.building.status = 'ready'
  await assert.rejects(projects.save(owner, draft.id, { revision: 2, foundations: completed }), badRequest)
  await assert.rejects(projects.save(owner, draft.id, { revision: 2, scene: {} }), badRequest)
  await assert.rejects(projects.save(owner, draft.id, { revision: 2, foundations: null }), badRequest)
  assert.equal((await projects.get(owner, draft.id)).revision, 2)
  await database.migrateApp()
  assert.deepEqual((await projects.get(owner, draft.id)).foundations, foundations, 'migration is idempotent and preserves intake')
})
