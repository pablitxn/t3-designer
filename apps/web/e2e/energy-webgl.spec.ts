import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

test.use({ locale: 'es-AR', viewport: { width: 1440, height: 1000 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } })

test('solar panels render on the building roof and their visibility does not alter energy', { tag: '@webgl' }, async ({ page }) => {
  test.setTimeout(process.env.CI ? 120_000 : 60_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/#building')
  await page.getByRole('button', { name: 'Energía solar', exact: true }).click()
  await page.locator('#solar-date').fill('2026-06-21')
  await page.locator('#solar-time').fill('14:00')
  const canvas = page.locator('.building-scene-surface canvas')
  await expect(canvas).toBeVisible()
  expect(await canvas.evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
  const panels = page.getByRole('checkbox', { name: 'Paneles solares', exact: true })
  await expect(panels).toBeChecked()
  const summary = page.locator('.building-energy-intro dl')
  const before = await summary.innerText()
  await panels.uncheck()
  await expect(summary).toHaveText(before, { useInnerText: true })
  await panels.check()
  await expect(page.locator('.building-labels-overlay .building-model-label').first()).toBeVisible()
  const directory = fileURLToPath(new URL('../../../artifacts/solar/', import.meta.url))
  await mkdir(directory, { recursive: true })
  await page.locator('.building-workspace').screenshot({ path: `${directory}/roof.png`, animations: 'disabled' })
  await page.getByRole('tab', { name: 'Año', exact: true }).click()
  await page.locator('.building-energy-study').screenshot({ path: `${directory}/annual-study.png`, animations: 'disabled' })
  expect(errors).toEqual([])
})
