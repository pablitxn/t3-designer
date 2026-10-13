import { createHash } from 'node:crypto'
import { readFile, rename } from 'node:fs/promises'
import { expect, test as base, type Page } from '@playwright/test'
import { demoPassword, startViewerScenario } from '../../../scripts/qa/project-viewer-scenario.mjs'

type Scenario = Awaited<ReturnType<typeof startViewerScenario>>
const test = base.extend<{ scenario: Scenario }>({
  // Playwright requires destructuring even when this fixture has no dependencies.
  // eslint-disable-next-line no-empty-pattern
  scenario: async ({}, use) => {
    const scenario = await startViewerScenario()
    try { await use(scenario) } finally { await scenario.close() }
  },
})
const unavailable = 'Este proyecto no está disponible o ya no tenés acceso.'
async function login(page: Page, scenario: Scenario, account: 'viewer' | 'outsider' = 'viewer') {
  await page.goto(`${scenario.origin}/login`)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(scenario.users[account].email)
  await page.getByLabel('Contraseña', { exact: true }).fill(demoPassword)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: false }).click()
  await expect(page).toHaveURL(`${scenario.origin}/app`)
  await expect(page.getByText(scenario.users[account].email, { exact: true })).toBeVisible()
}
async function openReady(page: Page, scenario: Scenario) {
  await page.goto(`${scenario.origin}/app/projects/${scenario.ready.id}`)
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
}
async function unchanged(scenario: Scenario) {
  expect(await scenario.projects.get(scenario.users.owner, scenario.ready.id)).toEqual(scenario.ready)
}
async function fits(page: Page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }))
  expect(size.content).toBeLessThanOrEqual(size.viewport + 1)
}
async function details(page: Page, name: string) {
  const summary = page.locator('summary').filter({ hasText: name })
  await summary.click()
  return summary.locator('..')
}
async function browserFetch(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'Idempotency-Key': 'viewer-prohibited-operation-2026' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, headers: Object.fromEntries(response.headers), text: method === 'HEAD' ? '' : await response.text() }
  }, { path, method, body })
}

test('listing, reviewed bases, plans, histories, floors, variants, context and energy remain read-only', async ({ page, scenario }, info) => {
  const errors: string[] = [], writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/\/api\/projects\//.test(request.url()) && request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`) })
  await login(page, scenario)
  await expect(page.getByRole('heading', { name: 'Casa compartida QA' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Proyecto vacío QA' })).toBeVisible()
  await expect(page.getByText('Proyecto de otra cuenta QA')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('list.png'), fullPage: true }); await fits(page)
  await page.getByRole('heading', { name: 'Casa compartida QA' }).getByRole('link').click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  await expect(page.getByLabel('Nombre del proyecto', { exact: true })).toHaveAttribute('readonly')
  await expect(page.getByLabel(/^Notas del proyecto/)).toHaveAttribute('readonly')
  await expect(page.getByLabel('Correo de la persona')).toHaveCount(0)
  const foundations = await details(page, 'Planos y fuentes originales')
  await expect(foundations.getByLabel('Nombre de la planta', { exact: true }).first()).toBeDisabled()
  await expect(foundations.getByRole('img', { name: scenario.plan.name })).toBeVisible()
  await expect(foundations.locator('input[type=file]')).toHaveCount(0)
  await foundations.locator('summary').first().click()
  const agents = await details(page, 'Agentes de vivienda y edificio')
  await expect(agents.getByTestId('foundation-agent-dwelling')).toContainText('Vivienda ficticia QA')
  await expect(agents.getByTestId('foundation-agent-building')).toContainText('Edificio ficticio QA')
  await expect(agents.locator('textarea')).toHaveCount(0)
  await agents.locator('summary').first().click()
  const checkpoints = await details(page, 'Puntos de recuperación del proyecto')
  await expect(checkpoints).toContainText('Antes de reemplazar el edificio')
  await expect(checkpoints.getByRole('button', { name: 'Restaurar este proyecto' })).toHaveCount(0)
  await checkpoints.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await checkpoints.locator('summary').first().click()
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption('qa-alternate')
  await expect(page.getByLabel(/^Objetos colocados/)).toContainText('—')
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption('qa-layout')
  await page.getByLabel(/^Objetos colocados/).selectOption('qa-chair')
  await expect(page.getByRole('button', { name: 'Rotar 90°', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Quitar objeto', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Plano', exact: true }).click()
  await page.getByLabel('Mostrar paredes completas', { exact: true }).check()
  await page.getByRole('combobox', { name: 'Planta', exact: true }).selectOption('upper')
  await expect(page.getByRole('combobox', { name: 'Planta', exact: true })).toHaveValue('upper')
  const context = await details(page, 'Edificio y luz solar')
  await expect(context.locator('canvas').first()).toBeVisible()
  await context.locator('summary').first().click()
  const energy = await details(page, 'Energía solar del edificio')
  await expect(energy).toContainText('solar')
  await expect(energy.locator('input:not([readonly]):not(:disabled),select:not(:disabled)')).toHaveCount(0)
  await energy.locator('summary').first().click()
  await fits(page); await page.screenshot({ path: info.outputPath('reviewed-readonly.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Planta', exact: true })).toHaveValue('ground')
  await page.getByRole('link', { name: 'Todos los proyectos' }).click()
  await page.goBack(); await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await page.goForward(); await expect(page.getByRole('heading', { name: 'Casa compartida QA' })).toBeVisible()
  expect(writes).toEqual([]); expect(errors).toEqual([]); await unchanged(scenario)
})

test('empty shared project, own empty library and unrelated URL attempts expose no foreign data', async ({ page, scenario }, info) => {
  await login(page, scenario)
  await page.goto(`${scenario.origin}/app/projects/${scenario.empty.id}`)
  await expect(page.getByRole('heading', { name: 'Las bases de tu proyecto', exact: true })).toBeVisible()
  await expect(page.getByLabel('Variantes del departamento')).toHaveCount(0)
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agregar planta' })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('empty-readonly.png'), fullPage: true }); await fits(page)
  await page.getByRole('link', { name: 'Mis assets', exact: true }).click()
  await expect(page.getByText(scenario.asset.label)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Crear objeto 3D', exact: true })).toBeDisabled()
  await page.goto(`${scenario.origin}/app/projects/${scenario.foreign.id}`)
  await expect(page.getByRole('alert')).toHaveText(unavailable)
  await expect(page.getByText(scenario.foreign.name)).toHaveCount(0)
  await page.goto(`${scenario.origin}/app/projects/${scenario.ready.id}/edit`)
  await expect(page.getByRole('heading', { name: 'Casa compartida QA' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  await page.goto(`${scenario.origin}/app/users`)
  await expect(page.getByLabel('Correo para invitar')).toHaveCount(0)
  await unchanged(scenario)
})

test('project-scoped plan popup and GLB download work; source artifacts and mutations are denied', async ({ page, scenario }, info) => {
  await login(page, scenario); await openReady(page, scenario)
  const creditsBefore = JSON.parse((await browserFetch(page, '/api/credits')).text)
  const attachmentsBefore = scenario.store.projectAssets(scenario.ready.id)
  const original = await details(page, 'Planos y fuentes originales')
  const popupPromise = page.waitForEvent('popup')
  await original.getByRole('link', { name: new RegExp(`Abrir plano: ${scenario.plan.name}`) }).click()
  const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded')
  await expect(popup.locator('img')).toBeVisible(); await popup.screenshot({ path: info.outputPath('plan-popup.png') }); await popup.close()
  const downloadPromise = page.waitForEvent('download')
  // There is no project-model download button today. Exercise the authorized
  // model URL in the browser, without granting access to the creator's library.
  await page.evaluate(url => { const link = document.createElement('a'); link.href = url; link.download = 'model.glb'; link.click() }, scenario.attached.url)
  const download = await downloadPromise; const target = info.outputPath('downloaded-model.glb'); await download.saveAs(target)
  const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
  expect(hash(await readFile(target))).toBe(hash(await readFile(`${scenario.directory}/model/model.glb`)))
  for (const path of [scenario.attached.url, `/api/projects/${scenario.ready.id}/references/${scenario.plan.id}/image`]) {
    const result = await browserFetch(page, path, 'HEAD'); expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store')
  }
  for (const path of [`/api/assets/${scenario.asset.id}`, `/api/assets/${scenario.asset.id}/files/model.glb`, `/api/jobs/${scenario.asset.jobId}`, `/api/references/${scenario.plan.id}/image`, scenario.attached.url.replace('model.glb', 'source.blend'), scenario.attached.url.replace('model.glb', 'manifest.json'), scenario.attached.url.replace(scenario.ready.id, scenario.empty.id)]) expect((await browserFetch(page, path)).status).toBe(404)
  const id = scenario.ready.id
  const operations: [string, string, unknown][] = [
    [`/api/projects/${id}`, 'PUT', { revision: 1, name: 'Forbidden edit' }],
    [`/api/projects/${id}/members`, 'POST', { email: scenario.users.outsider.email, role: 'editor' }],
    [`/api/projects/${id}/members/${scenario.users.viewer.id}`, 'DELETE', {}],
    [`/api/projects/${id}/references`, 'POST', { name: 'forbidden.png', dataUrl: 'data:image/png;base64,AA==' }],
    [`/api/projects/${id}/assets`, 'POST', { assetId: scenario.asset.id }],
    [`/api/projects/${id}/foundation-agent`, 'POST', { target: 'dwelling', revision: 1, message: 'Forbidden generation' }],
    [`/api/projects/${id}/foundation-agent/runs/${scenario.versions[0].runId}/cancel`, 'POST', {}],
    [`/api/projects/${id}/foundation-agent/versions/${scenario.versions[0].id}/accept`, 'POST', { revision: 1 }],
  ]
  const checkpoint = await scenario.database.db.selectFrom('t3_project_checkpoint').select('id').where('projectId', '=', id).executeTakeFirstOrThrow()
  operations.push([`/api/projects/${id}/checkpoints/${checkpoint.id}/restore`, 'POST', { revision: 1 }])
  for (const [path, method, body] of operations) expect((await browserFetch(page, path, method, body)).status, path).toBe(403)
  expect((await browserFetch(page, `/api/projects/${id}/members`)).status).toBe(403)
  await unchanged(scenario)
  expect(scenario.store.userJobs(scenario.users.viewer.id)).toEqual([])
  expect(scenario.store.projectAssets(scenario.ready.id)).toEqual(attachmentsBefore)
  expect(JSON.parse((await browserFetch(page, '/api/credits')).text)).toEqual(creditsBefore)
})

test('revocation while mounted clears private view on focus and permits a clean retry after regrant', async ({ page, scenario }, info) => {
  await login(page, scenario); await openReady(page, scenario)
  await scenario.revoke()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('alert')).toHaveText(unavailable)
  await expect(page.getByLabel('Variantes del departamento')).toHaveCount(0)
  await expect(page.getByLabel(/^Notas del proyecto/)).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('revoked.png') })
  expect((await browserFetch(page, scenario.attached.url)).status).toBe(404)
  expect((await browserFetch(page, `/api/projects/${scenario.ready.id}/references/${scenario.plan.id}/image`)).status).toBe(404)
  await scenario.restoreAccess()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await unchanged(scenario)
})

test('expired real session clears mounted data and back navigation cannot recover it', async ({ page, scenario }, info) => {
  await login(page, scenario); await openReady(page, scenario); await scenario.expire()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page).toHaveURL(`${scenario.origin}/login`)
  await expect(page.getByText(scenario.ready.name)).toHaveCount(0)
  await expect(page.getByLabel(/^Notas del proyecto/)).toHaveCount(0)
  await page.goBack(); await expect(page).toHaveURL(`${scenario.origin}/login`)
  await page.screenshot({ path: info.outputPath('expired.png') })
  expect((await browserFetch(page, scenario.attached.url)).status).toBe(401)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(scenario.users.viewer.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(demoPassword)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: scenario.ready.name })).toBeVisible()
})

test('UI sign-out and account change remove previous projects, including reload and history', async ({ page, scenario }, info) => {
  await login(page, scenario); await openReady(page, scenario)
  await page.getByRole('button', { name: 'Cerrar sesión' }).dblclick()
  await expect(page).toHaveURL(`${scenario.origin}/login`)
  await login(page, scenario, 'outsider')
  await expect(page.getByRole('heading', { name: scenario.foreign.name })).toBeVisible()
  await expect(page.getByText(scenario.ready.name)).toHaveCount(0)
  await page.goto(`${scenario.origin}/app/projects/${scenario.ready.id}`)
  await expect(page.getByRole('alert')).toHaveText(unavailable)
  await page.reload(); await expect(page.getByRole('alert')).toHaveText(unavailable)
  await page.screenshot({ path: info.outputPath('different-account.png') }); await unchanged(scenario)
})

test('a delayed old session response cannot remount the previous account after a cross-tab account change', async ({ page, context, scenario }) => {
  await login(page, scenario); await openReady(page, scenario)
  const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }
  const oldCheck = gate(), oldSeen = gate(), currentChecks = gate(), currentSeen = gate()
  const oldRequestSeen = gate(), fetchExpired = gate(), expiredFetched = gate(), deliverExpired = gate()
  let first = true
  await page.route('**/api/me', async route => {
    const response = await route.fetch()
    if (first) { first = false; oldSeen.release(); await oldCheck.promise }
    else { currentSeen.release(); await currentChecks.promise }
    await route.fulfill({ response }).catch(() => undefined)
  })
  const oldRequestPath = `/api/projects/${scenario.ready.id}/foundation-agent`
  await page.route(`**${oldRequestPath}`, async route => {
    oldRequestSeen.release(); await fetchExpired.promise
    const response = await route.fetch()
    expect(response.status()).toBe(401)
    expiredFetched.release(); await deliverExpired.promise
    await route.fulfill({ response }).catch(() => undefined)
  })
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await oldSeen.promise
    await page.evaluate(path => { const clientModule = '/src/private/api.ts'; void import(clientModule).then(({ request }) => request(path).catch(() => undefined)) }, oldRequestPath)
    await oldRequestSeen.promise
    expect((await context.request.post(`${scenario.origin}/api/account/sign-out`, { data: {}, headers: { Origin: scenario.origin } })).status()).toBe(200)
    fetchExpired.release(); await expiredFetched.promise
    expect((await context.request.post(`${scenario.origin}/api/account/sign-in`, { data: { email: scenario.users.outsider.email, password: demoPassword }, headers: { Origin: scenario.origin } })).status()).toBe(200)
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await currentSeen.promise
    const denied = page.waitForResponse(response => new URL(response.url()).pathname === oldRequestPath && response.status() === 401)
    deliverExpired.release(); await denied
    await expect(page.getByLabel(/^Notas del proyecto/)).toHaveCount(0)
    currentChecks.release()
    await expect(page.getByText(scenario.users.outsider.email, { exact: true })).toBeVisible()
    const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/me')
    oldCheck.release(); await oldResponse
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByText(scenario.users.outsider.email, { exact: true })).toBeVisible()
    await expect(page.getByText(scenario.users.viewer.email, { exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Mis proyectos', exact: true }).click()
    await expect(page.getByRole('heading', { name: scenario.foreign.name })).toBeVisible()
    await expect(page.getByText(scenario.ready.name)).toHaveCount(0)
  } finally { oldCheck.release(); currentChecks.release(); fetchExpired.release(); deliverExpired.release() }
})

test('transient server failure, lost GET response and cancelled navigation have recoverable UI', async ({ page, scenario }, info) => {
  await login(page, scenario)
  const pattern = `**/api/projects/${scenario.ready.id}`
  await page.route(pattern, route => route.fulfill({ status: 503, json: { error: 'Fixture outage' } }))
  await page.goto(`${scenario.origin}/app/projects/${scenario.ready.id}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel(/^Notas del proyecto/)).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('server-outage.png') })
  await page.unroute(pattern)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await page.route(pattern, route => route.abort('failed'))
  await page.reload(); await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute(pattern)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  let release!: () => void, intercepted!: () => void
  const held = new Promise<void>(resolve => { release = resolve }), seen = new Promise<void>(resolve => { intercepted = resolve })
  await page.route(pattern, async route => { const response = await route.fetch(); intercepted(); await held; await route.fulfill({ response }).catch(() => undefined) })
  await page.getByRole('link', { name: 'Mis proyectos', exact: true }).click()
  await page.getByRole('heading', { name: scenario.ready.name }).getByRole('link').click(); await seen
  await page.getByRole('link', { name: 'Mis proyectos', exact: true }).click(); release()
  await expect(page.getByRole('heading', { name: scenario.ready.name })).toBeVisible()
  await expect(page.getByLabel(/^Notas del proyecto/)).toHaveCount(0)
  await unchanged(scenario)
})

test('double-click duplication creates one independent copy and leaves the shared source intact', async ({ page, scenario }) => {
  await login(page, scenario); await openReady(page, scenario)
  await page.getByRole('button', { name: 'Duplicar', exact: true }).dblclick()
  await expect(page).not.toHaveURL(new RegExp(scenario.ready.id))
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  const copies = (await scenario.projects.list(scenario.users.viewer)).filter(project => project.role === 'owner')
  expect(copies).toHaveLength(1)
  const copy = await scenario.projects.get(scenario.users.viewer, copies[0].id)
  expect(copy.foundationModels?.levels).toHaveLength(2)
  expect(copy.scene?.assets[0].id).not.toBe(scenario.attached.id)
  expect((await browserFetch(page, copy.scene!.assets[0].url, 'HEAD')).status).toBe(200)
  await scenario.revoke()
  expect((await browserFetch(page, `/api/projects/${copy.id}/references/${scenario.plan.id}/image`, 'HEAD')).status).toBe(200)
  expect((await browserFetch(page, scenario.attached.url, 'HEAD')).status).toBe(404)
  await unchanged(scenario)
})

test('walkthrough renders existing assets, moves, pauses, cancels input and keeps visits temporary', async ({ page, scenario, isMobile, browserName }, info) => {
  const errors: string[] = [], writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/\/api\/projects\//.test(request.url()) && request.method() !== 'GET') writes.push(request.method()) })
  await login(page, scenario); await openReady(page, scenario)
  await page.getByRole('button', { name: /Recorrer esta versión/ }).click()
  const walk = page.getByTestId('walkthrough')
  await expect(walk.locator('canvas')).toBeVisible()
  await expect(walk.getByRole('button', { name: /Entrar al departamento/ })).toBeEnabled({ timeout: 45_000 })
  await walk.getByRole('button', { name: 'Preparar el paseo', exact: true }).click()
  const settings = walk.getByRole('dialog')
  await settings.getByRole('slider', { name: /^Altura de los ojos/ }).press('ArrowRight')
  await settings.getByRole('slider', { name: 'Campo de visión', exact: true }).press('ArrowLeft')
  await settings.getByRole('slider', { name: 'Sensibilidad del mouse', exact: true }).press('ArrowRight')
  await settings.getByLabel('Controles en pantalla', { exact: true }).check()
  await settings.getByLabel('Linterna de ayuda', { exact: true }).check()
  await settings.getByRole('button', { name: 'Cerrar ajustes', exact: true }).click()
  await walk.getByRole('button', { name: /Entrar al departamento/ }).dblclick()
  await expect(walk).toHaveAttribute('data-active', 'true')
  const map = walk.getByRole('img', { name: 'Tu ubicación', exact: true })
  await expect(map.locator('g')).toHaveAttribute('transform', /translate/)
  const before = await map.locator('g').getAttribute('transform')
  const forward = walk.getByRole('button', { name: 'Avanzar', exact: true })
  if (isMobile && browserName === 'chromium') {
    const session = await page.context().newCDPSession(page)
    await forward.scrollIntoViewIfNeeded()
    const box = await forward.boundingBox(); expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }] })
    await expect.poll(() => map.locator('g').getAttribute('transform')).not.toBe(before)
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await session.detach()
  } else {
    await page.keyboard.down('KeyW')
    await expect.poll(() => map.locator('g').getAttribute('transform')).not.toBe(before)
    await page.keyboard.up('KeyW')
  }
  await page.screenshot({ path: info.outputPath('walkthrough-live.png') })
  await page.keyboard.press('Escape'); await expect(walk).toHaveAttribute('data-active', 'false')
  await walk.locator('.walk-start-card').scrollIntoViewIfNeeded()
  // Check actual paint/hit order where the paused card and minimap overlap.
  // Temporarily include the normally decorative map in browser hit testing.
  expect(await walk.evaluate(root => {
    const card = root.querySelector<HTMLElement>('.walk-start-card')!, map = root.querySelector<HTMLElement>('.walk-map-wrap')!
    const a = card.getBoundingClientRect(), b = map.getBoundingClientRect()
    const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right), top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom)
    if (left >= right || top >= bottom) return true
    const original = map.style.pointerEvents
    try { map.style.pointerEvents = 'auto'; return card.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2)) }
    finally { map.style.pointerEvents = original }
  })).toBe(true)
  await fits(page); await page.screenshot({ path: info.outputPath('walkthrough.png') })
  await page.reload(); await expect(page.getByTestId('walkthrough')).toBeVisible()
  await page.getByRole('button', { name: /Volver al diseño/ }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await page.goBack(); await expect(page.getByTestId('walkthrough')).toBeVisible()
  await page.goForward(); await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  expect(writes).toEqual([]); expect(errors).toEqual([]); await unchanged(scenario)
})

test('WebGL-unavailable walkthrough shows fallback and a usable return', async ({ page, scenario }, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function (kind: string, ...args: unknown[]) { return /webgl/i.test(kind) ? null : Reflect.apply(original, this, [kind, ...args]) } })
  })
  await login(page, scenario); await openReady(page, scenario)
  await page.getByRole('button', { name: /Recorrer esta versión/ }).click()
  const walk = page.getByTestId('walkthrough')
  await expect(walk).toContainText('El recorrido necesita WebGL 2.')
  await expect(walk.locator('canvas')).toHaveCount(0)
  await walk.getByRole('button', { name: 'Preparar el paseo', exact: true }).click()
  await expect(walk.getByRole('dialog')).toBeVisible()
  await walk.getByRole('button', { name: /Volver al diseño/ }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await page.screenshot({ path: info.outputPath('webgl-fallback.png') }); await unchanged(scenario)
})

test('list failure retries, revoked memberships produce empty state, and creation can be cancelled without a write', async ({ page, scenario }, info) => {
  await login(page, scenario)
  await scenario.database.db.deleteFrom('t3_project_member').where('userId', '=', scenario.users.viewer.id).execute()
  await page.route('**/api/projects', route => route.fulfill({ status: 503, json: { error: 'Fixture outage' } }))
  await page.reload(); await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute('**/api/projects')
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tu primer proyecto empieza acá.' })).toBeVisible()
  await page.getByRole('button', { name: /Nuevo proyecto/ }).first().click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  expect(await page.getByLabel('Nombre del proyecto', { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByLabel('Nombre del proyecto', { exact: true })).toHaveCount(0)
  expect(await scenario.projects.list(scenario.users.viewer)).toEqual([])
  await page.screenshot({ path: info.outputPath('empty-list.png'), fullPage: true }); await fits(page)
})

test('a project GET with no response times out and retry recovers without background writes', async ({ page, scenario }, info) => {
  await login(page, scenario)
  const pattern = `**/api/projects/${scenario.ready.id}`
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route(pattern, async route => { const response = await route.fetch(); await held; await route.fulfill({ response }).catch(() => undefined) })
  await page.goto(`${scenario.origin}/app/projects/${scenario.ready.id}`)
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: info.outputPath('timeout.png') })
  release(); await page.unroute(pattern)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await unchanged(scenario)
})

test('periodic viewer access check clears a revoked walkthrough without resetting an unchanged floor selection', async ({ page, scenario }, info) => {
  await page.clock.install()
  await login(page, scenario); await openReady(page, scenario)
  await page.getByRole('combobox', { name: 'Planta', exact: true }).selectOption('upper')
  const checked = page.waitForResponse(response => response.url().endsWith(`/api/projects/${scenario.ready.id}`))
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await checked
  await expect(page.getByRole('combobox', { name: 'Planta', exact: true })).toHaveValue('upper')
  await page.getByRole('button', { name: /Recorrer esta versión/ }).click()
  await expect(page.getByTestId('walkthrough')).toBeVisible()
  await scenario.revoke()
  await page.clock.fastForward(60_001)
  await expect(page.getByRole('alert')).toHaveText(unavailable)
  await expect(page.getByTestId('walkthrough')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('periodic-revocation.png') })
  await unchanged(scenario)
})

test('missing model bytes use a visible fallback, preserve reading and recover after file restoration', async ({ page, scenario }, info) => {
  await rename(`${scenario.directory}/model/model.glb`, `${scenario.directory}/model/missing.glb`)
  await login(page, scenario); await openReady(page, scenario)
  await expect(page.getByText('Modelo no disponible', { exact: true })).toBeVisible()
  await page.getByLabel(/^Objetos colocados/).selectOption('qa-chair')
  await expect(page.getByRole('button', { name: 'Quitar objeto', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('missing-model.png') }); await fits(page)
  await rename(`${scenario.directory}/model/missing.glb`, `${scenario.directory}/model/model.glb`)
  await page.reload(); await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await expect(page.getByText('Modelo no disponible', { exact: true })).toHaveCount(0)
  expect((await browserFetch(page, scenario.attached.url, 'HEAD')).status).toBe(200)
  await unchanged(scenario)
})

test('long names and markup notes render as text without overflow or executing HTML', async ({ page, scenario }, info) => {
  const name = 'Nombre QA '.repeat(12).slice(0, 120)
  const notes = '<img src=x onerror="window.viewerMarkupExecuted=true"> & <script>alert(1)</script> ' + 'https://example.test/' + 'x'.repeat(1500)
  scenario.ready = await scenario.projects.save(scenario.users.owner, scenario.ready.id, { revision: 1, name, notes })
  await login(page, scenario)
  await expect(page.getByRole('heading', { name })).toBeVisible(); await fits(page)
  await openReady(page, scenario)
  await expect(page.getByLabel(/^Notas del proyecto/)).toHaveValue(notes)
  await expect(page.locator('img[src=x]')).toHaveCount(0)
  await expect(page.locator('script').filter({ hasText: 'alert(1)' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as Window & { viewerMarkupExecuted?: boolean }).viewerMarkupExecuted)).toBeUndefined()
  await page.screenshot({ path: info.outputPath('long-text.png'), fullPage: true }); await fits(page)
  await unchanged(scenario)
})

test('viewer account navigation reads its own credits and empty usage, including settings, with generation disabled', async ({ page, scenario }, info) => {
  await login(page, scenario)
  const nav = page.getByRole('navigation', { name: 'Tu espacio', exact: true })
  await nav.getByRole('link', { name: 'Créditos y plan', exact: true }).click()
  await expect(page.getByTestId('credit-balance')).toHaveText('100')
  await expect(page.getByRole('button', { name: 'Elegir suscripción', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Comprar paquete', exact: true }).first()).toBeDisabled()
  await fits(page); await page.screenshot({ path: info.outputPath('own-wallet.png'), fullPage: true })
  await nav.getByRole('link', { name: 'Consumo', exact: true }).click()
  await expect(page.getByText('No hay operaciones en este período con estos filtros.', { exact: true })).toBeVisible()
  await fits(page)
  await openReady(page, scenario)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Ajustes', exact: true })
  await expect(settings).toBeVisible()
  await settings.getByRole('button', { name: 'Consumo', exact: true }).click()
  await expect(settings.getByText('No hay operaciones en este período con estos filtros.', { exact: true })).toBeVisible()
  await settings.getByRole('button', { name: 'Cerrar ajustes', exact: true }).click()
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible()
  await page.goto(`${scenario.origin}/app/generate`)
  await expect(page.locator('form button[type=submit],form button').last()).toBeDisabled()
  expect(scenario.store.userJobs(scenario.users.viewer.id)).toEqual([])
  await unchanged(scenario)
})

test('lost clone reply leaves one persisted own copy recoverable from the list without replaying the mutation', async ({ page, scenario }, info) => {
  await login(page, scenario); await openReady(page, scenario)
  const pattern = `**/api/projects/${scenario.ready.id}/clone`
  await page.route(pattern, async route => { await route.fetch(); await route.abort('failed') })
  await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('No pudimos completar esta acción. Volvé a intentarlo.')
  await expect(page.getByRole('button', { name: 'Duplicar', exact: true })).toBeEnabled()
  const copies = (await scenario.projects.list(scenario.users.viewer)).filter(project => project.role === 'owner')
  expect(copies).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('lost-clone-reply.png') })
  await page.getByRole('link', { name: 'Mis proyectos', exact: true }).click()
  await page.getByRole('link', { name: copies[0].name, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  await unchanged(scenario)
})
