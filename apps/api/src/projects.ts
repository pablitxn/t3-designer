import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { ProjectSnapshotSchema, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { z } from 'zod'
import type { AppDatabase, AppTables } from './app-database.ts'
import { AccountError, accountBody, accountJson, parseInput, type Accounts, type User } from './accounts.ts'

export type ProjectRole = 'owner' | 'editor' | 'viewer'
export interface ProjectSummary {
  id: string; name: string; notes: string; ownerId: string; role: ProjectRole
  revision: number; createdAt: string; updatedAt: string
}
export interface ProjectDocument extends ProjectSummary { scene: ProjectSnapshot }
export type ProjectAssetReference = { id: string; url: string; repoPath: string }
const nameSchema = z.string().trim().min(1).max(120)
const notesSchema = z.string().max(20_000)
const revisionSchema = z.number().int().positive()
const idPattern = /^[a-f0-9-]{36}$/

export async function createProjects(options: {
  database: AppDatabase; accounts: Accounts; bundledScenePath?: string
  validateAssetReference?: (user: User, projectId: string, asset: ProjectAssetReference) => Promise<boolean>
  cloneAssetReferences?: (sourceId: string, targetId: string, user: User, scene: ProjectSnapshot) => Promise<ProjectSnapshot>
}) {
  const { database, accounts } = options
  const db = database.db
  const bundledScene = ProjectSnapshotSchema.parse(JSON.parse(await readFile(options.bundledScenePath ?? fileURLToPath(new URL('../../../assets/scenes/t3-project.json', import.meta.url)), 'utf8')))
  const publicAssets = new Map(bundledScene.assets.map(asset => [asset.id, asset]))
  const summary = (row: Omit<AppTables['t3_project'], 'scene'>, role: ProjectRole): ProjectSummary => ({ id: row.id, ownerId: row.ownerId, name: row.name, notes: row.notes, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, role })
  async function access(user: User, projectId: string): Promise<ProjectRole | null> {
    const project = await db.selectFrom('t3_project').select('ownerId').where('id', '=', projectId).executeTakeFirst()
    if (!project) return null
    if (project.ownerId === user.id) return 'owner'
    const member = await db.selectFrom('t3_project_member').select('role').where('projectId', '=', projectId).where('userId', '=', user.id).executeTakeFirst()
    return member?.role === 'editor' || member?.role === 'viewer' ? member.role : null
  }
  async function requireAccess(user: User, projectId: string, mode: 'read' | 'write' | 'owner' = 'read'): Promise<ProjectRole> {
    const role = await access(user, projectId)
    // Do not reveal whether another person's private project exists.
    if (!role) throw new AccountError(404, 'Proyecto no encontrado.')
    if ((mode === 'write' && role === 'viewer') || (mode === 'owner' && role !== 'owner')) throw new AccountError(403, 'No tenés permiso para modificar este proyecto.')
    return role
  }
  async function validateScene(user: User, projectId: string, value: unknown): Promise<ProjectSnapshot> {
    if (!value || typeof value !== 'object' || !('assets' in value) || !Array.isArray(value.assets)) throw new AccountError(400, 'Escena inválida.')
    for (const raw of value.assets) {
      const asset = parseInput(z.object({ id: z.string().min(1).max(128), url: z.string(), repoPath: z.string() }), raw)
      const bundled = publicAssets.get(asset.id)
      if (bundled && bundled.url === asset.url && bundled.repoPath === asset.repoPath) continue
      if (!idPattern.test(asset.id) || asset.url !== `/api/projects/${projectId}/assets/${asset.id}/files/model.glb` || !options.validateAssetReference
        || !await options.validateAssetReference(user, projectId, asset)) throw new AccountError(400, 'La escena contiene un recurso no autorizado.')
    }
    const parsed = ProjectSnapshotSchema.safeParse(value)
    if (!parsed.success) throw new AccountError(400, 'La escena no cumple el formato de proyecto.')
    if (parsed.data.project.id !== projectId) throw new AccountError(400, 'La escena pertenece a otro proyecto.')
    return parsed.data
  }
  async function get(user: User, projectId: string): Promise<ProjectDocument> {
    const role = await requireAccess(user, projectId)
    const row = await db.selectFrom('t3_project').selectAll().where('id', '=', projectId).executeTakeFirstOrThrow()
    return { ...summary(row, role), scene: JSON.parse(row.scene) as ProjectSnapshot }
  }
  async function list(user: User): Promise<ProjectSummary[]> {
    const rows = await db.selectFrom('t3_project').select(['id', 'ownerId', 'name', 'notes', 'revision', 'createdAt', 'updatedAt'])
      .where(eb => eb.or([eb('ownerId', '=', user.id), eb.exists(eb.selectFrom('t3_project_member').select('projectId').whereRef('projectId', '=', 't3_project.id').where('userId', '=', user.id))]))
      .orderBy('updatedAt', 'desc').execute()
    const members = await db.selectFrom('t3_project_member').select(['projectId', 'role']).where('userId', '=', user.id).execute()
    const roles = new Map(members.map(member => [member.projectId, member.role]))
    return rows.map(row => summary(row, row.ownerId === user.id ? 'owner' : roles.get(row.id) === 'editor' ? 'editor' : 'viewer'))
  }
  async function create(user: User, input: { name: string; notes?: string }, sourceId?: string): Promise<ProjectDocument> {
    if ((await db.selectFrom('t3_project').select('id').where('ownerId', '=', user.id).execute()).length >= 100) throw new AccountError(429, 'Llegaste al límite de 100 proyectos.')
    const id = randomUUID()
    const now = new Date().toISOString()
    let scene = structuredClone(bundledScene)
    let notes = input.notes ?? ''
    if (sourceId) {
      const source = await get(user, sourceId)
      scene = source.scene
      notes = source.notes
      if (scene.assets.some(asset => !publicAssets.has(asset.id))) {
        if (!options.cloneAssetReferences) throw new AccountError(409, 'No se pueden duplicar todavía los recursos privados de este proyecto.')
        scene = await options.cloneAssetReferences(sourceId, id, user, scene)
      }
    }
    scene.project = { id, name: input.name }
    scene = await validateScene(user, id, scene)
    const row = { id, ownerId: user.id, name: input.name, notes, revision: 1, scene: JSON.stringify(scene), createdAt: now, updatedAt: now }
    await db.insertInto('t3_project').values(row).execute()
    return { ...summary(row, 'owner'), scene }
  }
  async function createGenerated(user: User, scene: ProjectSnapshot): Promise<ProjectDocument> {
    const id = scene.project.id
    if (!idPattern.test(id)) throw new AccountError(400, 'Identidad de proyecto inválida.')
    const validated = await validateScene(user, id, scene)
    const now = new Date().toISOString()
    await db.transaction().execute(async tx => {
      const owner = await tx.updateTable('user').set(eb => ({ name: eb.ref('name') })).where('id', '=', user.id).returning('suspended').executeTakeFirst()
      if (!owner || owner.suspended) throw new AccountError(403, 'La cuenta no está disponible.')
      const existing = await tx.selectFrom('t3_project').select('ownerId').where('id', '=', id).executeTakeFirst()
      if (existing) { if (existing.ownerId !== user.id) throw new AccountError(409, 'Identidad de proyecto ocupada.'); return }
      if ((await tx.selectFrom('t3_project').select('id').where('ownerId', '=', user.id).execute()).length >= 100) throw new AccountError(429, 'Llegaste al límite de 100 proyectos.')
      await tx.insertInto('t3_project').values({ id, ownerId: user.id, name: validated.project.name, notes: 'Concepto generado con IA. Medidas, distribución y entorno requieren revisión; no es un relevamiento ni documentación de obra.', scene: JSON.stringify(validated), revision: 1, createdAt: now, updatedAt: now }).execute()
    })
    return get(user, id)
  }
  async function save(user: User, projectId: string, input: { revision: number; name?: string; notes?: string; scene?: unknown }): Promise<ProjectDocument> {
    const role = await requireAccess(user, projectId, 'write')
    const previous = await db.selectFrom('t3_project').selectAll().where('id', '=', projectId).executeTakeFirstOrThrow()
    const scene = input.scene === undefined ? JSON.parse(previous.scene) as ProjectSnapshot : await validateScene(user, projectId, input.scene)
    const name = input.name ?? previous.name
    scene.project = { id: projectId, name }
    const row = await db.updateTable('t3_project').set({ name, notes: input.notes ?? previous.notes, scene: JSON.stringify(scene), revision: input.revision + 1, updatedAt: new Date().toISOString() })
      .where('id', '=', projectId).where('revision', '=', input.revision)
      .where(eb => eb.or([eb('ownerId', '=', user.id), eb.exists(eb.selectFrom('t3_project_member').select('projectId').whereRef('projectId', '=', 't3_project.id').where('userId', '=', user.id).where('role', '=', 'editor'))]))
      .returningAll().executeTakeFirst()
    if (!row) throw new AccountError(409, 'El proyecto cambió. Recargalo antes de guardar.')
    return { ...summary(row, role), scene }
  }
  async function saveScene(user: User, projectId: string, scene: unknown, expectedRevision: number): Promise<ProjectDocument> {
    return save(user, projectId, { scene, revision: expectedRevision })
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/api/projects')) return false
    // Project-scoped asset routes belong to the asset API, after its own auth.
    if (/^\/api\/projects\/[^/]+\/assets(?:\/|$)/.test(path)) return false
    try {
      accounts.checkRequest(request)
      const user = await accounts.requireUser(request)
      const method = request.method ?? 'GET'
      if (!['GET', 'HEAD'].includes(method)) await accounts.rateLimit(request, 'project-mutation', 60, user.id)
      if (path === '/api/projects' && method === 'GET') { accountJson(response, 200, { projects: await list(user) }); return true }
      if (path === '/api/projects' && method === 'POST') {
        const input = parseInput(z.object({ name: nameSchema, notes: notesSchema.optional() }).strict(), await accountBody(request))
        accountJson(response, 201, { project: await create(user, input) }); return true
      }
      const match = /^\/api\/projects\/([a-f0-9-]{36})(?:\/(clone|members)(?:\/([a-zA-Z0-9-]+))?)?$/.exec(path)
      if (!match) throw new AccountError(404, 'Ruta no encontrada.')
      const [, id, action, memberId] = match
      if (!action && method === 'GET') { accountJson(response, 200, { project: await get(user, id) }); return true }
      if (!action && method === 'PUT') {
        const input = parseInput(z.object({ revision: revisionSchema, name: nameSchema.optional(), notes: notesSchema.optional(), scene: z.unknown().optional() }).strict(), await accountBody(request, 4 * 1024 * 1024))
        accountJson(response, 200, { project: await save(user, id, input) }); return true
      }
      if (action === 'clone' && !memberId && method === 'POST') {
        const source = await get(user, id)
        const input = parseInput(z.object({ name: nameSchema.optional() }).strict(), await accountBody(request))
        accountJson(response, 201, { project: await create(user, { name: input.name ?? `${source.name.slice(0, 110)} (copia)` }, id) }); return true
      }
      if (action === 'members') {
        await requireAccess(user, id, 'owner')
        if (!memberId && method === 'GET') {
          const members = await db.selectFrom('t3_project_member').innerJoin('user', 'user.id', 't3_project_member.userId')
            .select(['userId', 'user.email', 'user.name', 't3_project_member.role']).where('projectId', '=', id).execute()
          accountJson(response, 200, { members }); return true
        }
        if (!memberId && method === 'POST') {
          const input = parseInput(z.object({ email: z.email().transform(value => value.toLowerCase()), role: z.enum(['editor', 'viewer']) }).strict(), await accountBody(request))
          const target = await db.selectFrom('user').selectAll().where('email', '=', input.email).executeTakeFirst()
          if (!target || target.suspended) throw new AccountError(404, 'No hay una cuenta activa con ese email.')
          if (target.id === user.id) throw new AccountError(400, 'Ya sos propietario de este proyecto.')
          await db.insertInto('t3_project_member').values({ projectId: id, userId: target.id, role: input.role, createdAt: new Date().toISOString() })
            .onConflict(oc => oc.columns(['projectId', 'userId']).doUpdateSet({ role: input.role })).execute()
          accountJson(response, 200, { ok: true }); return true
        }
        if (memberId && method === 'DELETE') {
          await accountBody(request)
          await db.deleteFrom('t3_project_member').where('projectId', '=', id).where('userId', '=', memberId).execute()
          accountJson(response, 200, { ok: true }); return true
        }
      }
      throw new AccountError(404, 'Ruta no encontrada.')
    } catch (error) {
      if (error instanceof AccountError) accountJson(response, error.status, { error: error.message })
      else accountJson(response, 500, { error: 'No se pudo completar la solicitud de proyecto.' })
    }
    return true
  }
  return { createGenerated, handle, access, requireAccess, get, list, create, save, saveScene }
}
export type Projects = Awaited<ReturnType<typeof createProjects>>
