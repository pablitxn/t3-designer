import { expect, test } from '@playwright/test'
import type { FoundationOfficialResearch } from '@t3-designer/scene-schema'
import { foundationAgentFixture, projectPath } from './foundation-agent-fixture'

test.use({ locale: 'es-AR' })
function research(): FoundationOfficialResearch {
  return { countryCode: 'AR', jurisdiction: 'Córdoba', summary: 'Dos parcelas obtenidas de la consulta sintética; falta confirmar la referencia.',
    sources: [{ title: 'Registro catastral de prueba', url: 'https://catastro.example.test/parcels', kind: 'official', claims: ['Contornos parcelarios de prueba, sin huella ni altura de edificios.'], retrievedAt: '2026-10-08' }],
    unknowns: ['La ubicación es aproximada y no acredita cuál es tu parcela.', 'Faltan la huella y altura del edificio.'],
    geocode: { label: 'Calle del Parque 100, Córdoba', longitude: -64.18, latitude: -31.42, provider: 'Georef', precision: 'approximate', recordId: 'address-100' },
    parcels: [
      { id: '123', label: 'Parcela con patio', area: 72, areaBasis: 'published', footprint: [[0, 0], [8, 0], [8, 10], [0, 10]], holes: [[[2, 2], [4, 2], [4, 6], [2, 6]]], sourceUrl: 'https://catastro.example.test/parcels', provider: 'Catastro de prueba', sourceDate: '2026-10-01', attribution: 'Datos sintéticos para verificación de interfaz.' },
      { id: '124', label: 'Parcela vecina', area: 50, areaBasis: 'calculated', footprint: [[8, 0], [13, 0], [13, 10], [8, 10]], sourceUrl: 'https://catastro.example.test/parcels', provider: 'Catastro de prueba', sourceDate: null, attribution: 'Datos sintéticos para verificación de interfaz.' },
    ], selectedParcelId: null, selectionEvidence: null }
}

test('partial official research shows exact parcel holes and sources without a candidate, and visual inspection never confirms or accepts it', async ({ page }) => {
  const server = await foundationAgentFixture(page), run = server.seedRun('building'), version = server.complete('building', true)
  version.officialResearch = research(); version.questions = ['Confirmá la referencia catastral de la parcela.']; run.officialResearch = version.officialResearch
  await page.goto(projectPath)
  const workshop = page.getByTestId('foundation-agent-building'), card = workshop.getByTestId('official-research')
  await expect(card.getByRole('heading', { name: 'Investigación catastral oficial' })).toBeVisible()
  await expect(card.getByText('Parcela pendiente de confirmar', { exact: true })).toBeVisible()
  await expect(card.getByText(/Ubicación aproximada de la dirección; no identifica una parcela/)).toBeVisible()
  await expect(card.getByText('Superficie publicada', { exact: true })).toBeVisible()
  const parcel = card.locator('path[data-parcel-id="123"]')
  await expect(parcel).toHaveAttribute('fill-rule', 'evenodd')
  expect((await parcel.getAttribute('d'))?.match(/M/g)).toHaveLength(2)
  await card.getByLabel('Inspeccionar una parcela', { exact: true }).selectOption('124')
  await expect(card.locator('path[data-parcel-id="124"]')).toHaveAttribute('data-inspected', 'true')
  await expect(card.getByText('Superficie calculada del contorno', { exact: true })).toBeVisible()
  await expect(card.getByText('Fecha de la fuente no especificada', { exact: true })).toBeVisible()
  await card.getByText('Fuentes consultadas (1)', { exact: true }).click()
  await expect(card.getByRole('link', { name: /Registro catastral de prueba/ })).toHaveAttribute('href', 'https://catastro.example.test/parcels')
  await card.getByText('Información faltante y límites (2)', { exact: true }).click()
  await expect(card.getByText('Faltan la huella y altura del edificio.', { exact: true })).toBeVisible()
  await expect(workshop.getByRole('button', { name: 'Usar esta versión', exact: true })).toHaveCount(0)
  expect(server.accepts).toHaveLength(0); expect(server.writes).toHaveLength(0)
  expect(version.officialResearch.selectedParcelId).toBeNull()
  await workshop.getByLabel('Tu respuesta', { exact: true }).fill('La referencia que quiero consultar es 124.')
  await expect(workshop.getByRole('button', { name: /Continuar/ })).toBeEnabled()
  await page.getByLabel('Referencia catastral (opcional)', { exact: true }).fill('124')
  await expect(workshop.getByRole('button', { name: /Continuar/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Cambios guardados.', { exact: true })).toBeVisible()
  await expect(workshop.getByRole('button', { name: /Continuar/ })).toBeEnabled()
  expect(server.writes[0]).toMatchObject({ revision: 1, foundations: { building: { cadastralReference: '124' } } })
  await page.reload()
  await expect(page.getByLabel('Referencia catastral (opcional)', { exact: true })).toHaveValue('124')
  await expect(card.getByText('Parcela pendiente de confirmar', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('research is visible during acquisition and accepted research survives a project without agent history', async ({ page }) => {
  const server = await foundationAgentFixture(page), value = research(), run = server.seedRun('building')
  run.officialResearch = value
  await page.goto(projectPath)
  await expect(page.getByTestId('foundation-agent-building').getByTestId('official-research')).toBeVisible()
  run.status = 'cancelled'; delete run.officialResearch
  server.makeReady(); value.selectedParcelId = '123'; value.selectionEvidence = 'Referencia indicada por el usuario y recuperada del servicio.'
  server.setAcceptedResearch(value)
  // A copied project can retain accepted research without the original run history.
  await page.route('**/foundation-agent', route => route.fulfill({ json: { runs: [], versions: [] } }))
  await page.reload()
  await page.locator('summary').filter({ hasText: /^Agentes de vivienda y edificio$/ }).click()
  const card = page.getByTestId('foundation-agent-building').getByTestId('official-research')
  await expect(card.getByText('Referencia de parcela registrada: 123', { exact: true })).toBeVisible()
  await expect(card.getByText(value.selectionEvidence, { exact: true })).toBeVisible()
  await expect(card.getByText('Superficie publicada', { exact: true })).toBeVisible()
})
