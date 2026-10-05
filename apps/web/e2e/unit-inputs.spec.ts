import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { ProjectSnapshot } from '@t3-designer/scene-schema'
import type { CreateJobInput, Job } from '@t3-designer/asset-schema'
import { creditFixture } from './credit-fixture'
import { closeSettings, openSettings } from './settings-helpers'

test.use({ locale: 'en-GB' })

test('changing units preserves a draft and project generation submits edited feet as meters', async ({ page }) => {
  let submitted: Record<string, number> | undefined
  page.on('dialog', dialog => { void dialog.accept() })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'unit-test-owner', name: 'Unit test', role: 'user', tier: 'standard' } } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance: 1000 } })
    if (path === '/api/health') return route.fulfill({ json: { projectGenerationEnabled: true } })
    if (path === '/api/project-generations' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON()
      return route.fulfill({ status: 202, json: { job: { id: 'unit-job', status: 'queued', projectId: null, input: submitted, createdAt: new Date().toISOString() } } })
    }
    if (path === '/api/project-generations') return route.fulfill({ json: { jobs: [] } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/app/generate')
  await page.locator('[name="name"]').fill('Unit conversion concept')
  await page.locator('[name="prompt"]').fill('An apartment with two bedrooms and a spacious living room.')
  for (const [name, value] of Object.entries({ width: '12', depth: '10', storeyHeight: '2.8', floors: '3', latitude: '48', longitude: '-2', timeZone: 'Europe/Paris' })) {
    await page.locator(`[name="${name}"]`).fill(value)
  }
  const settings = await openSettings(page)
  await settings.getByRole('combobox', { name: 'Measurement units', exact: true }).selectOption('imperial')
  await closeSettings(page)
  expect(Number(await page.getByLabel('Width (ft)', { exact: true }).inputValue())).toBeCloseTo(12 / .3048, 8)
  await page.getByLabel('Width (ft)', { exact: true }).fill('40')
  await page.getByRole('button', { name: 'Generate concept', exact: false }).click()
  await expect.poll(() => submitted?.width).toBeCloseTo(12.192, 8)
  expect(submitted?.depth).toBeCloseTo(10, 8)
  expect(submitted?.storeyHeight).toBeCloseTo(2.8, 8)
  expect(submitted?.floors).toBe(3)
  expect(submitted?.latitude).toBe(48)
  expect(submitted?.longitude).toBe(-2)
})

test('untouched divider defaults convert once and save as the original meter dimensions', async ({ page }) => {
  const scene = JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')) as ProjectSnapshot
  const id = '86c794df-15d9-45d2-8401-683c33ebf0a3'
  scene.project = { id, name: 'Divider units' }
  const project = { id, name: scene.project.name, notes: '', role: 'owner', ownerId: 'unit-owner', revision: 1, scene }
  let saved: ProjectSnapshot | undefined
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'unit-owner', name: 'Unit test', role: 'user' } } })
    if (path === `/api/projects/${id}` && route.request().method() === 'PUT') {
      saved = route.request().postDataJSON().scene
      return route.fulfill({ json: { project: { ...project, revision: 2, scene: saved } } })
    }
    if (path === `/api/projects/${id}`) return route.fulfill({ json: { project } })
    if (path.endsWith('/members')) return route.fulfill({ json: { members: [] } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto(`/app/projects/${id}`)
  await page.getByText('Try a divider', { exact: false }).first().click()
  const settings = await openSettings(page)
  await settings.getByRole('combobox', { name: 'Measurement units', exact: true }).selectOption('imperial')
  await closeSettings(page)
  expect(Number(await page.getByLabel('Thickness (ft)', { exact: true }).inputValue())).toBeCloseTo(.1 / .3048, 8)
  await page.getByRole('button', { name: 'Add divider', exact: false }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect.poll(() => saved?.apartment.walls.length).toBe(scene.apartment.walls.length + 1)
  const divider = saved!.apartment.walls.find(wall => !scene.apartment.walls.some(original => original.id === wall.id))!
  expect(divider.thickness).toBeCloseTo(.1, 8)
  expect(divider.height).toBeCloseTo(Math.min(2.4, scene.geometry.ceiling.elevation), 8)
  expect(Math.hypot(divider.to[0] - divider.from[0], divider.to[1] - divider.from[1])).toBeCloseTo(1.5, 8)
})

test('asset dimensions keep the draft across unit switches and submit inches as meters', async ({ page }) => {
  let submitted: CreateJobInput | undefined
  let jobs: Job[] = []
  page.on('dialog', dialog => { void dialog.accept() })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'unit-owner', name: 'Unit test', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance: 1000 } })
    if (path === '/api/health') return route.fulfill({ json: { status: 'ok', codex: { available: true, authenticated: true, authMode: 'api-key' }, blender: { available: true }, activeJobId: null } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (path === '/api/jobs' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON() as CreateJobInput
      const job: Job = { id: 'unit-asset-job', status: 'queued', input: submitted, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stage: '', questions: [], error: null, assetId: null, warnings: [] }
      jobs = [job]
      return route.fulfill({ status: 202, json: { job } })
    }
    if (path === '/api/jobs') return route.fulfill({ json: { jobs } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/app/assets')
  await page.getByLabel('Product link', { exact: true }).fill('https://www.ikea.com/es/es/p/strandmon-sillon-20343224/')
  await page.getByLabel('Details and preferences', { exact: true }).fill('Keep these supplied dimensions')
  await page.locator('#create-width').fill('100')
  await page.locator('#create-height').fill('2000')
  await page.locator('#create-depth').fill('5')
  for (const system of ['imperial', 'metric', 'imperial']) {
    const settings = await openSettings(page)
    await settings.getByRole('combobox', { name: 'Measurement units', exact: true }).selectOption(system)
    await closeSettings(page)
    const factor = system === 'imperial' ? 2.54 : 1
    for (const [axis, centimeters] of [['width', 100], ['height', 2000], ['depth', 5]] as const) {
      const field = page.locator(`#create-${axis}`)
      expect(Number(await field.inputValue())).toBeCloseTo(centimeters / factor, 5)
      expect(await field.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true)
    }
  }
  await page.getByRole('spinbutton', { name: 'Width (in)', exact: true }).fill('40')
  await page.getByRole('button', { name: 'Create 3D object', exact: false }).click()
  await expect.poll(() => submitted?.dimensions?.[0]).toBeCloseTo(1.016, 8)
  expect(submitted?.dimensions?.[1]).toBe(20)
  expect(submitted?.dimensions?.[2]).toBe(.05)
  expect(submitted?.notes).toBe('Keep these supplied dimensions')
})
