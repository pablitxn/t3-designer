import { creditFixture } from './credit-fixture'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { expect, test, type Page, type Request, type Route } from '@playwright/test'
import type { Job } from '@t3-designer/asset-schema'
import { ProjectSnapshotSchema } from '@t3-designer/scene-schema'
import { CONSENT_KEY as consentKey, POLICY_VERSION } from '../src/lib/analytics-policy.ts'
import { siteConfigFixture } from './site-config-fixture'

// This suite must run against the isolated production build, not Vite's dev server.
test.skip(process.env.T3_ANALYTICS_E2E !== '1', 'Run with playwright.analytics.config.ts')

const websiteId = '00000000-0000-4000-8000-000000000001'
const policyVersion = `${POLICY_VERSION}:${siteConfigFixture.privacyRevision}`
test.beforeEach(async ({ context }) => {
  await context.route('**/site-config.json', route => {
    const disabledPort = String(process.env.T3_ANALYTICS_DISABLED_E2E_PORT ?? 4176)
    return new URL(route.request().url()).port === disabledPort
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ json: siteConfigFixture })
  })
})
const trackerSource = readFileSync(new URL('./fixtures/umami-3.4.0-tracker.ts.txt', import.meta.url), 'utf8')

// Exact source: https://github.com/umami-software/umami/blob/v3.4.0/src/tracker/index.ts
// MIT license is alongside the fixture.
// Only the same two build substitutions as upstream rollup.tracker.config.js apply.
expect(createHash('sha256').update(trackerSource).digest('hex')).toBe('0684f4c6896f53695fe6c0ae1122f70f0e12e6e8a3d1ea21ad2556653525d6a7')
const tracker = stripTypeScriptTypes(trackerSource)
  .replaceAll('__COLLECT_API_HOST__', '')
  .replaceAll('__COLLECT_API_ENDPOINT__', '/api/send')

type Payload = Record<string, unknown> & { url: string; name?: string }
type CollectorRequest = { type: string; payload: Payload }
type Capture = { scripts: Request[]; posts: Request[]; payloads: CollectorRequest[] }

async function interceptAnalytics(page: Page, options: {
  script?: (route: Route) => Promise<void>
  collector?: (route: Route) => Promise<void>
} = {}): Promise<Capture> {
  const capture: Capture = { scripts: [], posts: [], payloads: [] }
  await page.route('**/umami/**', async route => {
    const request = route.request()
    if (new URL(request.url()).pathname === '/umami/script.js') {
      capture.scripts.push(request)
      if (options.script) return options.script(route)
      return route.fulfill({ contentType: 'application/javascript', body: tracker })
    }
    capture.posts.push(request)
    capture.payloads.push(request.postDataJSON() as CollectorRequest)
    if (options.collector) return options.collector(route)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cache: 'test-only-cache' }) })
  })
  return capture
}

async function preferences(page: Page) {
  await page.getByTestId('privacy-preferences').click()
  await expect(page.getByTestId('privacy-dialog')).toBeVisible()
}

async function withdraw(page: Page) {
  await preferences(page)
  await page.getByRole('button', { name: 'Withdraw permission', exact: true }).click()
}

async function idle(page: Page) {
  // Let microtasks and tracker async continuations finish before negative assertions.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

test('first visit and rejection make no analytics requests, including after reload', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#building')
  await expect(page.getByTestId('analytics-consent-banner')).toBeVisible()
  await page.screenshot({ path: '/tmp/t3-analytics-desktop-banner.png' })
  await page.getByRole('button', { name: 'Apartment', exact: true }).click()
  await expect(page.locator('#solar-date')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)

  await page.getByTestId('analytics-reject').click()
  await page.reload()
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
  await expect(page.getByTestId('privacy-preferences')).toBeVisible()
})

test('acceptance loads the real tracker once and sends only sanitized, deduplicated SPA payloads to the prefixed collector', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/?email=person@example.invalid#building', { referer: 'https://private.example.invalid/account/alice?token=secret#private' })
  await page.evaluate(() => { document.title = 'Private person@example.invalid' })
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(1)
  await page.getByRole('button', { name: 'Building and sun', exact: true }).click()
  await idle(page)
  expect(capture.payloads.filter(item => !item.payload.name)).toHaveLength(1)

  await page.getByRole('button', { name: 'Apartment', exact: true }).click()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(2)
  await expect.poll(() => capture.payloads.filter(item => item.payload.name === 'solar_opened').length).toBe(2)
  await idle(page)
  const beforeArrangement = capture.posts.length
  await page.getByRole('button', { name: 'Rearrange furniture' }).click()
  await page.getByLabel('Apartment objects').selectOption('living-table')
  const position = page.getByLabel('X position (m)', { exact: true })
  const moved = String(Number((Number(await position.inputValue()) - .3).toFixed(3)))
  await position.fill(moved)
  await position.press('Enter')
  await expect(position).toHaveValue(moved)
  await page.getByRole('button', { name: 'Rotate 90°' }).click()
  await expect(page.getByLabel('Rotation (°)')).toHaveValue('90')
  expect(await page.evaluate(() => localStorage.getItem('t3-designer.demo-layout.v1'))).toContain('living-table')
  await idle(page)
  expect(capture.posts).toHaveLength(beforeArrangement)
  expect(JSON.stringify(capture.payloads)).not.toMatch(/living-table|position|rotation|fixture|demo-layout/)
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(3)
  await idle(page)
  expect(capture.scripts).toHaveLength(1)
  expect(capture.payloads.filter(item => !item.payload.name).map(item => item.payload.url)).toEqual(['/building', '/apartment', '/documentation'])
  expect(capture.payloads.filter(item => item.payload.name === 'view_changed')).toHaveLength(2)
  expect(capture.payloads.filter(item => item.payload.name === 'dossier_opened')).toHaveLength(1)
  for (const [index, request] of capture.posts.entries()) {
    expect(new URL(request.url()).pathname).toBe('/umami/api/send')
    expect(request.method()).toBe('POST')
    expect(request.headers()['referer']).toBeUndefined()
    expect(request.headers()['cookie']).toBeUndefined()
    const body = capture.payloads[index]
    expect(body.type).toBe('event')
    expect(body.payload.website).toBe(websiteId)
    expect(JSON.stringify(body)).not.toMatch(/person@|alice|secret|private\.example|[?#]/)
    expect(body.payload).not.toHaveProperty('id')
    expect(body.payload).not.toHaveProperty('screen')
    expect(body.payload).not.toHaveProperty('language')
  }
  const script = page.locator('script[data-website-id]')
  await expect(script).toHaveAttribute('data-auto-track', 'false')
  await expect(script).toHaveAttribute('data-host-url', /\/umami$/)
  await expect(script).toHaveAttribute('referrerpolicy', 'no-referrer')
  const approvedCount = capture.posts.length
  await page.evaluate(async () => {
    const { umami } = window as unknown as { umami: { track: (value?: unknown) => Promise<void>; identify: (id: string) => Promise<void> } }
    await umami.track()
    await umami.track('arbitrary-event')
    await umami.identify('person@example.invalid')
  })
  await idle(page)
  expect(capture.posts).toHaveLength(approvedCount)
})

test('withdrawal blocks retained tracker callbacks and survives reload without losing solar inputs', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#apartment')
  await page.locator('#solar-date').fill('2026-12-21')
  await page.locator('#solar-time').fill('15:30')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.posts.length).toBeGreaterThan(0)
  await page.evaluate(() => {
    const target = window as unknown as { umami: { track: (value?: unknown) => Promise<void>; identify: (id: string) => Promise<void> }; retainedTracker?: unknown }
    target.retainedTracker = target.umami
  })
  await withdraw(page)
  const postsAtWithdrawal = capture.posts.length
  await expect(page.locator('#solar-date')).toHaveValue('2026-12-21')
  await expect(page.locator('#solar-time')).toHaveValue('15:30')
  await page.evaluate(async () => {
    const target = window as unknown as { retainedTracker: { track: (value?: unknown) => Promise<void>; identify: (id: string) => Promise<void> } }
    await target.retainedTracker.track()
    await target.retainedTracker.track('unapproved-event')
    await target.retainedTracker.identify('person@example.invalid')
    history.pushState(null, '', '?token=secret#documentation')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  await idle(page)
  expect(capture.posts).toHaveLength(postsAtWithdrawal)
  await page.reload()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(1)
  expect(capture.posts).toHaveLength(postsAtWithdrawal)
})

test('the object workshop sends no analytics events or product data after consent', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  const capture = await interceptAnalytics(page)
  const productUrl = 'https://store.example.com/products/private-sofa?owner=person@example.invalid#private-choice'
  const notes = 'Private household preferences and person@example.invalid'
  const jobs: Job[] = []
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'private-user', name: 'Private person', email: 'person@example.invalid', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: {
      status: 'ok', codex: { available: true, authenticated: true, authMode: 'chatgpt' },
      blender: { available: true }, activeJobId: null,
    } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    if (path === '/api/jobs' && request.method() === 'POST') {
      const input = request.postDataJSON() as Job['input']
      expect(input).toEqual({ url: productUrl, notes })
      const job: Job = {
        id: 'private-job', input, status: 'queued', createdAt: '2026-10-03T12:00:00Z',
        updatedAt: '2026-10-03T12:00:00Z', stage: 'Queued', questions: [],
        error: null, assetId: null, warnings: [],
      }
      jobs.push(job)
      return route.fulfill({ status: 202, json: { job } })
    }
    if (path === '/api/jobs') return route.fulfill({ json: { jobs } })
    if (path === '/api/jobs/private-job/events') return route.fulfill({ json: { events: [{
      seq: 1, jobId: 'private-job', attempt: 1, at: '2026-10-03T12:00:00Z',
      kind: 'source', message: 'Product reference', detail: notes, url: productUrl,
    }] } })
    if (path === '/api/jobs/private-job/events/stream') return route.fulfill({
      contentType: 'text/event-stream', body: ': connected\n\n',
    })
    return route.fulfill({ status: 404, json: { error: 'Unexpected test route' } })
  })
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(1)
  await idle(page)
  const postsBeforeWorkshop = capture.posts.length
  await page.goto('/app/assets')
  await expect(page.locator('.asset-workshop')).toBeVisible()
  await page.getByLabel('Product link', { exact: true }).fill(productUrl)
  await page.getByLabel('Details and preferences', { exact: true }).fill(notes)
  await page.getByRole('button', { name: 'Create 3D object' }).click()
  await expect(page.locator('.workshop-notice')).toContainText('Request received')
  await expect(page.getByText('Product reference', { exact: true })).toBeVisible()
  await idle(page)
  expect(jobs).toHaveLength(1)
  expect(capture.posts).toHaveLength(postsBeforeWorkshop)
  expect(capture.scripts).toHaveLength(1)
  await expect(page.locator('script[data-website-id]')).toHaveCount(0)
  expect(JSON.stringify(capture.payloads)).not.toMatch(/private-sofa|store\.example|person@|household|private-job|assets/)
})

test('the public object history suspends analytics after consent and never reports selected products or versions', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => item.payload.name === 'solar_opened').length).toBe(1)
  await idle(page)
  const beforeGallery = capture.posts.length
  await page.getByRole('button', { name: 'Objects', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Objects with a history.' })).toBeVisible()
  await expect(page.locator('script[data-website-id]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Review DYVLINGE' }).click()
  await page.getByLabel('Version history').selectOption('dyvlinge-v1')
  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await expect(page.locator('.workshop-preview img')).toHaveAttribute('src', '/demo-assets/dyvlinge-v1/front.png')
  await page.getByRole('button', { name: 'Explore in 3D', exact: true }).click()
  await expect(page.getByText(/The 3D view needs WebGL 2/)).toBeVisible()
  await idle(page)
  expect(capture.posts).toHaveLength(beforeGallery)
  expect(capture.scripts).toHaveLength(1)
  expect(JSON.stringify(capture.payloads)).not.toMatch(/DYVLINGE|dyvlinge|ikea|demo-assets|version|model\.glb/)
})

test('prior public consent never loads or resumes analytics on account and private project routes', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  const projectId = '05c696e1-6449-4909-8d57-b22af19d0644'
  const projectName = 'Private household project'
  const privateEmail = 'private-person@example.invalid'
  const scene = ProjectSnapshotSchema.parse(JSON.parse(readFileSync(new URL('../../../assets/scenes/t3-project.json', import.meta.url), 'utf8')))
  scene.project = { id: projectId, name: projectName }
  const project = {
    id: projectId, name: projectName, notes: 'Private household notes', ownerId: 'private-user',
    role: 'viewer', revision: 1, createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T10:00:00Z', scene,
  }
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'private-user', name: 'Private person', email: privateEmail, role: 'user' } } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [project] } })
    if (path === `/api/projects/${projectId}`) return route.fulfill({ json: { project } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected test route' } })
  })
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(1)
  await idle(page)
  const allowedPosts = capture.posts.length
  const privateRoutes = [
    { path: `/login?email=${privateEmail}`, heading: 'A space for your ideas.' },
    { path: '/invite#token=private-invitation-token', heading: 'Welcome to T3 Designer' },
    { path: '/recover#token=private-recovery-token', heading: 'Choose a new password' },
    { path: '/app', heading: 'Make room for your next idea.' },
    { path: `/app/projects/${projectId}`, heading: projectName },
  ]
  for (const route of privateRoutes) {
    await page.goto(route.path)
    await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible()
    // Lifecycle notifications must not reinterpret a private URL as a public view.
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new FocusEvent('focus'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    await idle(page)
    await expect(page.locator('script[data-website-id]')).toHaveCount(0)
    expect(capture.scripts).toHaveLength(1)
    expect(capture.posts).toHaveLength(allowedPosts)
  }
  expect(JSON.stringify(capture.payloads)).not.toMatch(/private-user|private-person|household|invitation-token|recovery-token|05c696e1|\/app|\/login|\/invite|\/recover/)
})

test('revocation while the script is loading prevents late analytics sends', async ({ page }) => {
  let releaseScript: (() => void) | undefined
  const scriptReady = new Promise<void>(resolve => { releaseScript = resolve })
  const capture = await interceptAnalytics(page, {
    script: async route => {
      await scriptReady
      await route.fulfill({ contentType: 'application/javascript', body: tracker })
    },
  })
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.scripts.length).toBe(1)
  await withdraw(page)
  releaseScript?.()
  await page.getByTestId('privacy-close').click()
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await idle(page)
  expect(capture.posts).toHaveLength(0)
})

for (const signal of ['doNotTrack', 'globalPrivacyControl'] as const) {
  test(`${signal} prevents loading even after an explicit accept attempt`, async ({ page }) => {
    const capture = await interceptAnalytics(page)
    await page.addInitScript(signal => {
      Object.defineProperty(navigator, signal, { configurable: true, value: signal === 'doNotTrack' ? '1' : true })
    }, signal)
    await page.goto('/#building')
    await preferences(page)
    const accept = page.getByTestId('analytics-dialog-accept')
    if (await accept.isEnabled()) await accept.click()
    await idle(page)
    expect(capture.scripts).toHaveLength(0)
    expect(capture.posts).toHaveLength(0)
  })
}

for (const failure of ['read', 'write'] as const) {
  test(`storage ${failure} failure leaves analytics off and the app usable`, async ({ page }) => {
    const capture = await interceptAnalytics(page)
    await page.addInitScript(({ key, failure }) => {
      const method = failure === 'read' ? 'getItem' : 'setItem'
      const original = Storage.prototype[method]
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value(this: Storage, storageKey: string, value: string) {
          if (storageKey === key) throw new DOMException('Storage is blocked', 'SecurityError')
          return Reflect.apply(original, this, [storageKey, value])
        },
      })
    }, { key: consentKey, failure })
    await page.goto('/#building')
    await preferences(page)
    const accept = page.getByTestId('analytics-dialog-accept')
    if (await accept.isEnabled()) await accept.click()
    await page.getByTestId('privacy-close').click()
    await page.getByRole('button', { name: 'Documentation', exact: true }).click()
    await expect(page.locator('.dossier-hero')).toBeVisible()
    await idle(page)
    expect(capture.scripts).toHaveLength(0)
    expect(capture.posts).toHaveLength(0)
  })
}

test('an expired decision prompts again without loading the tracker', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ choice: 'accepted', version, expiresAt: Date.now() - 1 }))
  }, { key: consentKey, version: policyVersion })
  await page.goto('/#building')
  await expect(page.getByTestId('analytics-consent-banner')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('expiry during an active session stops future sends and requires a new decision', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.clock.install({ time: new Date('2026-09-27T12:00:00Z') })
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ choice: 'accepted', version, expiresAt: Date.now() + 60_000 }))
  }, { key: consentKey, version: policyVersion })
  await page.goto('/#building')
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(1)
  await page.clock.fastForward(60_001)
  await expect(page.getByTestId('analytics-consent-banner')).toBeVisible()
  const count = capture.posts.length
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(1)
  expect(capture.posts).toHaveLength(count)
})

test('a stored acceptance cannot enable analytics when storage has become read-only', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ choice: 'accepted', version, expiresAt: Date.now() + 86_400_000 }))
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value() { throw new DOMException('Storage is read-only', 'QuotaExceededError') },
    })
  }, { key: consentKey, version: policyVersion })
  await page.goto('/#building')
  await expect(page.getByTestId('analytics-consent-banner')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('a concurrent rejection cannot be overwritten by a stale stored acceptance', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.addInitScript(({ key, version }) => {
    const accepted = { choice: 'accepted', version, expiresAt: Date.now() + 86_400_000 }
    localStorage.setItem(key, JSON.stringify(accepted))
    const originalGet = Storage.prototype.getItem
    const originalSet = Storage.prototype.setItem
    let rejected = false
    Object.defineProperty(Storage.prototype, 'getItem', {
      configurable: true,
      value(this: Storage, storageKey: string) {
        const stored = originalGet.call(this, storageKey)
        if (storageKey === key && !rejected) {
          rejected = true
          // Model another tab withdrawing after this tab read a stale acceptance.
          originalSet.call(this, key, JSON.stringify({ ...accepted, choice: 'rejected' }))
        }
        return stored
      },
    })
  }, { key: consentKey, version: policyVersion })
  await page.goto('/#building')
  await preferences(page)
  await expect(page.getByTestId('analytics-status')).toContainText('rejected')
  await idle(page)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).choice, consentKey)).toBe('rejected')
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('withdrawing in another tab immediately closes the current analytics session', async ({ page, context }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.posts.length).toBeGreaterThan(0)
  const other = await context.newPage()
  await interceptAnalytics(other)
  await other.goto('/#building')
  await withdraw(other)
  await expect.poll(() => page.evaluate(() => document.querySelector('script[data-website-id]') === null)).toBe(true)
  const count = capture.posts.length
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await idle(page)
  expect(capture.posts).toHaveLength(count)
  await other.close()
})

test('page suspension cannot restart analytics until a genuine pageshow resumes it', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(1)
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new FocusEvent('focus'))
  })
  const count = capture.posts.length
  await idle(page)
  expect(capture.scripts).toHaveLength(1)
  expect(capture.posts).toHaveLength(count)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await expect.poll(() => capture.scripts.length).toBe(2)
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(2)
})

test('solar opening and GLB download emit bounded events without asset or control data', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#apartment')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => item.payload.name === 'solar_opened').length).toBe(1)
  await page.locator('#solar-date').fill('2026-12-21')
  await page.locator('#solar-time').fill('15:30')
  await page.locator('.inspector-tabs button').last().click()
  await page.locator('.asset-list button').first().click()
  const download = page.waitForEvent('download')
  await page.locator('.asset-details a[download]').click()
  await (await download).cancel()
  await expect.poll(() => capture.payloads.filter(item => item.payload.name === 'glb_download').length).toBe(1)
  expect(capture.payloads.find(item => item.payload.name === 'glb_download')?.payload.data).toEqual({ view: 'apartment' })
  expect(capture.payloads.filter(item => item.payload.name === 'solar_opened')).toHaveLength(1)
  await page.locator('.inspector-tabs button').first().click()
  await expect.poll(() => capture.payloads.filter(item => item.payload.name === 'solar_opened').length).toBe(2)
  expect(JSON.stringify(capture.payloads)).not.toMatch(/2026-12-21|15:30|\.glb|roomId|latitude|longitude/)
})

test('a production build without operator configuration does not offer analytics consent', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto(`http://127.0.0.1:${process.env.T3_ANALYTICS_DISABLED_E2E_PORT ?? 4176}/#building`)
  await expect(page.getByTestId('analytics-consent-banner')).toHaveCount(0)
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await preferences(page)
  await expect(page.getByTestId('analytics-dialog-accept')).toBeDisabled()
  await expect(page.getByTestId('analytics-status')).toContainText('configuration is disabled or incomplete')
  await idle(page)
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('script failure is contained and leaves all workspaces usable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const capture = await interceptAnalytics(page, { script: route => route.abort('blockedbyclient') })
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.scripts.length).toBe(1)
  await page.getByRole('button', { name: 'Apartment', exact: true }).click()
  await expect(page.locator('#solar-date')).toBeVisible()
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await page.getByRole('button', { name: 'Objects', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Objects with a history.' })).toBeVisible()
  await page.getByRole('button', { name: 'Building and sun', exact: true }).click()
  await expect(page.locator('#solar-date')).toBeVisible()
  await idle(page)
  expect(capture.posts).toHaveLength(0)
  expect(errors).toEqual([])
})

test('collector failure does not break navigation or retry in a loop', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const capture = await interceptAnalytics(page, { collector: route => route.abort('connectionfailed') })
  await page.goto('/#building')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.posts.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Documentation', exact: true }).click()
  await expect(page.locator('.dossier-hero')).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(1)
  expect(capture.posts.length).toBeLessThanOrEqual(5)
  expect(errors).toEqual([])
})

test('mobile choices and privacy controls remain keyboard accessible', async ({ page }) => {
  await interceptAnalytics(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#building')
  const accept = page.getByTestId('analytics-accept')
  const reject = page.getByTestId('analytics-reject')
  for (const choice of [accept, reject]) {
    await expect(choice).toBeVisible()
    const bounds = await choice.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
  }
  await accept.focus()
  await page.keyboard.press('Tab')
  await expect(reject).toBeFocused()
  await page.keyboard.press('Enter')
  await preferences(page)
  await expect(page.getByTestId('privacy-dialog')).toBeVisible()
  await page.screenshot({ path: '/tmp/t3-analytics-mobile-dialog.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('privacy-dialog')).not.toBeVisible()
  await expect(page.getByTestId('privacy-preferences')).toBeFocused()
})

const privacyLanguages = [
  { locale: 'en-GB', language: 'en', heading: 'Privacy policy' },
  { locale: 'es-AR', language: 'es', heading: 'Política de privacidad' },
  { locale: 'fr-FR', language: 'fr', heading: 'Politique de confidentialité' },
] as const

for (const variant of privacyLanguages) {
  test.describe(`privacy page in ${variant.language}`, () => {
    test.use({ locale: variant.locale })

    test('opens directly on canonical and trailing-slash routes with no analytics', async ({ page }) => {
      const capture = await interceptAnalytics(page)
      for (const path of ['/privacy', '/privacy/']) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('lang', variant.language)
        const policy = page.getByTestId('privacy-page')
        await expect(policy).toBeVisible()
        await expect(policy.getByRole('heading', { level: 1 })).toHaveText(variant.heading)
        await expect(page).toHaveTitle(new RegExp(variant.heading))
        await expect(page.locator('.workspace')).toHaveCount(0)
        await expect(page.getByTestId('privacy-back')).toHaveAttribute('href', '/#building')
        await expect(policy.locator('a[href="mailto:privacy@example.test"]').first()).toBeVisible()
        await expect(policy).toContainText('Example Operator')
        await expect(policy).not.toContainText('{{')
        await expect(policy).not.toContainText('{months}')
        if (variant.language === 'en' && path === '/privacy') await page.screenshot({ path: '/tmp/t3-privacy-desktop.png' })
        await idle(page)
      }
      expect(capture.scripts).toHaveLength(0)
      expect(capture.posts).toHaveLength(0)
    })
  })
}

test('privacy is a genuine link that supports opening a separate browser tab', async ({ page, context }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#apartment')
  const link = page.getByTestId('privacy-policy')
  await expect(link).toHaveAttribute('href', '/privacy')
  await expect(link).toHaveRole('link')
  const opened = context.waitForEvent('page')
  await link.click({ button: 'middle' })
  const other = await opened
  await expect(other).toHaveURL(/\/privacy$/)
  await expect(other.getByTestId('privacy-page')).toBeVisible()
  await expect(page).toHaveURL(/#apartment$/)
  await other.close()
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('the privacy subpage and browser history preserve apartment controls and selection', async ({ page }) => {
  await interceptAnalytics(page)
  await page.goto('/#apartment')
  await page.locator('#solar-date').fill('2026-12-21')
  await page.locator('#solar-time').fill('15:30')
  await page.locator('.inspector-tabs button').nth(1).click()
  await page.locator('.room-navigation button').first().click()
  await page.getByTestId('privacy-policy').click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.locator('#privacy-page-title')).toBeFocused()
  await expect(page.getByTestId('privacy-back')).toHaveAttribute('href', '/#apartment')
  await page.getByTestId('privacy-back').click()
  await expect(page).toHaveURL(/\/#apartment$/)
  await expect(page.locator('.room-navigation button').first()).toHaveClass(/selected/)
  await page.locator('.inspector-tabs button').first().click()
  await expect(page.locator('#solar-date')).toHaveValue('2026-12-21')
  await expect(page.locator('#solar-time')).toHaveValue('15:30')
  await page.goBack()
  await expect(page.getByTestId('privacy-page')).toBeVisible()
  await page.goForward()
  await expect(page.locator('#solar-date')).toHaveValue('2026-12-21')
  await expect(page.locator('#solar-time')).toHaveValue('15:30')
})

test('stored consent never loads analytics on a direct privacy page or its section anchors', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.addInitScript(({ key, version }) => {
    localStorage.setItem(key, JSON.stringify({ choice: 'accepted', version, expiresAt: Date.now() + 86_400_000 }))
  }, { key: consentKey, version: policyVersion })
  await page.goto('/privacy?email=person@example.invalid#private')
  const policy = page.getByTestId('privacy-page')
  await expect(policy).toBeVisible()
  const sectionLink = policy.locator('nav a[href^="#"]').first()
  await expect(sectionLink).toBeVisible()
  const sectionHref = await sectionLink.getAttribute('href')
  await sectionLink.click()
  expect(new URL(page.url()).hash).toBe(sectionHref)
  await expect(policy).toBeVisible()
  await page.goBack()
  await expect(policy).toBeVisible()
  await page.reload()
  await expect(policy).toBeVisible()
  await idle(page)
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('analytics stops on privacy and resumes only the real workspace once per return', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.goto('/#apartment')
  await page.getByTestId('analytics-accept').click()
  await expect.poll(() => capture.payloads.filter(item => item.payload.name === 'solar_opened').length).toBe(1)
  await page.getByTestId('privacy-policy').click()
  await expect(page.getByTestId('privacy-page')).toBeVisible()
  const before = capture.posts.length
  await idle(page)
  expect(capture.posts).toHaveLength(before)
  expect(capture.scripts).toHaveLength(1)
  await expect(page.locator('script[data-website-id]')).toHaveCount(0)
  await page.getByTestId('privacy-back').click()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(2)
  expect(capture.scripts).toHaveLength(2)
  await page.goBack()
  await expect(page.getByTestId('privacy-page')).toBeVisible()
  const afterReturn = capture.posts.length
  await idle(page)
  expect(capture.posts).toHaveLength(afterReturn)
  await page.goForward()
  await expect.poll(() => capture.payloads.filter(item => !item.payload.name).length).toBe(3)
  expect(capture.scripts).toHaveLength(3)
  expect(capture.payloads.filter(item => !item.payload.name).map(item => item.payload.url)).toEqual(['/apartment', '/apartment', '/apartment'])
  expect(capture.payloads.some(item => item.payload.url.includes('privacy'))).toBe(false)
})

test('privacy-page preferences can withdraw a stored acceptance before any analytics request', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.addInitScript(({ key, version }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ choice: 'accepted', version, expiresAt: Date.now() + 86_400_000 }))
  }, { key: consentKey, version: policyVersion })
  await page.goto('/privacy')
  await withdraw(page)
  await expect(page.getByTestId('analytics-status')).toContainText('rejected')
  await page.getByTestId('privacy-close').click()
  await page.getByTestId('privacy-back').click()
  await expect(page.locator('#solar-date')).toBeVisible()
  await page.reload()
  await expect(page.locator('#solar-date')).toBeVisible()
  await idle(page)
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).choice, consentKey)).toBe('rejected')
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})

test('the privacy page remains readable and keyboard navigable on a mobile viewport', async ({ page }) => {
  const capture = await interceptAnalytics(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/privacy')
  const policy = page.getByTestId('privacy-page')
  await expect(policy).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.locator('#privacy-page-title')).toBeFocused()
  const firstSection = policy.locator('nav a').first()
  await firstSection.focus()
  await page.keyboard.press('Enter')
  expect(new URL(page.url()).hash).toBe(await firstSection.getAttribute('href'))
  await expect(policy.locator('a[href="mailto:privacy@example.test"]').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/t3-privacy-mobile.png', fullPage: true })
  expect(capture.scripts).toHaveLength(0)
  expect(capture.posts).toHaveLength(0)
})
