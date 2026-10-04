import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'es-AR' })
const key = 't3-designer.demo-layout.v1'

async function openArrangement(page: Page) {
  await page.goto('/#apartment')
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await expect(page.getByRole('heading', { name: 'Tu distribución de la demo' })).toBeVisible()
}

test('public layout persists across reload, navigation and reset without touching private APIs or preferences', async ({ page }) => {
  const privateRequests: string[] = []
  await page.route('**/api/**', route => { privateRequests.push(route.request().url()); return route.fulfill({ status: 401, json: { error: 'Unauthorized' } }) })
  await openArrangement(page)
  await page.evaluate(() => localStorage.setItem('unrelated-preference', 'keep'))
  await page.getByLabel('Objetos del departamento').selectOption('living-table')
  const x = page.getByLabel('Posición X (m)', { exact: true })
  const original = Number(await x.inputValue()), moved = String(Number((original - .3).toFixed(3)))
  await x.fill(moved); await x.press('Enter')
  await expect(x).toHaveValue(moved)
  await expect(page.getByRole('region', { name: 'Tu distribución de la demo' }).getByRole('status')).toContainText('Distribución guardada en este navegador')
  await page.getByRole('button', { name: 'Girar 90°' }).click()
  await expect(page.getByLabel('Giro (°)')).toHaveValue('90')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByLabel('Giro (°)')).toHaveValue('0')
  await page.getByRole('button', { name: 'Rehacer' }).click()
  await expect(page.getByLabel('Giro (°)')).toHaveValue('90')
  await page.getByRole('button', { name: 'Objetos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Objetos con historia.' })).toBeVisible()
  await page.getByRole('button', { name: 'Departamento', exact: true }).click()
  await page.getByLabel('Objetos del departamento').selectOption('living-table')
  await expect(x).toHaveValue(moved)
  await page.reload()
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await page.getByLabel('Objetos del departamento').selectOption('living-table')
  await expect(x).toHaveValue(moved)
  await expect(page.getByLabel('Giro (°)')).toHaveValue('90')
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  await expect(x).toHaveValue(String(original))
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep')
  expect(privateRequests).toEqual([])
})

test('fixed installations stay locked; invalid furniture positions are rejected and keyboard movement works', async ({ page }) => {
  await openArrangement(page)
  await page.getByLabel('Objetos del departamento').selectOption('wc-toilet')
  await expect(page.getByLabel('Posición X (m)', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('Giro (°)')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Girar 90°' })).toBeDisabled()
  await expect(page.getByText('Esta instalación forma parte del departamento y conserva su posición.')).toBeVisible()
  await page.getByLabel('Objetos del departamento').selectOption('k-fridge')
  const x = page.getByLabel('Posición X (m)', { exact: true })
  const original = await x.inputValue()
  await x.fill('999'); await x.press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(x).toHaveValue(original)
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  const viewport = page.getByLabel('Arrastrá un mueble para moverlo; arrastrá el fondo para cambiar la vista. Rueda para acercar.', { exact: true })
  await viewport.focus(); await viewport.press('ArrowLeft')
  await expect(x).toHaveValue(String(Number((Number(original) - .1).toFixed(3))))
  await viewport.press('r')
  await expect(page.getByLabel('Giro (°)')).toHaveValue('270')
})

test('blocked storage remains usable with an honest unsaved status', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 't3-designer.demo-layout.v1') throw new DOMException('Quota exceeded', 'QuotaExceededError')
      setItem.call(this, key, value)
    }
  })
  await openArrangement(page)
  await page.getByLabel('Objetos del departamento').selectOption('living-table')
  await page.getByRole('button', { name: 'Girar 90°' }).click()
  await expect(page.getByLabel('Giro (°)')).toHaveValue('90')
  await expect(page.getByRole('region', { name: 'Tu distribución de la demo' }).getByRole('status')).toContainText('No se pudo guardar en este navegador')
})

test('two tabs synchronize edits and reset; mobile controls fit the viewport', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openArrangement(page)
  const other = await context.newPage()
  await openArrangement(other)
  await page.getByLabel('Objetos del departamento').selectOption('living-table')
  await other.getByLabel('Objetos del departamento').selectOption('living-table')
  await page.getByRole('button', { name: 'Girar 90°' }).click()
  await expect(other.getByLabel('Giro (°)')).toHaveValue('90')
  await other.getByRole('button', { name: 'Restaurar distribución original' }).click()
  await expect(page.getByLabel('Giro (°)')).toHaveValue('0')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
