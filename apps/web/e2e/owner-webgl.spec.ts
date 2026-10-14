import type { Object3D, Mesh } from 'three'
import { expect, test } from '@playwright/test'

// Browser rendering of existing assets only; no model, provider or Blender runs.
test('OWNER-WEBGL existing GLB and accepted fixture geometry render in the private editor', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().route(url => url.hostname !== '127.0.0.1' && !['data:', 'blob:'].includes(url.protocol), route => route.abort())
  await page.goto('/login')
  await page.getByLabel('Correo electrónico', { exact: true }).fill('owner-standard@example.test')
  await page.getByLabel(/^Contraseña/).fill('Synthetic-QA-password-2026')
  await page.getByRole('button', { name: /^Iniciar sesión/ }).click()
  await expect(page).toHaveURL(/\/app$/)
  await page.getByRole('button', { name: /Nuevo proyecto/ }).first().click()
  await page.getByLabel('Nombre del proyecto', { exact: true }).fill(`GLB existente ${test.info().project.name}`)
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Las bases de tu proyecto', exact: true })).toBeVisible()
  const id = page.url().split('/').at(-1)!
  page.on('dialog', dialog => { void dialog.accept() })
  for (const target of ['dwelling', 'building']) {
    const area = page.getByTestId(`foundation-agent-${target}`)
    await area.getByRole('button', { name: /^Iniciar modelado/ }).click()
    await expect(area.getByRole('button', { name: 'Usar esta versión', exact: true })).toBeEnabled({ timeout: 30_000 })
    const canvas = area.locator('canvas').first()
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
    await canvas.scrollIntoViewIfNeeded()
    await canvas.screenshot({ path: test.info().outputPath(`${target}-webgl.png`) })
    await area.getByRole('button', { name: 'Usar esta versión', exact: true }).click()
    await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  }
  // Seed a synthetic asset through the real queue; its GLB is copied from the existing public catalog.
  const response = await page.request.post('/api/jobs', { headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': crypto.randomUUID() },
    data: { url: 'https://example.test/existing-glb', notes: 'WebGL QA fixture', dimensions: [1.2, .75, .7] } })
  expect(response.status()).toBe(202)
  const { job } = await response.json()
  let assetId = ''
  await expect.poll(async () => {
    const current = (await (await page.request.get(`/api/jobs/${job.id}`)).json()).job
    assetId = current.assetId ?? ''; return current.status
  }, { timeout: 20_000 }).toBe('completed')
  await page.reload()
  await page.getByRole('combobox', { name: 'Mis assets', exact: true }).selectOption(assetId)
  await page.getByRole('button', { name: 'Agregar al proyecto', exact: true }).click()
  await page.getByRole('button', { name: /Colocar objeto$/ }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  const project = (await (await page.request.get(`/api/projects/${id}`)).json()).project
  const fixtureId = project.scene.fixtures[0].id
  const modelURL = project.scene.assets[0].url
  expect((await page.request.get(modelURL)).status()).toBe(200)
  const editor = page.getByRole('region', { name: 'Diseñá tu departamento', exact: true })
  const canvas = editor.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await canvas.scrollIntoViewIfNeeded()
  const store = await page.evaluateHandle(async () => {
    const module = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
    if (!module) throw new Error('React Three Fiber module missing')
    const fiber = await import(/* @vite-ignore */ module.name)
    const element = [...document.querySelectorAll('section')].find(section => section.getAttribute('aria-label') === 'Diseñá tu departamento')!.querySelector('canvas')
    return fiber._roots.get(element).store
  })
  const rendering = async () => store.evaluate((store, id) => {
    const { gl, scene } = store.getState()
    let modelVertices = 0
    scene.getObjectByName(id)?.traverse((child: Object3D) => {
      const mesh = child as Mesh
      if (mesh.isMesh) modelVertices += mesh.geometry.attributes.position?.count ?? 0
    })
    return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, modelVertices, contextLost: gl.getContext().isContextLost() }
  }, fixtureId)
  await expect.poll(async () => (await rendering()).modelVertices, { timeout: 30_000 }).toBeGreaterThan(100)
  const observed = await rendering()
  expect(observed.calls).toBeGreaterThan(0); expect(observed.triangles).toBeGreaterThan(0); expect(observed.contextLost).toBe(false)
  expect(errors).toEqual([])
  await test.info().attach('software-webgl-observation', { body: JSON.stringify({ viewport: test.info().project.use.viewport, rendering: observed, modelURL, quality3DValidated: false }), contentType: 'application/json' })
  await canvas.screenshot({ path: test.info().outputPath('existing-glb-webgl.png') })
})
