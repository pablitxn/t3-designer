import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Transaction } from 'kysely'
import { z } from 'zod'
import { AccountError } from './accounts.ts'
import type { AppDatabase, AppTables } from './app-database.ts'
import type { CreditService } from './credits.ts'

export const CheckoutInputSchema = z.object({ product: z.enum(['monthly', 'pack100', 'pack500']) }).strict()
export type BillingProductId = z.infer<typeof CheckoutInputSchema>['product']
export interface BillingConfig {
  mode: 'disabled' | 'sandbox' | 'mock'
  publicUrl: string
  accessToken?: string
  webhookSecret?: string
  payerEmail?: string
  monthlyAmount: number
  monthlyCredits: number
  smallPackAmount: number
  smallPackCredits: number
  largePackAmount: number
  largePackCredits: number
}
export const DEFAULT_BILLING_PRICES = {
  monthlyAmount: 10000, monthlyCredits: 500,
  smallPackAmount: 3000, smallPackCredits: 100,
  largePackAmount: 12000, largePackCredits: 500,
}
type Order = AppTables['t3_billing_order']
type BillingTransaction = Transaction<AppTables>
export class BillingError extends AccountError {
  code: string
  constructor(status: number, code: string, message: string) { super(status, message); this.code = code }
}
const unavailable = () => new BillingError(503, 'BILLING_UNAVAILABLE', 'Los pagos están en desarrollo y todavía no están habilitados. No se realizan cobros reales.')
const providerFailure = () => new BillingError(502, 'BILLING_PROVIDER_ERROR', 'Mercado Pago no pudo confirmar la operación. Consultá el estado antes de reintentar.')
const mismatch = () => new BillingError(502, 'BILLING_RESOURCE_MISMATCH', 'No pudimos verificar la operación de prueba de Mercado Pago.')
const unconfirmed = () => new BillingError(409, 'CHECKOUT_UNCONFIRMED', 'El alta anterior todavía no se confirmó. Volvé a consultar; conservamos la misma operación para evitar duplicados.')
const IdSchema = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String)
const AmountSchema = z.union([z.number(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)]).transform(Number).pipe(z.number().finite().nonnegative())
const SubscriptionSchema = z.object({
  id: z.string(), external_reference: z.string(), collector_id: IdSchema,
  status: z.enum(['pending', 'authorized', 'paused', 'cancelled']), init_point: z.url().optional(),
  auto_recurring: z.object({ frequency: z.number(), frequency_type: z.string(), transaction_amount: AmountSchema, currency_id: z.string() }),
})
const PreferenceSchema = z.object({
  id: z.string(), external_reference: z.string(), collector_id: IdSchema, init_point: z.url(),
  items: z.array(z.object({ id: z.string(), quantity: z.number(), unit_price: AmountSchema, currency_id: z.string() })),
})
const InvoiceSchema = z.object({ id: IdSchema, preapproval_id: z.string(), payment: z.object({ id: IdSchema.nullable().optional() }).nullable().optional() })
const PaymentSchema = z.object({
  id: IdSchema, status: z.string(), live_mode: z.boolean(), transaction_amount: AmountSchema,
  transaction_amount_refunded: AmountSchema.optional(), currency_id: z.string(), collector_id: IdSchema,
  date_approved: z.string().nullable(), external_reference: z.string().nullable().optional(),
  order: z.object({ id: IdSchema, type: z.string() }).nullable().optional(),
})
const MerchantOrderSchema = z.object({ id: IdSchema, preference_id: z.string(), external_reference: z.string(), payments: z.array(z.object({ id: IdSchema })) })
type ProviderPayment = z.infer<typeof PaymentSchema>
function providerData<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw providerFailure()
  return parsed.data
}

/** Calendar month, clamped to the last day (Jan 31 -> Feb 28/29). */
export function paidPeriodEnd(approved: Date): Date {
  const date = new Date(approved), day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date
}

/** Query data.id must match the body; the HTTP handler enforces that before use. */
export function validWebhookSignature(secret: string, signature: string, requestId: string, dataId: string, now = Date.now()): boolean {
  if (!secret || !/^[A-Za-z0-9_-]{1,200}$/.test(dataId) || !/^[A-Za-z0-9_-]{1,200}$/.test(requestId)) return false
  const parts = signature.split(',').map(part => part.trim().split('='))
  const timestamps = parts.filter(([key]) => key === 'ts'), hashes = parts.filter(([key]) => key === 'v1')
  if (timestamps.length !== 1 || hashes.length !== 1 || parts.some(part => part.length !== 2)) return false
  const ts = timestamps[0][1], hash = hashes[0][1]
  if (!/^\d{10,13}$/.test(ts ?? '') || !/^[a-f0-9]{64}$/i.test(hash ?? '')) return false
  const time = Number(ts) * (ts.length <= 10 ? 1000 : 1)
  if (Math.abs(now - time) > 5 * 60_000) return false
  const expected = createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest()
  return timingSafeEqual(expected, Buffer.from(hash, 'hex'))
}

export async function migrateBilling(database: AppDatabase): Promise<void> {
  const { schema } = database.db
  await schema.createTable('t3_billing_order').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('userId', 'text', c => c.notNull().references('user.id').onDelete('cascade'))
    .addColumn('mode', 'text', c => c.notNull()).addColumn('product', 'text', c => c.notNull())
    .addColumn('kind', 'text', c => c.notNull()).addColumn('amountMinor', 'integer', c => c.notNull())
    .addColumn('credits', 'integer', c => c.notNull()).addColumn('providerId', 'text', c => c.unique())
    .addColumn('status', 'text', c => c.notNull()).addColumn('checkoutUrl', 'text')
    .addColumn('openKey', 'text', c => c.unique()).addColumn('createdAt', 'text', c => c.notNull())
    .addColumn('updatedAt', 'text', c => c.notNull()).execute()
  await schema.createIndex('t3_billing_order_user').ifNotExists().on('t3_billing_order').column('userId').execute()
  await schema.createTable('t3_billing_payment').ifNotExists()
    .addColumn('providerId', 'text', c => c.primaryKey())
    .addColumn('orderId', 'text', c => c.notNull().references('t3_billing_order.id').onDelete('cascade'))
    .addColumn('status', 'text', c => c.notNull()).addColumn('approvedAt', 'text').addColumn('periodEndsAt', 'text')
    .addColumn('createdAt', 'text', c => c.notNull()).addColumn('updatedAt', 'text', c => c.notNull()).execute()
  await schema.createIndex('t3_billing_payment_order').ifNotExists().on('t3_billing_payment').column('orderId').execute()
}

export class MercadoPagoClient {
  readonly config: BillingConfig
  constructor(config: BillingConfig) { this.config = config }
  async request(path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<unknown> {
    try {
      const response = await fetch(`https://api.mercadopago.com${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (!response.ok) throw providerFailure()
      return await response.json()
    } catch { throw providerFailure() }
  }
  async seller(): Promise<string> {
    const value = providerData(z.object({ id: IdSchema, tags: z.array(z.string()), site_id: z.string() }), await this.request('/users/me'))
    if (!value.tags.includes('test_user') || value.site_id !== 'MLA') throw new BillingError(503, 'SANDBOX_ACCOUNT_REQUIRED', 'Mercado Pago requiere una cuenta vendedora de prueba de Argentina.')
    return value.id
  }
  subscription(id: string) { return this.request(`/preapproval/${encodeURIComponent(id)}`).then(data => providerData(SubscriptionSchema, data)) }
  preference(id: string) { return this.request(`/checkout/preferences/${encodeURIComponent(id)}`).then(data => providerData(PreferenceSchema, data)) }
  invoice(id: string) { return this.request(`/authorized_payments/${encodeURIComponent(id)}`).then(data => providerData(InvoiceSchema, data)) }
  payment(id: string) { return this.request(`/v1/payments/${encodeURIComponent(id)}`).then(data => providerData(PaymentSchema, data)) }
  merchantOrder(id: string) { return this.request(`/merchant_orders/${encodeURIComponent(id)}`).then(data => providerData(MerchantOrderSchema, data)) }
  async search<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
    const result: T[] = []
    for (let offset = 0; offset < 1000;) {
      const page = providerData(z.object({ results: z.array(schema), paging: z.object({ total: z.number().int().nonnegative() }) }),
        await this.request(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`))
      result.push(...page.results)
      if (offset + page.results.length >= page.paging.total) return result
      if (!page.results.length) throw providerFailure()
      offset += page.results.length
    }
    // An incomplete search must never silently declare that a payment is absent.
    throw providerFailure()
  }
  invoices(id: string) { return this.search(`/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`, InvoiceSchema) }
  payments(reference: string) { return this.search(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}`, z.object({ id: IdSchema })) }
  async findSubscription(reference: string) {
    const results = await this.search(`/preapproval/search?payer_email=${encodeURIComponent(this.config.payerEmail ?? '')}`, z.object({ id: z.string(), external_reference: z.string().optional() }))
    const found = results.filter(item => item.external_reference === reference)
    if (found.length > 1) throw mismatch()
    return found[0] ? this.subscription(found[0].id) : null
  }
  async findPreference(reference: string) {
    const page = providerData(z.object({ elements: z.array(z.object({ id: z.string() })), total: z.number().int().nonnegative() }),
      await this.request(`/checkout/preferences/search?external_reference=${encodeURIComponent(reference)}&limit=2`))
    if (page.total > 1 || page.elements.length > 1) throw mismatch()
    return page.elements[0] ? this.preference(page.elements[0].id) : null
  }
}

export class BillingService {
  readonly database: AppDatabase
  readonly credits: CreditService
  readonly config: BillingConfig
  readonly now: () => Date
  readonly client: MercadoPagoClient | null
  constructor(database: AppDatabase, credits: CreditService, config: BillingConfig, now = () => new Date(), client?: MercadoPagoClient) {
    this.database = database; this.credits = credits; this.config = config; this.now = now
    this.client = config.mode === 'sandbox' ? client ?? new MercadoPagoClient(config) : null
    if (!['disabled', 'sandbox', 'mock'].includes(config.mode)) throw new Error('El modo de pagos solo admite disabled, sandbox o mock.')
    const origin = new URL(config.publicUrl)
    if (config.mode === 'mock' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('El simulador de pagos solo puede usarse con un origen local.')
    if (config.mode === 'sandbox' && (!config.accessToken || !config.webhookSecret || !config.payerEmail)) throw new Error('Sandbox requiere token, firma webhook y email de comprador de prueba.')
    for (const product of this.products()) {
      if (!Number.isSafeInteger(product.amount * 100) || product.amount <= 0 || product.amount > 10_000_000 || !Number.isSafeInteger(product.credits) || product.credits < 1 || product.credits > 1_000_000) throw new Error('Los precios y créditos de prueba deben ser positivos y válidos.')
    }
  }
  products() {
    const config = this.config
    return [
      { id: 'monthly' as const, label: 'Mensual', kind: 'subscription' as const, amount: config.monthlyAmount, credits: config.monthlyCredits, months: 1 },
      { id: 'pack100' as const, label: `${config.smallPackCredits} créditos`, kind: 'pack' as const, amount: config.smallPackAmount, credits: config.smallPackCredits, months: null },
      { id: 'pack500' as const, label: `${config.largePackCredits} créditos`, kind: 'pack' as const, amount: config.largePackAmount, credits: config.largePackCredits, months: null },
    ]
  }
  private sandbox() {
    if (this.config.mode !== 'sandbox' || !this.client) throw unavailable()
    return this.client
  }
  private async transaction<T>(userId: string, operation: (transaction: BillingTransaction) => Promise<T>, requireActive = true): Promise<T> {
    return this.database.db.transaction().execute(async transaction => {
      // A database write serializes this user's billing across processes and in SQLite.
      const user = await transaction.updateTable('user').set(eb => ({ name: eb.ref('name') })).where('id', '=', userId)
        .returning(['id', 'suspended']).executeTakeFirst()
      if (!user || (requireActive && user.suspended)) throw new AccountError(401, 'Iniciá sesión con una cuenta activa para continuar.')
      return operation(transaction)
    })
  }
  async status(userId: string) {
    const orders = await this.database.db.selectFrom('t3_billing_order').selectAll().where('userId', '=', userId).where('mode', '=', this.config.mode)
      .orderBy('createdAt', 'desc').orderBy('id', 'desc').limit(50).execute()
    const payments = await this.database.db.selectFrom('t3_billing_payment as p').innerJoin('t3_billing_order as o', 'o.id', 'p.orderId')
      .select(['p.providerId', 'p.orderId', 'p.status', 'p.approvedAt', 'p.periodEndsAt']).where('o.userId', '=', userId).where('o.mode', '=', this.config.mode)
      .orderBy('p.updatedAt', 'desc').limit(100).execute()
    const subscription = await this.database.db.selectFrom('t3_billing_order').selectAll().where('userId', '=', userId).where('mode', '=', this.config.mode)
      .where('kind', '=', 'subscription').orderBy('createdAt', 'desc').orderBy('id', 'desc').executeTakeFirst()
    const period = subscription ? await this.database.db.selectFrom('t3_billing_payment').select('periodEndsAt')
      .where('orderId', '=', subscription.id).where('status', '=', 'approved').where('periodEndsAt', 'is not', null).orderBy('periodEndsAt', 'desc').executeTakeFirst() : null
    return {
      mode: this.config.mode, currency: 'ARS' as const, products: this.products(),
      subscription: subscription ? { id: subscription.id, product: subscription.product, status: subscription.status, checkoutUrl: subscription.checkoutUrl, periodEndsAt: period?.periodEndsAt ?? null } : null,
      orders: orders.map(order => ({ id: order.id, product: order.product, kind: order.kind, status: order.status, amount: order.amountMinor / 100, credits: order.credits, checkoutUrl: order.checkoutUrl, createdAt: order.createdAt })),
      payments,
    }
  }
  async checkout(userId: string, productId: BillingProductId) {
    if (this.config.mode === 'disabled') throw unavailable()
    const product = this.products().find(item => item.id === productId)
    if (!product) throw new AccountError(400, 'Producto desconocido.')
    const seller = this.client ? await this.client.seller() : null // Verified BEFORE any remote write.
    const attempt = await this.transaction(userId, async transaction => {
      const openKey = `${this.config.mode}:${userId}:${productId}`
      const existing = await transaction.selectFrom('t3_billing_order').selectAll().where('openKey', '=', openKey).executeTakeFirst()
      if (existing) return { order: existing, create: false }
      const timestamp = this.now().toISOString()
      const order: Order = { id: randomUUID(), userId, mode: this.config.mode, product: product.id, kind: product.kind,
        amountMinor: Math.round(product.amount * 100), credits: product.credits, providerId: null, status: 'creating', checkoutUrl: null, openKey, createdAt: timestamp, updatedAt: timestamp }
      await transaction.insertInto('t3_billing_order').values(order).execute()
      return { order, create: true }
    })
    return this.transaction(userId, async transaction => {
      const order = await transaction.selectFrom('t3_billing_order').selectAll().where('id', '=', attempt.order.id).executeTakeFirstOrThrow()
      if (this.config.mode === 'mock') {
        if (order.status === 'creating') await transaction.updateTable('t3_billing_order').set({ status: 'pending', providerId: `mock-${order.id}`, updatedAt: this.now().toISOString() }).where('id', '=', order.id).execute()
        return { orderId: order.id, checkoutUrl: null, mode: this.config.mode }
      }
      if (order.checkoutUrl && ['pending', 'authorized', 'paused', 'in_process', 'in_mediation'].includes(order.status)) return { orderId: order.id, checkoutUrl: order.checkoutUrl, mode: this.config.mode }
      if (order.status !== 'creating') throw new BillingError(409, 'CHECKOUT_CLOSED', 'La operación ya terminó. Consultá el estado antes de crear otra.')
      const client = this.sandbox()
      let providerId: string, checkoutUrl: string, status: string
      if (order.kind === 'subscription') {
        const remote = attempt.create ? providerData(SubscriptionSchema, await client.request('/preapproval', 'POST', {
          reason: `T3 Designer · ${order.credits} créditos mensuales · prueba`, external_reference: order.id,
          payer_email: this.config.payerEmail, status: 'pending', back_url: `${this.config.publicUrl}/?billing=return`,
          auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: order.amountMinor / 100, currency_id: 'ARS' },
        }, order.id)) : await client.findSubscription(order.id)
        if (!remote) throw unconfirmed()
        this.validateSubscription(order, remote, seller!)
        if (!remote.init_point) throw providerFailure()
        providerId = remote.id; checkoutUrl = this.checkoutUrl(remote.init_point); status = remote.status
      } else {
        const remote = attempt.create ? providerData(PreferenceSchema, await client.request('/checkout/preferences', 'POST', {
          external_reference: order.id, items: [{ id: order.product, title: `T3 Designer · ${order.credits} créditos · prueba`, quantity: 1, unit_price: order.amountMinor / 100, currency_id: 'ARS' }],
          payer: { email: this.config.payerEmail }, back_urls: { success: `${this.config.publicUrl}/?billing=return`, pending: `${this.config.publicUrl}/?billing=return`, failure: `${this.config.publicUrl}/?billing=return` },
          notification_url: `${this.config.publicUrl}/api/billing/webhook`,
        }, order.id)) : await client.findPreference(order.id)
        if (!remote) throw unconfirmed()
        this.validatePreference(order, remote, seller!)
        providerId = remote.id; checkoutUrl = this.checkoutUrl(remote.init_point); status = 'pending'
      }
      await transaction.updateTable('t3_billing_order').set({ providerId, checkoutUrl, status, updatedAt: this.now().toISOString(), ...(status === 'cancelled' ? { openKey: null } : {}) }).where('id', '=', order.id).execute()
      return { orderId: order.id, checkoutUrl, mode: this.config.mode }
    })
  }
  private checkoutUrl(value: string): string {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'www.mercadopago.com.ar' || url.username || url.password || url.port) throw mismatch()
    return url.href
  }
  private validateSubscription(order: Order, remote: z.infer<typeof SubscriptionSchema>, seller: string) {
    if (remote.external_reference !== order.id || remote.collector_id !== seller || (order.providerId && remote.id !== order.providerId)
      || remote.auto_recurring.frequency !== 1 || remote.auto_recurring.frequency_type !== 'months'
      || remote.auto_recurring.currency_id !== 'ARS' || Math.round(remote.auto_recurring.transaction_amount * 100) !== order.amountMinor) throw mismatch()
  }
  private validatePreference(order: Order, remote: z.infer<typeof PreferenceSchema>, seller: string) {
    const item = remote.items[0]
    if (remote.external_reference !== order.id || remote.collector_id !== seller || (order.providerId && remote.id !== order.providerId)
      || remote.items.length !== 1 || item.id !== order.product || item.quantity !== 1 || item.currency_id !== 'ARS' || Math.round(item.unit_price * 100) !== order.amountMinor) throw mismatch()
  }
  private validatePayment(order: Order, payment: ProviderPayment, expectedId: string, seller: string) {
    if (payment.id !== expectedId || payment.live_mode || payment.collector_id !== seller || payment.currency_id !== 'ARS'
      || Math.round(payment.transaction_amount * 100) !== order.amountMinor || (payment.external_reference && payment.external_reference !== order.id)) throw mismatch()
  }
  private async savePayment(transaction: BillingTransaction, order: Order, payment: ProviderPayment) {
    const approved = payment.date_approved ? new Date(payment.date_approved) : null
    const paid = payment.status === 'approved' && !(payment.transaction_amount_refunded && payment.transaction_amount_refunded > 0)
    if (paid && (!approved || !Number.isFinite(approved.getTime()) || approved.getTime() > this.now().getTime() + 60_000 || approved.getTime() < new Date(order.createdAt).getTime() - 60_000)) throw mismatch()
    const previous = await transaction.selectFrom('t3_billing_payment').selectAll().where('providerId', '=', payment.id).executeTakeFirst()
    if (previous && previous.orderId !== order.id) throw mismatch()
    // Preserve the original approved period across retries and subsequent refunds.
    if (paid && previous?.approvedAt && approved!.toISOString() !== previous.approvedAt) throw mismatch()
    const timestamp = this.now().toISOString()
    const approvedAt = paid ? approved!.toISOString() : previous?.approvedAt ?? null
    const periodEndsAt = paid && order.kind === 'subscription' ? paidPeriodEnd(approved!).toISOString() : previous?.periodEndsAt ?? null
    const status = paid ? 'approved' : payment.status === 'approved' ? 'refunded' : payment.status
    await transaction.insertInto('t3_billing_payment').values({ providerId: payment.id, orderId: order.id, status, approvedAt, periodEndsAt, createdAt: timestamp, updatedAt: timestamp })
      .onConflict(oc => oc.column('providerId').doUpdateSet({ status, approvedAt, periodEndsAt, updatedAt: timestamp })).execute()
    const sourceKey = `${order.mode}:payment:${payment.id}`
    if (paid) {
      await this.credits.grant(order.userId, { amount: order.credits, sourceKey, reason: order.kind === 'subscription' ? 'Suscripción mensual de prueba' : 'Paquete de créditos de prueba', expiresAt: periodEndsAt }, transaction)
    } else if (previous?.approvedAt) {
      await this.credits.revoke(sourceKey, `Pago ${payment.id}: ${status}`, transaction)
    }
    if (order.kind === 'pack') await transaction.updateTable('t3_billing_order').set({ status, updatedAt: timestamp, ...(paid || ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(status) ? { openKey: null } : {}) }).where('id', '=', order.id).execute()
  }
  private async reconcile(orderId: string, invoiceId?: string, paymentId?: string) {
    const client = this.sandbox()
    const seller = await client.seller()
    const order = await this.database.db.selectFrom('t3_billing_order').selectAll().where('id', '=', orderId).where('mode', '=', 'sandbox').executeTakeFirst()
    if (!order) return
    await this.transaction(order.userId, async transaction => {
      const current = await transaction.selectFrom('t3_billing_order').selectAll().where('id', '=', order.id).executeTakeFirstOrThrow()
      if (current.kind === 'subscription') {
        const remote = current.providerId ? await client.subscription(current.providerId) : await client.findSubscription(current.id)
        if (!remote) throw unconfirmed()
        this.validateSubscription(current, remote, seller)
        const invoices = invoiceId ? [await client.invoice(invoiceId)] : await client.invoices(remote.id)
        for (const invoice of invoices) {
          if (invoice.preapproval_id !== remote.id) throw mismatch()
          if (!invoice.payment?.id) continue
          const payment = await client.payment(invoice.payment.id)
          this.validatePayment(current, payment, invoice.payment.id, seller)
          await this.savePayment(transaction, current, payment)
        }
        // Keep checking recorded payments even when provider search history is pruned.
        const stored = await transaction.selectFrom('t3_billing_payment').select('providerId').where('orderId', '=', current.id).execute()
        const checked = new Set(invoices.map(invoice => invoice.payment?.id))
        for (const saved of stored) {
          if (!checked.has(saved.providerId) || saved.providerId === paymentId) {
            const payment = await client.payment(saved.providerId)
            this.validatePayment(current, payment, saved.providerId, seller)
            await this.savePayment(transaction, current, payment)
          }
        }
        await transaction.updateTable('t3_billing_order').set({ providerId: remote.id, status: remote.status, updatedAt: this.now().toISOString(), ...(remote.status === 'cancelled' ? { openKey: null } : {}) }).where('id', '=', current.id).execute()
      } else {
        const remote = current.providerId ? await client.preference(current.providerId) : await client.findPreference(current.id)
        if (!remote) throw unconfirmed()
        this.validatePreference(current, remote, seller)
        await transaction.updateTable('t3_billing_order').set({ providerId: remote.id, updatedAt: this.now().toISOString() }).where('id', '=', current.id).execute()
        const saved = await transaction.selectFrom('t3_billing_payment').select('providerId').where('orderId', '=', current.id).execute()
        const found = paymentId ? [{ id: paymentId }] : await client.payments(current.id)
        const payments = [...new Set([...found.map(payment => payment.id), ...saved.map(payment => payment.providerId)])].map(id => ({ id }))
        for (const candidate of payments) {
          const payment = await client.payment(candidate.id)
          this.validatePayment(current, payment, candidate.id, seller)
          if (payment.external_reference !== current.id || !payment.order || payment.order.type !== 'mercadopago') throw mismatch()
          const merchant = await client.merchantOrder(payment.order.id)
          if (merchant.id !== payment.order.id || merchant.preference_id !== remote.id || merchant.external_reference !== current.id || !merchant.payments.some(item => item.id === payment.id)) throw mismatch()
          await this.savePayment(transaction, current, payment)
        }
      }
    }, false)
  }
  async refresh(userId: string) {
    if (this.config.mode !== 'sandbox') return this.status(userId)
    const orders = await this.database.db.selectFrom('t3_billing_order').select('id').where('userId', '=', userId).where('mode', '=', 'sandbox').orderBy('createdAt', 'desc').execute()
    // Cancelled orders stay eligible for refund/chargeback reconciliation.
    for (const order of orders) await this.reconcile(order.id)
    return this.status(userId)
  }
  async cancel(userId: string) {
    if (this.config.mode === 'disabled') throw unavailable()
    const seller = this.client ? await this.client.seller() : null
    await this.transaction(userId, async transaction => {
      const order = await transaction.selectFrom('t3_billing_order').selectAll().where('openKey', '=', `${this.config.mode}:${userId}:monthly`).executeTakeFirst()
      if (!order) return
      if (this.client) {
        if (!order.providerId) throw unconfirmed()
        const remote = providerData(SubscriptionSchema, await this.client.request(`/preapproval/${encodeURIComponent(order.providerId)}`, 'PUT', { status: 'cancelled' }))
        this.validateSubscription(order, remote, seller!)
        if (remote.status !== 'cancelled') throw providerFailure()
      }
      await transaction.updateTable('t3_billing_order').set({ status: 'cancelled', openKey: null, updatedAt: this.now().toISOString() }).where('id', '=', order.id).execute()
    })
    return this.status(userId)
  }
  async simulate(userId: string, orderId: string) {
    if (this.config.mode !== 'mock') throw unavailable()
    await this.transaction(userId, async transaction => {
      const order = await transaction.selectFrom('t3_billing_order').selectAll().where('id', '=', orderId).where('userId', '=', userId).where('mode', '=', 'mock').executeTakeFirst()
      if (!order) throw new AccountError(404, 'No existe esa operación de prueba.')
      if (order.status === 'cancelled') throw new AccountError(409, 'La suscripción de prueba está cancelada.')
      const id = `mock-payment-${order.id}`
      const previous = await transaction.selectFrom('t3_billing_payment').select('approvedAt').where('providerId', '=', id).executeTakeFirst()
      await this.savePayment(transaction, order, { id, status: 'approved', live_mode: false, transaction_amount: order.amountMinor / 100, currency_id: 'ARS', collector_id: 'mock', date_approved: previous?.approvedAt ?? this.now().toISOString(), external_reference: order.id })
      if (order.kind === 'subscription') await transaction.updateTable('t3_billing_order').set({ status: 'authorized', updatedAt: this.now().toISOString() }).where('id', '=', order.id).execute()
    })
    return this.status(userId)
  }
  /** Called only after the HTTP handler validates the signed query id and body. */
  async webhook(type: string, id: string) {
    const client = this.sandbox()
    if (type === 'subscription_preapproval') {
      const remote = await client.subscription(id)
      if (remote.id !== id) throw mismatch()
      const order = await this.database.db.selectFrom('t3_billing_order').selectAll().where('id', '=', remote.external_reference).where('kind', '=', 'subscription').where('mode', '=', 'sandbox').executeTakeFirst()
      if (order) {
        if (order.providerId && order.providerId !== id) throw mismatch()
        await this.reconcile(order.id)
      }
    } else if (type === 'subscription_authorized_payment') {
      const invoice = await client.invoice(id)
      if (invoice.id !== id) throw mismatch()
      const remote = await client.subscription(invoice.preapproval_id)
      const order = await this.database.db.selectFrom('t3_billing_order').selectAll().where('id', '=', remote.external_reference).where('kind', '=', 'subscription').where('mode', '=', 'sandbox').executeTakeFirst()
      if (order) {
        if (order.providerId && order.providerId !== invoice.preapproval_id) throw mismatch()
        await this.reconcile(order.id, id)
      }
    } else if (type === 'payment') {
      const attributed = await this.database.db.selectFrom('t3_billing_payment').select('orderId').where('providerId', '=', id).executeTakeFirst()
      if (attributed) await this.reconcile(attributed.orderId, undefined, id)
      else {
        const payment = await client.payment(id)
        if (payment.id !== id) throw mismatch()
        // Pack ownership is additionally proven by its canonical merchant order.
        if (payment.external_reference) {
          const order = await this.database.db.selectFrom('t3_billing_order').selectAll().where('id', '=', payment.external_reference).where('mode', '=', 'sandbox').executeTakeFirst()
          if (order) await this.reconcile(order.id, undefined, order.kind === 'pack' ? id : undefined)
        }
      }
    }
    return { ok: true }
  }
}
