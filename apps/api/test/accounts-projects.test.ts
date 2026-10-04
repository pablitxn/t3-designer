import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import test from 'node:test'
import pg from 'pg'
import { defaultDesignCustomization } from '@t3-designer/scene-schema'
import { createAccounts, normalizedIP, rateLimitClientIP } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { createProjects, type ProjectDocument, type ProjectAssetReference } from '../src/projects.ts'
import type { User } from '../src/accounts.ts'
import { createDefaultBuildingEnergy } from '../../web/src/energy/model.ts'

interface TestResponse { user: User; token: string; project: ProjectDocument; projects: ProjectDocument[]; error?: string; ok?: boolean }
const proxyRequest = (remoteAddress: string, forwarded?: string): IncomingMessage => ({ socket: { remoteAddress }, headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } }) as IncomingMessage

test('forwarded addresses require exact trusted hops and reject forged or malformed chains', () => {
  const trusted = new Set(['127.0.0.1', '10.0.0.2', '2001:db8::2'])
  assert.equal(normalizedIP('::ffff:127.0.0.1'), '127.0.0.1')
  assert.equal(normalizedIP('::ffff:7f00:1'), '127.0.0.1')
  assert.equal(normalizedIP('2001:0db8:0000::2'), '2001:db8::2')
  assert.equal(normalizedIP('fe80::1%lo'), null)
  assert.equal(rateLimitClientIP(proxyRequest('198.51.100.8', '203.0.113.99'), trusted), '198.51.100.8')
  assert.equal(rateLimitClientIP(proxyRequest('::ffff:127.0.0.1', '198.51.100.8, 10.0.0.2'), trusted), '198.51.100.8')
  assert.equal(rateLimitClientIP(proxyRequest('127.0.0.1', '203.0.113.99, 198.51.100.8, 10.0.0.2'), trusted), '198.51.100.8')
  assert.equal(rateLimitClientIP(proxyRequest('2001:db8::2', '2001:db8::123'), trusted), '2001:db8::123')
  assert.equal(rateLimitClientIP(proxyRequest('127.0.0.1'), trusted), '127.0.0.1')
  for (const invalid of ['', 'bad, 198.51.100.8', '198.51.100.8:80', '198.51.100.8,', Array(11).fill('198.51.100.8').join(',')]) {
    assert.throws(() => rateLimitClientIP(proxyRequest('127.0.0.1', invalid), trusted), /proxy inválida/)
  }
})

for (const dialect of process.env.TEST_DATABASE_URL ? ['sqlite', 'postgres'] : ['sqlite']) {
  test(`invited accounts, private projects and revocation (${dialect})`, async t => {
    const origin = 'http://127.0.0.1:5173'
    let cleanup: (() => Promise<void>) | undefined
    let url: string | undefined
    if (dialect === 'postgres') {
      const parsed = new URL(process.env.TEST_DATABASE_URL!)
      if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a disposable local *_test PostgreSQL database.')
      const pool = new pg.Pool({ connectionString: parsed.toString() })
      const schema = `t3_test_${randomUUID().replaceAll('-', '')}`
      await pool.query(`CREATE SCHEMA ${schema}`)
      parsed.searchParams.set('options', `-c search_path=${schema}`)
      url = parsed.toString()
      cleanup = async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() }
    }
    const database = openAppDatabase({ url })
    const accounts = await createAccounts({ database, baseURL: origin, secret: randomUUID() + randomUUID(), trustedProxyIPs: ['::ffff:127.0.0.1', '10.0.0.2'] })
    const attachments = new Map<string, ProjectAssetReference>()
    const projects = await createProjects({ database, accounts,
      validateAssetReference: async (_user, projectId, asset) => JSON.stringify(attachments.get(`${projectId}:${asset.id}`)) === JSON.stringify(asset),
      cloneAssetReferences: async (_sourceId, targetId, _user, scene) => {
        const copied = structuredClone(scene)
        const replacements = new Map<string, string>()
        for (const asset of copied.assets) {
          if (!asset.url.startsWith('/api/')) continue
          const original = asset.id
          asset.id = randomUUID()
          asset.url = `/api/projects/${targetId}/assets/${asset.id}/files/model.glb`
          asset.repoPath = `private/${asset.id}/model.glb`
          attachments.set(`${targetId}:${asset.id}`, { id: asset.id, url: asset.url, repoPath: asset.repoPath })
          replacements.set(original, asset.id)
        }
        for (const fixtures of [copied.fixtures, ...(copied.editor?.architectures.flatMap(architecture => architecture.layouts.map(layout => layout.fixtures)) ?? [])]) {
          for (const fixture of fixtures) fixture.assetId = replacements.get(fixture.assetId) ?? fixture.assetId
        }
        return copied
      },
    })
    const server = createServer((request, response) => {
      void (async () => {
        if (await accounts.handle(request, response) || await projects.handle(request, response)) return
        response.writeHead(404).end()
      })().catch(error => { response.writeHead(500).end(String(error)) })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const base = `http://127.0.0.1:${address.port}`
    t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await database.close(); await cleanup?.() })
    const request = async (path: string, options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}) => {
      const response = await fetch(base + path, {
        method: options.method ?? 'GET',
        headers: { Origin: options.origin ?? origin, ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.cookie ? { Cookie: options.cookie } : {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
      return { status: response.status, body: await response.json() as TestResponse, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '), cookies: response.headers.getSetCookie() }
    }
    const abandoned = await accounts.createBootstrapInvitation('admin@example.test')
    await assert.rejects(accounts.createBootstrapInvitation('admin@example.test'))
    await database.db.updateTable('t3_invitation').set({ expiresAt: '2000-01-01T00:00:00.000Z' }).where('id', '=', abandoned.invitation.id).execute()
    const first = await accounts.createBootstrapInvitation('admin@example.test')
    const accepted = await request('/api/account/accept-invitation', { method: 'POST', body: { token: first.token, email: 'admin@example.test', name: 'Admin', password: 'correct-test-password-123' } })
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
    const adminCookie = accepted.cookie
    const admin = accepted.body.user
    assert.equal(admin.role, 'admin')
    const session = await database.db.selectFrom('session').select('expiresAt').where('userId', '=', admin.id).executeTakeFirstOrThrow()
    assert.ok(new Date(session.expiresAt).getTime() <= Date.now() + 8 * 60 * 60_000)
    assert.ok(accepted.cookies.some(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')))
    assert.ok(!accepted.cookies.some(cookie => /Domain=/i.test(cookie)))
    assert.equal((await request('/api/me', { cookie: adminCookie })).status, 200)
    assert.equal((await request('/api/me')).status, 401)

    async function addUser(email: string, name: string) {
      const invite = await request('/api/account/invitations', { method: 'POST', cookie: adminCookie, body: { email } })
      assert.equal(invite.status, 201)
      const result = await request('/api/account/accept-invitation', { method: 'POST', body: { token: invite.body.token, email, name, password: 'correct-test-password-123' } })
      assert.equal(result.status, 200, JSON.stringify(result.body))
      return { user: result.body.user, cookie: result.cookie, token: invite.body.token }
    }
    const alice = await addUser('alice@example.test', 'Alice')
    const bob = await addUser('bob@example.test', 'Bob')

    await t.test('persistent rate limits separate verified clients and ignore spoofed prefixes', async () => {
      await accounts.rateLimit(proxyRequest('198.51.100.8', '203.0.113.10'), 'untrusted-proxy-test', 1)
      await assert.rejects(accounts.rateLimit(proxyRequest('198.51.100.8', '203.0.113.11'), 'untrusted-proxy-test', 1), /Demasiados/)
      await accounts.rateLimit(proxyRequest('127.0.0.1', '198.51.100.8, 10.0.0.2'), 'trusted-proxy-test', 1)
      await accounts.rateLimit(proxyRequest('127.0.0.1', '198.51.100.9, 10.0.0.2'), 'trusted-proxy-test', 1)
      await assert.rejects(accounts.rateLimit(proxyRequest('127.0.0.1', '203.0.113.99, 198.51.100.8, 10.0.0.2'), 'trusted-proxy-test', 1), /Demasiados/)
      await assert.rejects(accounts.rateLimit(proxyRequest('127.0.0.1', 'bad, 198.51.100.10'), 'trusted-proxy-test', 1), /proxy inválida/)
      await accounts.rateLimit(proxyRequest('127.0.0.1', '198.51.100.10'), 'trusted-proxy-test', 1)
    })

    await t.test('invites are hashed, email bound, one-use and atomic', async () => {
      const rows = await database.db.selectFrom('t3_invitation').selectAll().execute()
      assert.ok(rows.every(row => row.tokenHash.length === 64 && !JSON.stringify(row).includes(alice.token)))
      assert.equal((await request('/api/account/accept-invitation', { method: 'POST', body: { token: alice.token, email: 'alice@example.test', name: 'Again', password: 'correct-test-password-123' } })).status, 400)
      const invite = await accounts.createInvitation('single@example.test', admin.id)
      await assert.rejects(accounts.acceptInvitation({ token: invite.token, email: 'wrong@example.test', name: 'Wrong', password: 'correct-test-password-123' }))
      const attempts = await Promise.allSettled([1, 2].map(() => accounts.acceptInvitation({ token: invite.token, email: 'single@example.test', name: 'Once', password: 'correct-test-password-123' })))
      assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1)
      assert.equal((await database.db.selectFrom('user').select('id').where('email', '=', 'single@example.test').execute()).length, 1)
      await assert.rejects(accounts.createBootstrapInvitation('otheradmin@example.test'))
      const expired = await accounts.createInvitation('expired@example.test', admin.id)
      await database.db.updateTable('t3_invitation').set({ expiresAt: '2000-01-01T00:00:00.000Z' }).where('id', '=', expired.invitation.id).execute()
      await assert.rejects(accounts.acceptInvitation({ token: expired.token, email: 'expired@example.test', name: 'Expired', password: 'correct-test-password-123' }))
    })

    await t.test('raw signup routes and cross-origin mutations are blocked', async () => {
      assert.equal((await request('/api/auth/sign-up/email', { method: 'POST', body: { email: 'stranger@example.test', password: 'correct-test-password-123', name: 'Stranger' } })).status, 404)
      assert.equal((await request('/api/account/sign-in', { method: 'POST', origin: 'https://evil.example', body: { email: alice.user.email, password: 'correct-test-password-123' } })).status, 403)
      const noOrigin = await fetch(base + '/api/account/sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: alice.user.email, password: 'correct-test-password-123' }) })
      assert.equal(noOrigin.status, 403)
      assert.equal((await request('/api/account/users', { cookie: alice.cookie })).status, 403)
    })

    const created = await request('/api/projects', { method: 'POST', cookie: alice.cookie, body: { name: 'Alice home', notes: 'Private notes' } })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const project = created.body.project
    assert.equal(project.scene.project.id, project.id)
    const resource = `/api/projects/${project.id}`
    await t.test('private project isolation includes admin, listing and cloning', async () => {
      assert.equal((await request(resource, { cookie: bob.cookie })).status, 404)
      assert.equal((await request(resource, { cookie: adminCookie })).status, 404)
      assert.equal((await request('/api/projects', { cookie: bob.cookie })).body.projects.length, 0)
      assert.equal((await request(resource + '/clone', { method: 'POST', cookie: bob.cookie, body: {} })).status, 404)
    })
    await t.test('viewer/editor grants, safe clone, optimistic concurrency and revocation', async () => {
      assert.equal((await request(resource + '/members', { method: 'POST', cookie: alice.cookie, body: { email: bob.user.email, role: 'viewer' } })).status, 200)
      assert.equal((await request(resource, { cookie: bob.cookie })).body.project.role, 'viewer')
      assert.equal((await request(resource, { method: 'PUT', cookie: bob.cookie, body: { revision: 1, name: 'Nope' } })).status, 403)
      const clone = await request(resource + '/clone', { method: 'POST', cookie: bob.cookie, body: {} })
      assert.equal(clone.status, 201)
      assert.equal(clone.body.project.ownerId, bob.user.id)
      assert.equal((await request(`/api/projects/${clone.body.project.id}`, { cookie: alice.cookie })).status, 404)
      await request(resource + '/members', { method: 'POST', cookie: alice.cookie, body: { email: bob.user.email, role: 'editor' } })
      assert.equal((await request(resource, { method: 'PUT', cookie: bob.cookie, body: { revision: 1, notes: 'Shared edit' } })).status, 200)
      assert.equal((await request(resource, { method: 'PUT', cookie: alice.cookie, body: { revision: 1, name: 'Stale edit' } })).status, 409)
      assert.equal((await request(resource + '/members', { method: 'POST', cookie: bob.cookie, body: { email: admin.email, role: 'editor' } })).status, 403)
      await request(resource + '/members/' + bob.user.id, { method: 'DELETE', cookie: alice.cookie, body: {} })
      assert.equal((await request(resource, { cookie: bob.cookie })).status, 404)
    })
    await t.test('scene rejects foreign URLs, path changes and mismatched project identity', async () => {
      for (const edit of [
        (scene: typeof project.scene) => { scene.assets[0].url = '/api/projects/other/assets/secret/files/model.glb' },
        (scene: typeof project.scene) => { scene.assets[0].repoPath = '../secret' },
        (scene: typeof project.scene) => { scene.project.id = randomUUID() },
      ]) {
        const scene = structuredClone(project.scene); edit(scene)
        assert.equal((await request(resource, { method: 'PUT', cookie: alice.cookie, body: { revision: 2, scene } })).status, 400)
      }
      assert.equal((await request(resource, { cookie: alice.cookie })).body.project.revision, 2)
    })
    await t.test('editor variants persist and every inactive layout validates its assets', async () => {
      const scene = structuredClone(project.scene)
      scene.fixtures = []
      scene.editor = { schemaVersion: 1, activeArchitectureId: 'original', architectures: [{ id: 'original', name: 'Original', apartment: structuredClone(scene.apartment), partitionWallIds: [], activeLayoutId: 'active', layouts: [{ id: 'active', name: 'Active', fixtures: [] }, { id: 'inactive', name: 'Inactive', fixtures: [] }] }] }
      const saved = await request(resource, { method: 'PUT', cookie: alice.cookie, body: { revision: 2, scene } })
      assert.equal(saved.status, 200, JSON.stringify(saved.body))
      assert.deepEqual(saved.body.project.scene.editor, scene.editor)
      scene.editor.architectures[0].layouts[1].fixtures = [{ ...project.scene.fixtures[0], position: [1, 0, 1], assetId: 'someone-elses-asset' }]
      assert.equal((await request(resource, { method: 'PUT', cookie: alice.cookie, body: { revision: 3, scene } })).status, 400)
    })
    await t.test('private assets require exact grants and clone rewrites every layout', async () => {
      const scene = (await request(resource, { cookie: alice.cookie })).body.project.scene
      const asset = { ...scene.assets[0], id: randomUUID() }
      asset.url = `/api/projects/${project.id}/assets/${asset.id}/files/model.glb`
      asset.repoPath = `private/${asset.id}/model.glb`
      scene.assets.push(asset)
      scene.editor!.architectures[0].layouts[1].fixtures.push({ ...project.scene.fixtures[0], position: [1, 0, 1], assetId: asset.id })
      assert.equal((await request(resource, { method: 'PUT', cookie: alice.cookie, body: { revision: 3, scene } })).status, 400)
      attachments.set(`${project.id}:${asset.id}`, { id: asset.id, url: asset.url, repoPath: asset.repoPath })
      const saved = await request(resource, { method: 'PUT', cookie: alice.cookie, body: { revision: 3, scene } })
      assert.equal(saved.status, 200, JSON.stringify(saved.body))
      assert.equal(saved.body.project.scene.assets.at(-1)!.url, asset.url)
      assert.equal(saved.body.project.scene.assets.at(-1)!.repoPath, asset.repoPath)
      const cloned = await request(resource + '/clone', { method: 'POST', cookie: alice.cookie, body: {} })
      assert.equal(cloned.status, 201, JSON.stringify(cloned.body))
      const privateAsset = cloned.body.project.scene.assets.find(candidate => candidate.url.startsWith('/api/'))!
      assert.notEqual(privateAsset.id, asset.id)
      assert.ok(privateAsset.url.includes(cloned.body.project.id))
      assert.equal(cloned.body.project.scene.editor!.architectures[0].layouts[1].fixtures[0].assetId, privateAsset.id)
      assert.equal((await request(resource, { cookie: alice.cookie })).body.project.scene.assets.at(-1)!.id, asset.id)
    })
    await t.test('design alternatives and lamp emitters survive authenticated save, reload and clone while viewers cannot modify them', async () => {
      const createdDesign = await request('/api/projects', { method: 'POST', cookie: alice.cookie, body: { name: 'Lighting study' } })
      assert.equal(createdDesign.status, 201)
      const design = createdDesign.body.project.scene, designResource = `/api/projects/${createdDesign.body.project.id}`
      const fixture = design.fixtures[0]
      fixture.light = { enabled: true, kelvin: 2700, lumens: 700, offset: [0, .5, 0] }
      design.assets.find(asset => asset.id === fixture.assetId)!.light = structuredClone(fixture.light)
      design.customization = defaultDesignCustomization()
      design.customization.wallColors[design.apartment.walls[0].id] = '#e6d6c4'
      design.customization.floors[design.apartment.rooms[0].id] = { material: 'parquet', color: '#bc8855' }
      design.customization.doors[design.apartment.doors[0].id] = { style: 'glazed', color: '#fafafa', openness: .5 }
      design.customization.windows[design.apartment.windows[0].id] = { style: 'sliding', frameColor: '#303030', covering: 'blind', coveringColor: '#eeeedd', closure: .7 }
      design.customization.lighting.lights.push({ id: 'ceiling', name: 'Ceiling', roomId: fixture.roomId, enabled: true, kelvin: 4000, lumens: 1200, position: [fixture.position[0], 2, fixture.position[2]] })
      const evening = structuredClone(design.customization)
      evening.lighting.naturalEnabled = false
      evening.lighting.lights[0].kelvin = 2200
      design.editor = { schemaVersion: 1, activeArchitectureId: 'original', architectures: [{
        id: 'original', name: 'Original', apartment: structuredClone(design.apartment), partitionWallIds: [], activeLayoutId: 'day', layouts: [
          { id: 'day', name: 'Day', fixtures: structuredClone(design.fixtures), customization: structuredClone(design.customization) },
          { id: 'evening', name: 'Evening', fixtures: structuredClone(design.fixtures), customization: evening },
        ],
      }] }
      const saved = await request(designResource, { method: 'PUT', cookie: alice.cookie, body: { revision: 1, scene: design } })
      assert.equal(saved.status, 200, JSON.stringify(saved.body))
      const reloaded = await request(designResource, { cookie: alice.cookie })
      assert.equal(reloaded.status, 200)
      assert.deepEqual(reloaded.body.project.scene, design, 'HTTP JSON and database serialization retain all design fields and local light offsets')
      assert.equal((await request(designResource + '/members', { method: 'POST', cookie: alice.cookie, body: { email: bob.user.email, role: 'viewer' } })).status, 200)
      const viewer = await request(designResource, { cookie: bob.cookie })
      assert.deepEqual(viewer.body.project.scene, design)
      const forbidden = structuredClone(design)
      forbidden.customization!.lighting.naturalEnabled = false
      forbidden.editor!.architectures[0].layouts[0].customization!.lighting.naturalEnabled = false
      assert.equal((await request(designResource, { method: 'PUT', cookie: bob.cookie, body: { revision: 2, scene: forbidden } })).status, 403)
      const invalid = structuredClone(design)
      invalid.editor!.architectures[0].layouts[1].customization!.wallColors['missing-wall'] = '#000000'
      assert.equal((await request(designResource, { method: 'PUT', cookie: alice.cookie, body: { revision: 2, scene: invalid } })).status, 400)
      assert.equal((await request(designResource, { cookie: alice.cookie })).body.project.revision, 2)
      const clone = await request(designResource + '/clone', { method: 'POST', cookie: bob.cookie, body: { name: 'My lighting study' } })
      assert.equal(clone.status, 201, JSON.stringify(clone.body))
      assert.equal(clone.body.project.ownerId, bob.user.id)
      assert.deepEqual(clone.body.project.scene, { ...design, project: { id: clone.body.project.id, name: 'My lighting study' } })
      assert.deepEqual((await request(`/api/projects/${clone.body.project.id}`, { cookie: bob.cookie })).body.project.scene, clone.body.project.scene)
      assert.deepEqual((await request(designResource, { cookie: alice.cookie })).body.project.scene, design, 'clone and rejected mutations preserve the source')
    })
    await t.test('building energy survives save, reload and clone with revision and viewer protection', async () => {
      const created = await request('/api/projects', { method: 'POST', cookie: alice.cookie, body: { name: 'Rooftop energy' } })
      assert.equal(created.status, 201)
      const scene = created.body.project.scene
      const energyResource = `/api/projects/${created.body.project.id}`
      scene.buildingEnergy = createDefaultBuildingEnergy(scene.site.targetId)
      scene.buildingEnergy.installation.panelCount = 8
      const saved = await request(energyResource, { method: 'PUT', cookie: alice.cookie, body: { revision: 1, scene } })
      assert.equal(saved.status, 200, JSON.stringify(saved.body))
      const reloaded = await request(energyResource, { cookie: alice.cookie })
      assert.deepEqual(reloaded.body.project.scene.buildingEnergy, scene.buildingEnergy)
      assert.equal((await request(energyResource, { method: 'PUT', cookie: alice.cookie, body: { revision: 1, scene } })).status, 409)
      const foreign = structuredClone(scene)
      foreign.buildingEnergy!.buildingId = 'different-building'
      assert.equal((await request(energyResource, { method: 'PUT', cookie: alice.cookie, body: { revision: 2, scene: foreign } })).status, 400)
      assert.equal((await request(energyResource + '/members', { method: 'POST', cookie: alice.cookie, body: { email: bob.user.email, role: 'viewer' } })).status, 200)
      assert.deepEqual((await request(energyResource, { cookie: bob.cookie })).body.project.scene.buildingEnergy, scene.buildingEnergy)
      assert.equal((await request(energyResource, { method: 'PUT', cookie: bob.cookie, body: { revision: 2, scene } })).status, 403)
      const cloned = await request(energyResource + '/clone', { method: 'POST', cookie: alice.cookie, body: {} })
      assert.equal(cloned.status, 201)
      assert.deepEqual(cloned.body.project.scene.buildingEnergy, scene.buildingEnergy)
      assert.equal(cloned.body.project.revision, 1)
      assert.equal((await request(energyResource, { cookie: alice.cookie })).body.project.revision, 2)
    })
    await t.test('suspend and revoke immediately invalidate existing cookies', async () => {
      assert.equal((await request(`/api/account/users/${alice.user.id}/revoke-sessions`, { method: 'POST', cookie: adminCookie, body: {} })).status, 200)
      assert.equal((await request('/api/me', { cookie: alice.cookie })).status, 401)
      assert.equal((await request(`/api/account/users/${bob.user.id}/suspend`, { method: 'POST', cookie: adminCookie, body: { suspended: true } })).status, 200)
      assert.equal((await request('/api/me', { cookie: bob.cookie })).status, 401)
      assert.equal((await request('/api/account/sign-in', { method: 'POST', body: { email: bob.user.email, password: 'correct-test-password-123' } })).status, 401)
      assert.equal((await request(`/api/account/users/${admin.id}/suspend`, { method: 'POST', cookie: adminCookie, body: { suspended: true } })).status, 403)
      await request(`/api/account/users/${bob.user.id}/suspend`, { method: 'POST', cookie: adminCookie, body: { suspended: false } })
      const login = await request('/api/account/sign-in', { method: 'POST', body: { email: bob.user.email, password: 'correct-test-password-123' } })
      assert.equal(login.status, 200)
      await request('/api/account/sign-out', { method: 'POST', cookie: login.cookie, body: {} })
      assert.equal((await request('/api/me', { cookie: login.cookie })).status, 401)
    })
    await t.test('email login attempts are rate limited', async t => {
      // Keep real HTTP/authentication requests inside one deterministic bucket;
      // this subtest's mock automatically restores Date.now during cleanup.
      let now = Date.UTC(2026, 0, 1, 12, 0, 59, 999)
      t.mock.method(Date, 'now', () => now)
      async function attempts() {
        const statuses: number[] = []
        for (let attempt = 0; attempt < 6; attempt++) statuses.push((await request('/api/account/sign-in', { method: 'POST', body: { email: 'unknown@example.test', password: 'wrong-password' } })).status)
        return statuses
      }
      assert.deepEqual(await attempts(), [401, 401, 401, 401, 401, 429])
      now += 1 // Crossing the minute boundary grants a fresh five-attempt bucket.
      assert.deepEqual(await attempts(), [401, 401, 401, 401, 401, 429])
    })
    await t.test('operator recovery is one-use, expires and revokes all sessions', async () => {
      const recovery = await accounts.createRecovery('admin@example.test')
      assert.equal((await request('/api/account/reset-password', { method: 'POST', body: { token: recovery.token, password: 'replacement-password-456' } })).status, 200)
      assert.equal((await request('/api/me', { cookie: adminCookie })).status, 401)
      assert.equal((await request('/api/account/reset-password', { method: 'POST', body: { token: recovery.token, password: 'replacement-password-789' } })).status, 400)
      assert.equal((await request('/api/account/sign-in', { method: 'POST', body: { email: admin.email, password: 'correct-test-password-123' } })).status, 401)
      assert.equal((await request('/api/account/sign-in', { method: 'POST', body: { email: admin.email, password: 'replacement-password-456' } })).status, 200)
      const expired = await accounts.createRecovery('admin@example.test')
      await database.db.updateTable('t3_recovery').set({ expiresAt: '2000-01-01T00:00:00.000Z' }).execute()
      assert.equal((await request('/api/account/reset-password', { method: 'POST', body: { token: expired.token, password: 'replacement-password-789' } })).status, 400)
    })
  })
}
