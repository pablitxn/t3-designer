import { expect, test } from '@playwright/test'
import { creditFixture } from './credit-fixture'
import type { Asset, CreateJobInput, Job, JobEvent } from '@t3-designer/asset-schema'

test.use({ locale: 'es-AR' })
test.beforeEach(({ page }) => { page.on('dialog', dialog => dialog.accept()) })
const account = { id: 'test-user', name: 'Usuario de prueba', email: 'owner@example.test', role: 'user' }

const productUrl = 'https://www.ikea.com/es/es/p/strandmon-sillon-20343224/'
const health = { status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true }, activeJobId: null }
const emptyImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23dddddd"/%3E%3C/svg%3E'
const sampleJob = (overrides: Partial<Job> = {}): Job => ({ id: 'job-live', status: 'analyzing', input: { url: productUrl, notes: '' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stage: 'Leyendo las medidas del producto.', questions: [], error: null, assetId: null, warnings: [], ...overrides })
const sampleEvent = (overrides: Partial<JobEvent> = {}): JobEvent => ({ seq: 1, jobId: 'job-live', attempt: 1, at: new Date().toISOString(), kind: 'queued', message: 'Pedido recibido en el taller.', ...overrides })

test('the public asset gallery shows real saved examples without private APIs and preserves navigation', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/api/**', route => { requests.push(route.request().url()); return route.fulfill({ status: 401, json: { error: 'Unauthorized' } }) })
  await page.goto('/#assets')
  await expect(page.getByRole('heading', { name: 'Objetos con historia.' })).toBeVisible()
  await expect(page.getByRole('link', { name: '+ Crear un objeto' })).toHaveAttribute('href', '/app/assets')
  await expect(page.getByRole('link', { name: 'Iniciar sesión para crear' })).toHaveAttribute('href', '/app/assets')
  await expect(page.getByRole('button', { name: 'Revisar STRANDMON' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revisar DYVLINGE' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revisar FÅGELFJÄLLET' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear objeto 3D' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Revisar DYVLINGE' }).click()
  const detail = page.getByRole('region', { name: 'Objeto seleccionado' })
  await expect(detail.getByText('Necesita otra corrección', { exact: true })).toBeVisible()
  await expect(detail.getByRole('img')).toHaveAttribute('src', '/demo-assets/dyvlinge-v2/preview.png')
  await page.getByLabel('Historial de versiones').selectOption('dyvlinge-v1')
  await expect(detail.getByRole('img')).toHaveAttribute('src', '/demo-assets/dyvlinge-v1/preview.png')
  await expect(detail.getByText('Necesita otra corrección', { exact: true })).toHaveCount(0)
  await detail.getByRole('button', { name: 'Frente', exact: true }).click()
  await expect(detail.getByRole('img')).toHaveAttribute('src', '/demo-assets/dyvlinge-v1/front.png')
  await expect(detail.getByRole('img')).toHaveJSProperty('naturalWidth', 512)
  await detail.getByRole('button', { name: 'Explorar en 3D', exact: true }).click()
  await expect(detail.getByText(/La vista 3D necesita WebGL 2/)).toBeVisible()
  await page.getByRole('button', { name: 'Revisar FÅGELFJÄLLET' }).click()
  await expect(detail.getByText('152 × 101 × 207 cm', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Historial de versiones').locator('option')).toHaveCount(1)
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'Documentación', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
})

test('creates a dimensioned asset, answers missing information and reviews its local files', async ({ page }) => {
  let jobs: Job[] = []
  let assets: Asset[] = []
  let submitted: CreateJobInput | undefined
  let answered: unknown
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (path === '/api/jobs' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON() as CreateJobInput
      const job: Job = { id: 'job-one', status: 'needs_input', input: submitted, createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:00:00Z', stage: 'Confirmá la variante del producto.', questions: ['¿Qué color querés usar?'], error: null, assetId: null, warnings: [] }
      jobs = [job]
      return route.fulfill({ status: 202, json: { job } })
    }
    if (path === '/api/jobs/job-one/answers') {
      answered = route.request().postDataJSON()
      jobs = [{ ...jobs[0], status: 'completed', assetId: 'asset-one', questions: [], stage: 'Objeto guardado.' }]
      assets = [{ id: 'asset-one', jobId: 'job-one', label: 'STRANDMON gris oscuro', kind: 'wingback-chair', dimensions: [.82, 1.01, .96], createdAt: '2026-10-03T10:01:00Z', source: { url: productUrl, description: 'Sillón orejero de tela gris.', dimensionalStatus: 'user-supplied' }, fidelityStatus: 'draft', files: { model: '/api/assets/asset-one/files/model.glb', preview: emptyImage, blend: '/api/assets/asset-one/files/source.blend', manifest: '/api/assets/asset-one/files/manifest.json', request: '/api/assets/asset-one/files/request.json' }, warnings: ['Revisar las costuras.'] }]
      return route.fulfill({ json: { job: jobs[0] } })
    }
    return route.fulfill({ json: { jobs } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Taller conectado', { exact: true })).toBeVisible()
  await page.getByLabel('Enlace del producto').fill(productUrl)
  await page.getByLabel('Detalles y preferencias').fill('Tela gris y patas negras')
  await page.locator('#create-width').fill('82')
  await page.locator('#create-height').fill('101')
  await page.locator('#create-depth').fill('96')
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect(page.getByText('¿Qué color querés usar?', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Enlace del producto')).toHaveValue('')
  await expect(page.getByLabel('Detalles y preferencias')).toHaveValue('')
  await expect(page.locator('#create-width')).toHaveValue('')
  await expect(page.locator('#create-height')).toHaveValue('')
  await expect(page.locator('#create-depth')).toHaveValue('')
  expect(submitted).toEqual({ url: productUrl, notes: 'Tela gris y patas negras', dimensions: [.82, 1.01, .96] })
  await page.getByLabel('Tu respuesta').fill('Gris oscuro Nordvalla')
  await page.getByRole('button', { name: 'Continuar generación' }).click()
  await expect(page.getByRole('heading', { name: 'STRANDMON gris oscuro' })).toBeVisible()
  expect(answered).toEqual({ notes: 'Gris oscuro Nordvalla' })
  await expect(page.getByRole('link', { name: 'Modelo GLB' })).toHaveAttribute('href', '/api/assets/asset-one/files/model.glb')
  await expect(page.getByRole('link', { name: 'Fuente Blender' })).toHaveAttribute('href', '/api/assets/asset-one/files/source.blend')
  await expect(page.getByRole('region', { name: 'Objeto seleccionado' }).getByText('82,0 × 101,0 × 96,0')).toBeVisible()
  await page.getByRole('button', { name: 'Explorar en 3D' }).click()
  await expect(page.getByText(/La vista 3D necesita WebGL 2/)).toBeVisible()
})

test('job cancellation and retry update the persisted activity view', async ({ page }) => {
  let job: Job = { id: 'job-cancel', status: 'analyzing', input: { url: productUrl, notes: '' }, createdAt: '2026-10-03T10:00:00Z', updatedAt: '2026-10-03T10:00:00Z', stage: 'Analizando las medidas.', questions: [], error: null, assetId: null, warnings: [] }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (path.endsWith('/cancel')) { job = { ...job, status: 'cancelled' }; return route.fulfill({ json: { job } }) }
    if (path.endsWith('/retry')) { job = { ...job, status: 'queued' }; return route.fulfill({ json: { job } }) }
    return route.fulfill({ json: { jobs: [job] } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Analizando las medidas.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByText('En cola', { exact: true })).toBeVisible()
})

test('a rejected request preserves the draft and lets the user correct it', async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (route.request().method() === 'POST') return route.fulfill({ status: 400, json: { error: 'No se pudo aceptar este producto.' } })
    return route.fulfill({ json: { jobs: [] } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Taller conectado', { exact: true })).toBeVisible()
  await page.getByLabel('Enlace del producto').fill(productUrl)
  await page.getByLabel('Detalles y preferencias').fill('Mantener la tela gris')
  await page.locator('#create-width').fill('82')
  await page.locator('#create-height').fill('101')
  await page.locator('#create-depth').fill('96')
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect(page.getByRole('alert')).toHaveText('No se pudo aceptar este producto.')
  await expect(page.getByLabel('Enlace del producto')).toHaveValue(productUrl)
  await expect(page.getByLabel('Detalles y preferencias')).toHaveValue('Mantener la tela gris')
  await expect(page.locator('#create-height')).toHaveValue('101')
  await expect(page.getByRole('button', { name: 'Crear objeto 3D' })).toBeEnabled()
})

test('late create responses preserve edits for the next object and block duplicate submits', async ({ page }) => {
  let posts = 0
  let jobs: Job[] = []
  let finishRequest: (() => void) | undefined
  const pendingRequest = new Promise<void>(resolve => { finishRequest = resolve })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (route.request().method() === 'POST') {
      posts += 1
      await pendingRequest
      jobs = [sampleJob()]
      return route.fulfill({ status: 202, json: { job: jobs[0] } })
    }
    return route.fulfill({ json: { jobs } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Taller conectado', { exact: true })).toBeVisible()
  await page.getByLabel('Enlace del producto').fill(productUrl)
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect.poll(() => posts).toBe(1)
  await page.locator('.workshop-create').dispatchEvent('submit')
  await page.getByLabel('Enlace del producto').fill('https://www.ikea.com/es/es/p/next-product/')
  await page.getByLabel('Detalles y preferencias').fill('Este es mi próximo objeto')
  finishRequest?.()
  await expect(page.getByText('Solicitud recibida. Seguí la generación en el panel de actividad.')).toBeVisible()
  await expect(page.getByLabel('Enlace del producto')).toHaveValue('https://www.ikea.com/es/es/p/next-product/')
  await expect(page.getByLabel('Detalles y preferencias')).toHaveValue('Este es mi próximo objeto')
  expect(posts).toBe(1)
  await page.getByRole('button', { name: '+ Nuevo objeto' }).click()
  await expect(page.getByLabel('Enlace del producto')).toBeFocused()
})

test('streams timestamped activity and source links, deduplicates replay and selects historical jobs', async ({ page }) => {
  const historyJob = sampleJob({ id: 'job-old', status: 'completed', createdAt: '2026-10-02T10:00:00Z', updatedAt: '2026-10-02T10:01:00Z' })
  const initial = sampleEvent()
  const search = sampleEvent({ seq: 2, kind: 'search', message: 'Buscando fotos del sillón.', detail: 'Consulta: STRANDMON gris oscuro dimensiones' })
  const source = sampleEvent({ seq: 3, kind: 'source', message: 'Ficha del fabricante consultada.', url: productUrl })
  const streamed = [initial, search, source, source]
  let requestedAfter = ''
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/me') return route.fulfill({ json: { user: account } })
    if (url.pathname === '/api/credits') return route.fulfill({ json: creditFixture })
    if (url.pathname === '/api/health') return route.fulfill({ json: health })
    if (url.pathname === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (url.pathname === '/api/jobs') return route.fulfill({ json: { jobs: [sampleJob(), historyJob] } })
    if (url.pathname === '/api/jobs/job-old/events') return route.fulfill({ json: { events: [] } })
    if (url.pathname.endsWith('/events/stream')) {
      requestedAfter = url.searchParams.get('after') ?? ''
      return route.fulfill({ contentType: 'text/event-stream', body: streamed.map(event => `id: ${event.seq}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`).join('') })
    }
    return route.fulfill({ json: { events: url.searchParams.get('after') === '0' ? [initial] : streamed.filter(event => event.seq > Number(url.searchParams.get('after'))) } })
  })
  await page.goto('/app/assets')
  const activity = page.getByRole('region', { name: 'Generación en vivo' })
  await expect(activity.getByText('Ficha del fabricante consultada.', { exact: true })).toHaveCount(1)
  expect(requestedAfter).toBe('1')
  await expect(activity.getByRole('link', { name: 'www.ikea.com ↗', exact: true })).toHaveAttribute('href', productUrl)
  await activity.getByText('Ver detalles', { exact: true }).click()
  await expect(activity.getByText('Consulta: STRANDMON gris oscuro dimensiones')).toBeVisible()
  await expect(activity.locator('.workshop-event time')).toHaveCount(3)
  await page.getByLabel('Creación seleccionada').selectOption('job-old')
  await expect(activity.getByText('Esta creación es anterior al registro de actividad. Su historial detallado no está disponible.')).toBeVisible()
  await expect(activity.getByText('Ficha del fabricante consultada.')).toHaveCount(0)
})

test('fallback polling recovers an unavailable activity feed without losing recorded events', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'EventSource', { value: undefined }))
  let available = false
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs: [sampleJob()] } })
    if (!available) return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    return route.fulfill({ json: { events: [sampleEvent({ kind: 'render', message: 'Render recuperado después de reconectar.' })] } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Sin conexión con la actividad. Reintentando…')).toBeVisible()
  available = true
  await expect(page.getByText('Render recuperado después de reconectar.')).toBeVisible()
  await expect(page.getByText('Actualizando periódicamente', { exact: true })).toBeVisible()
})

test('switching history discards delayed events from the previous creation on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let releaseEvents: (() => void) | undefined
  const pendingEvents = new Promise<void>(resolve => { releaseEvents = resolve })
  const oldJob = sampleJob({ id: 'job-old', status: 'completed' })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs: [sampleJob(), oldJob] } })
    if (path === '/api/jobs/job-live/events') {
      await pendingEvents
      return route.fulfill({ json: { events: [sampleEvent({ message: 'Respuesta tardía del trabajo anterior.' })] } })
    }
    return route.fulfill({ json: { events: [sampleEvent({ jobId: 'job-old', kind: 'complete', message: 'Este es el historial que elegiste.' })] } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Cargando la actividad…')).toBeVisible()
  await page.getByLabel('Creación seleccionada').selectOption('job-old')
  await expect(page.getByText('Este es el historial que elegiste.')).toBeVisible()
  releaseEvents?.()
  await expect(page.getByText('Respuesta tardía del trabajo anterior.')).toHaveCount(0)
  await expect(page.locator('.workshop-activity')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
