import { expect, test, type Page } from '@playwright/test'
import type { BillingSummary } from '../src/private/account-api'
import { creditFixture } from './credit-fixture'

test.use({ locale: 'es-AR' })
const user = { id: 'test-user', name: 'Usuario de prueba', email: 'owner@example.test', role: 'user', tier: 'standard', canInvite: false }
const billing: BillingSummary = { mode: 'disabled', currency: 'ARS', products: [{ id: 'monthly', label: 'Mensual', kind: 'subscription', credits: 500, amount: 10000, months: 1 }, { id: 'pack100', label: '100 créditos', kind: 'pack', credits: 100, amount: 3000, months: null }, { id: 'pack500', label: '500 créditos', kind: 'pack', credits: 500, amount: 12000, months: null }], subscription: null, orders: [], payments: [] }
const workshopHealth = { status: 'ok', generationEnabled: true, codex: { available: true, authenticated: true, authMode: 'api-key' }, blender: { available: true }, activeJobId: null }
async function stubWallet(page: Page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/billing') return route.fulfill({ json: billing })
    return route.fulfill({ json: { projects: [] } })
  })
}

test('standard account sees allowance expiry and credit history with disabled development payments', async ({ page }) => {
  await stubWallet(page)
  await page.goto('/app/credits')
  await expect(page.getByTestId('credit-balance')).toHaveText('100')
  await expect(page.getByText(/Los pagos están en desarrollo/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Elegir suscripción' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Comprar paquete' })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Comprar paquete' }).first()).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Invitaciones', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Movimientos de créditos' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '+100', exact: true })).toBeVisible()
  await expect(page.getByText(/Crear proyectos desde la demo, editarlos y compartirlos es gratis/)).toBeVisible()
  await page.screenshot({ path: '/tmp/t3-credit-wallet-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-credit-wallet-mobile.png', fullPage: true })
})

test('gifted premium can create and revoke capped standard invitation links without admin controls', async ({ page }) => {
  let created: unknown
  let revoked = false
  const link = { id: 'link-one', tier: 'standard', createdAt: '2026-10-04T10:00:00Z', expiresAt: '2030-10-11T10:00:00Z', maxUses: 5, uses: 0, revokedAt: null as string | null }
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { ...user, tier: 'premium', canInvite: true } } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, tier: 'premium', balance: 1000 } })
    if (path === '/api/account/invitations') return route.fulfill({ json: { invitations: [] } })
    if (path === '/api/account/invitation-links/link-one/revoke') { revoked = true; link.revokedAt = new Date().toISOString(); return route.fulfill({ json: { ok: true } }) }
    if (path === '/api/account/invitation-links' && route.request().method() === 'POST') { created = route.request().postDataJSON(); return route.fulfill({ json: { link, token: 'share-test-token' } }) }
    if (path === '/api/account/invitation-links') return route.fulfill({ json: { links: created ? [link] : [] } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } })
  })
  await page.goto('/app/users')
  await expect(page.getByRole('link', { name: 'Invitaciones', exact: true })).toBeVisible()
  await expect(page.getByLabel('Acceso de esta invitación')).toHaveCount(0)
  await expect(page.getByLabel('Máximo de cuentas')).toHaveAttribute('max', '10')
  await page.getByRole('button', { name: 'Crear enlace compartible' }).click()
  await expect(page.getByLabel('Enlace compartible de invitación')).toHaveValue(/\/invite#token=share-test-token$/)
  expect(created).toEqual({ tier: 'standard', maxUses: 5, expiresInDays: 7 })
  await page.getByRole('button', { name: 'Revocar invitación' }).click()
  await expect(page.getByText(/Revocada/)).toBeVisible()
  expect(revoked).toBe(true)
  await expect(page.getByRole('button', { name: 'Dar acceso premium' })).toHaveCount(0)
  await page.screenshot({ path: '/tmp/t3-invitations-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/t3-invitations-mobile.png', fullPage: true })
})

test('admin can grant premium and manual credits with an audited reason', async ({ page }) => {
  let tier: unknown
  let grant: { amount: number; reason: string; requestId: string } | undefined
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { ...user, role: 'admin', tier: 'premium', canInvite: true } } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/account/users/friend/tier') { tier = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }) }
    if (path === '/api/account/users/friend/credits') { grant = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }) }
    if (path === '/api/account/users') return route.fulfill({ json: { users: [{ ...user, id: 'friend', tier: tier ? 'premium' : 'standard' }] } })
    if (path === '/api/account/invitations') return route.fulfill({ json: { invitations: [] } })
    if (path === '/api/account/invitation-links') return route.fulfill({ json: { links: [] } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } })
  })
  await page.goto('/app/users')
  await page.getByRole('button', { name: 'Dar acceso premium' }).click()
  await expect(page.getByRole('button', { name: 'Pasar a cuenta estándar' })).toBeVisible()
  expect(tier).toEqual({ tier: 'premium' })
  await page.locator('summary').filter({ hasText: 'Otorgar créditos' }).click()
  await page.getByLabel('Créditos', { exact: true }).fill('80')
  await page.getByLabel('Motivo de la asignación', { exact: true }).fill('Prueba de nuevos modelos')
  await page.getByRole('button', { name: 'Otorgar créditos', exact: true }).click()
  await expect(page.getByText('Créditos otorgados.', { exact: true })).toBeVisible()
  expect(grant).toMatchObject({ amount: 80, reason: 'Prueba de nuevos modelos' })
  expect(grant?.requestId).toMatch(/^[\da-f-]{36}$/)
})

test('sandbox return parameters do not grant credits or claim a payment succeeded', async ({ page }) => {
  let checkoutCalls = 0
  await stubWallet(page)
  await page.route('**/api/billing', route => route.fulfill({ json: { ...billing, mode: 'sandbox' } }))
  await page.route('**/api/billing/checkout', route => { checkoutCalls++; return route.fulfill({ json: { orderId: 'order-test', checkoutUrl: 'https://sandbox.mercadopago.com.ar/checkout/test', mode: 'sandbox' } }) })
  await page.goto('/app/credits?status=approved&payment_id=forged')
  await expect(page.getByTestId('credit-balance')).toHaveText('100')
  await page.getByRole('button', { name: 'Comprar paquete' }).first().click()
  await expect(page.getByRole('link', { name: 'Abrir sandbox de Mercado Pago' })).toHaveAttribute('href', 'https://sandbox.mercadopago.com.ar/checkout/test')
  await expect(page.getByText(/Los créditos se agregan solo cuando se verifica el pago/)).toBeVisible()
  await expect(page.getByTestId('credit-balance')).toHaveText('100')
  expect(checkoutCalls).toBe(1)
})

test('insufficient balance prevents generation and declined cost confirmation preserves the draft', async ({ page }) => {
  let balance = 5
  let posts = 0
  let confirmation = ''
  page.on('dialog', dialog => { confirmation = dialog.message(); void dialog.dismiss() })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance } })
    if (path === '/api/health') return route.fulfill({ json: workshopHealth })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === '/api/jobs' && route.request().method() === 'POST') posts++
    return route.fulfill({ json: { jobs: [] } })
  })
  await page.goto('/app/assets')
  await page.getByLabel('Enlace del producto').fill('https://example.com/chair')
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect(page.getByRole('alert')).toContainText('No tenés créditos suficientes')
  expect(posts).toBe(0)
  expect(confirmation).toBe('')
  balance = 100
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect.poll(() => confirmation).toContain('20 créditos')
  expect(posts).toBe(0)
  await expect(page.getByLabel('Enlace del producto')).toHaveValue('https://example.com/chair')
})

test('an asset request with a lost reply recovers the original job without a new credit confirmation', async ({ page }) => {
  const keys: string[] = []
  let confirmations = 0
  page.on('dialog', dialog => { confirmations++; void dialog.accept() })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/credits') return route.fulfill({ json: { ...creditFixture, balance: keys.length ? 0 : 20 } })
    if (path === '/api/health') return route.fulfill({ json: workshopHealth })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === '/api/jobs' && route.request().method() === 'POST') {
      keys.push(route.request().headers()['idempotency-key'])
      if (keys.length === 1) return route.abort('failed')
      return route.fulfill({ json: { job: { id: 'recovered-job', status: 'queued', input: route.request().postDataJSON(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stage: 'Esperando turno', questions: [], error: null, assetId: null, warnings: [] } } })
    }
    if (path.endsWith('/events/stream')) return route.fulfill({ status: 204 })
    if (path.endsWith('/events')) return route.fulfill({ json: { events: [] } })
    return route.fulfill({ json: { jobs: [] } })
  })
  await page.goto('/app/assets')
  await page.getByLabel('Enlace del producto').fill('https://example.com/chair')
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Crear objeto 3D' }).click()
  await expect(page.getByText('Solicitud recibida. Seguí la generación en el panel de actividad.')).toBeVisible()
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  expect(confirmations).toBe(1)
})
