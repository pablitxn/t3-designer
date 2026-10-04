import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sql, Kysely, PostgresDialect, SqliteDialect, type SqliteDatabase } from 'kysely'
import pg from 'pg'

export interface AccountUserRow {
  id: string; email: string; name: string; emailVerified: boolean | number; image: string | null
  createdAt: Date | number; updatedAt: Date | number; role: string; suspended: boolean | number
}
export interface AppTables {
  user: AccountUserRow
  account: { id: string; accountId: string; providerId: string; userId: string; password: string | null; createdAt: Date | number; updatedAt: Date | number }
  session: { id: string; userId: string; token: string; expiresAt: Date | number; createdAt: Date | number; updatedAt: Date | number; ipAddress: string | null; userAgent: string | null }
  t3_invitation: { id: string; tokenHash: string; email: string; role: string; revokedAt: import('kysely').Generated<string | null>; tier: import('kysely').Generated<string>; createdBy: string | null; createdAt: string; expiresAt: string; usedAt: string | null }
  t3_invite_link: { id: string; tokenHash: string; createdBy: string; tier: string; createdAt: string; expiresAt: string; revokedAt: string | null; maxUses: number; uses: number }
  t3_invite_redemption: { linkId: string; userId: string; createdAt: string }
  t3_credit_account: { userId: string; tier: string; trialEndsAt: string; premiumStartedAt: string | null; debt: number; createdAt: string }
  t3_credit_grant: { id: string; userId: string; sourceKey: string; amount: number; remaining: number; reason: string; createdAt: string; expiresAt: string | null; revokedAt: string | null }
  t3_credit_reservation: { id: string; userId: string; kind: string; amount: number; state: string; createdAt: string; updatedAt: string }
  t3_credit_allocation: { operationId: string; grantId: string; amount: number }
  t3_credit_ledger: { id: string; userId: string; eventKey: string; type: string; amount: number; reason: string; createdAt: string; operationId: string | null; grantId: string | null }
  t3_billing_order: { id: string; userId: string; mode: string; product: string; kind: string; amountMinor: number; credits: number; providerId: string | null; status: string; checkoutUrl: string | null; openKey: string | null; createdAt: string; updatedAt: string }
  t3_billing_payment: { providerId: string; orderId: string; status: string; approvedAt: string | null; periodEndsAt: string | null; createdAt: string; updatedAt: string }
  t3_bootstrap: { id: string; invitationId: string }
  t3_recovery: { id: string; tokenHash: string; userId: string; expiresAt: string; usedAt: string | null }
  t3_rate_limit: { key: string; count: number; expiresAt: string }
  t3_project: { id: string; ownerId: string; name: string; notes: string; scene: string; revision: number; createdAt: string; updatedAt: string }
  t3_project_member: { projectId: string; userId: string; role: string; createdAt: string }
}

/** node:sqlite implements the same synchronous statement primitives as Kysely's
 * SQLite driver; `reader` is the only better-sqlite3-specific property. */
function sqliteAdapter(sqlite: DatabaseSync): SqliteDatabase {
  return {
    close: () => sqlite.close(),
    prepare: (statement) => {
      const prepared = sqlite.prepare(statement)
      return {
        reader: prepared.columns().length > 0,
        all: (parameters) => prepared.all(...parameters as Parameters<typeof prepared.all>),
        run: (parameters) => prepared.run(...parameters as Parameters<typeof prepared.run>),
        iterate: (parameters) => prepared.iterate(...parameters as Parameters<typeof prepared.iterate>),
      }
    },
  }
}

export class AppDatabase {
  readonly db: Kysely<AppTables>
  readonly dialect: 'postgres' | 'sqlite'
  constructor(options: { url?: string; sqlitePath?: string }) {
    this.dialect = options.url ? 'postgres' : 'sqlite'
    if (options.url) {
      if (!/^postgres(ql)?:\/\//.test(options.url)) throw new Error('T3_DATABASE_URL debe ser una URL PostgreSQL.')
      this.db = new Kysely<AppTables>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: options.url, max: 8 }) }) })
    } else {
      const path = options.sqlitePath ?? ':memory:'
      if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      const sqlite = new DatabaseSync(path)
      sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
      this.db = new Kysely<AppTables>({ dialect: new SqliteDialect({ database: sqliteAdapter(sqlite) }) })
    }
  }
  authDate(value = new Date()): Date | number { return this.dialect === 'postgres' ? value : value.getTime() }
  bool(value: boolean): boolean | number { return this.dialect === 'postgres' ? value : Number(value) }
  close(): Promise<void> { return this.db.destroy() }

  async migrateApp(): Promise<void> {
    await this.db.schema.createTable('t3_invitation').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('tokenHash', 'text', c => c.notNull().unique())
      .addColumn('email', 'text', c => c.notNull()).addColumn('role', 'text', c => c.notNull())
      .addColumn('createdBy', 'text').addColumn('createdAt', 'text', c => c.notNull())
      .addColumn('expiresAt', 'text', c => c.notNull()).addColumn('usedAt', 'text').execute()
    if (this.dialect === 'postgres') {
      // Resolve by the connection's search_path. PostgreSQL introspection lists
      // other schemas too, so a same-named table must never suppress this migration.
      await sql`ALTER TABLE t3_invitation ADD COLUMN IF NOT EXISTS "tier" text NOT NULL DEFAULT 'standard'`.execute(this.db)
      await sql`ALTER TABLE t3_invitation ADD COLUMN IF NOT EXISTS "revokedAt" text`.execute(this.db)
    } else {
      const invitationColumns = (await this.db.introspection.getTables()).find(table => table.name === 't3_invitation')?.columns ?? []
      if (!invitationColumns.some(column => column.name === 'tier')) {
        await this.db.schema.alterTable('t3_invitation').addColumn('tier', 'text', c => c.notNull().defaultTo('standard')).execute()
      }
      if (!invitationColumns.some(column => column.name === 'revokedAt')) {
        await this.db.schema.alterTable('t3_invitation').addColumn('revokedAt', 'text').execute()
      }
    }
    await this.db.schema.createTable('t3_invite_link').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('tokenHash', 'text', c => c.notNull().unique())
      .addColumn('createdBy', 'text', c => c.notNull().references('user.id')).addColumn('tier', 'text', c => c.notNull())
      .addColumn('createdAt', 'text', c => c.notNull()).addColumn('expiresAt', 'text', c => c.notNull())
      .addColumn('revokedAt', 'text').addColumn('maxUses', 'integer', c => c.notNull()).addColumn('uses', 'integer', c => c.notNull()).execute()
    await this.db.schema.createTable('t3_invite_redemption').ifNotExists()
      .addColumn('linkId', 'text', c => c.notNull().references('t3_invite_link.id'))
      .addColumn('userId', 'text', c => c.notNull().references('user.id')).addColumn('createdAt', 'text', c => c.notNull())
      .addPrimaryKeyConstraint('t3_invite_redemption_pk', ['linkId', 'userId']).execute()
    await this.db.schema.createTable('t3_bootstrap').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('invitationId', 'text', c => c.notNull()).execute()
    await this.db.schema.createTable('t3_recovery').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('tokenHash', 'text', c => c.notNull().unique())
      .addColumn('userId', 'text', c => c.notNull().references('user.id').onDelete('cascade'))
      .addColumn('expiresAt', 'text', c => c.notNull()).addColumn('usedAt', 'text').execute()
    await this.db.schema.createTable('t3_rate_limit').ifNotExists()
      .addColumn('key', 'text', c => c.primaryKey()).addColumn('count', 'integer', c => c.notNull())
      .addColumn('expiresAt', 'text', c => c.notNull()).execute()
    await this.db.schema.createTable('t3_project').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('ownerId', 'text', c => c.notNull().references('user.id'))
      .addColumn('name', 'text', c => c.notNull()).addColumn('notes', 'text', c => c.notNull())
      .addColumn('scene', 'text', c => c.notNull()).addColumn('revision', 'integer', c => c.notNull())
      .addColumn('createdAt', 'text', c => c.notNull()).addColumn('updatedAt', 'text', c => c.notNull()).execute()
    await this.db.schema.createTable('t3_project_member').ifNotExists()
      .addColumn('projectId', 'text', c => c.notNull().references('t3_project.id').onDelete('cascade'))
      .addColumn('userId', 'text', c => c.notNull().references('user.id').onDelete('cascade'))
      .addColumn('role', 'text', c => c.notNull()).addColumn('createdAt', 'text', c => c.notNull())
      .addPrimaryKeyConstraint('t3_project_member_pk', ['projectId', 'userId']).execute()
    await this.db.schema.createTable('t3_credit_account').ifNotExists()
      .addColumn('userId', 'text', c => c.primaryKey().references('user.id'))
      .addColumn('tier', 'text', c => c.notNull()).addColumn('trialEndsAt', 'text', c => c.notNull())
      .addColumn('premiumStartedAt', 'text').addColumn('debt', 'integer', c => c.notNull().defaultTo(0))
      .addColumn('createdAt', 'text', c => c.notNull()).execute()
    await this.db.schema.createTable('t3_credit_grant').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text', c => c.notNull().references('t3_credit_account.userId'))
      .addColumn('sourceKey', 'text', c => c.notNull().unique()).addColumn('amount', 'integer', c => c.notNull())
      .addColumn('remaining', 'integer', c => c.notNull()).addColumn('reason', 'text', c => c.notNull())
      .addColumn('createdAt', 'text', c => c.notNull()).addColumn('expiresAt', 'text').addColumn('revokedAt', 'text').execute()
    await this.db.schema.createTable('t3_credit_reservation').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text', c => c.notNull().references('t3_credit_account.userId'))
      .addColumn('kind', 'text', c => c.notNull()).addColumn('amount', 'integer', c => c.notNull())
      .addColumn('state', 'text', c => c.notNull()).addColumn('createdAt', 'text', c => c.notNull()).addColumn('updatedAt', 'text', c => c.notNull()).execute()
    await this.db.schema.createTable('t3_credit_allocation').ifNotExists()
      .addColumn('operationId', 'text', c => c.notNull().references('t3_credit_reservation.id'))
      .addColumn('grantId', 'text', c => c.notNull().references('t3_credit_grant.id'))
      .addColumn('amount', 'integer', c => c.notNull()).addPrimaryKeyConstraint('t3_credit_allocation_pk', ['operationId', 'grantId']).execute()
    await this.db.schema.createTable('t3_credit_ledger').ifNotExists()
      .addColumn('id', 'text', c => c.primaryKey()).addColumn('userId', 'text', c => c.notNull().references('t3_credit_account.userId'))
      .addColumn('eventKey', 'text', c => c.notNull().unique()).addColumn('type', 'text', c => c.notNull())
      .addColumn('amount', 'integer', c => c.notNull()).addColumn('reason', 'text', c => c.notNull())
      .addColumn('createdAt', 'text', c => c.notNull()).addColumn('operationId', 'text').addColumn('grantId', 'text').execute()
    await this.db.schema.createIndex('t3_credit_grant_user').ifNotExists().on('t3_credit_grant').column('userId').execute()
    await this.db.schema.createIndex('t3_credit_reservation_user').ifNotExists().on('t3_credit_reservation').columns(['userId', 'state']).execute()
    await this.db.schema.createIndex('t3_credit_ledger_user').ifNotExists().on('t3_credit_ledger').columns(['userId', 'createdAt']).execute()
    await this.db.schema.createIndex('t3_project_owner').ifNotExists().on('t3_project').column('ownerId').execute()
    await this.db.schema.createIndex('t3_project_member_user').ifNotExists().on('t3_project_member').column('userId').execute()
  }
}

export function openAppDatabase(options: { url?: string; sqlitePath?: string } = {}): AppDatabase { return new AppDatabase(options) }
