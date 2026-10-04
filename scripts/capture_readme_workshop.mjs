import assert from 'node:assert/strict'
import { spawn, spawnSync, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { backup, DatabaseSync } from 'node:sqlite'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Real browser, real API and archived public models. No synthetic jobs, mocked
// responses or inference requests. All account/project data is disposable.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium, expect } = requireWeb('@playwright/test')
const { createServer: createVite } = await import(requireWeb.resolve('vite'))
const { publicAssets } = await import('../apps/web/src/data/public-assets.ts')
const output = resolve(root, process.env.README_MEDIA_DIR ?? 'docs/media')
const webPort = Number(process.env.README_WORKSHOP_WEB_PORT ?? 5193)
const apiPort = Number(process.env.README_WORKSHOP_API_PORT ?? 8793)
const origin = `http://127.0.0.1:${webPort}`
const galleryOrigin = process.env.README_GALLERY_BASE_URL ?? origin
const fps = 8
for (const port of [webPort, apiPort]) {
  const probe = createServer()
  probe.listen(port, '127.0.0.1')
  await once(probe, 'listening')
  probe.close()
  await once(probe, 'close')
}
assert.equal(spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status, 0, 'FFmpeg is required')
await mkdir(output, { recursive: true })
await mkdir(join(root, 'artifacts/readme'), { recursive: true })
const scratch = await mkdtemp(join(root, 'artifacts/readme/workshop-'))
const privateData = await mkdtemp(join(tmpdir(), 't3-readme-workshop-'))
const env = { ...process.env, NODE_ENV: 'development', T3_DATABASE_URL: '',
  T3_AUTH_SECRET: randomBytes(48).toString('hex'), T3_PUBLIC_URL: origin,
  T3_API_HOST: '127.0.0.1', T3_API_PORT: String(apiPort), T3_GENERATION_ENABLED: 'false',
  T3_INFERENCE_PROVIDER: 'openai', OPENAI_API_KEY: '', T3_BILLING_MODE: 'disabled',
  MP_ACCESS_TOKEN: '', MP_WEBHOOK_SECRET: '', MP_SANDBOX_PAYER_EMAIL: '',
  T3_ACCOUNT_DATA_DIR: join(privateData, 'accounts'), T3_ASSET_DATA_DIR: join(privateData, 'assets') }
const vite = await createVite({ mode: 'full', configFile: join(root, 'apps/web/vite.config.ts'), root: join(root, 'apps/web'),
  server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } } })
let api, browser, page
const errors = []
try {
  // Optional original, unowned workshop archive: snapshot the SQLite file read-only,
  // copy its artifacts and claim only that disposable copy after account creation.
  const archive = process.env.README_WORKSHOP_LIBRARY
  if (archive) {
    const source = new DatabaseSync(resolve(archive, 'library.sqlite'), { readOnly: true })
    try {
      assert.equal(source.prepare('SELECT COUNT(*) AS count FROM resource_owners').get().count, 0, 'Use an unowned legacy archive, not an existing private account library')
      assert.equal(source.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status != 'completed'").get().count, 0, 'Archive must contain completed jobs only')
      await mkdir(env.T3_ASSET_DATA_DIR, { recursive: true })
      await backup(source, join(env.T3_ASSET_DATA_DIR, 'library.sqlite'))
      const snapshot = new DatabaseSync(join(env.T3_ASSET_DATA_DIR, 'library.sqlite'))
      try {
        for (const row of source.prepare('SELECT id,directory FROM assets').all()) {
          const destination = join(env.T3_ASSET_DATA_DIR, 'assets', row.id)
          await cp(row.directory, destination, { recursive: true })
          snapshot.prepare('UPDATE assets SET directory=? WHERE id=?').run(destination, row.id)
        }
      } finally { snapshot.close() }
      const references = resolve(archive, 'references')
      if (await stat(references).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) await cp(references, join(env.T3_ASSET_DATA_DIR, 'references'), { recursive: true })
    } finally { source.close() }
  }
  await vite.listen()
  api = spawn(process.execPath, [join(root, 'apps/api/src/index.ts')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  api.stdout.on('data', chunk => { logs += String(chunk) })
  api.stderr.on('data', chunk => { logs += String(chunk) })
  await expect.poll(async () => {
    if (api.exitCode !== null) throw new Error(`Isolated API stopped: ${logs}`)
    return fetch(`http://127.0.0.1:${apiPort}/api/live`).then(response => response.status, () => 0)
  }, { timeout: 20000 }).toBe(200)
  browser = await chromium.launch({ channel: process.env.T3_PLAYWRIGHT_CHANNEL ?? 'chromium', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'en-GB', colorScheme: 'light' })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const generationRequests = []
  page.on('request', request => { if (request.method() === 'POST' && /\/api\/(?:jobs|assets\/[^/]+\/revisions)/.test(request.url())) generationRequests.push(request.url()) })
  const settle = async (ms = 900) => { await page.waitForTimeout(ms) }
  async function align(locator, offset = 16) {
    await locator.evaluate((element, margin) => { const view = element.ownerDocument.defaultView; view.scrollTo({ top: view.scrollY + element.getBoundingClientRect().top - margin, behavior: 'instant' }) }, offset)
    await settle(200)
  }
  function recorder(name) {
    let index = 0
    const directory = join(scratch, name)
    return {
      async frame(hold = 1) {
        await mkdir(directory, { recursive: true })
        const path = join(directory, `frame-${String(index++).padStart(4, '0')}.png`)
        await page.screenshot({ path, scale: 'css' })
        for (let count = 1; count < hold; count++) await copyFile(path, join(directory, `frame-${String(index++).padStart(4, '0')}.png`))
      },
      async encode() {
        const filename = join(output, `${name}.gif`)
        const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps), '-i', join(directory, 'frame-%04d.png'), '-filter_complex', '[0:v]scale=1040:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', filename], { stdio: 'inherit' })
        assert.equal(result.status, 0, `Could not encode ${name}`)
        console.log(`${name}.gif: ${((await stat(filename)).size / 1024 / 1024).toFixed(2)} MiB, ${index / fps}s`)
      },
    }
  }

  await page.goto(`${galleryOrigin}/#assets`)
  await page.getByTestId('privacy-preferences').waitFor()
  if (await page.getByTestId('analytics-reject').isVisible()) await page.getByTestId('analytics-reject').click()
  await page.getByRole('heading', { name: 'Objects with a history.', exact: true }).waitFor()
  await page.locator('html').evaluate(element => element.ownerDocument.fonts.ready)
  await settle()
  if (process.env.README_WORKSHOP_SKIP_GALLERY !== '1') {
    const gallery = recorder('object-library')
    await gallery.frame(16)
    await page.getByRole('button', { name: 'Review DYVLINGE', exact: true }).click()
    await align(page.getByRole('region', { name: 'Selected object', exact: true }))
    await settle()
    await gallery.frame(16)
    await page.getByRole('button', { name: 'Front', exact: true }).click()
    await settle(350)
    await gallery.frame(12)
    await page.getByRole('button', { name: 'Side', exact: true }).click()
    await settle(350)
    await gallery.frame(12)
    await page.getByRole('button', { name: 'Explore in 3D', exact: true }).click()
    await page.locator('canvas').waitFor()
    await settle(2000)
    await gallery.frame(8)
    const canvas = await page.locator('canvas').boundingBox()
    assert.ok(canvas)
    await page.mouse.move(canvas.x + canvas.width * .6, canvas.y + canvas.height * .5)
    await page.mouse.down()
    for (let step = 0; step < 28; step++) {
      await page.mouse.move(canvas.x + canvas.width * (.6 - .011 * step), canvas.y + canvas.height * (.5 + Math.sin(step / 28 * Math.PI) * .07))
      await settle(60)
      await gallery.frame()
    }
    await page.mouse.up()
    await settle()
    await gallery.frame(8)
    await page.getByRole('button', { name: 'Perspective', exact: true }).click()
    await page.getByLabel('Version history', { exact: true }).selectOption('dyvlinge-v1')
    await settle()
    await gallery.frame(16)
    await page.getByLabel('Version history', { exact: true }).selectOption('dyvlinge-v2')
    await settle()
    await gallery.frame(16)
    await gallery.encode()
  }

  // Follow the same real bootstrap/activation path as private-auth.browser.ts.
  // Tokens/passwords remain in memory or a temporary directory removed below.
  await promisify(execFile)(process.execPath, [join(root, 'apps/api/src/account-cli.ts'), 'bootstrap', 'readme@example.test'], { env })
  const activation = (await readFile(join(privateData, 'accounts/bootstrap-link.txt'), 'utf8')).trim()
  await page.goto(activation)
  await page.getByLabel('Your name', { exact: true }).fill('README Demo')
  await page.getByLabel('Email address', { exact: true }).fill('readme@example.test')
  await page.getByLabel(/^Password/).fill(randomBytes(24).toString('base64url'))
  await page.getByRole('button', { name: 'Create my account', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/app`)
  await page.getByRole('link', { name: 'My assets', exact: true }).click()
  await page.getByText('Generation is disabled for this account.', { exact: false }).waitFor()
  const product = publicAssets.find(asset => asset.id === 'dyvlinge')
  await page.getByLabel('Product link', { exact: true }).fill(product.sourceUrl)
  await page.getByLabel('Details and preferences', { exact: true }).fill('DYVLINGE · Kelinge beige. Preserve the rounded seat, low back and five-star swivel base.')
  for (const [axis, value] of [['Width', 63], ['Height', 68], ['Depth', 75]]) await page.locator(`#create-${axis.toLowerCase()}`).fill(String(value))
  await page.getByRole('heading', { name: 'Create an object', exact: true }).click()
  await align(page.locator('.asset-workshop'), 18)
  await settle()
  await page.screenshot({ path: join(output, 'object-workshop.png'), scale: 'css' })
  console.log('Captured object-workshop.png (unsubmitted form; generation disabled)')

  if (archive) {
    await promisify(execFile)(process.execPath, [join(root, 'apps/api/src/account-cli.ts'), 'claim-library', 'readme@example.test'], { env })
    await page.reload()
    await page.locator('.workshop-event').first().waitFor()
    const history = recorder('workshop-history')
    await align(page.locator('.workshop-layout'), 18)
    const feed = page.getByRole('list', { name: 'Activity log', exact: true })
    await feed.evaluate(element => { element.scrollTop = 0 })
    await settle()
    await history.frame(20)
    for (const progress of [.2, .5, .8, 1]) {
      await feed.evaluate((element, value) => { element.scrollTop = value * (element.scrollHeight - element.clientHeight) }, progress)
      await settle(400)
      await history.frame(16)
    }
    await page.getByRole('button', { name: 'View object', exact: false }).click()
    await align(page.getByRole('region', { name: 'Selected object', exact: true }), 18)
    await settle()
    await history.frame(20)
    await align(page.getByRole('region', { name: 'Automatic visual review', exact: true }), 18)
    await settle()
    await history.frame(20)
    await history.encode()
  }

  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.getByRole('link', { name: 'My projects', exact: true }).click()
  await page.getByRole('button', { name: /Create from demo/ }).first().click()
  await page.getByLabel('Project name', { exact: true }).fill('A warmer place · layout study')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/projects\/[\da-f-]+$/)
  await page.getByRole('combobox', { name: /^Apartment variants/ }).waitFor()
  await page.locator('canvas').waitFor()
  await settle(2500)
  const design = recorder('private-design')
  await align(page.getByRole('heading', { name: 'A warmer place · layout study', exact: true }), 16)
  await design.frame(16)
  await page.getByLabel('Copy name', { exact: true }).fill('Warm materials')
  await page.getByRole('button', { name: 'Duplicate layout', exact: true }).click()
  await settle()
  await design.frame(16)
  await page.getByRole('combobox', { name: /^Floor in room/ }).selectOption('living')
  await page.getByRole('combobox', { name: /^Floor finish/ }).selectOption('parquet')
  await page.getByRole('button', { name: 'Wall color: Sage', exact: true }).click()
  await align(page.getByRole('region', { name: 'Finishes & lighting', exact: true }), 18)
  await settle()
  await design.frame(16)
  await page.getByText('Doors & windows', { exact: true }).click()
  await page.getByRole('combobox', { name: /^Window dressing$/ }).selectOption('curtain')
  await page.getByRole('button', { name: 'Fabric or shutter color: Linen', exact: true }).click()
  await page.getByLabel('Window dressing closure', { exact: false }).fill('35')
  await design.frame(16)
  await page.getByRole('combobox', { name: /^Room for a new light/ }).selectOption('living')
  await page.getByRole('button', { name: '+ Add light point', exact: true }).click()
  await page.getByRole('button', { name: 'Warm · 2700 K', exact: true }).click()
  await page.getByLabel('Light output', { exact: false }).fill('1500')
  await align(page.locator('summary').filter({ hasText: /^Lighting/ }).locator('..'), 18)
  await settle()
  await design.frame(20)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.getByText('Changes saved.', { exact: true }).waitFor()
  await align(page.getByRole('heading', { name: 'A warmer place · layout study', exact: true }), 16)
  await settle(1500)
  await design.frame(20)
  await page.screenshot({ path: join(output, 'private-project.png'), scale: 'css' })
  await design.encode()
  await page.reload()
  await page.getByRole('combobox', { name: /^Apartment variants/ }).waitFor()
  await expect(page.getByRole('combobox', { name: /^Furniture layouts/ }).locator('option:checked')).toContainText('Warm materials')
  await expect(page.getByRole('button', { name: 'Wall color: Sage', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByText('Doors & windows', { exact: true }).click()
  await expect(page.getByRole('combobox', { name: /^Window dressing$/ })).toHaveValue('curtain')
  await expect(page.getByLabel('Light output', { exact: false })).toHaveValue('1500')
  assert.deepEqual(generationRequests, [], 'The recording must never start generation')
  assert.deepEqual(errors, [], 'Browser must not emit page errors')
  console.log(`Real project save/reload verified. Original frames: ${scratch}`)
} catch (error) {
  if (page?.url().startsWith(`${origin}/app`)) {
    await page.screenshot({ path: join(scratch, 'failure.png') }).catch(() => {})
    console.error('Page errors:', errors)
    console.error('Failure screenshot:', join(scratch, 'failure.png'))
  }
  throw error
} finally {
  await browser?.close()
  await vite.close()
  if (api && api.exitCode === null) { const exited = once(api, 'exit'); api.kill('SIGTERM'); await exited }
  await rm(privateData, { recursive: true, force: true })
}
