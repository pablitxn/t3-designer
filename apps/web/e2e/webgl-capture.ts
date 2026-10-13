import type { Page, TestInfo } from '@playwright/test'

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
      const previous = state.frameloop
      state.setFrameloop('never')
      state.gl.render(state.scene, state.camera)
      return previous as 'always' | 'demand' | 'never'
    })
  })
  try {
    await info.attach('capture-mode', { body: JSON.stringify({ temporaryFrameFreeze: true, previousLoops: loops, geometryChanged: false, quality3DValidated: false }), contentType: 'application/json' })
    const path = info.outputPath(`${name}.png`)
    if (selector) await page.locator(selector).screenshot({ path, timeout: 15_000 })
    else await page.screenshot({ path, fullPage: false, timeout: 15_000 })
    await info.attach(name, { path, contentType: 'image/png' })
  } finally {
    await page.locator('canvas').evaluateAll(async (canvases, previous) => {
      const resource = performance.getEntriesByType('resource').find(entry => entry.name.includes('/@react-three_fiber.js'))
      if (!resource) return
      const { _roots } = await import(resource.name)
      canvases.forEach((canvas, index) => {
        const state = _roots.get(canvas)?.store.getState()
        if (state && previous[index]) { state.setFrameloop(previous[index]); state.invalidate() }
      })
    }, loops)
  }
}
