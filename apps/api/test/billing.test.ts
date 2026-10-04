import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import test, { type TestContext } from 'node:test'
import pg from 'pg'
import { createAccounts } from '../src/accounts.ts'
import { openAppDatabase } from '../src/app-database.ts'
import { BillingService, DEFAULT_BILLING_PRICES, MercadoPagoClient, migrateBilling, paidPeriodEnd, validWebhookSignature, type BillingConfig } from '../src/billing.ts'
import { CreditService } from '../src/credits.ts'

type Subscription = Awaited<ReturnType<MercadoPagoClient['subscription']>>
type Preference = Awaited<ReturnType<MercadoPagoClient['preference']>>
type Payment = Awaited<ReturnType<MercadoPagoClient['payment']>>
type Invoice = Awaited<ReturnType<MercadoPagoClient['invoice']>>
type MerchantOrder = Awaited<ReturnType<MercadoPagoClient['merchantOrder']>>
const settings: BillingConfig = { mode: 'sandbox', publicUrl: 'http://127.0.0.1:5173', accessToken: 'fake-test-token', webhookSecret: 'fake-webhook-secret', payerEmail: 'buyer@testuser.com', ...DEFAULT_BILLING_PRICES }

/** Fakes the provider transport, so real parsing, ownership and database paths run. */
class Provider extends MercadoPagoClient {
  subscriptions = new Map<string, Subscription>()
  preferences = new Map<string, Preference>()
  paymentRecords = new Map<string, Payment>()
  invoiceRecords = new Map<string, Invoice>()
  merchantOrders = new Map<string, MerchantOrder>()
  writes = 0
  testSeller = true
  timeoutAfterCreate = false
  timeoutBeforeCreate = false
  checkoutHost = 'www.mercadopago.com.ar'
  async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const url = new URL(path, 'https://api.mercadopago.com')
    const data = body as Record<string, unknown>
    if (url.pathname === '/users/me') return { id: 'seller', tags: this.testSeller ? ['test_user'] : [], site_id: 'MLA' }
    if (method === 'POST') {
      this.writes++
      if (this.timeoutBeforeCreate) throw new Error('Unknown network result')
      const id = randomUUID()
      const shared = { id, external_reference: data.external_reference as string, collector_id: 'seller', init_point: `https://${this.checkoutHost}/checkout?${id}` }
      let result: unknown
      if (url.pathname === '/preapproval') {
        result = { ...shared, status: 'pending', auto_recurring: data.auto_recurring }
        this.subscriptions.set(id, result as Subscription)
      } else if (url.pathname === '/checkout/preferences') {
        result = { ...shared, items: data.items }
        this.preferences.set(id, result as Preference)
      } else throw new Error(`Unexpected POST ${path}`)
      if (this.timeoutAfterCreate) { this.timeoutAfterCreate = false; throw new Error('Unknown network result') }
      return structuredClone(result)
    }
    if (url.pathname === '/preapproval/search') return { results: [...this.subscriptions.values()], paging: { total: this.subscriptions.size } }
    if (url.pathname === '/checkout/preferences/search') {
      const records = [...this.preferences.values()].filter(value => value.external_reference === url.searchParams.get('external_reference'))
      return { elements: records, total: records.length }
    }
    if (url.pathname === '/authorized_payments/search') {
      const records = [...this.invoiceRecords.values()].filter(value => value.preapproval_id === url.searchParams.get('preapproval_id'))
      return { results: records, paging: { total: records.length } }
    }
    if (url.pathname === '/v1/payments/search') {
      const records = [...this.paymentRecords.values()].filter(value => value.external_reference === url.searchParams.get('external_reference'))
      return { results: records, paging: { total: records.length } }
    }
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!)
    if (url.pathname.startsWith('/preapproval/')) {
      const subscription = this.subscriptions.get(id)!
      if (method === 'PUT') { this.writes++; subscription.status = data.status as Subscription['status'] }
      return structuredClone(subscription)
    }
    if (url.pathname.startsWith('/checkout/preferences/')) return structuredClone(this.preferences.get(id))
    if (url.pathname.startsWith('/v1/payments/')) return structuredClone(this.paymentRecords.get(id))
    if (url.pathname.startsWith('/authorized_payments/')) return structuredClone(this.invoiceRecords.get(id))
    if (url.pathname.startsWith('/merchant_orders/')) return structuredClone(this.merchantOrders.get(id))
    throw new Error(`Unexpected GET ${path}`)
  }
  recurring(subscription: Subscription, date: string, status = 'approved') {
    const payment: Payment = { id: randomUUID(), external_reference: subscription.external_reference, status, live_mode: false, collector_id: 'seller', currency_id: 'ARS', transaction_amount: subscription.auto_recurring.transaction_amount, date_approved: status === 'approved' ? date : null }
    const invoice: Invoice = { id: randomUUID(), preapproval_id: subscription.id, payment: { id: payment.id } }
    this.paymentRecords.set(payment.id, payment); this.invoiceRecords.set(invoice.id, invoice)
    return { payment, invoice }
  }
  pack(preference: Preference, date: string, status = 'approved') {
    const merchant: MerchantOrder = { id: randomUUID(), preference_id: preference.id, external_reference: preference.external_reference, payments: [] }
    const payment: Payment = { id: randomUUID(), external_reference: preference.external_reference, status, live_mode: false, collector_id: 'seller', currency_id: 'ARS', transaction_amount: preference.items[0].unit_price, date_approved: status === 'approved' ? date : null, order: { id: merchant.id, type: 'mercadopago' } }
    merchant.payments.push({ id: payment.id })
    this.paymentRecords.set(payment.id, payment); this.merchantOrders.set(merchant.id, merchant)
    return { payment, merchant }
  }
}

async function fixture(t: TestContext, dialect: string, mode: BillingConfig['mode'] = 'sandbox') {
  let url: string | undefined, cleanup: (() => Promise<void>) | undefined
  if (dialect === 'postgres') {
    const parsed = new URL(process.env.TEST_DATABASE_URL!)
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a disposable local *_test database.')
    const pool = new pg.Pool({ connectionString: parsed.toString() })
    const schema = `t3_billing_${randomUUID().replaceAll('-', '')}`
    await pool.query(`CREATE SCHEMA ${schema}`)
    parsed.searchParams.set('options', `-c search_path=${schema}`)
    url = parsed.toString()
    cleanup = async () => { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() }
  }
  const database = openAppDatabase({ url })
  t.after(async () => { await database.close(); await cleanup?.() })
  await createAccounts({ database, baseURL: settings.publicUrl, secret: randomUUID() + randomUUID() })
  await migrateBilling(database)
  const clock = { date: new Date('2026-01-31T12:00:00Z') }
  const now = () => clock.date
  const credits = new CreditService(database, { trialCredits: 0, premiumMonthlyCredits: 0 }, now)
  const ids = [randomUUID(), randomUUID()]
  for (const id of ids) {
    await database.db.insertInto('user').values({ id, name: 'Billing test', email: `${id}@example.test`, role: 'user', emailVerified: database.bool(true), suspended: database.bool(false), image: null, createdAt: database.authDate(now()), updatedAt: database.authDate(now()) }).execute()
    await credits.initialize(id, 'standard')
  }
  const provider = new Provider(settings)
  const config = { ...settings, mode }
  const billing = new BillingService(database, credits, config, now, provider)
  return { database, credits, clock, provider, billing, user: ids[0], other: ids[1], config, now }
}

test('webhook manifest binds exact id/request, accepts seconds/milliseconds and rejects replay/ambiguity', () => {
  const now = Date.now(), request = randomUUID(), id = 'ABC-123', secret = 'only-test-secret'
  for (const ts of [String(now), String(Math.floor(now / 1000))]) {
    const hash = createHmac('sha256', secret).update(`id:${id.toLowerCase()};request-id:${request};ts:${ts};`).digest('hex')
    const signature = `ts=${ts},v1=${hash}`
    assert.equal(validWebhookSignature(secret, signature, request, id, now), true)
    assert.equal(validWebhookSignature(secret, signature, request, 'other', now), false)
    assert.equal(validWebhookSignature(secret, signature, 'other', id, now), false)
    assert.equal(validWebhookSignature(secret, signature, request, id, now + 301_000), false)
    assert.equal(validWebhookSignature(secret, signature + `,ts=${ts}`, request, id, now), false)
    assert.equal(validWebhookSignature('', signature, request, id, now), false)
  }
  assert.equal(paidPeriodEnd(new Date('2026-01-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z')
  assert.equal(paidPeriodEnd(new Date('2024-01-31T12:00:00Z')).toISOString(), '2024-02-29T12:00:00.000Z')
})

for (const dialect of process.env.TEST_DATABASE_URL ? ['sqlite', 'postgres'] : ['sqlite']) {
  test(`disabled defaults and isolated local simulation (${dialect})`, async t => {
    const f = await fixture(t, dialect, 'disabled')
    assert.equal((await f.billing.status(f.user)).products.length, 3)
    await assert.rejects(f.billing.checkout(f.user, 'monthly'), /desarrollo/)
    await assert.rejects(f.billing.simulate(f.user, 'anything'), /desarrollo/)
    assert.equal(f.provider.writes, 0)
    assert.throws(() => new BillingService(f.database, f.credits, { ...settings, mode: 'mock', publicUrl: 'https://example.com' }), /local/)
    const mock = new BillingService(f.database, f.credits, { ...settings, mode: 'mock' }, f.now)
    const checkout = await mock.checkout(f.user, 'monthly')
    assert.equal(checkout.checkoutUrl, null)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
    await assert.rejects(mock.simulate(f.other, checkout.orderId), /No existe/)
    await mock.simulate(f.user, checkout.orderId)
    await mock.simulate(f.user, checkout.orderId)
    assert.equal((await f.credits.summary(f.user)).balance, 500)
    await mock.cancel(f.user)
    assert.equal((await f.credits.summary(f.user)).balance, 500)
    await assert.rejects(mock.simulate(f.user, checkout.orderId), /cancelada/)
    const sandbox = new BillingService(f.database, f.credits, settings, f.now, f.provider)
    assert.equal((await sandbox.status(f.user)).orders.length, 0)
    await sandbox.refresh(f.user)
    assert.equal(f.provider.writes, 0)
  })

  test(`subscription authorization is not payment; retries, renewals, cancellation and refund are atomic (${dialect})`, async t => {
    const f = await fixture(t, dialect)
    const checkouts = await Promise.all([f.billing.checkout(f.user, 'monthly'), f.billing.checkout(f.user, 'monthly')])
    assert.equal(checkouts[0].orderId, checkouts[1].orderId)
    assert.equal(f.provider.writes, 1)
    const remote = [...f.provider.subscriptions.values()][0]
    remote.status = 'authorized'
    await f.billing.webhook('subscription_preapproval', remote.id)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
    const { payment, invoice } = f.provider.recurring(remote, f.now().toISOString(), 'pending')
    await f.billing.webhook('subscription_authorized_payment', invoice.id)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
    payment.status = 'approved'; payment.date_approved = f.now().toISOString()
    await Promise.all([f.billing.webhook('subscription_authorized_payment', invoice.id), f.billing.refresh(f.user)])
    assert.equal((await f.credits.summary(f.user)).balance, 500)
    assert.equal((await f.billing.status(f.user)).subscription?.periodEndsAt, '2026-02-28T12:00:00.000Z')
    assert.equal((await f.billing.status(f.other)).payments.length, 0)
    f.clock.date = new Date('2026-02-28T12:00:00Z')
    f.provider.recurring(remote, f.now().toISOString())
    await f.billing.refresh(f.user)
    assert.equal((await f.credits.summary(f.user)).balance, 500)
    await f.billing.cancel(f.user)
    assert.equal((await f.billing.status(f.user)).subscription?.status, 'cancelled')
    assert.equal((await f.credits.summary(f.user)).balance, 500)
    const newest = [...f.provider.paymentRecords.values()].at(-1)!
    newest.status = 'refunded'
    f.provider.invoiceRecords.clear() // Old records must remain reconcilable after search pruning.
    await f.billing.refresh(f.user)
    await f.billing.webhook('payment', newest.id)
    const wallet = await f.credits.summary(f.user)
    assert.equal(wallet.balance, 0)
    assert.equal(wallet.transactions.filter(row => row.type === 'revoke').length, 1)
    assert.equal((await f.billing.status(f.user)).subscription?.periodEndsAt, '2026-02-28T12:00:00.000Z')
  })

  test(`packs require canonical preference ownership and a paid payment, with one grant under concurrency (${dialect})`, async t => {
    const f = await fixture(t, dialect)
    const result = await f.billing.checkout(f.user, 'pack100')
    assert.match(result.checkoutUrl!, /^https:\/\/www\.mercadopago\.com\.ar\//)
    const preference = [...f.provider.preferences.values()][0]
    const { payment, merchant } = f.provider.pack(preference, f.now().toISOString(), 'pending')
    await f.billing.webhook('payment', payment.id)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
    payment.status = 'approved'; payment.date_approved = f.now().toISOString()
    const correctPreference = merchant.preference_id
    merchant.preference_id = 'unrelated'
    await assert.rejects(f.billing.webhook('payment', payment.id), /verificar/)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
    merchant.preference_id = correctPreference
    await Promise.all([f.billing.webhook('payment', payment.id), f.billing.refresh(f.user), f.billing.refresh(f.user)])
    const wallet = await f.credits.summary(f.user)
    assert.equal(wallet.balance, 100)
    assert.equal(wallet.grants.length, 1)
    assert.equal(wallet.grants[0].expiresAt, null)
    assert.equal((await f.billing.status(f.user)).orders[0].status, 'approved')
    await f.credits.reserve(f.user, 'asset-operation', 'asset')
    await f.credits.commit('asset-operation')
    payment.status = 'charged_back'
    await f.database.db.updateTable('user').set({ suspended: f.database.bool(true) }).where('id', '=', f.user).execute()
    await f.billing.webhook('payment', payment.id) // Suspension must not prevent refund reconciliation.
    await f.billing.webhook('payment', payment.id)
    const reversed = await f.credits.summary(f.user)
    assert.equal(reversed.balance, 0)
    assert.equal(reversed.debt, 20)
    assert.equal(reversed.transactions.filter(row => row.type === 'revoke').length, 1)
    await assert.rejects(f.billing.checkout(f.user, 'pack500'), /activa/)
  })

  test(`unknown checkout outcomes recover references without repeating provider POSTs (${dialect})`, async t => {
    const f = await fixture(t, dialect)
    for (const product of ['monthly', 'pack100'] as const) {
      f.provider.timeoutAfterCreate = true
      await assert.rejects(f.billing.checkout(f.user, product), /Unknown network/)
      const count = f.provider.writes
      const recovered = await f.billing.checkout(f.user, product)
      assert.ok(recovered.checkoutUrl)
      assert.equal(f.provider.writes, count)
    }
    f.provider.timeoutBeforeCreate = true
    await assert.rejects(f.billing.checkout(f.user, 'pack500'), /Unknown network/)
    const count = f.provider.writes
    await assert.rejects(f.billing.checkout(f.user, 'pack500'), /todavía no se confirmó/)
    assert.equal(f.provider.writes, count)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
  })

  test(`a rejected pack can be purchased again without losing the original payment history (${dialect})`, async t => {
    const f = await fixture(t, dialect)
    const original = await f.billing.checkout(f.user, 'pack100')
    const preference = [...f.provider.preferences.values()][0]
    const { payment } = f.provider.pack(preference, f.now().toISOString(), 'rejected')
    await f.billing.webhook('payment', payment.id)
    const replacement = await f.billing.checkout(f.user, 'pack100')
    assert.notEqual(replacement.orderId, original.orderId)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
    assert.equal((await f.billing.status(f.user)).payments[0].status, 'rejected')
    assert.equal((await f.billing.status(f.user)).orders.length, 2)
  })

  test(`seller and checkout origin restrictions fail before granting credits (${dialect})`, async t => {
    const f = await fixture(t, dialect)
    f.provider.testSeller = false
    await assert.rejects(f.billing.checkout(f.user, 'monthly'), /vendedora de prueba/)
    assert.equal(f.provider.writes, 0)
    f.provider.testSeller = true; f.provider.checkoutHost = 'attacker.example'
    await assert.rejects(f.billing.checkout(f.user, 'monthly'), /verificar/)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
  })

  test(`invalid live payment, amount, currency, seller, reference and approval time never grant (${dialect})`, async t => {
    const f = await fixture(t, dialect)
    await f.billing.checkout(f.user, 'monthly')
    const remote = [...f.provider.subscriptions.values()][0]
    const { payment, invoice } = f.provider.recurring(remote, f.now().toISOString())
    const original = structuredClone(payment)
    const mutations: Partial<Payment>[] = [{ live_mode: true }, { transaction_amount: 1 }, { currency_id: 'USD' }, { collector_id: 'different-seller' }, { external_reference: 'different-order' }, { date_approved: null }, { date_approved: '2027-01-01T00:00:00Z' }, { date_approved: '2025-01-01T00:00:00Z' }]
    for (const mutation of mutations) {
      Object.assign(payment, original, mutation)
      await assert.rejects(f.billing.webhook('subscription_authorized_payment', invoice.id), /verificar/)
      assert.equal((await f.credits.summary(f.user)).balance, 0)
      assert.equal((await f.billing.status(f.user)).payments.length, 0)
    }
    Object.assign(payment, original)
    await f.billing.refresh(f.user)
    assert.equal((await f.credits.summary(f.user)).balance, 500)
    payment.transaction_amount_refunded = 1
    await f.billing.refresh(f.user)
    assert.equal((await f.credits.summary(f.user)).balance, 0)
  })
}
