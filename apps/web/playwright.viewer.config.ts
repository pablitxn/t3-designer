import { defineConfig } from '@playwright/test'

// Each test owns a real API + Vite + SQLite scenario; no shared app data.
const executablePath = process.env.T3_VIEWER_CHROMIUM_PATH
const evidenceDir = process.env.T3_VIEWER_EVIDENCE_DIR ?? '../../artifacts/qa-project-viewer/final'
export default defineConfig({
  testDir: './e2e', testMatch: 'project-viewer.spec.ts', fullyParallel: false, workers: 1,
  timeout: 120_000, expect: { timeout: 15_000 }, retries: 0,
  outputDir: `${evidenceDir}/results`,
  reporter: [['list'], ['json', { outputFile: `${evidenceDir}/results.json` }]],
  use: { locale: 'es-AR', actionTimeout: 15_000, screenshot: 'on', trace: { mode: 'on', screenshots: false, snapshots: true, sources: true },
    // Match Cloud's full Chromium headless mode; CI already installs this binary.
    launchOptions: { ...(executablePath ? { executablePath } : { channel: 'chromium' }), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } },
  projects: [
    { name: 'chromium-mobile-375', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'chromium-mobile-430', use: { browserName: 'chromium', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } },
    ...(process.env.T3_VIEWER_WEBKIT === '1' ? [{ name: 'webkit-mobile-375', use: { browserName: 'webkit' as const, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, launchOptions: {} } }, { name: 'webkit-mobile-430', use: { browserName: 'webkit' as const, viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, launchOptions: {} } }, { name: 'webkit-desktop', use: { browserName: 'webkit' as const, viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, launchOptions: {} } }] : []),
  ],
})
