import { expect, test } from '@playwright/test'
import { creditFixture } from './credit-fixture'
import type { AnswersInput, Asset, CreateJobInput, Job, RevisionInput } from '@t3-designer/asset-schema'

test.use({ locale: 'es-AR' })
test.beforeEach(({ page }) => { page.on('dialog', dialog => dialog.accept()) })
const account = { id: 'test-user', name: 'Usuario de prueba', email: 'owner@example.test', role: 'user' }
const productUrl = 'https://www.ikea.com/es/es/p/dyvlinge-sillon-giratorio-verde-90570836/'
const health = { status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' }, blender: { available: true }, activeJobId: null }
const photoId = '88d32532-670b-4f6c-8a85-e120b393c67f'
const photo = { name: 'dyvlinge-front.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64') }
const image = `data:image/png;base64,${photo.buffer.toString('base64')}`
const reference = { id: photoId, name: photo.name, url: image }
const original: Asset = { id: 'asset-original', jobId: 'job-original', label: 'DYVLINGE verde', kind: 'procedural', dimensions: [.63, .79, .75], createdAt: '2026-10-03T10:00:00Z', source: { url: productUrl, description: 'Sillón giratorio verde.', dimensionalStatus: 'manufacturer-specified' }, fidelityStatus: 'draft', files: { model: '/api/assets/asset-original/files/model.glb', preview: image, blend: '/api/assets/asset-original/files/source.blend', manifest: '/api/assets/asset-original/files/manifest.json', request: '/api/assets/asset-original/files/request.json' }, warnings: [], revision: 1, referenceImages: [reference], visualReview: { verdict: 'revise', summary: 'El respaldo se ve demasiado recto.', issues: ['Falta curvatura en el respaldo.'], iterations: 1 } }
const job = (overrides: Partial<Job> = {}): Job => ({ id: 'job-original', status: 'completed', input: { url: productUrl, notes: '', referenceImageIds: [photoId] }, createdAt: original.createdAt, updatedAt: original.createdAt, stage: 'Objeto guardado.', questions: [], error: null, assetId: original.id, warnings: [], ...overrides })

test('uploads reference photos for creation, validates files and clears only accepted attachments', async ({ page }) => {
  let uploadCount = 0
  let uploaded: { name: string; dataUrl: string } | undefined
  let submitted: CreateJobInput | undefined
  let jobs: Job[] = []
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === '/api/references') { uploadCount += 1; uploaded = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { reference } }) }
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (path === '/api/jobs' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON() as CreateJobInput
      jobs = [job({ input: submitted, status: 'queued', assetId: null })]
      return route.fulfill({ status: 202, json: { job: jobs[0] } })
    }
    return route.fulfill({ json: { jobs } })
  })
  await page.goto('/app/assets')
  await expect(page.getByText('Taller conectado', { exact: true })).toBeVisible()
  await page.locator('#create-photos').setInputFiles({ name: 'unsupported.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByRole('alert')).toHaveText('Elegí fotos PNG, JPEG o WebP de hasta 5 MB cada una.')
  expect(uploadCount).toBe(0)
  await page.locator('#create-photos').setInputFiles([photo, photo, photo, photo, photo])
  await expect(page.getByRole('alert')).toHaveText('Podés adjuntar hasta 4 fotos por solicitud.')
  expect(uploadCount).toBe(0)
  await page.locator('#create-photos').setInputFiles(photo)
  await expect(page.getByRole('button', { name: `Quitar ${photo.name}` })).toBeVisible()
  expect(uploaded).toEqual({ name: photo.name, dataUrl: image })
  await page.getByLabel('Enlace del producto').fill(productUrl)
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect(page.getByText('Solicitud recibida. Seguí la generación en el panel de actividad.')).toBeVisible()
  expect(submitted?.referenceImageIds).toEqual([photoId])
  await expect(page.locator('.workshop-create .workshop-reference-thumbnails')).toHaveCount(0)
})

test('corrects a model using a photo, compares the review and keeps both versions in one library entry', async ({ page }) => {
  let assets = [original]
  let jobs = [job()]
  let submitted: RevisionInput | undefined
  const improved: Asset = { ...original, id: 'asset-improved', jobId: 'job-revision', parentAssetId: original.id, revision: 2, createdAt: '2026-10-03T11:00:00Z', files: { ...original.files, model: '/api/assets/asset-improved/files/model.glb' }, visualReview: { verdict: 'revise', summary: 'El respaldo mejoró, pero la textura necesita ajuste.', issues: ['Revisar las costuras laterales.'], iterations: 2 } }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path === '/api/references') return route.fulfill({ status: 201, json: { reference } })
    if (path === `/api/references/${photoId}`) return route.fulfill({ json: { reference } })
    if (path === '/api/assets/asset-original/revisions') {
      submitted = route.request().postDataJSON() as RevisionInput
      jobs = [job({ id: 'job-revision', parentAssetId: original.id, assetId: improved.id }), ...jobs]
      assets = [improved, original]
      return route.fulfill({ status: 202, json: { job: jobs[0] } })
    }
    return route.fulfill({ status: 404, json: { error: 'Unknown test route' } })
  })
  await page.goto('/app/assets')
  const detail = page.getByRole('region', { name: 'Objeto seleccionado' })
  await expect(detail.getByRole('region', { name: 'Referencia y resultado' }).getByRole('img', { name: photo.name })).toBeVisible()
  await expect(detail.getByText('Falta curvatura en el respaldo.')).toBeVisible()
  await detail.getByLabel('¿Qué hay que corregir?').fill('Redondeá el respaldo y bajá el asiento.')
  await page.locator('#revision-photos-asset-original').setInputFiles(photo)
  await expect(detail.getByRole('button', { name: `Quitar ${photo.name}` })).toBeVisible()
  await detail.getByRole('button', { name: 'Crear versión mejorada' }).click()
  await expect(page.getByText('Corrección recibida. Podés seguir la nueva versión en el panel de actividad.')).toBeVisible()
  expect(submitted).toEqual({ feedback: 'Redondeá el respaldo y bajá el asiento.', referenceImageIds: [photoId] })
  await expect(page.locator('.workshop-card')).toHaveCount(1)
  await expect(page.getByText('2 versiones', { exact: true })).toBeVisible()
  await expect(detail.getByLabel('Historial de versiones')).toHaveValue(improved.id)
  await expect(detail.getByText('Revisar las costuras laterales.')).toBeVisible()
  await expect(detail.getByText('2 iteraciones registradas', { exact: true })).toBeVisible()
  await detail.getByLabel('Historial de versiones').selectOption(original.id)
  await expect(detail.getByRole('link', { name: 'Modelo GLB' })).toHaveAttribute('href', original.files.model)
  await expect(detail.getByLabel('¿Qué hay que corregir?')).toHaveValue('')
  await expect(detail.getByText('Falta curvatura en el respaldo.')).toBeVisible()
})

test('failed corrections preserve feedback and photos across object selection', async ({ page }) => {
  const other: Asset = { ...original, id: 'other-object', jobId: 'job-other', label: 'Mesa de prueba' }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [original, other] } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs: [job()] } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path === '/api/references') return route.fulfill({ status: 201, json: { reference } })
    if (path.endsWith('/revisions')) return route.fulfill({ status: 409, json: { error: 'Ya hay una corrección en curso.' } })
    return route.fulfill({ status: 404, json: { error: 'Unknown test route' } })
  })
  await page.goto('/app/assets')
  await page.getByLabel('¿Qué hay que corregir?').fill('Conservar el terciopelo verde.')
  await page.locator('#revision-photos-asset-original').setInputFiles(photo)
  await expect(page.getByRole('button', { name: `Quitar ${photo.name}` })).toBeVisible()
  await page.getByRole('button', { name: 'Crear versión mejorada' }).click()
  await expect(page.getByRole('alert')).toHaveText('Ya hay una corrección en curso.')
  await page.getByRole('button', { name: 'Revisar Mesa de prueba', exact: true }).click()
  await expect(page.getByLabel('¿Qué hay que corregir?')).toHaveValue('')
  await page.getByRole('button', { name: 'Revisar DYVLINGE verde', exact: true }).click()
  await expect(page.getByLabel('¿Qué hay que corregir?')).toHaveValue('Conservar el terciopelo verde.')
  await expect(page.getByRole('button', { name: `Quitar ${photo.name}` })).toBeVisible()
})

test('photo upload completion retains feedback edited while the upload was in flight', async ({ page }) => {
  let finishUpload: (() => void) | undefined
  const pendingUpload = new Promise<void>(resolve => { finishUpload = resolve })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [original] } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs: [job()] } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path === '/api/references') { await pendingUpload; return route.fulfill({ status: 201, json: { reference } }) }
    return route.fulfill({ status: 404, json: { error: 'Unknown test route' } })
  })
  await page.goto('/app/assets')
  await page.locator('#revision-photos-asset-original').setInputFiles(photo)
  await expect(page.getByText('Subiendo fotos…')).toBeVisible()
  await page.getByLabel('¿Qué hay que corregir?').fill('No perder esta edición mientras sube la foto.')
  finishUpload?.()
  await expect(page.getByRole('button', { name: `Quitar ${photo.name}` })).toBeVisible()
  await expect(page.getByLabel('¿Qué hay que corregir?')).toHaveValue('No perder esta edición mientras sube la foto.')
})

test('answers an image clarification with photos alone and keeps minor accepted-review findings visible', async ({ page }) => {
  let activeJob = job({ status: 'needs_input', assetId: null, questions: ['Adjuntá una foto frontal del producto.'] })
  let submitted: AnswersInput | undefined
  const accepted: Asset = { ...original, visualReview: { verdict: 'accept', summary: 'La silueta coincide con la referencia.', issues: ['Los detalles ocultos siguen siendo aproximados.'], iterations: 2 } }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: account } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: health })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [accepted] } })
    if (path === '/api/jobs') return route.fulfill({ json: { jobs: [activeJob] } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (path === '/api/references') return route.fulfill({ status: 201, json: { reference } })
    if (path === '/api/jobs/job-original/answers') {
      submitted = route.request().postDataJSON() as AnswersInput
      activeJob = { ...activeJob, status: 'queued', questions: [] }
      return route.fulfill({ status: 202, json: { job: activeJob } })
    }
    return route.fulfill({ status: 404, json: { error: 'Unknown test route' } })
  })
  await page.goto('/app/assets')
  const continueButton = page.getByRole('button', { name: 'Continuar generación' })
  await expect(continueButton).toBeDisabled()
  await page.locator('#answer-photos-job-original').setInputFiles(photo)
  await expect(continueButton).toBeEnabled()
  await expect(page.getByLabel('Tu respuesta')).toHaveValue('')
  await continueButton.click()
  await expect(page.getByText('En cola', { exact: true })).toBeVisible()
  expect(submitted).toEqual({ notes: 'Fotos de referencia adjuntas.', referenceImageIds: [photoId] })
  await expect(page.getByText('Comparación visual aceptada', { exact: true })).toBeVisible()
  await expect(page.getByText('Los detalles ocultos siguen siendo aproximados.')).toBeVisible()
})
