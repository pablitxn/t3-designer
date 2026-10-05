import { expect, test, type Page } from '@playwright/test'
import { currentFixtures } from '../src/data/current-state'
import { closeSettings, openSettings } from './settings-helpers'
import { arrangementCard, arrangementPresence, selectArrangementObject } from './arrangement-helpers'

test.use({ locale: 'es-AR' })
const key = 't3-designer.demo-layout.v1'
const table = currentFixtures.find(fixture => fixture.id === 'living-table')!

async function openArrangement(page: Page) {
  await page.goto('/#apartment')
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await expect(page.getByRole('dialog', { name: 'Tu distribución de la demo' })).toBeVisible()
}

async function move(page: Page, ...keys: string[]) {
  const viewport = page.locator('.scene-surface')
  await viewport.focus()
  for (const key of keys) await viewport.press(key)
}

async function placement(page: Page, id = table.id) {
  return page.evaluate(({ key, id }) => {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved).placements.find((item: { id: string }) => item.id === id) ?? null : null
  }, { key, id }) as Promise<{ position: number[]; rotation: number } | null>
}

test('public layout persists across reload, navigation and reset without touching private APIs or preferences', async ({ page }) => {
  const privateRequests: string[] = []
  await page.route('**/api/**', route => { privateRequests.push(route.request().url()); return route.fulfill({ status: 401, json: { error: 'Unauthorized' } }) })
  await openArrangement(page)
  await page.evaluate(() => localStorage.setItem('unrelated-preference', 'keep'))
  await selectArrangementObject(page, table.id)
  await move(page, 'ArrowLeft', 'ArrowLeft', 'ArrowLeft')
  expect((await placement(page))!.position[0]).toBeCloseTo(table.position[0] - .3, 4)
  await move(page, 'r')
  expect((await placement(page))!.rotation).toBeCloseTo(Math.PI / 2)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  expect((await placement(page))!.rotation).toBe(0)
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  expect((await placement(page))!.rotation).toBeCloseTo(Math.PI / 2)
  await page.getByRole('button', { name: 'Objetos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Objetos con historia.' })).toBeVisible()
  await page.getByRole('button', { name: 'Departamento', exact: true }).click()
  await selectArrangementObject(page, table.id)
  await move(page, 'ArrowLeft')
  expect((await placement(page))!.position[0]).toBeCloseTo(table.position[0] - .4, 4)
  expect((await placement(page))!.rotation).toBeCloseTo(Math.PI / 2)
  await page.reload()
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await selectArrangementObject(page, table.id)
  // A further edit verifies that the restored scene, not only storage, kept both transforms.
  await move(page, 'r')
  expect((await placement(page))!.position[0]).toBeCloseTo(table.position[0] - .4, 4)
  expect((await placement(page))!.rotation).toBeCloseTo(Math.PI)
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  expect(await placement(page)).toBeNull()
  await move(page, 'r')
  expect((await placement(page))!.position).toEqual(table.position)
  expect((await placement(page))!.rotation).toBeCloseTo(Math.PI / 2)
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep')
  expect(privateRequests).toEqual([])
})

test('the visual catalog adds generated furniture and synchronizes presence, history and reset', async ({ page, context }) => {
  const generated = ['demo-strandmon-v1', 'demo-dyvlinge-v2', 'demo-fagelfjallet-v1']
  const original = 'b-washer'
  const savedLayout = (tab: Page) => tab.evaluate(key => {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as { version: number; hidden: string[]; added: string[]; placements: unknown[] } : null
  }, key)
  const expectPresence = async (tab: Page) => {
    for (const id of generated) await expect(arrangementPresence(tab, id)).toBeChecked()
    await expect(arrangementPresence(tab, original)).not.toBeChecked()
  }

  await openArrangement(page)
  const cards = page.locator('.arrangement-catalog-card')
  await expect(cards).toHaveCount(currentFixtures.length + generated.length)
  const previews = await cards.evaluateAll(items => items.map(item => ({ id: item.getAttribute('data-fixture-id')!, src: item.querySelector('img')?.getAttribute('src') })))
  expect(previews.map(item => item.id).sort()).toEqual([...currentFixtures.map(fixture => fixture.id), ...generated].sort())
  for (const fixture of currentFixtures) {
    expect(previews.find(item => item.id === fixture.id)?.src).toBe(`/models/current/previews/${fixture.assetId}.png`)
  }
  for (const id of generated) {
    const card = arrangementCard(page, id)
    await expect(card.locator('img')).toHaveAttribute('src', `/demo-assets/${id.slice('demo-'.length)}/preview.png`)
    await expect(card.locator('.arrangement-catalog-draft')).toBeVisible()
    await expect(arrangementPresence(page, id)).not.toBeChecked()
    await arrangementPresence(page, id).check()
    await selectArrangementObject(page, id)
  }
  await arrangementPresence(page, original).uncheck()
  await expectPresence(page)
  const added = await savedLayout(page)
  expect(added).toMatchObject({ version: 2, hidden: [original], placements: [] })
  expect([...added!.added].sort()).toEqual([...generated].sort())

  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(arrangementPresence(page, original)).toBeChecked()
  expect((await savedLayout(page))!.hidden).toEqual([])
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  await expectPresence(page)
  const other = await context.newPage()
  await openArrangement(other)
  await expectPresence(other)

  await page.getByRole('button', { name: 'Objetos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Objetos con historia.' })).toBeVisible()
  await page.getByRole('button', { name: 'Departamento', exact: true }).click()
  await expectPresence(page)
  await page.reload()
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await expectPresence(page)
  expect(await savedLayout(page)).toEqual(added)

  // A presence change in another tab must update the already mounted catalog.
  await arrangementPresence(other, generated[0]).uncheck()
  await expect(arrangementPresence(page, generated[0])).not.toBeChecked()
  await other.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(arrangementPresence(page, generated[0])).toBeChecked()
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  expect(await savedLayout(page)).toBeNull()
  for (const tab of [page, other]) {
    for (const id of generated) await expect(arrangementPresence(tab, id)).not.toBeChecked()
    await expect(arrangementPresence(tab, original)).toBeChecked()
  }
})

test('fixed installations stay locked; invalid furniture positions are rejected and keyboard movement works', async ({ page }) => {
  await openArrangement(page)
  await selectArrangementObject(page, 'wc-toilet')
  await move(page, 'ArrowLeft', 'r')
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled()
  await selectArrangementObject(page, table.id)
  await move(page, 'Shift+ArrowDown')
  const valid = await placement(page)
  expect(valid!.position[2]).toBeCloseTo(table.position[2] + .5, 4)
  await move(page, 'Shift+ArrowDown')
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await placement(page)).toEqual(valid)
  await page.getByRole('button', { name: 'Restaurar distribución original' }).click()
  await selectArrangementObject(page, 'k-fridge')
  await move(page, 'ArrowLeft', 'r')
  const fridge = await placement(page, 'k-fridge')
  expect(fridge!.position[0]).toBeCloseTo(currentFixtures.find(fixture => fixture.id === 'k-fridge')!.position[0] - .1, 4)
  expect(fridge!.rotation).toBeCloseTo(Math.PI * 1.5)
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
  await selectArrangementObject(page, table.id)
  await move(page, 'r')
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeEnabled()
  await expect(page.getByRole('dialog', { name: 'Tu distribución de la demo' }).getByRole('status')).toContainText('No se pudo guardar en este navegador')
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rehacer', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Tu distribución de la demo' }).getByRole('status')).toContainText('No se pudo guardar en este navegador')
  await page.reload()
  await page.getByRole('button', { name: 'Reacomodar muebles' }).click()
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled()
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
})

test('two tabs synchronize edits and reset; mobile controls fit the viewport', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openArrangement(page)
  const other = await context.newPage()
  await openArrangement(other)
  await selectArrangementObject(page, table.id)
  await selectArrangementObject(other, table.id)
  await move(page, 'r')
  // Editing in the second tab must start from the transform received through storage events.
  await move(other, 'r')
  expect((await placement(other))!.rotation).toBeCloseTo(Math.PI)
  await other.getByRole('button', { name: 'Restaurar distribución original' }).click()
  await move(page, 'r')
  expect((await placement(page))!.rotation).toBeCloseTo(Math.PI / 2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('imperial preferences keep keyboard furniture moves in canonical meters', async ({ page }) => {
  await openArrangement(page)
  await selectArrangementObject(page, table.id)
  const settings = await openSettings(page)
  await settings.getByRole('combobox', { name: 'Unidades de medida', exact: true }).selectOption('imperial')
  await closeSettings(page)
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull()
  await move(page, 'ArrowLeft', 'r')
  const saved = await placement(page)
  expect(saved!.position[0]).toBeCloseTo(table.position[0] - .1, 4)
  expect(saved!.position[1]).toBe(table.position[1])
  expect(saved!.rotation).toBeCloseTo(Math.PI / 2)
})
