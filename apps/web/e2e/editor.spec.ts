import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { ProjectSnapshotSchema, type ProjectSnapshot } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'

test.use({ locale: 'es-AR' })

const projectId = '8a38d6b3-178b-4b6d-96e5-bb1e249ee672'
const projectPath = `/app/projects/${projectId}`
const bundledScene = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))
const generatedAssetId = '9686f148-5185-4e3d-98a3-780ff3dddc65'
const generatedModelUrl = `/api/projects/${projectId}/assets/${generatedAssetId}/files/model.glb`

async function mockProject(page: Page, role: Project['role'] = 'owner', withPrivateAsset = false) {
  const scene = structuredClone(bundledScene)
  scene.project = { id: projectId, name: 'Prueba de distribuciones' }
  scene.fixtures = [{ ...scene.fixtures[0], position: [2, 0.015, 7] }]
  if (withPrivateAsset) {
    scene.assets.push({ ...scene.assets[0], id: generatedAssetId, label: 'Mueble generado', url: generatedModelUrl, repoPath: `private/${generatedAssetId}/model.glb` })
    scene.fixtures[0] = { ...scene.fixtures[0], assetId: generatedAssetId, label: 'Mueble generado' }
  }
  let saved: Project = {
    id: projectId, name: scene.project.name, notes: '', ownerId: 'test-owner', role,
    revision: 1, createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z', scene,
  }
  const writes: { revision: number; scene: ProjectSnapshot; name: string; notes: string }[] = []
  let conflictNextSave = false
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'test-owner', name: 'Test designer', email: 'designer@example.test', role: 'user' } } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [saved] } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === generatedModelUrl) return route.fulfill({ contentType: 'model/gltf-binary', body: readFileSync(new URL('../public/models/current/fridge-freezer.glb', import.meta.url)) })
    if (path === `/api/projects/${projectId}/members`) return route.fulfill({ json: { members: [] } })
    if (path === `/api/projects/${projectId}` && request.method() === 'GET') return route.fulfill({ json: { project: saved } })
    if (path === `/api/projects/${projectId}` && request.method() === 'PUT') {
      const body = request.postDataJSON() as typeof writes[number]
      writes.push(structuredClone(body))
      if (role === 'viewer') return route.fulfill({ status: 403, json: { error: 'No tenés permiso para modificar este proyecto.' } })
      if (conflictNextSave || body.revision !== saved.revision) {
        conflictNextSave = false
        saved = { ...saved, revision: saved.revision + 1 }
        return route.fulfill({ status: 409, json: { error: 'El proyecto cambió. Recargalo antes de guardar.' } })
      }
      const validated = ProjectSnapshotSchema.parse(body.scene)
      saved = { ...saved, name: body.name, notes: body.notes, scene: validated, revision: saved.revision + 1 }
      return route.fulfill({ json: { project: saved } })
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected test request: ${request.method()} ${path}` } })
  })
  return {
    saved: () => saved,
    writes,
    conflictNextSave: () => { conflictNextSave = true },
  }
}

async function openEditor(page: Page) {
  await page.goto(projectPath)
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
}

async function selectFridge(page: Page) {
  await page.getByRole('combobox', { name: /^Objetos colocados/ }).selectOption('k-fridge')
}

test('a copied layout keeps its own objects and survives project save and reload', async ({ page }) => {
  const server = await mockProject(page)
  await openEditor(page)
  const originalLayout = await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).inputValue()
  await page.getByLabel('Nombre de la copia').fill('Heladera junto a la entrada')
  await page.getByRole('button', { name: 'Duplicar distribución', exact: true }).click()
  const copiedLayout = await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).inputValue()
  expect(copiedLayout).not.toBe(originalLayout)
  await selectFridge(page)
  await page.getByLabel('X (m)', { exact: true }).fill('3')
  await page.getByLabel('X (m)', { exact: true }).blur()
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption(originalLayout)
  await selectFridge(page)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('2')
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption(copiedLayout)
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  expect(server.writes).toHaveLength(1)
  expect(server.writes[0].revision).toBe(1)
  const architecture = server.saved().scene.editor!.architectures[0]
  expect(architecture.layouts.find(layout => layout.id === originalLayout)!.fixtures[0].position[0]).toBe(2)
  expect(architecture.layouts.find(layout => layout.id === copiedLayout)!.fixtures[0].position[0]).toBe(3)
  expect(server.saved().scene.fixtures[0].position[0]).toBe(3)
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Distribuciones', exact: true })).toHaveValue(copiedLayout)
  await selectFridge(page)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
})

test('numeric movement, rotation and object copies use undo and redo', async ({ page }) => {
  const server = await mockProject(page)
  await openEditor(page)
  await selectFridge(page)
  await page.getByLabel('X (m)', { exact: true }).fill('3')
  await page.getByLabel('X (m)', { exact: true }).blur()
  await page.getByRole('button', { name: /Deshacer$/ }).click()
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('2')
  await page.getByRole('button', { name: /Rehacer$/ }).click()
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  await page.getByRole('button', { name: 'Rotar 90°', exact: true }).click()
  await expect(page.getByLabel('Rotación (°)', { exact: true })).toHaveValue('270')
  await page.keyboard.press('Control+z')
  await expect(page.getByLabel('Rotación (°)', { exact: true })).toHaveValue('180')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByLabel('Rotación (°)', { exact: true })).toHaveValue('270')
  await page.getByRole('button', { name: 'Duplicar objeto', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  expect(server.saved().scene.fixtures).toHaveLength(2)
  expect(server.saved().scene.fixtures[0].position[0]).toBe(3)
  expect(Math.abs(server.saved().scene.fixtures[0].rotation - Math.PI * 1.5)).toBeLessThan(1e-8)
  expect(server.saved().scene.fixtures[1].id).not.toBe(server.saved().scene.fixtures[0].id)
})

test('project-scoped generated assets can be placed, moved and saved with their pinned reference', async ({ page }) => {
  const server = await mockProject(page, 'owner', true)
  await openEditor(page)
  await selectFridge(page)
  await page.getByLabel('X (m)', { exact: true }).fill('3')
  await page.getByLabel('X (m)', { exact: true }).blur()
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  await page.getByRole('combobox', { name: 'Objeto para colocar', exact: true }).selectOption(generatedAssetId)
  await page.getByRole('combobox', { name: 'Colocar en ambiente', exact: true }).selectOption('kitchen')
  await page.getByRole('button', { name: /Colocar objeto$/ }).click()
  await expect(page.getByRole('combobox', { name: 'Objetos colocados (2)', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  expect(server.saved().scene.fixtures).toHaveLength(2)
  expect(server.saved().scene.fixtures.every(fixture => fixture.assetId === generatedAssetId)).toBe(true)
  expect(server.saved().scene.assets.find(asset => asset.id === generatedAssetId)).toMatchObject({
    url: generatedModelUrl, repoPath: `private/${generatedAssetId}/model.glb`,
  })
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Objetos colocados (2)', exact: true })).toBeVisible()
  await selectFridge(page)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
})

test('a proposed divider belongs to its copied variant and all that variant’s layouts', async ({ page }) => {
  const server = await mockProject(page)
  await openEditor(page)
  const originalVariant = await page.getByLabel('Variantes del departamento').inputValue()
  const originalWallCount = server.saved().scene.apartment.walls.length
  await page.getByLabel('Nombre de la copia').fill('Dormitorio con cambiador')
  await page.getByRole('button', { name: 'Duplicar variante', exact: true }).click()
  const copiedVariant = await page.getByLabel('Variantes del departamento').inputValue()
  expect(copiedVariant).not.toBe(originalVariant)
  await page.locator('summary').filter({ hasText: 'Probar un divisor' }).click()
  await page.getByLabel('Inicio X (m)', { exact: true }).fill('2')
  await page.getByLabel('Inicio Z (m)', { exact: true }).fill('5')
  await page.getByLabel('Fin X (m)', { exact: true }).fill('4')
  await page.getByLabel('Fin Z (m)', { exact: true }).fill('5')
  await page.getByRole('button', { name: /Añadir divisor$/ }).click()
  await expect(page.getByRole('button', { name: 'Quitar divisor 1', exact: true })).toBeVisible()
  await page.getByLabel('Nombre de la copia').fill('Tres muebles')
  await page.getByRole('button', { name: 'Duplicar distribución', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Quitar divisor 1', exact: true })).toBeVisible()
  await page.getByLabel('Variantes del departamento').selectOption(originalVariant)
  await expect(page.getByRole('button', { name: 'Quitar divisor 1', exact: true })).toHaveCount(0)
  await page.getByLabel('Variantes del departamento').selectOption(copiedVariant)
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  const architectures = server.saved().scene.editor!.architectures
  expect(architectures.find(item => item.id === originalVariant)!.apartment.walls).toHaveLength(originalWallCount)
  const variant = architectures.find(item => item.id === copiedVariant)!
  expect(variant.apartment.walls).toHaveLength(originalWallCount + 1)
  expect(variant.partitionWallIds).toHaveLength(1)
  expect(variant.layouts).toHaveLength(2)
  expect(server.saved().scene.geometry.walls).toHaveLength(originalWallCount + 1)
})

test('a project conflict preserves the draft until the user reloads the saved scene', async ({ page }) => {
  const server = await mockProject(page)
  await openEditor(page)
  await selectFridge(page)
  await page.getByLabel('X (m)', { exact: true }).fill('3')
  await page.getByLabel('X (m)', { exact: true }).blur()
  server.conflictNextSave()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Este proyecto cambió en otra sesión.')
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
  expect(server.saved().scene.fixtures[0].position[0]).toBe(2)
  await page.getByRole('button', { name: 'Cargar última versión', exact: true }).click()
  await selectFridge(page)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('2')
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
  expect(server.writes).toHaveLength(1)
})

test('viewers can inspect objects but cannot edit or submit the project', async ({ page }) => {
  const server = await mockProject(page, 'viewer')
  const scene = server.saved().scene
  const alternateFixtures = structuredClone(scene.fixtures)
  alternateFixtures[0].position[0] = 3
  scene.editor = {
    schemaVersion: 1, activeArchitectureId: 'architecture-original',
    architectures: [{
      id: 'architecture-original', name: 'Original', apartment: scene.apartment,
      partitionWallIds: [], activeLayoutId: 'layout-original',
      layouts: [
        { id: 'layout-original', name: 'Original', fixtures: scene.fixtures },
        { id: 'layout-alternate', name: 'Alternativa', fixtures: alternateFixtures },
      ],
    }],
  }
  await openEditor(page)
  await selectFridge(page)
  await expect(page.getByLabel('X (m)', { exact: true })).toBeDisabled()
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption('layout-alternate')
  await selectFridge(page)
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  expect(server.saved().scene.fixtures[0].position[0]).toBe(2)
  expect(server.saved().scene.editor!.architectures[0].activeLayoutId).toBe('layout-original')
  for (const name of ['Duplicar variante', 'Duplicar distribución']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  for (const name of ['Rotar 90°', 'Duplicar objeto', 'Quitar objeto']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await page.locator('summary').filter({ hasText: 'Probar un divisor' }).click()
  await expect(page.getByRole('button', { name: /Añadir divisor$/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0)
  expect(server.writes).toHaveLength(0)
})

async function openCustomizationSection(page: Page, title: string) {
  const summary = page.locator('summary').filter({ hasText: title })
  const isOpen = await summary.evaluate(element => element.parentElement?.hasAttribute('open'))
  if (!isOpen) await summary.click()
}

test('finishes, openings and light sources travel with layouts and survive save/reload', async ({ page }) => {
  const server = await mockProject(page)
  await openEditor(page)
  const original = await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).inputValue()
  await page.getByLabel('Nombre de la copia').fill('Luz cálida y cortinas')
  await page.getByRole('button', { name: 'Duplicar distribución', exact: true }).click()
  const alternative = await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).inputValue()
  await openCustomizationSection(page, 'Paredes y pisos')
  await page.getByRole('button', { name: 'Color de pared: Salvia', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Terminación del piso', exact: true }).selectOption('concrete')
  await openCustomizationSection(page, 'Puertas y ventanas')
  await page.getByRole('combobox', { name: 'Tipo de puerta', exact: true }).selectOption('glazed')
  await page.getByRole('combobox', { name: 'Cortina o persiana', exact: true }).selectOption('curtain')
  await page.getByLabel('Cierre de cortina o persiana').focus()
  await page.keyboard.press('End')
  await openCustomizationSection(page, 'Iluminación')
  await page.getByLabel('Luz natural', { exact: true }).uncheck()
  await page.getByRole('button', { name: /Añadir punto de luz$/ }).click()
  await page.getByRole('button', { name: /^Blanca neutra/ }).click()
  await selectFridge(page)
  await page.getByLabel('Este objeto emite luz', { exact: true }).check()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  const saved = server.saved().scene
  expect(saved.customization!.lighting.naturalEnabled).toBe(false)
  expect(saved.customization!.lighting.lights[0].kelvin).toBe(4000)
  expect(Object.values(saved.customization!.doors)[0].style).toBe('glazed')
  expect(Object.values(saved.customization!.windows)[0]).toMatchObject({ covering: 'curtain', closure: 1 })
  expect(saved.fixtures[0].light?.kelvin).toBe(2700)
  expect(Object.values(saved.customization!.floors).every(floor => floor.material === 'concrete')).toBe(true)
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption(original)
  await expect(page.getByLabel('Luz natural', { exact: true })).toBeChecked()
  await expect(page.getByRole('combobox', { name: 'Punto de luz a editar', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption(alternative)
  await expect(page.getByLabel('Luz natural', { exact: true })).not.toBeChecked()
  await page.reload()
  await openCustomizationSection(page, 'Iluminación')
  await expect(page.getByLabel('Luz natural', { exact: true })).not.toBeChecked()
  await selectFridge(page)
  await expect(page.getByLabel('Este objeto emite luz', { exact: true })).toBeChecked()
})

test('solar editing preserves explicit time choices, supports undo, and remains read-only for viewers', async ({ page }) => {
  const server = await mockProject(page)
  await openEditor(page)
  await openCustomizationSection(page, 'Luz natural · fecha y hora')
  await page.getByLabel('Fecha del estudio', { exact: true }).fill('2026-10-25')
  await page.getByLabel('Hora del edificio', { exact: true }).fill('02:30')
  await page.getByRole('button', { name: 'Aplicar fecha y hora', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Revisá la fecha y la hora')
  await page.getByRole('combobox', { name: 'Hora repetida por cambio de horario', exact: true }).selectOption('later')
  await page.getByRole('button', { name: 'Aplicar fecha y hora', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: /Deshacer/ }).click()
  await expect(page.getByLabel('Fecha del estudio', { exact: true })).toHaveValue(bundledScene.solar.date)
  await page.getByRole('button', { name: /Rehacer/ }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  expect(server.saved().scene.solar.selected.utc).toBe('2026-10-25T01:30:00.000Z')
  server.saved().role = 'viewer'
  await page.reload()
  await openCustomizationSection(page, 'Iluminación')
  await expect(page.getByLabel('Luz natural', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Añadir punto de luz$/ })).toBeDisabled()
  await openCustomizationSection(page, 'Luz natural · fecha y hora')
  await expect(page.getByRole('button', { name: 'Aplicar fecha y hora', exact: true })).toBeDisabled()
  expect(server.writes).toHaveLength(1)
})
