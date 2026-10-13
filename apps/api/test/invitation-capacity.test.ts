import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { openAppDatabase } from '../src/app-database.ts'
import { AccountError, createAccounts } from '../src/accounts.ts'

test('personal and shared invitations share capacity, serialize the last place, and release terminal places', async () => {
  const database = openAppDatabase({ sqlitePath: ':memory:' })
  try {
    const accounts = await createAccounts({ database, baseURL: 'http://127.0.0.1:5173', secret: randomBytes(48).toString('hex') })
    const password = randomBytes(24).toString('base64url')
    const bootstrap = await accounts.createBootstrapInvitation('admin@example.test')
    const admin = await accounts.acceptInvitation({ token: bootstrap.token, email: 'admin@example.test', name: 'Admin', password })
    const invite = await accounts.createInvitation('premium@example.test', admin.id, false, 'premium')
    const premium = await accounts.acceptInvitation({ token: invite.token, email: 'premium@example.test', name: 'Premium', password })
    const first = await accounts.createInvitationLink(premium, { maxUses: 10 })
    await accounts.createInvitationLink(premium, { maxUses: 9 })
    const attempts = await Promise.allSettled([
      accounts.createInvitation('personal@example.test', premium.id),
      accounts.createInvitationLink(premium, { maxUses: 1 }),
    ])
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    const rejected = attempts.find(result => result.status === 'rejected')
    assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof AccountError)
    assert.equal(rejected.reason.status, 429)
    await assert.rejects(accounts.createInvitation('over@example.test', premium.id), { status: 429 })
    await database.db.updateTable('t3_invite_link').set({ revokedAt: new Date().toISOString() }).where('id', '=', first.link.id).execute()
    const personal = await accounts.createInvitation('released@example.test', premium.id)
    await database.db.updateTable('t3_invitation').set({ expiresAt: '2000-01-01T00:00:00.000Z' }).where('id', '=', personal.invitation.id).execute()
    await accounts.createInvitationLink(premium, { maxUses: 10 })
    await assert.rejects(accounts.createInvitation('still-over@example.test', premium.id), { status: 429 })
    // A caller holding stale canInvite metadata cannot allocate after demotion.
    await accounts.credits.setTier(premium.id, 'standard')
    await assert.rejects(accounts.createInvitationLink(premium, { maxUses: 1 }), { status: 403 })
    await assert.rejects(accounts.createInvitation('demoted@example.test', premium.id), { status: 403 })
  } finally { await database.close() }
})
