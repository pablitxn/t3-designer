import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { createProjectFoundations, ProjectFoundationsSchema, type ProjectFoundations } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'
import { creditFixture } from './credit-fixture'

test.use({ locale: 'es-AR' })
const projectId = '8a38d6b3-178b-4b6d-96e5-bb1e249ee672'
const path = `/app/projects/${projectId}`
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4mEAAAAASUVORK5CYII=', 'base64')

async function fixture(page: Page, role: Project['role'] = 'owner', foundations = createProjectFoundations()) {
  let saved: Project = { id: projectId, name: 'Mi casa', ownerId: 'test-owner', role, revision: 1, notes: '', stage: 'setup', scene: null, foundations, createdAt: '2026-10-07T10:00:00Z', updatedAt: '2026-10-07T10:00:00Z' }
  const writes: { revision: number; foundations: ProjectFoundations; name: string; notes: string; scene?: unknown }[] = []
  const creations: unknown[] = []
  const requests: string[] = []
  const uploads: { name: string; dataUrl: string }[] = []
  let conflict = false
  let created = false
  await page.route('**/api/**', route => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    requests.push(`${request.method()} ${url}`)
    if (url === '/api/me') return route.fulfill({ json: { user: { id: 'test-owner', name: 'Juan', email: 'juan@example.test', role: 'user' } } })
    if (url === '/api/credits') return route.fulfill({ json: creditFixture })
    if (url === '/api/health') return route.fulfill({ json: { foundationAgentEnabled: false } })
    if (url === `/api/projects/${projectId}/foundation-agent`) return route.fulfill({ json: { runs: [], versions: [] } })
    if (url === '/api/projects' && request.method() === 'POST') { creations.push(request.postDataJSON()); saved = { ...saved, name: request.postDataJSON().name }; created = true; return route.fulfill({ json: { project: saved } }) }
    if (url === '/api/projects') return route.fulfill({ json: { projects: created ? [saved] : [] } })
    if (url === `${path.replace('/app/', '/api/')}/members`) return route.fulfill({ json: { members: [] } })
    if (url === `/api/projects/${projectId}/references` && request.method() === 'POST') {
      uploads.push(request.postDataJSON())
      return route.fulfill({ json: { reference: { id: randomUUID(), name: request.postDataJSON().name } } })
    }
    if (/\/references\/[^/]+\/image$/.test(url)) return route.fulfill({ contentType: 'image/png', body: image })
    if (url === `/api/projects/${projectId}` && request.method() === 'GET') return route.fulfill({ json: { project: saved } })
    if (url === `/api/projects/${projectId}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as typeof writes[number]
      writes.push(structuredClone(body))
      if (conflict) { conflict = false; saved = { ...saved, revision: saved.revision + 1, notes: 'Cambio de otra sesión' }; return route.fulfill({ status: 409, json: { error: 'Conflict' } }) }
      const parsed = ProjectFoundationsSchema.parse(body.foundations)
      saved = { ...saved, name: body.name, notes: body.notes, foundations: parsed, revision: saved.revision + 1 }
      return route.fulfill({ json: { project: saved } })
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected ${request.method()} ${url}` } })
  })
  return { saved: () => saved, writes, creations, requests, uploads, conflictNext: () => { conflict = true } }
}

async function open(page: Page) {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Las bases de tu proyecto' })).toBeVisible()
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
}

test('creates an empty private project and persists independent floors, plans and building evidence', async ({ page }) => {
  const server = await fixture(page)
  await page.goto('/app')
  await expect(page.getByRole('button', { name: /Crear desde la demo/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Generar con IA/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Nuevo proyecto/ }).first().click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('Casa de Juan')
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  await expect(page).toHaveURL(path)
  await expect(page.getByRole('heading', { name: 'Las bases de tu proyecto' })).toBeVisible()
  expect(server.creations).toEqual([{ name: 'Casa de Juan' }])
  await expect(page.getByLabel('País / territorio', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Variantes del departamento')).toHaveCount(0)
  await expect(page.getByText('Energía solar del edificio', { exact: true })).toHaveCount(0)
  await page.getByLabel('Tipo de vivienda', { exact: true }).selectOption('house')
  await page.getByLabel('Agregar imagen del plano', { exact: true }).setInputFiles({ name: 'planta-baja.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('img', { name: 'planta-baja.png', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Agregar planta', exact: false }).click()
  const upstairs = page.getByTestId('foundation-level').nth(1)
  await upstairs.getByLabel('Nombre de la planta', { exact: true }).fill('Dormitorios')
  await upstairs.getByLabel('Número de planta', { exact: true }).fill('2')
  await upstairs.getByText('Medidas opcionales', { exact: true }).click()
  await upstairs.getByLabel('Elevación de la planta (m)', { exact: true }).fill('5.4')
  await upstairs.getByLabel('Altura del techo (m)', { exact: true }).fill('2.6')
  await upstairs.getByLabel('Notas de la planta', { exact: true }).fill('Escalera y armario fijo')
  await upstairs.getByLabel('Agregar imagen del plano', { exact: true }).setInputFiles({ name: 'dormitorios.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('img', { name: 'dormitorios.png', exact: true })).toBeVisible()
  await page.getByLabel('País / territorio', { exact: true }).selectOption('AR')
  await expect(page.getByRole('link', { name: /ARBA/ })).toBeVisible()
  await page.getByLabel('Provincia / región / municipio', { exact: true }).fill('Córdoba')
  await page.getByLabel('Dirección de la propiedad', { exact: true }).fill('Av. Colón 100, Córdoba')
  await page.getByRole('button', { name: 'Agregar fuente', exact: false }).click()
  await page.getByLabel('Título de la fuente', { exact: true }).fill('Catastro provincial')
  await page.getByLabel('URL de la fuente', { exact: true }).fill('https://example.test/catastro/parcela')
  await page.getByLabel('Tipo de fuente', { exact: true }).selectOption('official')
  await page.getByLabel('Fecha de consulta', { exact: true }).fill('2026-10-07')
  await save(page)
  expect(server.saved().scene).toBeNull()
  expect(server.saved().foundations?.dwelling.levels).toHaveLength(2)
  expect(server.saved().foundations?.dwelling.levels[1]).toMatchObject({ name: 'Dormitorios', levelIndex: 2, elevation: 5.4, ceilingHeight: 2.6, notes: 'Escalera y armario fijo' })
  expect(server.saved().foundations?.building).toMatchObject({ status: 'draft', address: 'Av. Colón 100, Córdoba', countryCode: 'AR', region: 'Córdoba' })
  expect(server.writes[0]).not.toHaveProperty('scene')
  expect(server.uploads.map(upload => upload.name)).toEqual(['planta-baja.png', 'dormitorios.png'])
  expect(server.requests.some(request => request.includes('/api/assets') || request.includes('/project-generations'))).toBe(false)
  await page.reload()
  await expect(page.getByTestId('foundation-level')).toHaveCount(2)
  await expect(page.getByRole('img', { name: 'dormitorios.png', exact: true })).toHaveAttribute('src', new RegExp(`/api/projects/${projectId}/references/[^/]+/image`))
  await expect(page.getByLabel('Nombre de la planta', { exact: true }).nth(1)).toHaveValue('Dormitorios')
  await expect(page.getByLabel('País / territorio', { exact: true })).toHaveValue('AR')
  await expect(page.getByText('2 de 2 plantas con planos', { exact: true })).toBeVisible()
  await expect(page.getByText('Modelado de vivienda y edificio pendiente', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
  await page.screenshot({ path: '/tmp/t3-project-foundations-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-project-foundations-mobile.png', fullPage: true })
  await page.getByLabel('Dirección de la propiedad', { exact: true }).scrollIntoViewIfNeeded()
  const saveBounds = await page.getByRole('button', { name: 'Guardar cambios', exact: true }).boundingBox()
  expect(saveBounds?.y).toBeGreaterThanOrEqual(0)
  expect(saveBounds!.y + saveBounds!.height).toBeLessThan(200)
  await page.screenshot({ path: '/tmp/t3-project-foundations-mobile-scrolled.png' })
})

test('a stale revision locks intake editing until reloading the current project', async ({ page }) => {
  const server = await fixture(page)
  await open(page)
  await page.getByLabel('Dirección de la propiedad', { exact: true }).fill('Mi dirección')
  server.conflictNext()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(/Este proyecto cambió en otra sesión/)
  await expect(page.getByLabel('Dirección de la propiedad', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Agregar planta', exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
  expect(server.writes[0].revision).toBe(1)
  await page.getByRole('button', { name: 'Cargar última versión', exact: true }).click()
  await expect(page.getByLabel('Dirección de la propiedad', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Dirección de la propiedad', { exact: true })).toBeEnabled()
  await expect(page.getByLabel('Notas del proyecto')).toHaveValue('Cambio de otra sesión')
})

test('readers can inspect foundations and plan previews without editing them', async ({ page }) => {
  const foundations = createProjectFoundations()
  foundations.dwelling.levels[0].planReferences = [{ id: randomUUID(), name: 'plano-compartido.png' }]
  await fixture(page, 'viewer', foundations)
  await open(page)
  await expect(page.getByRole('img', { name: 'plano-compartido.png', exact: true })).toBeVisible()
  await expect(page.getByLabel('Nombre de la planta', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('País / territorio', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Dirección de la propiedad', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Agregar planta|Quitar plano/ })).toHaveCount(0)
  await expect(page.getByLabel('Agregar imagen del plano', { exact: true })).toHaveCount(0)
})

test('duplicate floor numbers and invalid links cannot be saved, and removed floors stay removed', async ({ page }) => {
  const server = await fixture(page)
  await open(page)
  await page.getByRole('button', { name: 'Agregar planta', exact: false }).click()
  const floorNumber = page.getByLabel('Número de planta', { exact: true }).nth(1)
  await floorNumber.clear()
  await expect(floorNumber).toHaveValue('')
  await floorNumber.pressSequentially('-1')
  await expect(floorNumber).toHaveValue('-1')
  await floorNumber.fill('0')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(/Cada planta debe tener un número distinto/)
  expect(server.writes).toHaveLength(0)
  await page.getByLabel('Número de planta', { exact: true }).nth(1).fill('1')
  await page.getByRole('button', { name: 'Agregar fuente', exact: false }).click()
  await page.getByLabel('URL de la fuente', { exact: true }).fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  expect(server.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Quitar fuente', exact: true }).click()
  await page.getByRole('button', { name: 'Quitar planta: Planta 1', exact: true }).click()
  await save(page)
  await page.reload()
  await expect(page.getByTestId('foundation-level')).toHaveCount(1)
  expect(server.saved().foundations?.building.sources).toEqual([])
})
