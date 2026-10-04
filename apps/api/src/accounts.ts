import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { betterAuth } from 'better-auth'
import { hashPassword } from 'better-auth/crypto'
import { getMigrations } from 'better-auth/db/migration'
import { z } from 'zod'
import type { AppDatabase, AccountUserRow } from './app-database.ts'
import { CreditService, CreditError, type CreditConfig } from './credits.ts'

export interface User { id: string; email: string; name: string; role: 'admin' | 'user'; tier?: 'standard' | 'premium'; canInvite?: boolean }
export class AccountError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export function accountJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(body))
}
export async function accountBody(request: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AccountError(415, 'Se requiere JSON.')
  if (Number(request.headers['content-length']) > limit) throw new AccountError(413, 'Solicitud demasiado grande.')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new AccountError(413, 'Solicitud demasiado grande.')
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new AccountError(400, 'JSON inválido.') }
}
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AccountError(400, parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  return parsed.data
}
const emailSchema = z.email().max(254).transform(value => value.toLowerCase())
const passwordSchema = z.string().min(12).max(128)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const publicUser = (row: Pick<AccountUserRow, 'id' | 'email' | 'name' | 'role'>): User => ({ id: row.id, email: row.email, name: row.name, role: row.role === 'admin' ? 'admin' : 'user' })
export function normalizedIP(value: string): string | null {
  if (!isIP(value) || value.includes('%')) return null
  if (isIP(value) === 4) return value
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical)
  if (!mapped) return canonical
  const first = Number.parseInt(mapped[1], 16), second = Number.parseInt(mapped[2], 16)
  return `${first >> 8}.${first & 255}.${second >> 8}.${second & 255}`
}
export function rateLimitClientIP(request: IncomingMessage, trustedProxyIPs: ReadonlySet<string>): string {
  const socketIP = normalizedIP(request.socket.remoteAddress ?? '') ?? 'unknown'
  if (!trustedProxyIPs.has(socketIP)) return socketIP
  const forwarded = request.headers['x-forwarded-for']
  if (forwarded === undefined) return socketIP
  if (typeof forwarded !== 'string') throw new AccountError(403, 'Cadena de proxy inválida.')
  const values = forwarded.split(',')
  if (values.length > 10) throw new AccountError(403, 'Cadena de proxy inválida.')
  const chain = values.map(value => normalizedIP(value.trim()))
  // Reject the entire malformed chain rather than falling back to a shared
  // upstream bucket that one attacker could exhaust for every visitor.
  if (chain.some(value => value === null)) throw new AccountError(403, 'Cadena de proxy inválida.')
  let candidate = socketIP
  for (let index = chain.length - 1; index >= 0 && trustedProxyIPs.has(candidate); index--) candidate = chain[index]!
  return candidate
}
function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers()
  for (const name of ['cookie', 'origin', 'user-agent', 'content-type']) {
    const value = request.headers[name]
    if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}

export async function createAccounts(options: {
  database: AppDatabase; baseURL: string; secret: string; trustedOrigins?: string[]; production?: boolean; trustedProxyIPs?: string[]; credits?: CreditService; creditConfig?: Partial<CreditConfig>
}) {
  const { database } = options
  const db = database.db
  const base = new URL(options.baseURL)
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('T3_PUBLIC_URL debe ser un origen sin ruta ni credenciales.')
  if (options.secret.length < 32) throw new Error('T3_AUTH_SECRET debe tener al menos 32 caracteres aleatorios.')
  if (options.production && base.protocol !== 'https:') throw new Error('Production requiere T3_PUBLIC_URL HTTPS.')
  const origins = new Set([base.origin, ...(options.trustedOrigins ?? [])].map(value => new URL(value).origin))
  const trustedProxyIPs = new Set((options.trustedProxyIPs ?? []).map(value => {
    const normalized = normalizedIP(value)
    if (!normalized) throw new Error('Los proxies confiables deben ser direcciones IP exactas.')
    return normalized
  }))
  const auth = betterAuth({
    appName: 'T3 Designer', baseURL: base.origin, secret: options.secret,
    database: { db, type: database.dialect },
    trustedOrigins: [...origins],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128, autoSignIn: false },
    user: { additionalFields: {
      role: { type: 'string', defaultValue: 'user', required: true, input: false },
      suspended: { type: 'boolean', defaultValue: false, required: true, input: false },
    } },
    session: { expiresIn: 8 * 60 * 60, updateAge: 60 * 60, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: base.protocol === 'https:', cookiePrefix: 't3',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      crossSubDomainCookies: { enabled: false },
    },
    rateLimit: { enabled: true, window: 60, max: 20 },
    databaseHooks: { session: { create: { before: async session => {
      const user = await db.selectFrom('user').select('suspended').where('id', '=', session.userId).executeTakeFirst()
      if (!user || user.suspended) return false
      // Better Auth's non-remembered default is one day independently of
      // expiresIn. Bound the stored session too, while keeping a session cookie.
      return { data: { ...session, expiresAt: new Date(Math.min(new Date(session.expiresAt).getTime(), Date.now() + 8 * 60 * 60_000)) } }
    } } } },
    logger: { disabled: true },
  })
  const migration = await getMigrations(auth.options)
  await migration.runMigrations()
  await database.migrateApp()
  const credits = options.credits ?? new CreditService(database, options.creditConfig)
  await credits.backfill()
  async function enrichedUser(row: Pick<AccountUserRow, 'id' | 'email' | 'name' | 'role'>): Promise<User> {
    const account = await db.selectFrom('t3_credit_account').select('tier').where('userId', '=', row.id).executeTakeFirst()
    const tier = account?.tier === 'premium' ? 'premium' : 'standard'
    return { ...publicUser(row), tier, canInvite: row.role === 'admin' || tier === 'premium' }
  }

  function checkRequest(request: IncomingMessage): void {
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new AccountError(403, 'Origen no permitido.')
    const origin = request.headers.origin
    if (origin && !origins.has(origin)) throw new AccountError(403, 'Origen no permitido.')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET') && (!origin || !origins.has(origin))) {
      throw new AccountError(403, 'La solicitud debe venir de la aplicación.')
    }
  }
  async function rateLimit(request: IncomingMessage, scope: string, max = 30, discriminator = ''): Promise<void> {
    const now = Date.now()
    const key = digest(`${scope}:${rateLimitClientIP(request, trustedProxyIPs)}:${discriminator}:${Math.floor(now / 60_000)}`)
    const row = await db.insertInto('t3_rate_limit').values({ key, count: 1, expiresAt: new Date(now + 120_000).toISOString() })
      .onConflict(oc => oc.column('key').doUpdateSet(eb => ({ count: eb('t3_rate_limit.count', '+', 1) })))
      .returning('count').executeTakeFirstOrThrow()
    await db.deleteFrom('t3_rate_limit').where('expiresAt', '<', new Date(now).toISOString()).execute()
    if (row.count > max) throw new AccountError(429, 'Demasiados intentos. Esperá un minuto.')
  }
  async function authorize(request: IncomingMessage): Promise<User | null> {
    const session = await auth.api.getSession({ headers: requestHeaders(request) })
    if (!session) return null
    // Always read current role/suspension. No cookie-cached grants survive revocation.
    const user = await db.selectFrom('user').selectAll().where('id', '=', session.user.id).executeTakeFirst()
    return user && !user.suspended ? enrichedUser(user) : null
  }
  async function requireUser(request: IncomingMessage): Promise<User> {
    const user = await authorize(request)
    if (!user) throw new AccountError(401, 'Iniciá sesión para continuar.')
    return user
  }
  async function requireAdmin(request: IncomingMessage): Promise<User> {
    const user = await requireUser(request)
    if (user.role !== 'admin') throw new AccountError(403, 'Solo el administrador puede hacer esto.')
    return user
  }
  async function requireInviter(request: IncomingMessage): Promise<User> {
    const actor = await requireUser(request)
    if (!actor.canInvite) throw new AccountError(403, 'Solo administradores e invitados premium pueden invitar.')
    return actor
  }
  async function invitation(email: string, creator: string | null, bootstrap = false, tier: 'standard' | 'premium' = 'standard') {
    const normalizedEmail = parseInput(emailSchema, email.trim())
    const token = randomBytes(32).toString('base64url')
    const now = new Date().toISOString()
    const row = { id: randomUUID(), tokenHash: digest(token), email: normalizedEmail, role: bootstrap ? 'admin' : 'user', tier: bootstrap ? 'premium' : tier, createdBy: creator, createdAt: now, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), usedAt: null }
    await db.transaction().execute(async transaction => {
      if (await transaction.selectFrom('user').select('id').where('email', '=', normalizedEmail).executeTakeFirst()) throw new AccountError(409, 'Esa persona ya tiene una cuenta.')
      if (bootstrap) {
        if (await transaction.selectFrom('user').select('id').executeTakeFirst()) throw new AccountError(409, 'Ya hay usuarios. El bootstrap está cerrado.')
        const previous = await transaction.selectFrom('t3_bootstrap').select('invitationId').where('id', '=', 'first-admin').executeTakeFirst()
        if (previous) {
          const expired = await transaction.updateTable('t3_invitation').set({ usedAt: now })
            .where('id', '=', previous.invitationId).where('usedAt', 'is', null).where('expiresAt', '<=', now).returning('id').executeTakeFirst()
          if (!expired) throw new AccountError(409, 'La invitación inicial sigue vigente; usá ese enlace o esperá su vencimiento.')
          await transaction.deleteFrom('t3_bootstrap').where('id', '=', 'first-admin').where('invitationId', '=', previous.invitationId).execute()
        }
        // Unique singleton serializes competing first-admin bootstraps.
        await transaction.insertInto('t3_bootstrap').values({ id: 'first-admin', invitationId: row.id }).execute()
      }
      await transaction.insertInto('t3_invitation').values(row).execute()
    })
    return { invitation: { id: row.id, email: row.email, tier: row.tier, expiresAt: row.expiresAt }, token }
  }
  async function createRecovery(email: string) {
    const normalizedEmail = parseInput(emailSchema, email.trim())
    const user = await db.selectFrom('user').select(['id', 'suspended']).where('email', '=', normalizedEmail).executeTakeFirst()
    if (!user || user.suspended) throw new AccountError(404, 'No hay una cuenta activa con ese email.')
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
    await db.transaction().execute(async transaction => {
      // Issuing a replacement invalidates older recovery links for this user.
      await transaction.deleteFrom('t3_recovery').where('userId', '=', user.id).execute()
      await transaction.insertInto('t3_recovery').values({ id: randomUUID(), tokenHash: digest(token), userId: user.id, expiresAt, usedAt: null }).execute()
    })
    return { email: normalizedEmail, token, expiresAt }
  }
  async function resetPassword(token: string, rawPassword: string): Promise<void> {
    const tokenHash = digest(token)
    const candidate = await db.selectFrom('t3_recovery').select('id').where('tokenHash', '=', tokenHash)
      .where('usedAt', 'is', null).where('expiresAt', '>', new Date().toISOString()).executeTakeFirst()
    if (!candidate) throw new AccountError(400, 'Enlace inválido, usado o vencido.')
    const password = await hashPassword(rawPassword)
    await db.transaction().execute(async transaction => {
      const recovery = await transaction.updateTable('t3_recovery').set({ usedAt: new Date().toISOString() })
        .where('id', '=', candidate.id).where('tokenHash', '=', tokenHash).where('usedAt', 'is', null)
        .where('expiresAt', '>', new Date().toISOString()).returning('userId').executeTakeFirst()
      if (!recovery) throw new AccountError(400, 'Enlace inválido, usado o vencido.')
      const user = await transaction.selectFrom('user').select('suspended').where('id', '=', recovery.userId).executeTakeFirst()
      if (!user || user.suspended) throw new AccountError(403, 'La cuenta no está disponible.')
      await transaction.updateTable('account').set({ password, updatedAt: database.authDate() }).where('userId', '=', recovery.userId).where('providerId', '=', 'credential').execute()
      await transaction.deleteFrom('session').where('userId', '=', recovery.userId).execute()
      await transaction.deleteFrom('t3_recovery').where('userId', '=', recovery.userId).execute()
    })
  }
  async function inviteMetadata(token: string) {
    const now = new Date().toISOString()
    const personal = await db.selectFrom('t3_invitation').selectAll().where('revokedAt', 'is', null).where('tokenHash', '=', digest(token))
      .where('usedAt', 'is', null).where('expiresAt', '>', now).executeTakeFirst()
    const link = personal ? null : await db.selectFrom('t3_invite_link').selectAll().where('tokenHash', '=', digest(token))
      .where('revokedAt', 'is', null).where('expiresAt', '>', now).whereRef('uses', '<', 'maxUses').executeTakeFirst()
    const invite = personal ?? link
    if (!invite) throw new AccountError(400, 'Invitación inválida, usada o vencida.')
    if (invite.createdBy) {
      const creator = await db.selectFrom('user').selectAll().where('id', '=', invite.createdBy).executeTakeFirst()
      if (!creator || creator.suspended || !(await enrichedUser(creator)).canInvite) throw new AccountError(400, 'La invitación ya no está disponible.')
    }
    return { email: personal?.email ?? null, tier: invite.tier, expiresAt: invite.expiresAt,
      trialDays: options.creditConfig?.trialDays ?? 15, trialCredits: options.creditConfig?.trialCredits ?? 100 }
  }
  async function createInvitationLink(actor: User, input: { maxUses: number; expiresInDays?: number; tier?: 'standard' | 'premium' }) {
    if (!actor.canInvite) throw new AccountError(403, 'No tenés permiso para invitar.')
    const tier = input.tier ?? 'standard'
    if (actor.role !== 'admin' && (tier !== 'standard' || input.maxUses > 10)) throw new AccountError(403, 'Los invitados premium pueden invitar hasta 10 personas por enlace, con acceso de prueba.')
    const token = randomBytes(32).toString('base64url')
    const now = new Date()
    const link = { id: randomUUID(), tokenHash: digest(token), createdBy: actor.id, tier, createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (input.expiresInDays ?? 7) * 86400000).toISOString(), revokedAt: null, maxUses: input.maxUses, uses: 0 }
    await db.transaction().execute(async tx => {
      // This write serializes invite allocation across processes on both dialects.
      await tx.updateTable('user').set({ updatedAt: database.authDate() }).where('id', '=', actor.id).execute()
      const outstanding = await tx.selectFrom('t3_invite_link').select(['maxUses', 'uses']).where('createdBy', '=', actor.id)
        .where('revokedAt', 'is', null).where('expiresAt', '>', now.toISOString()).execute()
      if (outstanding.reduce((sum, item) => sum + item.maxUses - item.uses, 0) + input.maxUses > (actor.role === 'admin' ? 1000 : 20)) {
        throw new AccountError(429, 'Agotaste el cupo de invitaciones pendientes. Revocá un enlace anterior para liberar cupos.')
      }
      await tx.insertInto('t3_invite_link').values(link).execute()
    })
    const visible = { id: link.id, createdBy: link.createdBy, tier: link.tier, createdAt: link.createdAt, expiresAt: link.expiresAt, revokedAt: link.revokedAt, maxUses: link.maxUses, uses: link.uses }
    return { link: visible, token }
  }
  async function acceptInvitation(input: { token: string; email: string; name: string; password: string }): Promise<User> {
    const metadata = await inviteMetadata(input.token)
    if (metadata.email && metadata.email !== input.email) throw new AccountError(400, 'Invitación inválida, usada o vencida.')
    const tokenHash = digest(input.token)
    const password = await hashPassword(input.password)
    return db.transaction().execute(async transaction => {
      const now = new Date()
      const personal = await transaction.updateTable('t3_invitation').set({ usedAt: now.toISOString() }).where('revokedAt', 'is', null)
        .where('tokenHash', '=', tokenHash).where('email', '=', input.email)
        .where('usedAt', 'is', null).where('expiresAt', '>', now.toISOString()).returningAll().executeTakeFirst()
      const link = personal ? null : await transaction.updateTable('t3_invite_link').set(eb => ({ uses: eb('uses', '+', 1) }))
        .where('tokenHash', '=', tokenHash).where('revokedAt', 'is', null).where('expiresAt', '>', now.toISOString())
        .whereRef('uses', '<', 'maxUses').returningAll().executeTakeFirst()
      const invite = personal ?? link
      if (!invite) throw new AccountError(400, 'Invitación inválida, usada o vencida.')
      if (invite.createdBy) {
        const creator = await transaction.selectFrom('user').select(['role', 'suspended']).where('id', '=', invite.createdBy).executeTakeFirst()
        const gift = await transaction.selectFrom('t3_credit_account').select('tier').where('userId', '=', invite.createdBy).executeTakeFirst()
        if (!creator || creator.suspended || (creator.role !== 'admin' && gift?.tier !== 'premium')) throw new AccountError(400, 'La invitación ya no está disponible.')
        if (invite.tier === 'premium' && creator.role !== 'admin') throw new AccountError(400, 'La invitación premium ya no está disponible.')
      }
      if (await transaction.selectFrom('user').select('id').where('email', '=', input.email).executeTakeFirst()) throw new AccountError(409, 'La cuenta ya existe.')
      const user = { id: randomUUID(), email: input.email, name: input.name, role: personal?.role ?? 'user', suspended: database.bool(false), emailVerified: database.bool(false), image: null, createdAt: database.authDate(now), updatedAt: database.authDate(now) }
      await transaction.insertInto('user').values(user).execute()
      await transaction.insertInto('account').values({ id: randomUUID(), userId: user.id, accountId: user.id, providerId: 'credential', password, createdAt: database.authDate(now), updatedAt: database.authDate(now) }).execute()
      const tier = invite.tier === 'premium' || user.role === 'admin' ? 'premium' : 'standard'
      await credits.initialize(user.id, tier, transaction)
      if (link) await transaction.insertInto('t3_invite_redemption').values({ linkId: link.id, userId: user.id, createdAt: now.toISOString() }).execute()
      return { ...publicUser(user), tier, canInvite: tier === 'premium' || user.role === 'admin' }
    })
  }
  async function signIn(request: IncomingMessage, response: ServerResponse, input: { email: string; password: string }) {
    const result = await auth.api.signInEmail({ body: { ...input, rememberMe: false }, headers: requestHeaders(request), asResponse: true })
    if (!result.ok) throw new AccountError(401, 'Email o contraseña incorrectos, o cuenta suspendida.')
    const user = await db.selectFrom('user').selectAll().where('email', '=', input.email).executeTakeFirst()
    if (!user || user.suspended) throw new AccountError(401, 'No se pudo iniciar sesión.')
    response.setHeader('Set-Cookie', result.headers.getSetCookie())
    accountJson(response, 200, { user: await enrichedUser(user) })
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? '/', base.origin).pathname
    if (path !== '/api/me' && !path.startsWith('/api/account') && !path.startsWith('/api/auth')) return false
    try {
      checkRequest(request)
      const method = request.method ?? 'GET'
      if (path === '/api/me' && method === 'GET') { accountJson(response, 200, { user: await requireUser(request) }); return true }
      if (path === '/api/account/sign-in' && method === 'POST') {
        await rateLimit(request, 'sign-in', 20)
        const input = parseInput(z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict(), await accountBody(request))
        await rateLimit(request, 'sign-in-email', 5, input.email)
        await signIn(request, response, input); return true
      }
      if (path === '/api/account/sign-out' && method === 'POST') {
        await accountBody(request)
        const result = await auth.api.signOut({ headers: requestHeaders(request), asResponse: true })
        response.setHeader('Set-Cookie', result.headers.getSetCookie())
        accountJson(response, 200, { ok: true }); return true
      }
      if (path === '/api/account/accept-invitation' && method === 'POST') {
        await rateLimit(request, 'accept-invitation', 10)
        const input = parseInput(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), email: emailSchema, name: z.string().trim().min(1).max(100), password: passwordSchema }).strict(), await accountBody(request))
        await acceptInvitation(input)
        await signIn(request, response, input); return true
      }
      if (path === '/api/account/reset-password' && method === 'POST') {
        await rateLimit(request, 'reset-password', 10)
        const input = parseInput(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: passwordSchema }).strict(), await accountBody(request))
        await resetPassword(input.token, input.password)
        accountJson(response, 200, { ok: true }); return true
      }
      if (path === '/api/account/users' && method === 'GET') {
        await requireAdmin(request)
        const users = await db.selectFrom('user').selectAll().orderBy('createdAt').execute()
        accountJson(response, 200, { users: await Promise.all(users.map(async user => ({ ...await enrichedUser(user), suspended: Boolean(user.suspended) }))) }); return true
      }
      if (path === '/api/account/invitation' && method === 'POST') {
        await rateLimit(request, 'invitation-info', 30)
        const { token } = parseInput(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(), await accountBody(request))
        accountJson(response, 200, { invitation: await inviteMetadata(token) }); return true
      }
      if (path === '/api/account/invitations' && method === 'GET') {
        const actor = await requireInviter(request)
        let query = db.selectFrom('t3_invitation').select(['id', 'email', 'tier', 'createdAt', 'expiresAt', 'usedAt', 'revokedAt']).orderBy('createdAt', 'desc').limit(100)
        if (actor.role !== 'admin') query = query.where('createdBy', '=', actor.id)
        accountJson(response, 200, { invitations: await query.execute() }); return true
      }
      if (path === '/api/account/invitations' && method === 'POST') {
        const actor = await requireInviter(request)
        await rateLimit(request, 'invite', 10, actor.id)
        const input = parseInput(z.object({ email: emailSchema, role: z.literal('user').optional(), tier: z.enum(['standard', 'premium']).default('standard') }).strict(), await accountBody(request))
        if (input.tier === 'premium' && actor.role !== 'admin') throw new AccountError(403, 'Solo el administrador puede regalar acceso premium.')
        accountJson(response, 201, await invitation(input.email, actor.id, false, input.tier)); return true
      }
      if (path === '/api/account/invitation-links' && method === 'GET') {
        const actor = await requireInviter(request)
        let query = db.selectFrom('t3_invite_link').select(['id', 'tier', 'createdAt', 'expiresAt', 'revokedAt', 'maxUses', 'uses']).orderBy('createdAt', 'desc').limit(100)
        if (actor.role !== 'admin') query = query.where('createdBy', '=', actor.id)
        accountJson(response, 200, { links: await query.execute() }); return true
      }
      if (path === '/api/account/invitation-links' && method === 'POST') {
        const actor = await requireInviter(request)
        await rateLimit(request, 'invite-link', 10, actor.id)
        const input = parseInput(z.object({ maxUses: z.number().int().min(1).max(100), expiresInDays: z.number().int().min(1).max(30).optional(), tier: z.enum(['standard', 'premium']).optional() }).strict(), await accountBody(request))
        accountJson(response, 201, await createInvitationLink(actor, input)); return true
      }
      const revoke = /^\/api\/account\/(invitations|invitation-links)\/([a-f0-9-]{36})\/revoke$/.exec(path)
      if (revoke && method === 'POST') {
        const actor = await requireInviter(request)
        await accountBody(request)
        const now = new Date().toISOString()
        if (revoke[1] === 'invitations') {
          let query = db.updateTable('t3_invitation').set({ revokedAt: now }).where('id', '=', revoke[2]).where('usedAt', 'is', null)
          if (actor.role !== 'admin') query = query.where('createdBy', '=', actor.id)
          if (!(await query.returning('id').executeTakeFirst())) throw new AccountError(404, 'Invitación no encontrada.')
        } else {
          let query = db.updateTable('t3_invite_link').set({ revokedAt: now }).where('id', '=', revoke[2])
          if (actor.role !== 'admin') query = query.where('createdBy', '=', actor.id)
          if (!(await query.returning('id').executeTakeFirst())) throw new AccountError(404, 'Enlace no encontrado.')
        }
        accountJson(response, 200, { ok: true }); return true
      }
      const creditManagement = /^\/api\/account\/users\/([a-zA-Z0-9-]+)\/(tier|credits)$/.exec(path)
      if (creditManagement && method === 'POST') {
        const actor = await requireAdmin(request)
        const target = await db.selectFrom('user').select(['id', 'role']).where('id', '=', creditManagement[1]).executeTakeFirst()
        if (!target) throw new AccountError(404, 'Usuario no encontrado.')
        if (creditManagement[2] === 'tier') {
          const input = parseInput(z.object({ tier: z.enum(['standard', 'premium']) }).strict(), await accountBody(request))
          if (target.role === 'admin' && input.tier !== 'premium') throw new AccountError(403, 'El administrador conserva acceso premium.')
          await credits.setTier(target.id, input.tier)
        } else {
          const input = parseInput(z.object({ amount: z.number().int().min(1).max(100000), reason: z.string().trim().min(5).max(240), requestId: z.uuid() }).strict(), await accountBody(request))
          await credits.grant(target.id, { amount: input.amount, sourceKey: `admin:${actor.id}:${input.requestId}`, reason: input.reason })
        }
        accountJson(response, 200, await credits.summary(target.id)); return true
      }
      const management = /^\/api\/account\/users\/([a-zA-Z0-9-]+)\/(suspend|revoke-sessions)$/.exec(path)
      if (management && method === 'POST') {
        const actor = await requireAdmin(request)
        const user = await db.selectFrom('user').selectAll().where('id', '=', management[1]).executeTakeFirst()
        if (!user) throw new AccountError(404, 'Usuario no encontrado.')
        if (management[2] === 'suspend') {
          const input = parseInput(z.object({ suspended: z.boolean() }).strict(), await accountBody(request))
          if (user.id === actor.id || user.role === 'admin') throw new AccountError(403, 'No se puede suspender al administrador.')
          await db.transaction().execute(async transaction => {
            await transaction.updateTable('user').set({ suspended: database.bool(input.suspended), updatedAt: database.authDate() }).where('id', '=', user.id).execute()
            if (input.suspended) await transaction.deleteFrom('session').where('userId', '=', user.id).execute()
          })
        } else { await accountBody(request); await db.deleteFrom('session').where('userId', '=', user.id).execute() }
        accountJson(response, 200, { ok: true }); return true
      }
      // Explicit allowlist: never expose Better Auth signup, social providers,
      // account linking, email changes or administrative routes accidentally.
      accountJson(response, 404, { error: 'Ruta no encontrada.' })
    } catch (error) {
      if (error instanceof AccountError || error instanceof CreditError) accountJson(response, error.status, { error: error.message })
      else accountJson(response, 500, { error: 'No se pudo completar la solicitud de cuenta.' })
    }
    return true
  }
  return { handle, authorize, requireUser, checkRequest, rateLimit, credits, createInvitationLink, inviteMetadata, createInvitation: invitation, createBootstrapInvitation: (email: string) => invitation(email, null, true), acceptInvitation, createRecovery }
}
export type Accounts = Awaited<ReturnType<typeof createAccounts>>
