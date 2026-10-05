import { expect, test, type Page } from '@playwright/test'
import { arrangementCard, arrangementPresence, selectArrangementObject } from './arrangement-helpers'

test.use({ locale: 'es-AR', viewport: { width: 1284, height: 926 } })

const storageKey = 't3-designer.demo-layout.v1'
const left = 'Girar 90° a la izquierda'
const right = 'Girar 90° a la derecha'

async function openArrangement(page: Page) {
  await page.goto('/#apartment')
  await page.getByRole('button', { name: 'Reacomodar muebles', exact: true }).click()
}

async function tableRotation(page: Page) {
  return page.evaluate(key => {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value).placements.find((item: { id: string }) => item.id === 'living-table')?.rotation ?? 0) as number : 0
  }, storageKey)
}

test('selected furniture rotates with its panel closed, persists and supports undo and redo', async ({ page }) => {
  await openArrangement(page)
  const surface = await page.locator('.scene-surface').elementHandle()
  await expect(page.getByRole('button', { name: left, exact: true })).toHaveCount(0)
  await selectArrangementObject(page, 'living-table')
  await expect(page.locator('.arrangement-selection-name')).toContainText('Mesa')
  const [bar, panel] = await Promise.all([page.locator('.arrangement-selection-toolbar').boundingBox(), page.locator('.apartment-furniture-panel').boundingBox()])
  expect(panel!.y + panel!.height).toBeLessThan(bar!.y)
  await page.keyboard.press('Escape')
  await expect(page.locator('.apartment-furniture-panel')).toHaveCount(0)
  await page.getByRole('button', { name: left, exact: true }).click()
  expect(await tableRotation(page)).toBeCloseTo(Math.PI / 2)
  await page.getByRole('button', { name: right, exact: true }).click()
  expect(await tableRotation(page)).toBe(0)
  await page.getByRole('button', { name: right, exact: true }).click()
  expect(await tableRotation(page)).toBeCloseTo(Math.PI * 1.5)
  expect(await surface!.evaluate(element => element.isConnected)).toBe(true)
  await page.getByRole('button', { name: 'Reacomodar muebles', exact: true }).click()
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  expect(await tableRotation(page)).toBe(0)
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  expect(await tableRotation(page)).toBeCloseTo(Math.PI * 1.5)
  await page.reload()
  await page.getByRole('button', { name: 'Reacomodar muebles', exact: true }).click()
  await selectArrangementObject(page, 'living-table')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: left, exact: true }).click()
  expect(await tableRotation(page)).toBe(0)
})

test('rotation controls hide for fixed, absent and non-editing selections and fit a narrow viewer', async ({ page }) => {
  await page.setViewportSize({ width: 605, height: 926 })
  await openArrangement(page)
  await selectArrangementObject(page, 'wc-toilet')
  await expect(page.locator('.arrangement-selection-toolbar')).toHaveCount(0)
  await selectArrangementObject(page, 'demo-strandmon-v1')
  const toolbar = page.locator('.arrangement-selection-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(toolbar).toContainText('STRANDMON')
  const [bar, panel, viewer] = await Promise.all([toolbar.boundingBox(), page.locator('.apartment-furniture-panel').boundingBox(), page.locator('.apartment-viewer').boundingBox()])
  expect(bar!.x).toBeGreaterThanOrEqual(viewer!.x)
  expect(bar!.x + bar!.width).toBeLessThanOrEqual(viewer!.x + viewer!.width)
  expect(panel!.y + panel!.height).toBeLessThan(bar!.y)
  await page.screenshot({ path: '/tmp/t3-arrangement-rotation-605.png', fullPage: true })
  await arrangementPresence(page, 'demo-strandmon-v1').uncheck()
  await expect(toolbar).toHaveCount(0)
  await selectArrangementObject(page, 'living-table')
  await page.getByRole('button', { name: 'Fecha y recorrido solar', exact: true }).click()
  await expect(toolbar).toHaveCount(0)
})

test('invalid edits remain visible beside rotation controls when the catalog is closed', async ({ page }) => {
  await openArrangement(page)
  await selectArrangementObject(page, 'living-table')
  await page.keyboard.press('Escape')
  const surface = page.locator('.scene-surface')
  await surface.focus()
  await surface.press('Shift+ArrowDown')
  const valid = await page.evaluate(key => localStorage.getItem(key), storageKey)
  await surface.press('Shift+ArrowDown')
  await expect(page.locator('.apartment-furniture-panel')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('El objeto debe quedar dentro del departamento')
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(valid)
  await page.getByRole('button', { name: left, exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await tableRotation(page)).toBeCloseTo(Math.PI / 2)
})

test('catalog categories start open, collapse by keyboard and keep their choice while editing', async ({ page }) => {
  await openArrangement(page)
  const generated = page.locator('[data-catalog-source="generated"]')
  const apartment = page.locator('[data-catalog-source="apartment"]')
  await expect(generated).toHaveJSProperty('open', true)
  await expect(apartment).toHaveJSProperty('open', true)
  await expect(generated.locator('.arrangement-catalog-count')).toHaveText('3')
  await expect(apartment.locator('.arrangement-catalog-count')).toHaveText('21')
  await generated.locator('summary').focus()
  await generated.locator('summary').press('Enter')
  await expect(generated).toHaveJSProperty('open', false)
  await expect(arrangementCard(page, 'demo-strandmon-v1')).toBeHidden()
  await selectArrangementObject(page, 'living-table')
  await page.getByRole('button', { name: left, exact: true }).click()
  await expect(generated).toHaveJSProperty('open', false)
  await apartment.locator('summary').focus()
  await apartment.locator('summary').press('r')
  expect(await tableRotation(page)).toBeCloseTo(Math.PI / 2)
  await apartment.locator('summary').press('Space')
  await expect(apartment).toHaveJSProperty('open', false)
  await expect(arrangementCard(page, 'living-table')).toBeHidden()
  await generated.locator('summary').focus()
  await generated.locator('summary').press('Enter')
  await expect(generated).toHaveJSProperty('open', true)
  await expect(arrangementCard(page, 'demo-strandmon-v1')).toBeVisible()
})
