import { expect, test } from '@playwright/test'
import { openApartmentDetails, openSolarControls } from './viewer-helpers'
import { openSettings, closeSettings } from './settings-helpers'

test('every room, apartment layer and bundled asset detail remains accessible', async ({ page }) => {
  await page.goto('/#apartment'); await openApartmentDetails(page)
  const layers = page.locator('.apartment-viewer-layers input')
  await expect(layers).toHaveCount(4)
  for (const layer of await layers.all()) {
    const original = await layer.isChecked()
    await layer.setChecked(!original); await expect(layer).toBeChecked({ checked: !original })
    await layer.setChecked(original)
  }
  await page.locator('.inspector-tabs button').first().click()
  const rooms = page.locator('.room-navigation button')
  await expect(rooms).toHaveCount(8)
  for (const room of await rooms.all()) { await room.click(); await expect(room).toHaveClass(/selected/) }
  await page.locator('.room-nav.overview').click(); await expect(page.locator('.room-navigation .selected')).toHaveCount(0)
  await page.locator('.inspector-tabs button').last().click()
  const assets = page.locator('.asset-list button')
  expect(await assets.count()).toBeGreaterThan(3)
  for (const asset of await assets.all()) {
    await asset.click(); await expect(asset).toHaveClass(/selected/)
    const details = page.locator('.asset-details')
    await expect(details.locator('h2')).not.toHaveText('')
    await expect(details.locator('a[download]')).toHaveAttribute('href', /\.glb$/)
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.asset-details a[download]').click()])
  expect(await download.failure()).toBeNull()
  await page.keyboard.press('Escape')
  await page.locator('.workspace-switcher button').nth(3).click()
  await page.locator('.workspace-switcher button').first().click(); await openApartmentDetails(page)
  await expect(page.locator('.inspector-tabs button').last()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.asset-list .selected')).toHaveCount(1)
})

test('building layers, cuts, location and entry controls keep their UI state', async ({ page }) => {
  await page.goto('/#building')
  for (const layer of await page.locator('.building-layers input').all()) {
    const original = await layer.isChecked(); await layer.setChecked(!original)
    await expect(layer).toBeChecked({ checked: !original }); await layer.setChecked(original)
  }
  await openSolarControls(page)
  for (const cut of await page.locator('.building-section-options button').all()) {
    await cut.click(); await expect(cut).toHaveAttribute('aria-pressed', 'true')
  }
  await page.locator('.apartment-locate').click(); await expect(page.locator('.apartment-locate')).toHaveAttribute('aria-pressed', 'false')
  await page.locator('.apartment-locate').click(); await expect(page.locator('.apartment-locate')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.apartment-enter').click(); await expect(page).toHaveURL(/#apartment$/)
  await openSolarControls(page); await expect(page.locator('#solar-time')).toBeVisible()
})

test('all thirteen source records close accessibly; print action and print media show the selected section', async ({ page }, info) => {
  await page.goto('/#documentation'); await page.locator('.dossier-sidebar nav button').last().click()
  const sources = page.locator('.dossier-source-card')
  await expect(sources).toHaveCount(13)
  for (const source of await sources.all()) {
    await source.click(); const dialog = page.locator('.dossier-dialog')
    await expect(dialog).toBeVisible(); await expect(dialog.locator('h2')).not.toHaveText('')
    await expect(dialog).not.toContainText(/\{\{|ui\./)
    for (const link of await dialog.locator('a').all()) await expect(link).toHaveAttribute('href', /^(\/dossier\/|https:\/\/)/)
    await page.keyboard.press('Escape'); await expect(source).toBeFocused()
  }
  await page.evaluate(() => {
    Reflect.set(window, '__qaPrints', 0)
    window.print = () => { Reflect.set(window, '__qaPrints', Reflect.get(window, '__qaPrints') + 1) }
  })
  await page.locator('.dossier-sidebar nav button').nth(1).click()
  if (await page.locator('.dossier-print').isVisible()) {
    await page.locator('.dossier-print').click()
    expect(await page.evaluate(() => Reflect.get(window, '__qaPrints'))).toBe(1)
  } else {
    // The current mobile design offers browser printing rather than this button.
    expect(page.viewportSize()!.width).toBeLessThanOrEqual(760)
  }
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.dossier-surfaces')).toBeVisible()
  await expect(page.locator('.workspace-switcher')).not.toBeVisible()
  const path = info.outputPath('dossier-print.png')
  await page.screenshot({ path, fullPage: true }); await info.attach('print-media', { path, contentType: 'image/png' })
})

test('corrupt layout is recovered and an unrelated preference survives reset', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('t3-designer.demo-layout.v1', '{'); localStorage.setItem('qa-unrelated', 'keep') })
  await page.goto('/#apartment'); await page.getByRole('button', { name: 'Rearrange furniture', exact: true }).click()
  await expect(page.locator('.apartment-furniture-panel').getByRole('status')).toContainText('recovered')
  await page.getByRole('button', { name: 'Restore original layout', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('t3-designer.demo-layout.v1'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('qa-unrelated'))).toBe('keep')
})

test('energy storage failures keep the draft usable and display an unsaved status', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 't3-designer.building-energy.v1') throw new DOMException('QA quota exceeded', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })
  await page.goto('/#building'); await openSolarControls(page)
  await page.getByRole('button', { name: 'Solar energy', exact: true }).click()
  await page.getByRole('tab', { name: 'Panels', exact: true }).click()
  const count = page.getByLabel(/^Number of panels/)
  await count.fill('4'); await count.press('Tab')
  await page.getByRole('button', { name: 'Save scenario in this browser', exact: true }).click()
  await expect(page.locator('.building-energy-savebar').getByRole('status')).toContainText('could not be saved')
  await expect(count).toHaveValue('4')
  expect(await page.evaluate(() => localStorage.getItem('t3-designer.building-energy.v1'))).toBeNull()
  const settings = await openSettings(page)
  await settings.getByRole('combobox', { name: 'Measurement units', exact: true }).selectOption('imperial')
  await closeSettings(page); await expect(count).toHaveValue('4')
})

test('walkthrough sliders have accessible names and accept keyboard changes', async ({ page }, info) => {
  await page.goto('/#walkthrough')
  await page.getByRole('button', { name: 'Set up your visit', exact: true }).click()
  const settings = page.locator('#walk-settings')
  for (const [label, value] of [['Eye height', '1.7'], ['Field of view', '71'], ['Mouse sensitivity', '1.1']]) {
    const slider = settings.getByRole('slider', { name: new RegExp(`^${label}`) })
    await expect(slider).toBeVisible()
    await slider.press('ArrowRight'); await expect(slider).toHaveValue(value)
  }
  const path = info.outputPath('walkthrough-settings.png')
  await page.screenshot({ path, fullPage: true }); await info.attach('walkthrough-settings', { path, contentType: 'image/png' })
})
