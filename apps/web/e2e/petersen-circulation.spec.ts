import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import type { FoundationCandidate, FoundationModels, ProjectSnapshot } from '@t3-designer/scene-schema'
import type { Project } from '../src/private/api'
import { creditFixture } from './credit-fixture'

// Opt-in saved source artifacts: manual interpretation or an accepted agent version.
// No model requests or database writes occur during the browser inspection.
const enabled = process.env.T3_PETERSEN_CIRCULATION === '1'
const realVersionPath = process.env.T3_PETERSEN_REAL_VERSION
const artifactPrefix = realVersionPath ? 'petersen-chrome-agent' : 'petersen-chrome-manual'
test.skip(!enabled, 'Set T3_PETERSEN_CIRCULATION=1 after preparing the ignored Petersen source fixture.')
test.use({ locale: 'es-AR', viewport: { width: 1440, height: 1000 },
  trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
  launchOptions: { channel: process.env.T3_PLAYWRIGHT_CHANNEL ?? 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
})

const directory = fileURLToPath(new URL('../../../artifacts/foundation-live-qa/', import.meta.url))
const projectId = '65d7e113-2784-47eb-9cd5-9166d6a83a11'
type Pose = { x: number; z: number; yaw: number; sourceY: number; sourceHeadY: number; feetOffset: number; eyeHeight: number; pitch: number; level: string | null; grounded: string | null }

async function pose(page: Page): Promise<Pose> {
  return page.locator('.walk-map').evaluate(element => {
    const match = element.querySelector('g')?.getAttribute('transform')?.match(/translate\(([^ ]+) ([^)]+)\) rotate\(([^)]+)\)/)
    if (!match) throw new Error('Missing real controller pose')
    const eyeHeight = Number(element.getAttribute('data-eye-height'))
    if (!(eyeHeight > 0)) throw new Error('Actual controller eye height must be exposed for head-clearance QA')
    const feetOffset = Number(element.getAttribute('data-feet-offset'))
    return { x: Number(match[1]), z: Number(match[2]), yaw: -Number(match[3]) * Math.PI / 180,
      sourceY: feetOffset - .127, sourceHeadY: feetOffset - .127 + eyeHeight, feetOffset, eyeHeight, pitch: Number(element.getAttribute('data-pitch')),
      level: element.getAttribute('data-level-id'), grounded: element.getAttribute('data-grounded') }
  })
}

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(done => {
    const end = performance.now() + 130
    let frames = 0
    const next = () => { if (++frames >= 3 && performance.now() >= end) done(); else requestAnimationFrame(next) }
    requestAnimationFrame(next)
  }))
}

async function walkTo(page: Page, target: readonly [number, number, number], samples: unknown[]) {
  // Keyboard inputs only. Read the rendered minimap; never set camera/React state.
  let previous = await pose(page), stagnant = 0
  for (let count = 0; count < 240; count++) {
    if (await page.getByTestId('walkthrough').getAttribute('data-active') !== 'true') throw new Error(`Visit paused unexpectedly at ${JSON.stringify(previous)}`)
    const dx = target[0] - previous.x, dz = target[2] - previous.z
    if (Math.hypot(dx, dz) < .075) {
      samples.push({ target, actual: previous, inputs: count })
      console.log('Petersen waypoint', JSON.stringify({ target, actual: previous }))
      expect(Math.abs(previous.sourceY - target[1])).toBeLessThan(.16)
      return
    }
    const forward = -Math.sin(previous.yaw) * dx - Math.cos(previous.yaw) * dz
    const right = Math.cos(previous.yaw) * dx - Math.sin(previous.yaw) * dz
    const magnitude = Math.max(Math.abs(forward), Math.abs(right))
    const keys = [Math.abs(forward) > magnitude * .45 ? forward > 0 ? 'w' : 's' : null,
      Math.abs(right) > magnitude * .45 ? right > 0 ? 'd' : 'a' : null].filter((key): key is string => !!key)
    const frames = Math.max(1, Math.min(3, Math.floor(Math.hypot(dx, dz) / .0725)))
    for (const key of keys) await page.keyboard.down(key)
    // A short wall-clock pulse can fit entirely between software WebGL frames.
    // Keep the real keys held until the renderer has consumed at least one frame.
    await page.evaluate(count => new Promise<void>(done => {
      const next = () => { if (--count <= 0) done(); else requestAnimationFrame(next) }
      requestAnimationFrame(next)
    }), frames)
    for (const key of keys) await page.keyboard.up(key)
    await settle(page)
    const current = await pose(page)
    if (Math.hypot(current.x - previous.x, current.z - previous.z) > .9) throw new Error(`Unexpected pose reset: ${JSON.stringify({ previous, current })}`)
    stagnant = Math.hypot(current.x - previous.x, current.z - previous.z) < .003 ? stagnant + 1 : 0
    if (stagnant > 12) throw new Error(`Blocked keyboard route toward ${JSON.stringify(target)} at ${JSON.stringify(current)}`)
    previous = current
  }
  throw new Error(`Route did not converge toward ${JSON.stringify(target)} at ${JSON.stringify(previous)}`)
}

async function face(page: Page, targetYaw: number) {
  for (let index = 0; index < 50; index++) {
    const current = await pose(page), raw = targetYaw - current.yaw
    const difference = Math.atan2(Math.sin(raw), Math.cos(raw))
    // Keyboard turns are quantized by rendered frames; pose feedback below
    // compensates for the remaining angle during actual movement.
    if (Math.abs(difference) < .15) return
    const key = difference > 0 ? 'ArrowLeft' : 'ArrowRight'
    await page.keyboard.down(key)
    await page.evaluate(count => new Promise<void>(done => {
      const next = () => { if (--count <= 0) done(); else requestAnimationFrame(next) }
      requestAnimationFrame(next)
    }), Math.max(1, Math.min(4, Math.floor(Math.abs(difference) / .0825))))
    await page.keyboard.up(key)
    await settle(page)
  }
  throw new Error('Keyboard camera orientation did not converge')
}

async function tiltDown(page: Page) {
  await page.keyboard.down('ArrowDown')
  await page.evaluate(() => new Promise<void>(done => {
    let frames = 4
    const next = () => { if (--frames <= 0) done(); else requestAnimationFrame(next) }
    requestAnimationFrame(next)
  }))
  await page.keyboard.up('ArrowDown')
  await settle(page)
}

test(`${realVersionPath ? 'accepted agent' : 'manual'} Petersen fixture traverses real Chrome stairs, floor opening and annex threshold`, { tag: '@webgl' }, async ({ page }) => {
  test.setTimeout(600_000)
  page.setDefaultTimeout(30_000)
  const fixture = JSON.parse(readFileSync(resolve(directory, realVersionPath ? 'petersen-circulation-agent-materialized.json' : 'petersen-circulation-materialized.json'), 'utf8')) as {
    candidate: FoundationCandidate; building: FoundationCandidate; levels: FoundationModels['levels']; scene: ProjectSnapshot; sourceVersionId?: string; sourceProjectId?: string
  }
  if (realVersionPath) {
    const version = JSON.parse(readFileSync(resolve(realVersionPath), 'utf8'))
    expect(version.status).toBe('ready')
    expect(fixture.sourceVersionId).toBe(version.id)
    expect(fixture.candidate).toEqual(version.candidate)
  }
  const foundations = JSON.parse(readFileSync(resolve(directory, 'petersen-detail-repair-2026-10-07T13-07-06.638Z/project-before.json'), 'utf8')).foundations
  foundations.dwelling.status = 'ready'; foundations.building.status = 'ready'
  if (fixture.candidate.target !== 'dwelling' || fixture.building.target !== 'building') throw new Error('Invalid Petersen manual fixture')
  const project: Project = { id: projectId, name: realVersionPath ? 'Petersen · versión aceptada del agente · contexto QA' : 'QA MANUAL · Petersen · circulación aproximada', notes: 'Inspección sin nueva inferencia; contexto exterior artificial.', ownerId: 'petersen-qa', role: 'viewer', revision: 1,
    stage: 'ready', createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z', foundations, scene: fixture.scene,
    foundationModels: { activeLevelId: 'first', levels: fixture.levels, dwelling: { versionId: fixture.sourceVersionId ?? '6b8723af-b2a6-4a93-8dd4-1bb49bdc75b3', candidate: fixture.candidate }, building: { versionId: '94b3c658-b9b5-4a40-8b97-53c0830487f3', candidate: fixture.building } } }
  const writes: string[] = [], errors: string[] = [], samples: unknown[] = []
  const hotUpdates: string[] = []
  const referenceDirectories: string[] = [], missingReferences: string[] = []
  let referenceDirectory: string | undefined = realVersionPath ? dirname(resolve(realVersionPath)) : resolve(directory, 'petersen-detail-repair-2026-10-07T13-07-06.638Z')
  while (referenceDirectory && !referenceDirectories.includes(referenceDirectory)) {
    referenceDirectories.push(referenceDirectory)
    const inputPath = resolve(referenceDirectory, 'input.json')
    if (!existsSync(inputPath)) break
    const input = JSON.parse(readFileSync(inputPath, 'utf8'))
    referenceDirectory = input.resumeDirectory ? resolve(directory, '../..', input.resumeDirectory) : undefined
  }
  let completed = false
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.text().includes('[vite] hot updated')) hotUpdates.push(message.text()) })
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Keyboard-only QA', 'NotAllowedError'))
    const style = document.createElement('style')
    style.textContent = '.walk-stage{width:800px!important;height:580px!important;max-height:580px!important}.walk-overlay{padding:12px!important}'
    const observer = new MutationObserver(() => { if (document.documentElement) { document.documentElement.append(style); observer.disconnect() } })
    observer.observe(document, { childList: true })
  })
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') { writes.push(`${request.method()} ${path}`); return route.fulfill({ status: 405, json: { error: 'Manual QA is read-only.' } }) }
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'petersen-qa', name: 'QA manual', email: 'qa@example.test', role: 'user' } } })
    if (path === '/api/credits') return route.fulfill({ json: creditFixture })
    if (path === '/api/health') return route.fulfill({ json: { foundationAgentEnabled: true } })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [project] } })
    if (path === `/api/projects/${projectId}`) return route.fulfill({ json: { project } })
    if (path.endsWith('/members')) return route.fulfill({ json: { members: [] } })
    if (path.endsWith('/foundation-agent')) return route.fulfill({ json: { runs: [], versions: [] } })
    if (path.endsWith('/checkpoints')) return route.fulfill({ json: { checkpoints: [] } })
    if (path === '/api/assets') return route.fulfill({ json: { assets: [] } })
    const reference = path.match(/\/references\/([\da-f-]+)\/image$/)
    if (reference) {
      for (const location of referenceDirectories) for (const [extension, contentType] of [['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png']]) {
        const file = resolve(location, 'references', `${reference[1]}.${extension}`)
        if (existsSync(file)) return route.fulfill({ contentType, body: readFileSync(file) })
      }
      missingReferences.push(reference[1])
    }
    return route.fulfill({ status: 404, json: { error: 'Unknown QA read.' } })
  })
  const screenshot = async (name: string) => {
    await page.getByTestId('walk-stage').screenshot({ path: resolve(directory, `${artifactPrefix}-${name}.png`), animations: 'disabled' })
  }
  try {
    await page.goto(`/app/projects/${projectId}#walkthrough`)
    const visit = page.getByTestId('walkthrough')
    await expect(visit.locator('canvas')).toBeVisible({ timeout: 30_000 })
    expect(await visit.locator('canvas').evaluate(element => !!(element as HTMLCanvasElement).getContext('webgl2'))).toBe(true)
    await visit.getByRole('button', { name: 'Preparar el paseo', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Preparar el paseo', exact: true })
    await settings.getByRole('combobox', { name: 'Punto de inicio', exact: true }).selectOption('first:f_r_hall')
    await settings.getByLabel('Linterna de ayuda', { exact: true }).check()
    await settings.getByRole('button', { name: 'Cerrar ajustes', exact: true }).click()
    await page.getByTestId('walk-stage').evaluate((element, real) => {
      const badge = document.createElement('div'); badge.textContent = real ? 'Versión del agente aprobada · circulación estimada · exterior sintético QA' : 'QA MANUAL · escalera aproximada HABS · entorno artificial · sin aceptación IA'
      Object.assign(badge.style, { position: 'absolute', left: '10px', top: '50px', padding: '6px', background: '#fff0c9', color: '#453c20', font: '11px system-ui', zIndex: '20', pointerEvents: 'none' }); element.append(badge)
    }, !!realVersionPath)
    await visit.getByRole('button', { name: /Entrar al departamento/ }).click()
    await page.mouse.move(1400, 950)
    await settle(page)
    await face(page, Math.PI / 2)
    samples.push({ phase: 'start', pose: await pose(page) })
    console.log('Petersen keyboard start', JSON.stringify(await pose(page)))
    const landing = 3.2766 * 13 / 18
    const main: [number, number, number][] = [[-6.2, 0, .6], [-6.5, 0, .6], [-9.8, landing, .6], [-10.2, landing, .6], [-10.2, landing, 1.55], [-9.8, landing, 1.55], [-8.5, 3.2766, 1.55], [-8.1, 3.2766, 1.55], [-7.35, 3.2766, 1.55]]
    for (const [index, target] of main.entries()) { await walkTo(page, target, samples); if ([0, 3, 8].includes(index)) await screenshot(`ascent-${index}`) }
    expect((await pose(page)).level).toBe('second')
    samples.push({ phase: 'main-ascent-complete', pose: await pose(page) })
    await expect(page.getByTestId('walk-current-level')).toHaveText('Second floor · planta alta')
    await tiltDown(page)
    await screenshot('second-floor-opening')
    for (const target of main.slice(0, -1).reverse()) await walkTo(page, target, samples)
    expect((await pose(page)).level).toBe('first')
    samples.push({ phase: 'main-descent-complete', pose: await pose(page) })
    await screenshot('returned-first')
    const annex: [number, number, number][] = [[-6.2, 0, 1.38], [-10.4, 0, 1.38], [-11.0236, 0, 1.38], [-11.3, -.127, 1.38], [-11.7, -.127, 1.38]]
    for (const target of annex) await walkTo(page, target, samples)
    expect((await pose(page)).sourceY).toBeCloseTo(-.127, 2)
    samples.push({ phase: 'annex-descent-complete', pose: await pose(page) })
    await face(page, -Math.PI / 2)
    await screenshot('annex-below-main')
    for (const target of annex.slice(0, -1).reverse()) await walkTo(page, target, samples)
    expect((await pose(page)).sourceY).toBeCloseTo(0, 2)
    samples.push({ phase: 'annex-ascent-complete', pose: await pose(page) })
    await screenshot('annex-return')
    expect(errors).toEqual([]); expect(writes).toEqual([]); expect(missingReferences).toEqual([])
    completed = true
  } finally {
    writeFileSync(resolve(directory, `${artifactPrefix}-assessment.json`), `${JSON.stringify({ fixture: realVersionPath ? 'Accepted agent candidate, exact saved geometry; synthetic site context for isolated QA' : 'Manual approximation, no agent acceptance; synthetic site context', actualVersionId: fixture.sourceVersionId ?? null, actualSourceProjectId: fixture.sourceProjectId ?? null, completed, eyeHeightSetting: 1.65, worldFloorElevation: -.127, inputMethod: 'Actual Chrome keyboard events consumed by rendered frames; pose read from visible minimap DOM, no camera or controller state writes', resetsRequestedAfterInitialSpawn: 0, discontinuityGuardMeters: .9, hotUpdates, samples, errors, writes, missingReferences }, null, 2)}\n`)
    await screenshot('last-state').catch(() => undefined)
  }
})
