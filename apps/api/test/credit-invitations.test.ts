import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'
import pg from 'pg'
import { createAccounts, type User } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'

interface Reply { user: User; token: string; link: { id: string; tier: string }; links: { id: string; tier: string }[]; invitation: { id: string; tier: string; trialDays: number; trialCredits: number }; error?: string }
for (const dialect of process.env.TEST_DATABASE_URL ? ['sqlite', 'postgres'] : ['sqlite']) {
  test(`gifted invitation access, limited redemption and revocation (${dialect})`, async t => {
    let cleanup: (() => Promise<void>) | undefined, url: string | undefined
    if (dialect === 'postgres') {
      const parsed = new URL(process.env.TEST_DATABASE_URL!)
      if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a disposable local *_test PostgreSQL database.')
      const pool = new pg.Pool({ connectionString: parsed.toString() }), schema = `t3_invite_${randomUUID().replaceAll('-', '')}`
      await pool.query(`CREATE SCHEMA ${schema}`)
      parsed.searchParams.set('options', `-c search_path=${schema}`); url = parsed.toString()
      cleanup = async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() }
    }
    const database = openAppDatabase({ url })
    const origin = 'http://localhost:5173'
    const accounts = await createAccounts({ database, baseURL: origin, secret: randomUUID() + randomUUID() })
    const server = createServer((req, res) => { void accounts.handle(req, res).then(handled => { if (!handled) res.writeHead(404).end() }).catch(() => res.writeHead(500).end()) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address(); assert.ok(address && typeof address === 'object')
    t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await database.close(); await cleanup?.() })
    const request = async (path: string, body?: unknown, cookie?: string) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, body: await response.json() as Reply, cookie: response.headers.getSetCookie().map(item => item.split(';')[0]).join('; ') }
    }
    const password = 'correct-test-password-123'
    const bootstrap = await accounts.createBootstrapInvitation('admin@example.test')
    const admin = await accounts.acceptInvitation({ token: bootstrap.token, email: 'admin@example.test', name: 'Admin', password })
    const premiumInvite = await accounts.createInvitation('premium@example.test', admin.id, false, 'premium')
    const premium = await accounts.acceptInvitation({ token: premiumInvite.token, email: 'premium@example.test', name: 'Premium', password })
    const normalInvite = await accounts.createInvitation('normal@example.test', admin.id)
    const normal = await accounts.acceptInvitation({ token: normalInvite.token, email: 'normal@example.test', name: 'Normal', password })
    const adminCookie = (await request('/api/account/sign-in', { email: admin.email, password })).cookie
    const premiumCookie = (await request('/api/account/sign-in', { email: premium.email, password })).cookie
    const normalCookie = (await request('/api/account/sign-in', { email: normal.email, password })).cookie

    await t.test('gift entitlement has limited credits and grants no administrator privileges', async () => {
      assert.equal((await accounts.credits.summary(admin.id)).balance, 1000)
      assert.equal((await accounts.credits.summary(premium.id)).balance, 1000)
      assert.equal((await accounts.credits.summary(normal.id)).balance, 100)
      assert.equal((await request('/api/me', undefined, premiumCookie)).body.user.canInvite, true)
      assert.equal((await request('/api/me', undefined, normalCookie)).body.user.canInvite, false)
      assert.equal((await request('/api/account/users', undefined, premiumCookie)).status, 403)
      assert.equal((await request(`/api/account/users/${normal.id}/tier`, { tier: 'premium' }, premiumCookie)).status, 403)
      assert.equal((await request('/api/account/invitation-links', { maxUses: 1 }, normalCookie)).status, 403)
      assert.equal((await request('/api/account/invitations', { email: 'forbidden@example.test' }, normalCookie)).status, 403)
      assert.equal((await request('/api/account/invitation-links', { maxUses: 1, tier: 'premium' }, premiumCookie)).status, 403)
      assert.equal((await request('/api/account/invitation-links', { maxUses: 11 }, premiumCookie)).status, 403)
      assert.equal((await request('/api/account/invitations', { email: 'forbidden@example.test', tier: 'premium' }, premiumCookie)).status, 403)
      assert.equal((await request('/api/account/invitations', { email: 'forbidden@example.test', role: 'admin' }, premiumCookie)).status, 400)
      assert.equal((await request(`/api/account/users/${admin.id}/tier`, { tier: 'standard' }, adminCookie)).status, 403)
    })

    await t.test('admin gifts premium, while premium share links create only standard trials', async () => {
      const gifted = await request('/api/account/invitation-links', { maxUses: 1, tier: 'premium' }, adminCookie)
      assert.equal(gifted.status, 201)
      const giftUser = await accounts.acceptInvitation({ token: gifted.body.token, email: 'gifted@example.test', name: 'Gifted', password })
      assert.equal(giftUser.tier, 'premium'); assert.equal(giftUser.role, 'user')
      assert.equal((await accounts.credits.summary(giftUser.id)).balance, 1000)
      const link = await request('/api/account/invitation-links', { maxUses: 2 }, premiumCookie)
      assert.equal(link.status, 201)
      const metadata = await request('/api/account/invitation', { token: link.body.token })
      assert.equal(metadata.body.invitation.tier, 'standard')
      assert.equal(metadata.body.invitation.trialDays, 15)
      assert.equal(metadata.body.invitation.trialCredits, 100)
      const invited = await accounts.acceptInvitation({ token: link.body.token, email: 'friend@example.test', name: 'Friend', password })
      assert.equal(invited.role, 'user'); assert.equal(invited.tier, 'standard'); assert.equal(invited.canInvite, false)
      assert.equal((await accounts.credits.summary(invited.id)).balance, 100)
      const listed = await request('/api/account/invitation-links', undefined, premiumCookie)
      assert.ok(listed.body.links.every(item => item.id !== gifted.body.link.id))
      assert.ok(!JSON.stringify(listed.body).includes(link.body.token))
      const stored = await database.db.selectFrom('t3_invite_link').selectAll().where('id', '=', link.body.link.id).executeTakeFirstOrThrow()
      assert.equal(stored.tokenHash.length, 64)
      assert.ok(!JSON.stringify(stored).includes(link.body.token))
    })

    await t.test('concurrent last-slot redemptions create exactly one trial and duplicate emails roll back usage', async () => {
      const invite = await accounts.createInvitationLink(premium, { maxUses: 1 })
      const attempts = await Promise.allSettled(['first', 'second'].map(name => accounts.acceptInvitation({ token: invite.token, email: `${name}@example.test`, name, password })))
      assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
      const row = await database.db.selectFrom('t3_invite_link').selectAll().where('id', '=', invite.link.id).executeTakeFirstOrThrow()
      assert.equal(row.uses, 1)
      assert.equal((await database.db.selectFrom('t3_invite_redemption').selectAll().where('linkId', '=', invite.link.id).execute()).length, 1)
      const repeat = await accounts.createInvitationLink(premium, { maxUses: 1 })
      await assert.rejects(accounts.acceptInvitation({ token: repeat.token, email: normal.email, name: 'Duplicate', password }), /existe/)
      assert.equal((await database.db.selectFrom('t3_invite_link').select('uses').where('id', '=', repeat.link.id).executeTakeFirstOrThrow()).uses, 0)
    })

    await t.test('expired, revoked and exhausted links reject before creation; foreign revocations fail', async () => {
      const expired = await accounts.createInvitationLink(premium, { maxUses: 1 })
      await database.db.updateTable('t3_invite_link').set({ expiresAt: '2000-01-01T00:00:00.000Z' }).where('id', '=', expired.link.id).execute()
      await assert.rejects(accounts.acceptInvitation({ token: expired.token, email: 'expired@example.test', name: 'Expired', password }), /vencida/)
      const revoked = await accounts.createInvitationLink(admin, { maxUses: 1 })
      assert.equal((await request(`/api/account/invitation-links/${revoked.link.id}/revoke`, {}, premiumCookie)).status, 404)
      assert.equal((await request(`/api/account/invitation-links/${revoked.link.id}/revoke`, {}, adminCookie)).status, 200)
      await assert.rejects(accounts.acceptInvitation({ token: revoked.token, email: 'revoked@example.test', name: 'Revoked', password }), /inválida/)
    })

    await t.test('downgrading or suspending an inviter invalidates links and current invite permissions', async () => {
      const invite = await accounts.createInvitationLink(premium, { maxUses: 1 })
      const personal = await accounts.createInvitation('personal@example.test', premium.id)
      assert.equal((await request(`/api/account/users/${premium.id}/tier`, { tier: 'standard' }, adminCookie)).status, 200)
      assert.equal((await request('/api/me', undefined, premiumCookie)).body.user.canInvite, false)
      assert.equal((await request('/api/account/invitation-links', { maxUses: 1 }, premiumCookie)).status, 403)
      await assert.rejects(accounts.acceptInvitation({ token: invite.token, email: 'downgraded@example.test', name: 'Downgraded', password }), /disponible/)
      await assert.rejects(accounts.acceptInvitation({ token: personal.token, email: 'personal@example.test', name: 'Personal', password }), /disponible/)
      await request(`/api/account/users/${premium.id}/tier`, { tier: 'premium' }, adminCookie)
      assert.equal((await accounts.credits.summary(premium.id)).balance, 0, 'tier toggles do not mint extra credits')
      await request(`/api/account/users/${premium.id}/suspend`, { suspended: true }, adminCookie)
      await assert.rejects(accounts.acceptInvitation({ token: invite.token, email: 'suspended@example.test', name: 'Suspended', password }), /disponible/)
      assert.equal((await request('/api/me', undefined, premiumCookie)).status, 401)
    })
  })
}
