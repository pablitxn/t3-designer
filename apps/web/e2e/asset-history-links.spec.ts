import { expect, test, type Page } from '@playwright/test'
import type { Asset, Job } from '@t3-designer/asset-schema'
import { creditFixture } from './credit-fixture'

test.use({ locale: 'es-AR' })
const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E'
const asset = (index: number): Asset => ({
  id: `asset-${index}`, jobId: `job-${index}`, label: index === 200 ? 'Objeto histórico exacto' : `Objeto reciente ${index}`,
  kind: 'procedural', dimensions: [1, 1, 1], createdAt: '2026-10-08T10:00:00Z',
  source: { url: `https://example.test/product-${index}`, description: 'Referencia controlada.', dimensionalStatus: 'user-supplied' },
  fidelityStatus: 'draft', warnings: [], files: { model: `/api/assets/asset-${index}/files/model.glb`, preview: image, blend: '#blend', manifest: '#manifest', request: '#request' },
})
const job = (value: Asset): Job => ({ id: value.jobId, status: 'completed', input: { url: value.source.url!, notes: '' }, createdAt: value.createdAt, updatedAt: value.createdAt, stage: 'Objeto guardado.', questions: [], error: null, assetId: value.id, warnings: [] })
const historical = asset(200)
const path = `/app/assets?jobId=${historical.jobId}&assetId=${historical.id}`

async function fixture(page: Page, options: { status?: number; response?: Promise<void> } = {}) {
  const assets = Array.from({ length: 200 }, (_, index) => asset(index))
  const requests: string[] = []
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    requests.push(`${request.method()} ${path}`)
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'owner', name: 'Owner', email: 'owner@example.test', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: { status: 'ok', generationEnabled: false, codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true }, activeJobId: null } })
    if (path === '/api/assets') return route.fulfill({ json: { assets } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs: assets.map(job) } })
    if (path === `/api/jobs/${historical.jobId}` || path === `/api/assets/${historical.id}`) {
      if (options.response) await options.response
      return route.fulfill(options.status ? { status: options.status, json: { error: 'Unavailable' } } : { json: path.startsWith('/api/jobs/') ? { job: job(historical) } : { asset: historical } })
    }
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } })
  })
  return requests
}

test('historical job and asset links load the exact items beyond the latest 200', async ({ page }) => {
  const requests = await fixture(page)
  await page.goto(path)
  await expect(page.getByLabel('Creación seleccionada')).toHaveValue(historical.jobId)
  const detail = page.getByRole('region', { name: 'Objeto seleccionado', exact: true })
  await expect(detail.getByRole('heading', { name: historical.label, exact: true })).toBeVisible()
  await expect(detail.getByRole('link', { name: 'Modelo GLB', exact: false })).toHaveAttribute('href', historical.files.model)
  expect(requests).toContain(`GET /api/jobs/${historical.jobId}`)
  expect(requests).toContain(`GET /api/assets/${historical.id}`)
  expect(requests.every(request => request.startsWith('GET '))).toBe(true)
})

for (const status of [403, 404]) test(`historical ${status} responses never select a different recent item`, async ({ page }) => {
  await fixture(page, { status })
  await page.goto(path)
  await expect(page.getByText('El trabajo solicitado no existe o no tenés acceso.', { exact: true })).toBeVisible()
  await expect(page.getByText('El objeto solicitado no existe o no tenés acceso.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Creación seleccionada')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Objeto seleccionado', exact: true })).toHaveCount(0)
})

test('late historical responses cannot replace a newer explicit selection', async ({ page }) => {
  let release!: () => void
  const response = new Promise<void>(resolve => { release = resolve })
  const requests = await fixture(page, { response })
  await page.goto(path)
  await expect.poll(() => requests.includes(`GET /api/jobs/${historical.jobId}`) && requests.includes(`GET /api/assets/${historical.id}`)).toBe(true)
  const activity = page.getByRole('region', { name: 'Generación en vivo', exact: true })
  await activity.getByRole('button', { name: 'Mostrar los más recientes', exact: true }).click()
  await page.getByRole('button', { name: 'Revisar Objeto reciente 1', exact: true }).click()
  release()
  await expect(page.getByLabel('Creación seleccionada')).toHaveValue('job-0')
  await expect(page.getByRole('region', { name: 'Objeto seleccionado', exact: true }).getByRole('heading', { name: 'Objeto reciente 1', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: historical.label, exact: true })).toHaveCount(0)
})
