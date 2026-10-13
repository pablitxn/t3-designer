import { writeFile } from 'node:fs/promises'
import type { CDPSession, Page, TestInfo } from '@playwright/test'

/** Freeze existing rendered frames only during capture, then restore their loops.
 * Inputs, geometry, shadows, DPR and assertions are unchanged. This avoids
 * continuous software WebGL repaint starving Chromium's screenshot compositor.
 */
export async function captureWebGL(page: Page, info: TestInfo, name: string, selector?: string) {
  const loops = await page.locator('canvas').evaluateAll(async canvases => {
    const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
    if (!resource) return []
    const { _roots } = await import(resource.name)
    return canvases.map(canvas => {
      const state = _roots.get(canvas)?.store.getState()
      if (!state?.gl) return null
      const previous = { loop: state.frameloop as 'always' | 'demand' | 'never', active: state.internal.active as boolean }
      // Canvas.configure can restore frameloop after a queued React update.
      // The scheduler's active flag keeps callbacks and drawing stopped too.
      state.internal.active = false
      state.setFrameloop('never')
      state.gl.render(state.scene, state.camera)
      // render() queues GPU work; finish the real frame before readback.
      state.gl.getContext().finish()
      return previous
    })
  })
  if (!loops.some(loop => loop !== null)) throw new Error('No active Fiber renderer was frozen for capture')
  try {
    await info.attach('capture-mode', { body: JSON.stringify({ temporaryFrameFreeze: true, previousLoops: loops, geometryChanged: false, quality3DValidated: false }), contentType: 'application/json' })
    const path = info.outputPath(`${name}.png`)
    if (!selector && page.context().browser()?.browserType().name() === 'chromium') {
      // Use lossless speed-oriented PNG encoding for the same viewport pixels.
      // The protocol request retains the original 15-second capture deadline.
      let session: CDPSession | undefined
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Viewport PNG readback exceeded 15000ms')), 15_000) })
        await Promise.race([page.evaluate(() => document.fonts.ready), deadline])
        session = await page.context().newCDPSession(page)
        const capture = session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, optimizeForSpeed: true })
        const { data } = await Promise.race([capture, deadline])
        await writeFile(path, Buffer.from(data, 'base64'))
      } finally { clearTimeout(timeout); await session?.detach() }
    } else if (selector) await page.locator(selector).screenshot({ path, timeout: 15_000 })
    else await page.screenshot({ path, fullPage: false, timeout: 15_000 })
    await info.attach(name, { path, contentType: 'image/png' })
  } catch (error) {
    throw new Error(`Capture ${name}, loops=${JSON.stringify(loops)}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  } finally {
    await page.locator('canvas').evaluateAll(async (canvases, previous) => {
      const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
      if (!resource) return
      const { _roots } = await import(resource.name)
      canvases.forEach((canvas, index) => {
        const state = _roots.get(canvas)?.store.getState()
        if (state && previous[index]) {
          state.setFrameloop(previous[index]!.loop)
          state.internal.active = previous[index]!.active
          state.invalidate()
        }
      })
    }, loops)
  }
}
