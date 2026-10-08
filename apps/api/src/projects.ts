import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createProjectFoundations, projectFoundationReadiness, ProjectFoundationsSchema, ProjectSnapshotSchema, FoundationModelsSchema, FoundationVersionSchema, foundationInputFingerprintValue, type FoundationModels, type FoundationVersion, type ProjectFoundations, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { z } from 'zod'
import { assembleFoundationScenes, rebaseBuildingFoundation } from '../../web/src/private/foundation-scenes.ts'
import type { AppDatabase, AppTables } from './app-database.ts'
import { AccountError, accountBody, accountJson, parseInput, type Accounts, type User } from './accounts.ts'

export type ProjectRole = 'owner' | 'editor' | 'viewer'
export interface ProjectSummary {
  id: string; name: string; notes: string; ownerId: string; role: ProjectRole
  revision: number; createdAt: string; updatedAt: string
  stage: 'setup' | 'ready'
}
export interface ProjectDocument extends ProjectSummary { scene: ProjectSnapshot | null; foundations: ProjectFoundations | null; foundationModels?: FoundationModels | null }
export type ProjectAssetReference = { id: string; url: string; repoPath: string }
const nameSchema = z.string().trim().min(1).max(120)
const notesSchema = z.string().max(20_000)
const revisionSchema = z.number().int().positive()
const idPattern = /^[a-f0-9-]{36}$/

export async function createProjects(options: {
  database: AppDatabase; accounts: Accounts; bundledScenePath?: string
  validateAssetReference?: (user: User, projectId: string, asset: ProjectAssetReference) => Promise<boolean>
  cloneAssetReferences?: (sourceId: string, targetId: string, user: User, scene: ProjectSnapshot) => Promise<ProjectSnapshot>
  validatePlanReference?: (user: User, projectId: string, referenceId: string) => Promise<boolean>
  clonePlanReferences?: (sourceId: string, targetId: string, user: User, foundations: ProjectFoundations) => Promise<void>
}) {
  const { database, accounts } = options
  const db = database.db
  // Only legacy scene validation needs the bundled public asset allowlist. A
  // new project never reads or inherits the demonstration scene.
  let publicAssets: Map<string, ProjectSnapshot['assets'][number]> | undefined
  async function bundledAssets() {
    if (!publicAssets) {
      const scene = ProjectSnapshotSchema.parse(JSON.parse(await readFile(options.bundledScenePath ?? fileURLToPath(new URL('../../../assets/scenes/t3-project.json', import.meta.url)), 'utf8')))
      publicAssets = new Map(scene.assets.map(asset => [asset.id, asset]))
    }
    return publicAssets
  }
  const decodeFoundations = (value: string | null): ProjectFoundations | null => value === null ? null : ProjectFoundationsSchema.parse(JSON.parse(value))
  const summary = (row: Pick<AppTables['t3_project'], 'id' | 'ownerId' | 'name' | 'notes' | 'revision' | 'createdAt' | 'updatedAt'>, role: ProjectRole, foundations: ProjectFoundations | null, sceneAvailable: boolean): ProjectSummary => ({
    id: row.id, ownerId: row.ownerId, name: row.name, notes: row.notes, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, role,
    stage: projectFoundationReadiness(foundations, sceneAvailable).ready ? 'ready' : 'setup',
  })
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
      const bundled = (await bundledAssets()).get(asset.id)
      if (bundled && bundled.url === asset.url && bundled.repoPath === asset.repoPath) continue
      if (!idPattern.test(asset.id) || asset.url !== `/api/projects/${projectId}/assets/${asset.id}/files/model.glb` || !options.validateAssetReference
        || !await options.validateAssetReference(user, projectId, asset)) throw new AccountError(400, 'La escena contiene un recurso no autorizado.')
    }
    const parsed = ProjectSnapshotSchema.safeParse(value)
    if (!parsed.success) throw new AccountError(400, 'La escena no cumple el formato de proyecto.')
    if (parsed.data.project.id !== projectId) throw new AccountError(400, 'La escena pertenece a otro proyecto.')
    return parsed.data
  }
  async function validateFoundations(user: User, projectId: string, value: unknown): Promise<ProjectFoundations> {
    const foundations = parseInput(ProjectFoundationsSchema, value)
    if (foundations.dwelling.status !== 'draft' || foundations.building.status !== 'draft') {
      throw new AccountError(400, 'Las bases requieren modelos revisados antes de completarse.')
    }
    await validateFoundationPlanReferences(user, projectId, foundations)
    return foundations
  }
  async function validateFoundationPlanReferences(user: User, projectId: string, foundations: ProjectFoundations): Promise<void> {
    const referenceIds = new Set(foundations.dwelling.levels.flatMap(level => level.planReferences.map(reference => reference.id)))
    for (const referenceId of referenceIds) {
      if (!options.validatePlanReference || !await options.validatePlanReference(user, projectId, referenceId)) {
        throw new AccountError(400, 'Uno de los planos no pertenece a este proyecto o ya no está disponible.')
      }
    }
  }
  const decodeModels = (value: string | null): FoundationModels | null => value === null ? null : FoundationModelsSchema.parse(JSON.parse(value))
  async function get(user: User, projectId: string): Promise<ProjectDocument> {
    const role = await requireAccess(user, projectId)
    const row = await db.selectFrom('t3_project').selectAll().where('id', '=', projectId).executeTakeFirstOrThrow()
    const scene = JSON.parse(row.scene) as ProjectSnapshot | null, foundations = decodeFoundations(row.foundations)
    return { ...summary(row, role, foundations, scene !== null), scene, foundations, foundationModels: decodeModels(row.foundationModels) }
  }
  async function list(user: User): Promise<ProjectSummary[]> {
    const rows = await db.selectFrom('t3_project').select(['id', 'ownerId', 'name', 'notes', 'revision', 'createdAt', 'updatedAt', 'foundations'])
      .select(eb => eb('scene', '!=', 'null').as('hasScene'))
      .where(eb => eb.or([eb('ownerId', '=', user.id), eb.exists(eb.selectFrom('t3_project_member').select('projectId').whereRef('projectId', '=', 't3_project.id').where('userId', '=', user.id))]))
      .orderBy('updatedAt', 'desc').execute()
    const members = await db.selectFrom('t3_project_member').select(['projectId', 'role']).where('userId', '=', user.id).execute()
    const roles = new Map(members.map(member => [member.projectId, member.role]))
    return rows.map(row => summary(row, row.ownerId === user.id ? 'owner' : roles.get(row.id) === 'editor' ? 'editor' : 'viewer', decodeFoundations(row.foundations), Boolean(row.hasScene)))
  }
  async function create(user: User, input: { name: string; notes?: string }, sourceId?: string): Promise<ProjectDocument> {
    if ((await db.selectFrom('t3_project').select('id').where('ownerId', '=', user.id).execute()).length >= 100) throw new AccountError(429, 'Llegaste al límite de 100 proyectos.')
    const id = randomUUID()
    const now = new Date().toISOString()
    let scene: ProjectSnapshot | null = null
    let foundations: ProjectFoundations | null = createProjectFoundations()
    let foundationModels: FoundationModels | null = null
    let notes = input.notes ?? ''
    if (sourceId) {
      const source = await get(user, sourceId)
      scene = source.scene
      foundations = source.foundations
      foundationModels = source.foundationModels ?? null
      notes = source.notes
      if (scene && scene.assets.some(asset => asset.url.startsWith('/api/'))) {
        if (!options.cloneAssetReferences) throw new AccountError(409, 'No se pueden duplicar todavía los recursos privados de este proyecto.')
        scene = await options.cloneAssetReferences(sourceId, id, user, scene)
      }
      if (foundations?.dwelling.levels.some(level => level.planReferences.length > 0)) {
        if (!options.clonePlanReferences) throw new AccountError(409, 'No se pueden duplicar todavía los planos privados de este proyecto.')
        await options.clonePlanReferences(sourceId, id, user, foundations)
      }
    }
    if (scene) {
      scene.project = { id, name: input.name }
      scene = await validateScene(user, id, scene)
    }
    if (foundationModels) {
      for (const level of foundationModels.levels) {
        if (options.cloneAssetReferences && level.scene.assets.some(asset => asset.url.startsWith('/api/'))) level.scene = await options.cloneAssetReferences(sourceId!, id, user, level.scene)
        level.scene.project = { id, name: input.name }
        level.scene = await validateScene(user, id, level.scene)
      }
      if (foundationModels.activeLevelId) scene = foundationModels.levels.find(level => level.id === foundationModels!.activeLevelId)?.scene ?? scene
    }
    if (foundations && !foundationModels) foundations = await validateFoundations(user, id, foundations)
    const row = { id, ownerId: user.id, name: input.name, notes, revision: 1, scene: JSON.stringify(scene), foundations: foundations ? JSON.stringify(foundations) : null, foundationModels: foundationModels ? JSON.stringify(foundationModels) : null, createdAt: now, updatedAt: now }
    await db.insertInto('t3_project').values(row).execute()
    return { ...summary(row, 'owner', foundations, scene !== null), scene, foundations, foundationModels }
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
  async function save(user: User, projectId: string, input: { revision: number; name?: string; notes?: string; scene?: unknown; foundations?: unknown; levels?: unknown; activeLevelId?: string }): Promise<ProjectDocument> {
    const role = await requireAccess(user, projectId, 'write')
    const previous = await db.selectFrom('t3_project').selectAll().where('id', '=', projectId).executeTakeFirstOrThrow()
    const previousFoundations = decodeFoundations(previous.foundations)
    let foundationModels = decodeModels(previous.foundationModels)
    let foundations = previousFoundations
    if (input.foundations !== undefined) {
      if (!previousFoundations) throw new AccountError(400, 'Este proyecto no tiene bases editables.')
      const proposed = parseInput(ProjectFoundationsSchema, input.foundations)
      if (proposed.dwelling.status !== previousFoundations.dwelling.status || proposed.building.status !== previousFoundations.building.status) throw new AccountError(400, 'La aprobación de modelos se realiza desde el taller.')
      const changedTargets = (['dwelling', 'building'] as const).filter(target => JSON.stringify(proposed[target]) !== JSON.stringify(previousFoundations[target]))
      if (changedTargets.length) {
        if (foundationModels?.levels.length) throw new AccountError(409, 'Pedí las correcciones de la base en el chat del agente.')
        for (const target of changedTargets) {
          proposed[target].status = 'draft'
          if (foundationModels) foundationModels[target] = null
        }
        if (foundationModels && !foundationModels.dwelling && !foundationModels.building) foundationModels = null
        await validateFoundationPlanReferences(user, projectId, proposed)
        foundations = proposed
      }
    }
    if (input.scene !== undefined && previousFoundations && !foundationModels?.levels.length) throw new AccountError(400, 'Primero hay que reconstruir y revisar las bases del proyecto.')
    let scene = input.scene === undefined ? JSON.parse(previous.scene) as ProjectSnapshot | null : await validateScene(user, projectId, input.scene)
    if (input.levels !== undefined || input.activeLevelId !== undefined) {
      if (!foundationModels?.levels.length || !input.activeLevelId || input.levels === undefined) throw new AccountError(400, 'Selección de planta inválida.')
      const levels = parseInput(z.array(z.object({ id: z.string(), name: z.string(), scene: ProjectSnapshotSchema })).max(30), input.levels)
      if (levels.length !== foundationModels.levels.length || new Set(levels.map(level => level.id)).size !== levels.length || levels.some(level => !foundationModels!.levels.some(original => original.id === level.id))) throw new AccountError(400, 'Las plantas se reconstruyen desde el taller.')
      for (const level of levels) level.scene = await validateScene(user, projectId, level.scene)
      const active = levels.find(level => level.id === input.activeLevelId)
      if (!active || (input.scene !== undefined && JSON.stringify(active.scene) !== JSON.stringify(scene))) throw new AccountError(400, 'La escena debe coincidir con la planta activa.')
      foundationModels = { ...foundationModels, activeLevelId: active.id, levels }
      scene = active.scene
    } else if (foundationModels?.activeLevelId && scene) {
      foundationModels.levels = foundationModels.levels.map(level => level.id === foundationModels!.activeLevelId ? { ...level, scene: scene! } : level)
    }
    const name = input.name ?? previous.name
    if (scene) scene.project = { id: projectId, name }
    if (foundationModels) for (const level of foundationModels.levels) {
      level.scene.project = { id: projectId, name }
      if (scene?.buildingEnergy) level.scene.buildingEnergy = structuredClone(scene.buildingEnergy)
      else delete level.scene.buildingEnergy
    }
    const row = await db.updateTable('t3_project').set({ name, notes: input.notes ?? previous.notes, scene: JSON.stringify(scene), foundations: foundations ? JSON.stringify(foundations) : null, foundationModels: foundationModels ? JSON.stringify(foundationModels) : null, revision: input.revision + 1, updatedAt: new Date().toISOString() })
      .where('id', '=', projectId).where('revision', '=', input.revision)
      .where(eb => eb.or([eb('ownerId', '=', user.id), eb.exists(eb.selectFrom('t3_project_member').select('projectId').whereRef('projectId', '=', 't3_project.id').where('userId', '=', user.id).where('role', '=', 'editor'))]))
      .returningAll().executeTakeFirst()
    if (!row) throw new AccountError(409, 'El proyecto cambió. Recargalo antes de guardar.')
    return { ...summary(row, role, foundations, scene !== null), scene, foundations, foundationModels }
  }
  async function saveScene(user: User, projectId: string, scene: unknown, expectedRevision: number): Promise<ProjectDocument> {
    return save(user, projectId, { scene, revision: expectedRevision })
  }
  async function applyFoundationVersion(user: User, projectId: string, raw: FoundationVersion, revision: number): Promise<ProjectDocument> {
    await requireAccess(user, projectId, 'write')
    const version = FoundationVersionSchema.parse(raw), project = await get(user, projectId)
    if (project.revision !== revision) throw new AccountError(409, 'El proyecto cambió. Recargalo antes de usar esta versión.')
    if (version.projectId !== projectId || version.status !== 'ready' || !version.candidate || version.candidate.target !== version.target || !version.iterations.at(-1)?.review.passed) throw new AccountError(400, 'Esta versión todavía necesita correcciones.')
    if (!project.foundations || createHash('sha256').update(foundationInputFingerprintValue(project.foundations)).digest('hex') !== version.foundationsFingerprint) throw new AccountError(409, 'Los planos o fuentes cambiaron. Generá una versión con los datos actuales.')
    const models: FoundationModels = structuredClone(project.foundationModels) ?? { dwelling: null, building: null, activeLevelId: null, levels: [] }
    if (models[version.target]?.versionId === version.id) return project
    models[version.target] = { versionId: version.id, candidate: version.candidate }
    const foundations = structuredClone(project.foundations)
    foundations[version.target].status = 'ready'
    let scene = project.scene
    if (models.dwelling?.candidate.target === 'dwelling' && models.building?.candidate.target === 'building') {
      models.levels = assembleFoundationScenes(projectId, project.name, models.dwelling.candidate, models.building.candidate)
      if (version.target === 'building' && project.foundationModels?.levels.length) models.levels = rebaseBuildingFoundation(project.foundationModels, models.levels)
      models.activeLevelId = models.levels.some(level => level.id === models.activeLevelId) ? models.activeLevelId : models.levels[0].id
      scene = models.levels.find(level => level.id === models.activeLevelId)!.scene
    }
    await db.transaction().execute(async tx => {
      const updated = await tx.updateTable('t3_project').set({ scene: JSON.stringify(scene), foundations: JSON.stringify(foundations), foundationModels: JSON.stringify(FoundationModelsSchema.parse(models)), revision: revision + 1, updatedAt: new Date().toISOString() })
        .where('id', '=', projectId).where('revision', '=', revision)
        .where(eb => eb.or([eb('ownerId', '=', user.id), eb.exists(eb.selectFrom('t3_project_member').select('projectId').whereRef('projectId', '=', 't3_project.id').where('userId', '=', user.id).where('role', '=', 'editor'))]))
        .returning('id').executeTakeFirst()
      if (!updated) throw new AccountError(409, 'El proyecto cambió o ya no podés editarlo.')
      if (project.scene) await tx.insertInto('t3_project_checkpoint').values({ id: randomUUID(), projectId, revision, reason: version.target, document: JSON.stringify(project), createdAt: new Date().toISOString() }).execute()
    })
    return get(user, projectId)
  }
  async function listCheckpoints(user: User, projectId: string) {
    await requireAccess(user, projectId)
    return db.selectFrom('t3_project_checkpoint').select(['id', 'revision', 'reason', 'createdAt']).where('projectId', '=', projectId).orderBy('revision', 'desc').execute()
  }
  async function restoreCheckpoint(user: User, projectId: string, checkpointId: string, revision: number): Promise<ProjectDocument> {
    await requireAccess(user, projectId, 'write')
    const current = await get(user, projectId)
    if (current.revision !== revision) throw new AccountError(409, 'El proyecto cambió. Recargalo antes de restaurar.')
    const checkpoint = await db.selectFrom('t3_project_checkpoint').select('document').where('id', '=', checkpointId).where('projectId', '=', projectId).executeTakeFirst()
    if (!checkpoint) throw new AccountError(404, 'Copia no encontrada.')
    const previous = JSON.parse(checkpoint.document) as ProjectDocument
    const scene = previous.scene ? await validateScene(user, projectId, previous.scene) : null
    const foundationModels = previous.foundationModels ? FoundationModelsSchema.parse(previous.foundationModels) : null
    if (foundationModels) for (const level of foundationModels.levels) await validateScene(user, projectId, level.scene)
    const foundations = previous.foundations ? ProjectFoundationsSchema.parse(previous.foundations) : null
    await db.transaction().execute(async tx => {
      const updated = await tx.updateTable('t3_project').set({ name: previous.name, notes: previous.notes, scene: JSON.stringify(scene), foundations: foundations ? JSON.stringify(foundations) : null, foundationModels: foundationModels ? JSON.stringify(foundationModels) : null, revision: revision + 1, updatedAt: new Date().toISOString() })
        .where('id', '=', projectId).where('revision', '=', revision)
        .where(eb => eb.or([eb('ownerId', '=', user.id), eb.exists(eb.selectFrom('t3_project_member').select('projectId').whereRef('projectId', '=', 't3_project.id').where('userId', '=', user.id).where('role', '=', 'editor'))]))
        .returning('id').executeTakeFirst()
      if (!updated) throw new AccountError(409, 'El proyecto cambió o ya no podés editarlo.')
      await tx.insertInto('t3_project_checkpoint').values({ id: randomUUID(), projectId, revision, reason: 'restore', document: JSON.stringify(current), createdAt: new Date().toISOString() }).execute()
    })
    return get(user, projectId)
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/api/projects')) return false
    // Project-scoped asset routes belong to the asset API, after its own auth.
    if (/^\/api\/projects\/[^/]+\/assets(?:\/|$)/.test(path)) return false
    if (/^\/api\/projects\/[^/]+\/references(?:\/|$)/.test(path)) return false
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
      const checkpointMatch = /^\/api\/projects\/([a-f0-9-]{36})\/checkpoints(?:\/([a-f0-9-]{36})\/restore)?$/.exec(path)
      if (checkpointMatch) {
        const [, projectId, checkpointId] = checkpointMatch
        if (!checkpointId && method === 'GET') { accountJson(response, 200, { checkpoints: await listCheckpoints(user, projectId) }); return true }
        if (checkpointId && method === 'POST') {
          const input = parseInput(z.object({ revision: revisionSchema }).strict(), await accountBody(request))
          accountJson(response, 200, { project: await restoreCheckpoint(user, projectId, checkpointId, input.revision) }); return true
        }
      }
      const match = /^\/api\/projects\/([a-f0-9-]{36})(?:\/(clone|members)(?:\/([a-zA-Z0-9-]+))?)?$/.exec(path)
      if (!match) throw new AccountError(404, 'Ruta no encontrada.')
      const [, id, action, memberId] = match
      if (!action && method === 'GET') { accountJson(response, 200, { project: await get(user, id) }); return true }
      if (!action && method === 'PUT') {
        const input = parseInput(z.object({ revision: revisionSchema, name: nameSchema.optional(), notes: notesSchema.optional(), scene: z.unknown().optional(), foundations: z.unknown().optional(), levels: z.unknown().optional(), activeLevelId: z.string().optional() }).strict(), await accountBody(request, 4 * 1024 * 1024))
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
  return { createGenerated, handle, access, requireAccess, get, list, create, save, saveScene, applyFoundationVersion, listCheckpoints, restoreCheckpoint }
}
export type Projects = Awaited<ReturnType<typeof createProjects>>
