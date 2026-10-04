import { randomUUID } from 'node:crypto'
import type { Transaction } from 'kysely'
import type { AppDatabase, AppTables } from './app-database.ts'

export type CreditTier = 'standard' | 'premium'
export type CreditKind = 'asset' | 'revision' | 'project' | 'building' | 'apartment'
export interface CreditConfig {
  trialDays: number
  trialCredits: number
  premiumMonthlyCredits: number
  costs: Record<CreditKind, number>
}
export const DEFAULT_CREDIT_CONFIG: CreditConfig = {
  trialDays: 15, trialCredits: 100, premiumMonthlyCredits: 1000,
  costs: { asset: 20, revision: 10, project: 50, building: 100, apartment: 50 },
}
export type CreditGrant = AppTables['t3_credit_grant']
export type CreditReservation = Omit<AppTables['t3_credit_reservation'], 'state' | 'kind'> & { state: 'reserved' | 'committed' | 'refunded'; kind: CreditKind }
export type CreditTransaction = AppTables['t3_credit_ledger']
export interface CreditSummary {
  tier: CreditTier; balance: number; reserved: number; debt: number; trialEndsAt: string; trialActive: boolean
  premiumPeriodEndsAt: string | null; premiumMonthlyCredits: number; trialCredits: number; trialDays: number; costs: Record<CreditKind, number>; grants: CreditGrant[]; transactions: CreditTransaction[]
}
export class CreditError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, message: string, code = 'credit_error') { super(message); this.status = status; this.code = code }
}
type CreditTx = Transaction<AppTables>
type GrantInput = { amount: number; sourceKey: string; reason: string; expiresAt?: string | null }
const MAX_CREDITS = 1_000_000_000
function integer(value: number, name: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_CREDITS) throw new CreditError(400, `${name} debe ser un entero entre ${allowZero ? 0 : 1} y ${MAX_CREDITS}.`)
  return value
}
function timestamp(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new CreditError(400, 'Fecha de vencimiento inválida.')
  return date.toISOString()
}
function tierValue(tier: string): CreditTier {
  if (tier !== 'standard' && tier !== 'premium') throw new CreditError(400, 'Tipo de cuenta inválido.')
  return tier
}
function monthPeriod(now: Date): { key: string; endsAt: string } {
  return { key: now.toISOString().slice(0, 7), endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString() }
}
// SQLite has one writer. Queue local credit transactions across service objects
// (and DB connections), while the write-first database lock covers other processes.
// PostgreSQL uses the same row update as a per-account lock across all instances.
let sqliteQueue: Promise<unknown> = Promise.resolve()

export class CreditService {
  readonly config: CreditConfig
  private readonly database: AppDatabase
  private readonly now: () => Date
  constructor(database: AppDatabase, config: Partial<Omit<CreditConfig, 'costs'>> & { costs?: Partial<Record<CreditKind, number>> } = {}, now: () => Date = () => new Date()) {
    this.database = database
    this.now = now
    this.config = { ...DEFAULT_CREDIT_CONFIG, ...config, costs: { ...DEFAULT_CREDIT_CONFIG.costs, ...config.costs } }
    integer(this.config.trialDays, 'Los días de prueba')
    if (this.config.trialDays > 3650) throw new CreditError(400, 'El período de prueba no puede superar 3650 días.')
    integer(this.config.trialCredits, 'Los créditos de prueba', true)
    integer(this.config.premiumMonthlyCredits, 'Los créditos premium', true)
    for (const cost of Object.values(this.config.costs)) integer(cost, 'El costo')
  }

  private transaction<T>(action: (transaction: CreditTx) => Promise<T>): Promise<T> {
    const run = () => this.database.db.transaction().execute(action)
    if (this.database.dialect !== 'sqlite') return run()
    const pending = sqliteQueue.then(run, run)
    sqliteQueue = pending.catch(() => undefined)
    return pending
  }
  private async lock(transaction: CreditTx, userId: string): Promise<AppTables['t3_credit_account']> {
    const account = await transaction.updateTable('t3_credit_account').set(eb => ({ debt: eb.ref('debt') }))
      .where('userId', '=', userId).returningAll().executeTakeFirst()
    if (!account) throw new CreditError(404, 'La cuenta de créditos no existe.')
    return account
  }
  private async event(transaction: CreditTx, input: Omit<CreditTransaction, 'id' | 'createdAt'>): Promise<void> {
    await transaction.insertInto('t3_credit_ledger').values({ ...input, id: randomUUID(), createdAt: this.now().toISOString() }).execute()
  }
  private async grantLocked(transaction: CreditTx, userId: string, input: GrantInput): Promise<CreditGrant> {
    integer(input.amount, 'Los créditos')
    if (!input.sourceKey.trim() || input.sourceKey.length > 500 || !input.reason.trim() || input.reason.length > 500) throw new CreditError(400, 'Origen o motivo del crédito inválido.')
    const expiresAt = input.expiresAt ? timestamp(input.expiresAt) : null
    const previous = await transaction.selectFrom('t3_credit_grant').selectAll().where('sourceKey', '=', input.sourceKey).executeTakeFirst()
    if (previous) {
      if (previous.userId !== userId || previous.amount !== input.amount || previous.reason !== input.reason || previous.expiresAt !== expiresAt) throw new CreditError(409, 'El origen ya fue usado para otro crédito.', 'credit_source_conflict')
      return previous
    }
    const grant: CreditGrant = { id: randomUUID(), userId, sourceKey: input.sourceKey, amount: input.amount, remaining: input.amount, reason: input.reason, createdAt: this.now().toISOString(), expiresAt, revokedAt: null }
    await transaction.insertInto('t3_credit_grant').values(grant).execute()
    await this.event(transaction, { userId, eventKey: `grant:${grant.id}`, type: 'grant', amount: grant.amount, reason: grant.reason, grantId: grant.id, operationId: null })
    return grant
  }

  /** Call inside account creation's transaction; a failure rolls back the account and its allowance. */
  async initialize(userId: string, tier: CreditTier, transaction?: CreditTx): Promise<void> {
    tierValue(tier)
    const action = async (tx: CreditTx) => {
      const now = this.now(), createdAt = now.toISOString(), trialEndsAt = new Date(now.getTime() + this.config.trialDays * 86_400_000).toISOString()
      const inserted = await tx.insertInto('t3_credit_account').values({ userId, tier, trialEndsAt, premiumStartedAt: tier === 'premium' ? createdAt : null, debt: 0, createdAt })
        .onConflict(oc => oc.column('userId').doNothing()).returning('userId').executeTakeFirst()
      if (!inserted) return
      if (tier === 'standard' && this.config.trialCredits) await this.grantLocked(tx, userId, { amount: this.config.trialCredits, sourceKey: `trial:${userId}`, reason: 'Créditos de prueba', expiresAt: trialEndsAt })
      await this.refresh(tx, await this.lock(tx, userId))
    }
    if (transaction) await action(transaction)
    else await this.transaction(action)
  }
  /** Existing administrators are gifted; normal users receive one trial from migration time. */
  async backfill(): Promise<void> {
    const users = await this.database.db.selectFrom('user').leftJoin('t3_credit_account', 'user.id', 't3_credit_account.userId')
      .select(['user.id', 'user.role']).where('t3_credit_account.userId', 'is', null).execute()
    for (const user of users) await this.initialize(user.id, user.role === 'admin' ? 'premium' : 'standard')
  }

  private async refresh(transaction: CreditTx, account: AppTables['t3_credit_account']): Promise<void> {
    const now = this.now().toISOString()
    const expired = await transaction.selectFrom('t3_credit_grant').selectAll().where('userId', '=', account.userId)
      .where('remaining', '>', 0).where('expiresAt', '<=', now).where('revokedAt', 'is', null).execute()
    for (const grant of expired) {
      await transaction.updateTable('t3_credit_grant').set({ remaining: 0 }).where('id', '=', grant.id).execute()
      await this.event(transaction, { userId: account.userId, eventKey: `expire:${grant.id}`, type: 'expire', amount: -grant.remaining, reason: 'Créditos vencidos', grantId: grant.id, operationId: null })
    }
    // No catch-up grants: only this calendar month's allowance, once, expires at
    // the UTC month boundary. Repeated tier toggles cannot issue another grant.
    if (account.tier === 'premium' && this.config.premiumMonthlyCredits) {
      const period = monthPeriod(this.now())
      const sourceKey = `premium:${account.userId}:${period.key}`
      const granted = await transaction.selectFrom('t3_credit_grant').select('id').where('sourceKey', '=', sourceKey).executeTakeFirst()
      if (!granted) await this.grantLocked(transaction, account.userId, { amount: this.config.premiumMonthlyCredits, sourceKey, reason: 'Créditos mensuales de invitado premium', expiresAt: period.endsAt })
    }
  }
  async setTier(userId: string, tier: CreditTier): Promise<void> {
    tierValue(tier)
    await this.transaction(async transaction => {
      const account = await this.lock(transaction, userId)
      await transaction.updateTable('t3_credit_account').set({ tier, premiumStartedAt: tier === 'premium' ? account.premiumStartedAt ?? this.now().toISOString() : null }).where('userId', '=', userId).execute()
      // Revocation of gift entitlement also removes its unspent allowance. A
      // downgrade does not create debt for work already consumed legitimately.
      if (tier === 'standard' && account.tier === 'premium') {
        const grants = await transaction.selectFrom('t3_credit_grant').selectAll().where('userId', '=', userId)
          .where('sourceKey', 'like', `premium:${userId}:%`).where('revokedAt', 'is', null).execute()
        for (const grant of grants) {
          await transaction.updateTable('t3_credit_grant').set({ remaining: 0, revokedAt: this.now().toISOString() }).where('id', '=', grant.id).execute()
          await this.event(transaction, { userId, eventKey: `revoke:${grant.id}`, type: 'revoke', amount: -grant.remaining, reason: 'Fin del acceso premium regalado', grantId: grant.id, operationId: null })
        }
      }
      await this.refresh(transaction, { ...account, tier })
    })
  }
  async grant(userId: string, input: GrantInput, transaction?: CreditTx): Promise<CreditGrant> {
    const action = async (tx: CreditTx) => { await this.lock(tx, userId); return this.grantLocked(tx, userId, input) }
    return transaction ? action(transaction) : this.transaction(action)
  }

  /** Provider reversals remove unspent credits and preserve already spent value
   * as debt. Future grants cover debt before allowing more generation. */
  async revoke(sourceKey: string, reason: string, transaction?: CreditTx): Promise<CreditGrant | null> {
    const action = async (tx: CreditTx) => {
      const candidate = await tx.selectFrom('t3_credit_grant').selectAll().where('sourceKey', '=', sourceKey).executeTakeFirst()
      if (!candidate) return null
      const account = await this.lock(tx, candidate.userId)
      const grant = await tx.selectFrom('t3_credit_grant').selectAll().where('id', '=', candidate.id).executeTakeFirstOrThrow()
      if (grant.revokedAt) return grant
      const spent = await tx.selectFrom('t3_credit_allocation').innerJoin('t3_credit_reservation', 't3_credit_reservation.id', 't3_credit_allocation.operationId')
        .select('t3_credit_allocation.amount').where('grantId', '=', grant.id).where('state', '=', 'committed').execute()
      const debt = spent.reduce((sum, row) => sum + row.amount, 0)
      integer(account.debt + debt, 'La deuda de créditos', true)
      await tx.updateTable('t3_credit_account').set({ debt: account.debt + debt }).where('userId', '=', account.userId).execute()
      const revoked = { ...grant, remaining: 0, revokedAt: this.now().toISOString() }
      await tx.updateTable('t3_credit_grant').set({ remaining: revoked.remaining, revokedAt: revoked.revokedAt }).where('id', '=', grant.id).execute()
      await this.event(tx, { userId: account.userId, eventKey: `revoke:${grant.id}`, type: 'revoke', amount: -(grant.remaining + debt), reason, grantId: grant.id, operationId: null })
      return revoked
    }
    return transaction ? action(transaction) : this.transaction(action)
  }

  async summary(userId: string): Promise<CreditSummary> {
    return this.transaction(async transaction => {
      const account = await this.lock(transaction, userId)
      await this.refresh(transaction, account)
      const grants = await transaction.selectFrom('t3_credit_grant').selectAll().where('userId', '=', userId).orderBy('createdAt', 'desc').execute()
      const reservations = await transaction.selectFrom('t3_credit_reservation').select('amount').where('userId', '=', userId).where('state', '=', 'reserved').execute()
      const transactions = await transaction.selectFrom('t3_credit_ledger').selectAll().where('userId', '=', userId).orderBy('createdAt', 'desc').orderBy('id', 'desc').limit(100).execute()
      return { tier: tierValue(account.tier), balance: Math.max(0, grants.reduce((sum, grant) => sum + grant.remaining, 0) - account.debt), reserved: reservations.reduce((sum, row) => sum + row.amount, 0), debt: account.debt,
        trialEndsAt: account.trialEndsAt, trialActive: account.trialEndsAt > this.now().toISOString(), premiumPeriodEndsAt: account.tier === 'premium' ? monthPeriod(this.now()).endsAt : null,
        premiumMonthlyCredits: this.config.premiumMonthlyCredits, trialCredits: this.config.trialCredits, trialDays: this.config.trialDays,
        costs: { ...this.config.costs }, grants, transactions }
    })
  }
  async reserve(userId: string, operationId: string, kind: CreditKind): Promise<CreditReservation> {
    if (!operationId.trim() || operationId.length > 300) throw new CreditError(400, 'Identificador de generación inválido.')
    if (!Object.hasOwn(this.config.costs, kind)) throw new CreditError(400, 'Tipo de generación inválido.')
    return this.transaction(async transaction => {
      const account = await this.lock(transaction, userId)
      const previous = await transaction.selectFrom('t3_credit_reservation').selectAll().where('id', '=', operationId).executeTakeFirst()
      if (previous) {
        if (previous.userId !== userId || previous.kind !== kind) throw new CreditError(409, 'La generación ya tiene otra reserva de créditos.', 'credit_operation_conflict')
        return previous as CreditReservation
      }
      await this.refresh(transaction, account)
      const grants = await transaction.selectFrom('t3_credit_grant').selectAll().where('userId', '=', userId).where('remaining', '>', 0).where('revokedAt', 'is', null).execute()
      grants.sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      const amount = this.config.costs[kind], balance = grants.reduce((sum, grant) => sum + grant.remaining, 0) - account.debt
      if (balance < amount) throw new CreditError(402, `No tenés créditos suficientes. Esta generación necesita ${amount} créditos y tenés ${Math.max(0, balance)} disponibles.`, 'insufficient_credits')
      const now = this.now().toISOString()
      const reservation: CreditReservation = { id: operationId, userId, kind, amount, state: 'reserved', createdAt: now, updatedAt: now }
      await transaction.insertInto('t3_credit_reservation').values(reservation).execute()
      let needed = amount
      for (const grant of grants) {
        if (!needed) break
        const debit = Math.min(needed, grant.remaining)
        await transaction.updateTable('t3_credit_grant').set({ remaining: grant.remaining - debit }).where('id', '=', grant.id).execute()
        await transaction.insertInto('t3_credit_allocation').values({ operationId, grantId: grant.id, amount: debit }).execute()
        needed -= debit
      }
      await this.event(transaction, { userId, eventKey: `reserve:${operationId}`, type: 'reserve', amount: -amount, reason: `Reserva de generación: ${kind}`, grantId: null, operationId })
      return reservation
    })
  }
  private async settle(operationId: string, state: 'committed' | 'refunded'): Promise<CreditReservation> {
    const candidate = await this.database.db.selectFrom('t3_credit_reservation').selectAll().where('id', '=', operationId).executeTakeFirst()
    if (!candidate) throw new CreditError(404, 'La reserva de créditos no existe.')
    return this.transaction(async transaction => {
      const account = await this.lock(transaction, candidate.userId)
      const reservation = await transaction.selectFrom('t3_credit_reservation').selectAll().where('id', '=', operationId).executeTakeFirstOrThrow()
      if (reservation.state === state) return reservation as CreditReservation
      if (reservation.state !== 'reserved') throw new CreditError(409, 'La reserva de créditos ya está cerrada.', 'credit_reservation_closed')
      const allocations = await transaction.selectFrom('t3_credit_allocation').innerJoin('t3_credit_grant', 't3_credit_grant.id', 't3_credit_allocation.grantId')
        .select(['t3_credit_allocation.amount', 't3_credit_grant.id', 't3_credit_grant.remaining', 't3_credit_grant.expiresAt', 't3_credit_grant.revokedAt', 't3_credit_grant.sourceKey'])
        .where('operationId', '=', operationId).execute()
      let returned = 0, debt = 0
      const now = this.now().toISOString()
      for (const allocation of allocations) {
        if (state === 'refunded' && !allocation.revokedAt && (!allocation.expiresAt || allocation.expiresAt > now)) {
          await transaction.updateTable('t3_credit_grant').set({ remaining: allocation.remaining + allocation.amount }).where('id', '=', allocation.id).execute()
          returned += allocation.amount
        }
        if (state === 'committed' && allocation.revokedAt && !allocation.sourceKey.startsWith(`premium:${account.userId}:`)) debt += allocation.amount
      }
      if (debt) {
        integer(account.debt + debt, 'La deuda de créditos', true)
        await transaction.updateTable('t3_credit_account').set({ debt: account.debt + debt }).where('userId', '=', account.userId).execute()
      }
      await transaction.updateTable('t3_credit_reservation').set({ state, updatedAt: now }).where('id', '=', operationId).execute()
      await this.event(transaction, { userId: account.userId, eventKey: `${state}:${operationId}`, type: state === 'committed' ? 'commit' : 'refund', amount: state === 'refunded' ? returned : -debt, reason: state === 'committed' ? 'Generación consumida' : 'Generación cancelada; devolución de créditos vigentes', grantId: null, operationId })
      return { ...reservation, state, updatedAt: now } as CreditReservation
    })
  }
  commit(operationId: string): Promise<CreditReservation> { return this.settle(operationId, 'committed') }
  refund(operationId: string): Promise<CreditReservation> { return this.settle(operationId, 'refunded') }
  async reservation(operationId: string): Promise<CreditReservation | null> {
    return await this.database.db.selectFrom('t3_credit_reservation').selectAll().where('id', '=', operationId).executeTakeFirst() as CreditReservation | undefined ?? null
  }
  /** Startup reconciliation must match these to persisted job states before
   * capture/refund. Never blindly refund work still owned by another worker. */
  async listReservations(): Promise<CreditReservation[]> {
    return await this.database.db.selectFrom('t3_credit_reservation').selectAll().where('state', '=', 'reserved').orderBy('createdAt').execute() as CreditReservation[]
  }
}
