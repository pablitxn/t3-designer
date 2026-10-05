import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSolarControls } from './viewer-helpers'

test.use({ locale: 'es-AR', viewport: { width: 1440, height: 1000 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } })

async function settledPosition(label: Locator) {
  let previous: { x: number; y: number } | undefined
  let stableSamples = 0
  await expect.poll(async () => {
    const position = await label.boundingBox()
    if (!position) return false
    stableSamples = previous && Math.hypot(position.x - previous.x, position.y - previous.y) < .1 ? stableSamples + 1 : 0
    previous = position
    return stableSamples >= 2
  }, { intervals: [250], timeout: 20_000 }).toBe(true)
  return previous!
}

async function solarMeshes(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/node_modules/.vite/deps/@react-three_fiber.js'
    const { _roots } = await import(modulePath) as typeof import('@react-three/fiber')
    const canvas = document.querySelector<HTMLCanvasElement>('.building-scene-surface canvas')!
    const group = _roots.get(canvas)?.store.getState().scene.getObjectByName('building-rooftop-solar')
    return group?.children.map(child => {
      const mesh = child as import('three').InstancedMesh
      return { count: mesh.count, heights: Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 13]) }
    }) ?? []
  })
}

test('solar panel visibility preserves the orbited camera and energy study', { tag: '@webgl' }, async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#building')
  const canvas = page.locator('.building-scene-surface canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  await page.evaluate(async () => {
    const modulePath = '/node_modules/.vite/deps/@react-three_fiber.js'
    const { _roots } = await import(modulePath) as typeof import('@react-three/fiber')
    const canvas = document.querySelector<HTMLCanvasElement>('.building-scene-surface canvas')!
    const state = _roots.get(canvas)!.store.getState()
    // Test actual scene geometry/camera while avoiding expensive 4096px software
    // shadow passes and many inertial frames for each simulated pointer move.
    state.gl.shadowMap.enabled = false
    state.setDpr(.5)
    Reflect.set(state.controls!, 'enableDamping', false)
  })
  await openSolarControls(page)
  await page.getByRole('button', { name: 'Energía solar', exact: true }).click()
  await page.locator('.studio-solar-controls > summary').click()
  await page.locator('#solar-date').fill('2026-06-21')
  await page.locator('#solar-time').fill('14:00')
  const summary = page.locator('.building-energy-intro dl')
  const before = await summary.innerText()
  const installedPanels = Number((await summary.locator('dd').first().innerText()).match(/\d+/)![0])
  expect(installedPanels).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  const panels = page.locator('.building-layers').getByRole('checkbox', { name: 'Paneles solares', exact: true })
  await expect(panels).not.toBeChecked()
  expect(await solarMeshes(page)).toEqual([])
  const label = page.locator('.building-labels-overlay .building-model-label').first()
  await expect(label).toBeVisible()
  const initial = await settledPosition(label)
  const scene = (await canvas.boundingBox())!
  await page.mouse.move(scene.x + scene.width * .3, scene.y + scene.height * .5)
  await page.mouse.down()
  await page.mouse.move(scene.x + scene.width * .3 + 100, scene.y + scene.height * .5 + 45)
  await page.mouse.up()
  const orbited = await settledPosition(label)
  expect(Math.hypot(orbited.x - initial.x, orbited.y - initial.y)).toBeGreaterThan(2)
  for (const visible of [true, false, true]) {
    await panels.setChecked(visible)
    const meshes = await solarMeshes(page)
    if (visible) {
      expect(meshes.map(mesh => mesh.count)).toEqual([installedPanels * 4, installedPanels, installedPanels])
      expect(meshes.every(mesh => mesh.heights.every(height => height > 1))).toBe(true)
    } else expect(meshes).toEqual([])
    const current = await settledPosition(label)
    expect(Math.hypot(current.x - orbited.x, current.y - orbited.y)).toBeLessThan(1)
  }
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Energía solar', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(summary).toHaveText(before, { useInnerText: true })
  const directory = fileURLToPath(new URL('../../../artifacts/solar/', import.meta.url))
  await mkdir(directory, { recursive: true })
  await page.locator('.building-workspace').screenshot({ path: `${directory}/roof.png`, animations: 'disabled' })
  await page.getByRole('tab', { name: 'Año', exact: true }).click()
  await page.locator('.building-energy-study').screenshot({ path: `${directory}/annual-study.png`, animations: 'disabled' })
  expect(errors).toEqual([])
})
