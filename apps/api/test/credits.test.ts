import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import pg from 'pg'
import { createAccounts } from '../src/accounts.ts'
import { openAppDatabase, type AppDatabase } from '../src/app-database.ts'
import { CreditError, CreditService } from '../src/credits.ts'

async function user(database: AppDatabase, role = 'user') {
  const id = randomUUID()
  await database.db.insertInto('user').values({ id, email: `${id}@example.test`, name: 'Test', role, suspended: database.bool(false), emailVerified: database.bool(true), image: null, createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
  return id
}

for (const dialect of process.env.TEST_DATABASE_URL ? ['sqlite', 'postgres'] : ['sqlite']) {
  test(`credit grants, reservations and recovery (${dialect})`, async t => {
    let cleanup: (() => Promise<void>) | undefined
    let url: string | undefined
    if (dialect === 'postgres') {
      const parsed = new URL(process.env.TEST_DATABASE_URL!)
      if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a disposable local *_test PostgreSQL database.')
      const pool = new pg.Pool({ connectionString: parsed.toString() })
      const schema = `t3_credits_${randomUUID().replaceAll('-', '')}`
      await pool.query(`CREATE SCHEMA ${schema}`)
      parsed.searchParams.set('options', `-c search_path=${schema}`)
      url = parsed.toString()
      cleanup = async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() }
    }
    const directory = mkdtempSync(join(tmpdir(), 't3-credits-'))
    const options = { url, sqlitePath: join(directory, 'accounts.sqlite') }
    const database = openAppDatabase(options)
    await createAccounts({ database, baseURL: 'http://localhost:5173', secret: randomUUID() + randomUUID() })
    t.after(async () => { await database.close(); await cleanup?.(); rmSync(directory, { recursive: true, force: true }) })
    let now = new Date('2026-10-04T10:00:00.000Z')
    const credits = new CreditService(database, {}, () => now)
    const secondService = new CreditService(database, {}, () => now)

    if (dialect === 'postgres') await t.test('invitation migration inspects the active schema rather than another same-named table', async () => {
      const pool = new pg.Pool({ connectionString: url })
      const other = `aaa_credit_migration_${randomUUID().replaceAll('-', '')}`
      try {
        await pool.query(`CREATE SCHEMA ${other}`)
        await pool.query(`CREATE TABLE ${other}.t3_invitation (id text, tier text, "revokedAt" text)`)
        await database.db.schema.alterTable('t3_invitation').dropColumn('tier').execute()
        await database.db.schema.alterTable('t3_invitation').dropColumn('revokedAt').execute()
        await database.migrateApp()
        await database.db.selectFrom('t3_invitation').select(['tier', 'revokedAt']).execute()
      } finally { await pool.query(`DROP SCHEMA ${other} CASCADE`); await pool.end() }
    })

    await t.test('backfill is idempotent, gifts only admins and grants a fresh migration trial', async () => {
      const admin = await user(database, 'admin'), normal = await user(database)
      await credits.backfill()
      await credits.backfill()
      assert.equal((await credits.summary(admin)).tier, 'premium')
      assert.equal((await credits.summary(admin)).balance, 1000)
      const trial = await credits.summary(normal)
      assert.equal(trial.tier, 'standard')
      assert.equal(trial.balance, 100)
      assert.equal(trial.trialEndsAt, '2026-10-19T10:00:00.000Z')
      assert.equal(trial.grants.length, 1)
    })

    await t.test('initial account and allowance creation share one transaction', async () => {
      const id = randomUUID()
      await assert.rejects(database.db.transaction().execute(async transaction => {
        await transaction.insertInto('user').values({ id, email: `${id}@example.test`, name: 'Rollback', role: 'user', suspended: database.bool(false), emailVerified: database.bool(true), image: null, createdAt: database.authDate(), updatedAt: database.authDate() }).execute()
        await credits.initialize(id, 'standard', transaction)
        throw new Error('rollback')
      }), /rollback/)
      assert.equal(await database.db.selectFrom('user').select('id').where('id', '=', id).executeTakeFirst(), undefined)
      assert.equal(await database.db.selectFrom('t3_credit_account').select('userId').where('userId', '=', id).executeTakeFirst(), undefined)
    })

    await t.test('competing services cannot overspend and settle once without altering prior events', async () => {
      const id = await user(database)
      await credits.initialize(id, 'standard')
      const original = (await credits.summary(id)).transactions[0]
      const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => (index % 2 ? credits : secondService).reserve(id, `${id}:${index}`, 'asset')))
      const accepted = attempts.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      assert.equal(accepted.length, 5)
      for (const failed of attempts.filter(result => result.status === 'rejected')) assert.ok(failed.reason instanceof CreditError && failed.reason.status === 402)
      assert.equal((await credits.summary(id)).balance, 0)
      assert.equal((await credits.summary(id)).reserved, 100)
      await Promise.all([credits.commit(accepted[0].id), secondService.commit(accepted[0].id)])
      await Promise.all([credits.refund(accepted[1].id), secondService.refund(accepted[1].id)])
      assert.equal((await credits.summary(id)).balance, 20)
      assert.equal((await credits.summary(id)).reserved, 60)
      assert.deepEqual(await database.db.selectFrom('t3_credit_ledger').selectAll().where('id', '=', original.id).executeTakeFirstOrThrow(), original)
      await assert.rejects(credits.refund(accepted[0].id), error => error instanceof CreditError && error.status === 409)
      await assert.rejects(credits.commit(accepted[1].id), error => error instanceof CreditError && error.status === 409)
      const duplicate = await credits.reserve(id, accepted[0].id, 'asset')
      assert.equal(duplicate.state, 'committed')
      const other = await user(database)
      await credits.initialize(other, 'standard')
      await assert.rejects(credits.reserve(other, accepted[0].id, 'asset'), error => error instanceof CreditError && error.status === 409)
      await assert.rejects(credits.reserve(id, accepted[0].id, 'revision'), error => error instanceof CreditError && error.status === 409)
    })

    await t.test('grants validate finite integer amounts and duplicate source identity', async () => {
      const id = await user(database)
      await credits.initialize(id, 'standard')
      for (const amount of [-1, 0, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) await assert.rejects(credits.grant(id, { amount, sourceKey: `bad:${amount}`, reason: 'Test' }), CreditError)
      const input = { amount: 40, sourceKey: `payment:${id}`, reason: 'Paquete de créditos' }
      const granted = await Promise.all([credits.grant(id, input), secondService.grant(id, input)])
      assert.equal(granted[0].id, granted[1].id)
      assert.equal((await credits.summary(id)).balance, 140)
      await assert.rejects(credits.grant(id, { ...input, amount: 80 }), error => error instanceof CreditError && error.status === 409)
      await assert.rejects(credits.grant(id, { ...input, expiresAt: 'no date' }), CreditError)
    })

    await t.test('trial expiration preserves purchased credits and refunds never resurrect expired grants', async () => {
      now = new Date('2026-10-04T10:00:00.000Z')
      const id = await user(database)
      await credits.initialize(id, 'standard')
      await credits.grant(id, { amount: 60, sourceKey: `pack:${id}`, reason: 'Paquete' })
      await credits.reserve(id, `expires:${id}`, 'asset')
      now = new Date('2026-10-20T10:00:00.000Z')
      assert.equal((await credits.summary(id)).balance, 60)
      assert.equal((await credits.summary(id)).trialActive, false)
      await credits.refund(`expires:${id}`)
      assert.equal((await credits.summary(id)).balance, 60)
      await credits.reserve(id, `paid:${id}`, 'asset')
      await credits.commit(`paid:${id}`)
      assert.equal((await credits.summary(id)).balance, 40)
      assert.equal((await credits.summary(id)).transactions.filter(event => event.type === 'expire').length, 1)
    })

    await t.test('premium renews only the current month, survives config changes and cannot be farmed by toggling tier', async () => {
      now = new Date('2026-10-04T10:00:00.000Z')
      const id = await user(database)
      await credits.initialize(id, 'premium')
      assert.equal((await credits.summary(id)).balance, 1000)
      const changed = new CreditService(database, { premiumMonthlyCredits: 500 }, () => now)
      assert.equal((await changed.summary(id)).balance, 1000)
      now = new Date('2027-01-01T00:00:00.000Z')
      assert.equal((await changed.summary(id)).balance, 500)
      assert.equal((await changed.summary(id)).grants.length, 2)
      await changed.setTier(id, 'standard')
      assert.equal((await changed.summary(id)).balance, 0)
      await changed.setTier(id, 'premium')
      assert.equal((await changed.summary(id)).balance, 0)
      now = new Date('2027-02-01T00:00:00.000Z')
      assert.equal((await changed.summary(id)).balance, 500)
    })

    await t.test('reversed purchases preserve spent debt, release no revoked funds and reconcile in-flight work', async () => {
      const id = await user(database)
      const empty = new CreditService(database, { trialCredits: 0 }, () => now)
      await empty.initialize(id, 'standard')
      const sourceKey = `reversal:${id}`
      await empty.grant(id, { amount: 100, sourceKey, reason: 'Payment' })
      await empty.reserve(id, `spent:${id}`, 'asset')
      await empty.commit(`spent:${id}`)
      await empty.reserve(id, `pending:${id}`, 'asset')
      await empty.reserve(id, `cancelled:${id}`, 'asset')
      await Promise.all([empty.revoke(sourceKey, 'Refund'), secondService.revoke(sourceKey, 'Refund')])
      assert.equal((await empty.summary(id)).balance, 0)
      assert.equal((await empty.summary(id)).debt, 20)
      await empty.commit(`pending:${id}`)
      await empty.refund(`cancelled:${id}`)
      assert.equal((await empty.summary(id)).debt, 40)
      await empty.grant(id, { amount: 50, sourceKey: `replacement:${id}`, reason: 'Replacement' })
      assert.equal((await empty.summary(id)).balance, 10)
      await assert.rejects(empty.reserve(id, `blocked:${id}`, 'asset'), error => error instanceof CreditError && error.status === 402)
      await empty.reserve(id, `covered:${id}`, 'revision')
      assert.equal((await empty.summary(id)).balance, 0)
    })

    await t.test('persistent reservation recovery works after service restart and across connections', async () => {
      const id = await user(database)
      await credits.initialize(id, 'standard')
      const operationId = `restart:${id}`
      await credits.reserve(id, operationId, 'asset')
      const reopened = openAppDatabase(options)
      try {
        const restarted = new CreditService(reopened, {}, () => now)
        assert.ok((await restarted.listReservations()).some(row => row.id === operationId))
        const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => (index % 2 ? credits : restarted).reserve(id, `reopened:${id}:${index}`, 'asset')))
        assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 4)
        await restarted.refund(operationId)
        await credits.refund(operationId)
        assert.equal((await restarted.summary(id)).balance, 20)
      } finally { await reopened.close() }
    })
  })
}
