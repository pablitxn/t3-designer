import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { defaultDesignCustomization, ProjectSnapshotSchema, type Point2D, type ProjectSnapshot, type Wall } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'
import { rebuildApartmentGeometry } from '../src/editor/model'
import { buildWalkWorld, initialWalkDoorStates, isWalkPositionFree } from '../src/walkthrough/navigation'

test.use({
  locale: 'es-AR', viewport: { width: 1720, height: 1100 },
  // Continuous screencasts compete with explicit software WebGL screenshots.
  // Keep action/DOM/source traces and the full desktop/mobile PNGs below.
  trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
})

const projectId = 'ec426d26-dc06-49e5-bb2c-d6e8cb51d043'
const projectPath = `/app/projects/${projectId}`
const bundled = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))

async function usePrivateInteractionCanvas(page: Page) {
  // Input/collision fixtures still render the real WebGL world, with its normal
  // lights and physics, but do not need desktop-sized rasterization. The public
  // furnished reference below separately covers the full desktop/mobile view.
  // Install before React mounts so its first Canvas measurement is also small.
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.dataset.walkInteractionFixture = 'true'
    style.textContent = `
      .walk-stage { width: min(640px, 100%) !important; height: 480px !important; max-height: 480px !important; }
      .walk-overlay { padding: 12px !important; }
      .walk-start-card { padding: 16px !important; }
    `
    const install = () => {
      if (!document.documentElement) return false
      document.documentElement.append(style)
      return true
    }
    if (!install()) {
      const observer = new MutationObserver(() => { if (install()) observer.disconnect() })
      observer.observe(document, { childList: true })
    }
  })
}

async function mockProject(page: Page, role: Project['role'] = 'owner', empty = false, source: ProjectSnapshot = bundled) {
  await usePrivateInteractionCanvas(page)
  const scene = structuredClone(source)
  // Private fixtures cover interior input, permissions and collision. Keep the
  // target building, apartment, furniture and lighting; neighbours and roads
  // are exercised by the furnished public reference below, not these controls.
  scene.buildings = scene.buildings.filter(building => building.isTarget)
  scene.roads = []
  scene.project = { id: projectId, name: 'Proyecto para recorrer' }
  scene.fixtures = empty ? [] : [{ ...scene.fixtures[0], position: [2, .015, 7] }]
  const alternative = structuredClone(scene.fixtures)
  if (alternative[0]) alternative[0].position[0] = 3
  scene.editor = {
    schemaVersion: 1, activeArchitectureId: 'architecture-original', architectures: [{
      id: 'architecture-original', name: 'Departamento original', apartment: structuredClone(scene.apartment),
      partitionWallIds: [], activeLayoutId: 'layout-original', layouts: [
        { id: 'layout-original', name: 'Distribución original', fixtures: structuredClone(scene.fixtures), customization: structuredClone(scene.customization) },
        { id: 'layout-alternate', name: 'Alternativa del invitado', fixtures: alternative, customization: structuredClone(scene.customization) },
      ],
    }],
  }
  const saved: Project = { id: projectId, name: scene.project.name, notes: '', ownerId: 'walk-owner', role,
    revision: 1, createdAt: '2026-10-04T12:00:00Z', updatedAt: '2026-10-04T12:00:00Z', scene }
  const mutations: string[] = []
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      mutations.push(`${request.method()} ${path}`)
      return route.fulfill({ status: 500, json: { error: 'A walkthrough must not persist changes.' } })
    }
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'walk-owner', name: 'Walk designer', email: 'walk@example.test', role: 'user' } } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [saved] } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === `/api/projects/${projectId}/members`) return route.fulfill({ json: { members: [] } })
    if (path === `/api/projects/${projectId}`) return route.fulfill({ json: { project: saved } })
    return route.fulfill({ status: 404, json: { error: `Unexpected request: ${request.method()} ${path}` } })
  })
  return { scene, saved, mutations }
}

function interactiveDoorScene(): ProjectSnapshot {
  const scene = structuredClone(bundled)
  const perimeter: Point2D[] = [[0, 0], [8, 0], [8, 4], [0, 4]]
  scene.apartment.perimeter = perimeter
  scene.apartment.rooms = [
    { id: 'entrance', name: 'Antes de la puerta', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], reportedArea: 16, color: '#e7ddca' },
    { id: 'beyond-door', name: 'Después de la puerta', polygon: [[4, 0], [8, 0], [8, 4], [4, 4]], reportedArea: 16, color: '#dce5d2' },
  ]
  scene.apartment.walls = perimeter.map((from, index): Wall => ({ id: `door-test-edge-${index}`, from, to: perimeter[(index + 1) % perimeter.length],
    height: 2.7, thickness: .1, kind: 'exterior', estimated: true }))
  scene.apartment.walls.push({ id: 'door-test-partition', from: [4, 0], to: [4, 4], height: 2.7, thickness: .1, kind: 'interior', estimated: true })
  scene.apartment.doors = [
    { id: 'door-test-entry', wallId: 'door-test-edge-3', offset: 2, width: 1.2, height: 2.1, hinge: 'start', opensToward: 1, appearance: 'passage', estimated: true, locationConfidence: 'schematic' },
    { id: 'door-test-panel', wallId: 'door-test-partition', offset: 1.3, width: 1.4, height: 2.1, hinge: 'start', opensToward: 1, appearance: 'panel', estimated: true, locationConfidence: 'schematic' },
  ]
  scene.apartment.windows = []
  delete scene.apartment.balcony
  delete scene.editor
  scene.fixtures = []
  scene.customization = defaultDesignCustomization()
  scene.customization.doors['door-test-panel'] = { style: 'panel', color: '#9baaaa', openness: 0 }
  scene.geometry.floor = { ...scene.geometry.floor, elevation: 0 }
  scene.geometry.ceiling = { ...scene.geometry.ceiling, elevation: 2.7 }
  scene.geometry = rebuildApartmentGeometry(scene)
  scene.geometry.contextSections.ceilingBase = scene.placement.floorElevation + 2.7
  return ProjectSnapshotSchema.parse(scene)
}

async function openEditor(page: Page) {
  await page.goto(projectPath)
  await expect(page.getByLabel('Variantes del departamento')).toBeVisible({ timeout: 30_000 })
}

async function withoutWebGL(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function (type: string, ...args: unknown[]) {
      if (/webgl/i.test(type)) return null
      return Reflect.apply(getContext, this, [type, ...args])
    } })
  })
}

test('the public walkthrough has a direct route, WebGL fallback and a working return', async ({ page }) => {
  await withoutWebGL(page)
  await page.goto('/#walkthrough')
  const visit = page.getByTestId('walkthrough')
  await expect(visit.getByRole('heading', { name: 'Recorrido en primera persona' })).toBeVisible()
  await expect(visit.getByRole('status').filter({ hasText: 'El recorrido necesita WebGL 2.' })).toBeVisible()
  await expect(visit.locator('canvas')).toHaveCount(0)
  await expect(visit.getByRole('button', { name: /Entrar al departamento/ })).toHaveCount(0)
  await expect(visit).toContainText('Departamento de referencia')
  await visit.getByRole('button', { name: /Volver al diseño/ }).click()
  await expect(visit).toHaveCount(0)
  await expect(page).not.toHaveURL(/#walkthrough$/)
  await page.getByRole('button', { name: 'Recorrido', exact: true }).click()
  await expect(page).toHaveURL(/#walkthrough$/)
  await expect(page.getByTestId('walkthrough')).toBeVisible()
})

test('an unsaved owner layout can be visited and returned to without saving or losing the draft', async ({ page }) => {
  await withoutWebGL(page)
  const server = await mockProject(page)
  await openEditor(page)
  await page.getByLabel('Nombre de la copia').fill('Paseo del borrador')
  await page.getByRole('button', { name: 'Duplicar distribución', exact: true }).click()
  const layout = await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).inputValue()
  await page.getByRole('combobox', { name: /^Objetos colocados/ }).selectOption('k-fridge')
  await page.getByLabel('X (m)', { exact: true }).fill('3.2')
  await page.getByLabel('X (m)', { exact: true }).blur()
  await page.getByRole('button', { name: /Recorrer esta versión/ }).click()
  await expect(page).toHaveURL(new RegExp(`${projectPath}#walkthrough$`))
  const visit = page.getByTestId('walkthrough')
  await expect(visit).toContainText('Paseo del borrador')
  await expect(visit).toContainText('Proyecto para recorrer')
  await visit.getByLabel('Hora local', { exact: true }).fill('08:30')
  await visit.getByRole('button', { name: /Volver al diseño/ }).click()
  await expect(page.getByRole('combobox', { name: 'Distribuciones', exact: true })).toHaveValue(layout)
  await page.getByRole('combobox', { name: /^Objetos colocados/ }).selectOption('k-fridge')
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3.2')
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Deshacer$/ })).toBeEnabled()
  expect(server.mutations).toEqual([])
  expect(server.saved.scene.fixtures[0].position[0]).toBe(2)
  expect(server.saved.scene.editor!.architectures[0].activeLayoutId).toBe('layout-original')
})

test('a viewer visits the selected alternative and browser Back retains that selection without writes', async ({ page }) => {
  await withoutWebGL(page)
  const server = await mockProject(page, 'viewer')
  await openEditor(page)
  await page.getByRole('combobox', { name: 'Distribuciones', exact: true }).selectOption('layout-alternate')
  await page.getByRole('button', { name: /Recorrer esta versión/ }).click()
  await expect(page.getByTestId('walkthrough')).toContainText('Alternativa del invitado')
  await page.goBack()
  await expect(page.getByTestId('walkthrough')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Distribuciones', exact: true })).toHaveValue('layout-alternate')
  await page.getByRole('combobox', { name: /^Objetos colocados/ }).selectOption('k-fridge')
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue('3')
  await expect(page.getByLabel('X (m)', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0)
  expect(server.mutations).toEqual([])
  expect(server.saved.scene.editor!.architectures[0].activeLayoutId).toBe('layout-original')
})

async function mapPose(page: Page) {
  const transform = await page.locator('.walk-map > g').getAttribute('transform')
  const parts = transform?.match(/translate\(([^ ]+) ([^)]+)\) rotate\(([^)]+)\)/)
  if (!parts) throw new Error(`Missing walkthrough pose: ${transform}`)
  return { x: Number(parts[1]), z: Number(parts[2]), degrees: Number(parts[3]), transform }
}

async function feetOffset(page: Page) {
  const value = await page.locator('.walk-map').getAttribute('data-feet-offset')
  if (value === null) throw new Error('The walkthrough has not published its vertical position')
  return Number(value)
}

async function cameraPitch(page: Page) {
  const value = await page.locator('.walk-map').getAttribute('data-pitch')
  if (value === null) throw new Error('The walkthrough has not published its camera pitch')
  return Number(value)
}

async function settlePose(page: Page) {
  // The minimap is published at 10 Hz. Wait for rendered frames as well as
  // elapsed time, since software WebGL can take longer than 250 ms per frame.
  await page.evaluate(() => new Promise<void>(resolve => {
    const after = performance.now() + 150
    let frames = 0
    const next = () => {
      frames += 1
      if (frames >= 4 && performance.now() >= after) resolve()
      else requestAnimationFrame(next)
    }
    requestAnimationFrame(next)
  }))
}

test.describe('software WebGL walkthrough', { tag: '@webgl' }, () => {
  // CPU-only Chromium can spend seconds per rendered frame. Keep frame/distance
  // assertions intact while budgeting the complete input sequence separately.
  test.setTimeout(process.env.CI ? 300_000 : 90_000)
  test('keyboard, mouse hover fallback, collision boundaries and pause/resume work in the rendered scene', async ({ page }, testInfo) => {
    // Preserve movement thresholds while allowing several software-rendered
    // frames to reach the minimap on CI; ordinary DOM assertions stay unchanged.
    const rendered = expect.configure({ timeout: process.env.CI ? 15_000 : 5_000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied for fallback coverage', 'NotAllowedError'))
    })
    const server = await mockProject(page, 'owner', true)
    const world = buildWalkWorld(server.scene, initialWalkDoorStates(server.scene))
    await openEditor(page)
    await page.getByRole('button', { name: /Recorrer esta versión/ }).click()
    const visit = page.getByTestId('walkthrough')
    const canvas = visit.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.walk-map > g')).toHaveCount(1, { timeout: 30_000 })
    expect(await canvas.evaluate(element => Boolean((element as HTMLCanvasElement).getContext('webgl2')))).toBe(true)
    const entrance = await mapPose(page)
    await visit.getByRole('button', { name: /Entrar al departamento/ }).click()
    await expect(visit).toHaveAttribute('data-active', 'true')
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull()

    // The entrance leaf and exterior boundary are immediately behind the spawn.
    // Backward walking must stay clear of both, even if no movement is possible.
    await page.keyboard.down('s')
    await page.waitForTimeout(650)
    await page.keyboard.up('s')
    await settlePose(page)
    const boundary = await mapPose(page)
    expect(Math.hypot(boundary.x - entrance.x, boundary.z - entrance.z)).toBeLessThan(.25)
    expect(isWalkPositionFree(world, [boundary.x, boundary.z])).toBe(true)

    await page.keyboard.down('w')
    await rendered.poll(async () => Math.hypot((await mapPose(page)).x - boundary.x, (await mapPose(page)).z - boundary.z)).toBeGreaterThan(.2)
    await page.keyboard.press('Escape')
    await expect(visit).toHaveAttribute('data-active', 'false')
    await settlePose(page)
    const paused = await mapPose(page)
    const pausedRect = (await canvas.boundingBox())!
    await page.mouse.move(pausedRect.x + 20, pausedRect.y + 20)
    await page.mouse.move(pausedRect.x + 180, pausedRect.y + 50, { steps: 4 })
    await settlePose(page)
    expect((await mapPose(page)).transform).toBe(paused.transform)
    await visit.getByRole('button', { name: /Continuar recorrido/ }).click()
    await settlePose(page)
    expect((await mapPose(page)).transform).toBe(paused.transform)
    await page.keyboard.up('w')

    // Arrow keys look around without translating; WASD movement above remains
    // independent of the camera's keyboard look controls.
    const keyboardOrigin = await mapPose(page)
    for (const [key, direction] of [['ArrowLeft', -1], ['ArrowRight', 1]] as const) {
      const before = await mapPose(page)
      await page.keyboard.down(key)
      await rendered.poll(async () => direction * ((await mapPose(page)).degrees - before.degrees)).toBeGreaterThan(4)
      await page.keyboard.up(key)
      await settlePose(page)
      const after = await mapPose(page)
      expect([after.x, after.z]).toEqual([keyboardOrigin.x, keyboardOrigin.z])
    }
    for (const [key, direction] of [['ArrowUp', 1], ['ArrowDown', -1]] as const) {
      const beforePitch = await cameraPitch(page)
      const before = await mapPose(page)
      await page.keyboard.down(key)
      await rendered.poll(async () => direction * ((await cameraPitch(page)) - beforePitch)).toBeGreaterThan(.06)
      await page.keyboard.up(key)
      await settlePose(page)
      const after = await mapPose(page)
      expect([after.x, after.z]).toEqual([keyboardOrigin.x, keyboardOrigin.z])
      expect(after.degrees).toBeCloseTo(before.degrees, 6)
    }

    const rect = (await canvas.boundingBox())!
    await page.mouse.move(rect.x + rect.width * .45, rect.y + rect.height * .45)
    await settlePose(page)
    const enteredCanvas = await mapPose(page)
    await page.mouse.move(rect.x + rect.width * .45 + 120, rect.y + rect.height * .45 + 30, { steps: 8 })
    await rendered.poll(async () => Math.abs((await mapPose(page)).degrees - enteredCanvas.degrees)).toBeGreaterThan(5)
    await page.mouse.move(rect.x - 10, rect.y + rect.height * .45)
    await settlePose(page)
    const outsideCanvas = await mapPose(page)
    await page.mouse.move(rect.x + rect.width * .75, rect.y + rect.height * .3)
    await settlePose(page)
    expect((await mapPose(page)).degrees).toBeCloseTo(outsideCanvas.degrees, 6)
    await page.mouse.move(rect.x + rect.width * .75 + 20, rect.y + rect.height * .3)
    await rendered.poll(async () => Math.abs((await mapPose(page)).degrees - outsideCanvas.degrees)).toBeGreaterThan(1)

    await page.keyboard.down('ArrowRight')
    const beforeTurn = await mapPose(page)
    await rendered.poll(async () => Math.abs((await mapPose(page)).degrees - beforeTurn.degrees)).toBeGreaterThan(5)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(visit).toHaveAttribute('data-active', 'false')
    await settlePose(page)
    const blurred = await mapPose(page)
    await visit.getByRole('button', { name: /Continuar recorrido/ }).click()
    await settlePose(page)
    expect((await mapPose(page)).transform).toBe(blurred.transform)
    await page.keyboard.up('ArrowRight')
    expect(isWalkPositionFree(world, [blurred.x, blurred.z])).toBe(true)
    const screenshot = '/tmp/t3-walkthrough-active.png'
    await page.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach('walkthrough-active', { path: screenshot, contentType: 'image/png' })
    await page.keyboard.press('Escape')
    await visit.getByLabel('Controles en pantalla', { exact: true }).check()
    await visit.getByRole('button', { name: /Continuar recorrido/ }).click()
    const forwardControl = visit.getByRole('button', { name: 'Avanzar', exact: true })
    await forwardControl.scrollIntoViewIfNeeded()
    const forwardRect = (await forwardControl.boundingBox())!
    const beforeHold = await mapPose(page)
    await page.mouse.move(forwardRect.x + forwardRect.width / 2, forwardRect.y + forwardRect.height / 2)
    await page.mouse.down()
    await rendered.poll(async () => Math.hypot((await mapPose(page)).x - beforeHold.x, (await mapPose(page)).z - beforeHold.z)).toBeGreaterThan(.08)
    await page.mouse.up()
    await settlePose(page)
    const afterHold = await mapPose(page)
    await settlePose(page)
    expect((await mapPose(page)).transform).toBe(afterHold.transform)
    expect(isWalkPositionFree(world, [afterHold.x, afterHold.z])).toBe(true)
    await page.keyboard.press('Escape')
    await visit.getByRole('button', { name: /Volver al diseño/ }).click()
    await expect(page.getByLabel('Variantes del departamento')).toBeVisible({ timeout: 30_000 })
    expect(server.mutations).toEqual([])
    expect(errors).toEqual([])
  })

  test('E operates a nearby door once per press, changes passage collision and resets only local door state', async ({ page }) => {
    const walking = expect.configure({ timeout: process.env.CI ? 60_000 : 15_000 })
    await page.setViewportSize({ width: 1280, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied for interaction coverage', 'NotAllowedError'))
    })
    const server = await mockProject(page, 'owner', true, interactiveDoorScene())
    await page.goto(`${projectPath}#walkthrough`)
    const visit = page.getByTestId('walkthrough')
    const canvas = visit.locator('canvas')
    const interact = visit.getByTestId('walk-interact')
    const leaf = visit.locator('.walk-map [data-door-id="door-test-panel"]')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.walk-map > g')).toHaveCount(1, { timeout: 30_000 })
    await expect(leaf).toHaveAttribute('data-openness', '0')
    await visit.getByRole('button', { name: /Entrar al departamento/ }).click()
    await expect(visit).toHaveAttribute('data-active', 'true')
    await expect(canvas).toBeFocused()
    await settlePose(page)
    await expect(interact).toHaveCount(0)
    await page.keyboard.down('w')
    // The leaf opens toward this room. Stop within its two-metre interaction
    // range but outside the swept leaf and body radius, before testing toggles.
    await walking.poll(async () => (await mapPose(page)).x, { intervals: [50] }).toBeGreaterThan(2.15)
    await page.keyboard.up('w')
    await settlePose(page)
    await expect(interact).toHaveAttribute('data-door-id', 'door-test-panel')
    await expect(interact).toHaveAttribute('data-door-open', 'false')
    await expect(interact).toContainText('Abrir puerta')
    const beforeToggle = await mapPose(page)
    expect(beforeToggle.x).toBeLessThan(2.4)
    await expect(visit.getByText('Dejá espacio para mover la puerta.', { exact: true })).toHaveCount(0)
    await page.keyboard.down('e')
    await expect(leaf).toHaveAttribute('data-openness', '1')
    await page.keyboard.down('e')
    await settlePose(page)
    await expect(leaf).toHaveAttribute('data-openness', '1')
    expect((await mapPose(page)).transform).toBe(beforeToggle.transform)
    await page.keyboard.up('e')
    // The entry aligns the ray near the hinge, keeping either leaf orientation
    // targetable while the player remains outside the swept opening arc.
    await expect(interact).toHaveAttribute('data-door-open', 'true')
    await expect(interact).toContainText('Cerrar puerta')
    await page.keyboard.press('e')
    await expect(leaf).toHaveAttribute('data-openness', '0')
    expect((await mapPose(page)).transform).toBe(beforeToggle.transform)

    // Strafe to the middle of the doorway, then prove its closed leaf blocks
    // walking before opening the same door and crossing the same path.
    await page.keyboard.down('d')
    await walking.poll(async () => (await mapPose(page)).z, { intervals: [50] }).toBeGreaterThan(1.95)
    await page.keyboard.up('d')
    await page.keyboard.down('w')
    await walking.poll(async () => (await mapPose(page)).x, { intervals: [50] }).toBeGreaterThan(3.7)
    await settlePose(page)
    await page.keyboard.up('w')
    await settlePose(page)
    const blocked = await mapPose(page)
    expect(blocked.x).toBeLessThan(3.82)
    await expect(interact).toHaveAttribute('data-door-open', 'false')
    await expect(visit.getByRole('status')).toHaveText('Dejá espacio para mover la puerta.')
    await page.keyboard.press('e')
    await settlePose(page)
    await expect(leaf).toHaveAttribute('data-openness', '0')
    expect((await mapPose(page)).transform).toBe(blocked.transform)
    // The closed leaf blocked our walk, and its opening arc must also reject
    // a toggle through the visitor. Step back beyond the swing before opening.
    await page.keyboard.down('s')
    await walking.poll(async () => (await mapPose(page)).x, { intervals: [50] }).toBeLessThan(2.5)
    await page.keyboard.up('s')
    await settlePose(page)
    const clearOfSwing = await mapPose(page)
    await expect(interact).toHaveAttribute('data-door-id', 'door-test-panel')
    await expect(visit.getByText('Dejá espacio para mover la puerta.', { exact: true })).toHaveCount(0)
    await page.keyboard.press('e')
    await expect(leaf).toHaveAttribute('data-openness', '1')
    expect((await mapPose(page)).transform).toBe(clearOfSwing.transform)
    await page.keyboard.press('Escape')
    await expect(visit).toHaveAttribute('data-active', 'false')
    await visit.locator('canvas').focus()
    await page.keyboard.press('e')
    await settlePose(page)
    await expect(leaf).toHaveAttribute('data-openness', '1')
    await visit.getByRole('button', { name: /Continuar recorrido/ }).click()
    await expect(visit).toHaveAttribute('data-active', 'true')
    await expect(canvas).toBeFocused()
    await settlePose(page)
    await page.keyboard.down('w')
    await walking.poll(async () => (await mapPose(page)).x).toBeGreaterThan(4.4)
    await page.keyboard.up('w')
    await page.keyboard.press('Escape')
    await visit.getByRole('button', { name: /Volver al inicio/ }).click()
    await expect(leaf).toHaveAttribute('data-openness', '0')
    await expect.poll(async () => (await mapPose(page)).x).toBeLessThan(1)
    expect(server.saved.scene.customization!.doors['door-test-panel'].openness).toBe(0)
    expect(server.mutations).toEqual([])
    expect(errors).toEqual([])
  })

  test('Space jumps once per press, lands, respects pause and supports the on-screen jump button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied for fallback coverage', 'NotAllowedError'))
    })
    const server = await mockProject(page, 'owner', true)
    await page.goto(`${projectPath}#walkthrough`)
    const visit = page.getByTestId('walkthrough')
    await expect(visit.locator('canvas')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.walk-map > g')).toHaveCount(1, { timeout: 30_000 })
    await visit.getByRole('combobox', { name: 'Punto de inicio', exact: true }).selectOption('living')
    await visit.getByLabel('Controles en pantalla', { exact: true }).check()
    await visit.getByRole('button', { name: /Entrar al departamento/ }).click()
    await expect(visit).toHaveAttribute('data-active', 'true')
    await expect(page.locator('.walk-map')).toHaveAttribute('data-grounded', 'true')
    await page.keyboard.down('Space')
    await expect.poll(() => feetOffset(page)).toBeGreaterThan(.05)
    await expect(page.locator('.walk-map')).toHaveAttribute('data-grounded', 'false')
    await expect.poll(() => feetOffset(page), { timeout: process.env.CI ? 60_000 : 15_000 }).toBe(0)
    await expect(page.locator('.walk-map')).toHaveAttribute('data-grounded', 'true')
    // A repeated keydown while Space is still held must not queue another jump.
    await page.keyboard.down('Space')
    await settlePose(page)
    await settlePose(page)
    expect(await feetOffset(page)).toBe(0)
    await page.keyboard.up('Space')
    await page.keyboard.press('Escape')
    await expect(visit).toHaveAttribute('data-active', 'false')
    await visit.locator('canvas').focus()
    await page.keyboard.press('Space')
    await settlePose(page)
    expect(await feetOffset(page)).toBe(0)
    await expect(visit).toHaveAttribute('data-active', 'false')
    await visit.getByRole('button', { name: /Continuar recorrido/ }).click()
    await visit.getByRole('button', { name: 'Saltar', exact: true }).click()
    await expect.poll(() => feetOffset(page)).toBeGreaterThan(.05)
    await expect.poll(() => feetOffset(page), { timeout: process.env.CI ? 60_000 : 15_000 }).toBe(0)
    expect(server.mutations).toEqual([])
    expect(errors).toEqual([])
  })

  test('the entry click acquires native pointer lock when the browser document supports it', async ({ page }) => {
    const rendered = expect.configure({ timeout: process.env.CI ? 15_000 : 5_000 })
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockProject(page, 'owner', true)
    await page.goto(`${projectPath}#walkthrough`)
    const visit = page.getByTestId('walkthrough')
    const canvas = visit.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.walk-map > g')).toHaveCount(1, { timeout: 30_000 })
    // Some headless Chromium hosts expose the API but reject every document
    // with WrongDocumentError. Prove that on an ordinary visible DIV first;
    // an application-only failure must still fail this test.
    await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.id = 'walk-native-lock-probe'
      probe.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:white;padding:8px'
      probe.dataset.result = 'pending'
      const button = document.createElement('button')
      button.textContent = 'Verify native mouse capture'
      button.onclick = () => {
        try {
          void probe.requestPointerLock().then(() => { probe.dataset.result = 'locked' }, error => {
            probe.dataset.result = error.name
            probe.dataset.message = error.message
          })
        } catch (error) { probe.dataset.result = String(error) }
      }
      probe.append(button)
      document.body.append(probe)
    })
    await page.getByRole('button', { name: 'Verify native mouse capture', exact: true }).click()
    const probe = page.locator('#walk-native-lock-probe')
    await expect(probe).not.toHaveAttribute('data-result', 'pending')
    const capability = await probe.getAttribute('data-result')
    const capabilityMessage = await probe.getAttribute('data-message')
    test.skip(capability === 'WrongDocumentError', `Native pointer lock is unavailable for this browser document: a visible ordinary DIV also failed with ${capability}: ${capabilityMessage}`)
    expect(capability).toBe('locked')
    await expect.poll(() => probe.evaluate(element => document.pointerLockElement === element)).toBe(true)
    await page.evaluate(() => document.exitPointerLock())
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true)
    await probe.evaluate(element => element.remove())
    await visit.getByRole('button', { name: /Entrar al departamento/ }).click()
    await expect(visit).toHaveAttribute('data-active', 'true')
    await expect.poll(() => canvas.evaluate(element => document.pointerLockElement === element)).toBe(true)
    await settlePose(page)
    const initial = await mapPose(page)
    const initialPitch = await cameraPitch(page)
    // Headless Chromium pairs CDP absolute mouse moves with opposite recenter
    // deltas under native lock, also reproduced on a plain DIV without WebGL.
    // Keep real lock acquisition/release, then inject a known relative event to
    // verify the captured-input handler; this is not physical mouse automation.
    await canvas.evaluate(element => element.dispatchEvent(new MouseEvent('mousemove', {
      movementX: 120, movementY: 30, bubbles: true,
    })))
    await rendered.poll(async () => Math.abs((await mapPose(page)).degrees - initial.degrees)).toBeGreaterThan(5)
    await rendered.poll(async () => initialPitch - await cameraPitch(page)).toBeGreaterThan(.05)
    expect(await canvas.evaluate(element => document.pointerLockElement === element)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(visit).toHaveAttribute('data-active', 'false')
    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true)
  })

  test('the furnished public reference renders at desktop and mobile widths', async ({ page }, testInfo) => {
    // Keep the full furnished site in this integration check. Software rendering
    // needs time for initial shaders and both desktop/mobile readbacks on CI.
    test.setTimeout(process.env.CI ? 480_000 : 90_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Denied for fallback coverage', 'NotAllowedError'))
    })
    await page.goto('/#walkthrough')
    const rejectAnalytics = page.getByRole('button', { name: 'Rechazar analytics', exact: true })
    if (await rejectAnalytics.isVisible()) await rejectAnalytics.click()
    const visit = page.getByTestId('walkthrough')
    await expect(visit.locator('canvas')).toBeVisible({ timeout: 30_000 })
    await visit.getByRole('combobox', { name: 'Punto de inicio', exact: true }).selectOption('living')
    await page.waitForLoadState('networkidle')
    await visit.getByRole('button', { name: /Entrar al departamento/ }).click()
    await expect(visit).toHaveAttribute('data-active', 'true')
    await expect(page.locator('.walk-map > g')).toHaveCount(1, { timeout: 30_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const desktop = '/tmp/t3-walkthrough-preview.png'
    await visit.screenshot({ path: desktop })
    await testInfo.attach('public-living-room', { path: desktop, contentType: 'image/png' })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(visit).toHaveAttribute('data-active', 'false')
    await expect(visit.getByRole('button', { name: /Continuar recorrido/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const mobile = '/tmp/t3-walkthrough-mobile.png'
    await visit.screenshot({ path: mobile })
    await testInfo.attach('public-mobile', { path: mobile, contentType: 'image/png' })
    expect(errors).toEqual([])
  })
})
