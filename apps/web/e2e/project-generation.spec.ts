import { expect, test, type Page } from '@playwright/test'
import { creditFixture } from './credit-fixture'

test.use({ locale: 'es-AR' })
const user = { id: 'test-user', name: 'Usuario de prueba', email: 'owner@example.test', role: 'user', tier: 'standard', canInvite: false }
const supplied = { name: 'Concepto de prueba', prompt: 'Dos dormitorios, cocina abierta y ventanas amplias hacia el patio.', kind: 'building', width: 12, depth: 10, storeyHeight: 2.8, floors: 3, latitude: -34.6, longitude: -58.4, timeZone: 'America/Argentina/Buenos_Aires' }
async function fill(page: Page) {
  await page.getByLabel('¿Qué querés generar?').selectOption('building')
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill(supplied.name)
  await page.getByLabel('Describí tu proyecto', { exact: true }).fill(supplied.prompt)
  for (const [label, value] of [['Ancho (m)', '12'], ['Profundidad (m)', '10'], ['Altura por planta (m)', '2.8'], ['Cantidad de plantas', '3'], ['Latitud', '-34.6'], ['Longitud', '-58.4'], ['Zona horaria IANA', supplied.timeZone]]) await page.getByLabel(label, { exact: true }).fill(value)
}

test('a dimensioned building confirms server cost, queues once and links to the completed private concept', async ({ page }) => {
  let posts = 0
  let submitted: unknown
  let key: string | undefined
  let completion = false
  let confirmation = ''
  page.on('dialog', dialog => { confirmation = dialog.message(); void dialog.accept() })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance: posts ? 0 : 100, reserved: posts && !completion ? 100 : 0 } })
    if (path === '/api/health') return route.fulfill({ json: { generationEnabled: true, projectGenerationEnabled: true } })
    if (path === '/api/project-generations' && route.request().method() === 'POST') { posts++; submitted = route.request().postDataJSON(); key = route.request().headers()['idempotency-key']; return route.fulfill({ status: 202, json: { job: { id: 'generation-one', status: 'queued', projectId: null, input: supplied, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } }) }
    if (path === '/api/project-generations') return route.fulfill({ json: { jobs: posts ? [{ id: 'generation-one', status: completion ? 'completed' : 'running', projectId: completion ? 'completed-project' : null, input: supplied, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] : [] } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } })
  })
  await page.goto('/app/generate')
  await expect(page.getByText(/Es un concepto aproximado: una planta modelada/)).toBeVisible()
  await expect(page.getByLabel('Latitud', { exact: true })).toHaveValue('')
  await fill(page)
  await expect(page.getByText(/Costo de generación: 100 créditos/)).toBeVisible()
  await page.screenshot({ path: '/tmp/t3-generation-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-generation-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Generar concepto', exact: false }).click()
  await expect(page.getByText(/Generación solicitada/)).toBeVisible()
  expect(confirmation).toContain('100 créditos')
  expect(submitted).toEqual(supplied)
  expect(key).toMatch(/^[\da-f-]{36}$/)
  completion = true
  await expect(page.getByRole('link', { name: 'Abrir proyecto' })).toHaveAttribute('href', '/app/projects/completed-project')
  expect(posts).toBe(1)
})

test('canceling a running generation updates status and restores the displayed balance', async ({ page }) => {
  let canceled = false
  const input = { ...supplied, kind: 'apartment' }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const job = { id: 'generation-one', status: canceled ? 'cancelled' : 'running', projectId: null, input, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance: canceled ? 100 : 50, reserved: canceled ? 0 : 50 } })
    if (path === '/api/health') return route.fulfill({ json: { generationEnabled: true, projectGenerationEnabled: true } })
    if (path === '/api/project-generations/generation-one/cancel') { canceled = true; return route.fulfill({ json: { job: { ...job, status: 'cancelled' } } }) }
    if (path === '/api/project-generations') return route.fulfill({ json: { jobs: [job] } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } })
  })
  await page.goto('/app/generate')
  await expect(page.getByText(/Créditos disponibles: 50/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar generación' }).click()
  await expect(page.getByText(/Departamento · Cancelado/)).toBeVisible()
  await expect(page.getByText(/Créditos disponibles: 100/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancelar generación' })).toHaveCount(0)
})

test('generation remains disabled when the provider is unavailable', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: { generationEnabled: true, projectGenerationEnabled: false } })
    return route.fulfill({ json: { jobs: [] } })
  })
  await page.goto('/app/generate')
  await expect(page.getByRole('button', { name: 'Generar concepto', exact: false })).toBeDisabled()
  await expect(page.getByText(/La generación de conceptos no está disponible/)).toBeVisible()
})

test('a lost response reuses the confirmed idempotency key even after the original credits were reserved', async ({ page }) => {
  const keys: string[] = []
  let confirmations = 0
  page.on('dialog', dialog => { confirmations++; void dialog.accept() })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance: keys.length ? 0 : 100 } })
    if (path === '/api/health') return route.fulfill({ json: { projectGenerationEnabled: true } })
    if (path === '/api/project-generations' && route.request().method() === 'POST') {
      keys.push(route.request().headers()['idempotency-key'])
      if (keys.length === 1) return route.abort('failed')
      return route.fulfill({ json: { job: { id: 'generation-one', status: 'queued', input: supplied, projectId: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } })
    }
    return route.fulfill({ json: { jobs: [] } })
  })
  await page.goto('/app/generate')
  await fill(page)
  await page.getByRole('button', { name: 'Generar concepto', exact: false }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Generar concepto', exact: false }).click()
  await expect(page.getByText(/Generación solicitada/)).toBeVisible()
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  expect(confirmations).toBe(1)
})
