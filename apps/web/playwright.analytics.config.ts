import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A separate production build is essential: analytics is disabled in development.
// The UUID below belongs only to the intercepted test collector, never to Umami.
process.env.T3_ANALYTICS_E2E = '1'
const outputDirectory = mkdtempSync(join(tmpdir(), 't3-analytics-enabled-'))
const disabledDirectory = mkdtempSync(join(tmpdir(), 't3-analytics-disabled-'))
const port = Number(process.env.T3_ANALYTICS_E2E_PORT ?? 4175)
const disabledPort = Number(process.env.T3_ANALYTICS_DISABLED_E2E_PORT ?? 4176)
const baseURL = `http://127.0.0.1:${port}`
const disabledURL = `http://127.0.0.1:${disabledPort}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'analytics.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'list',
  outputDir: process.env.CI ? 'test-results/analytics' : join(outputDirectory, 'test-results'),
  use: {
    baseURL,
    locale: 'en-GB',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--disable-webgl'], ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}) },
  },
  webServer: [{
    command: `pnpm exec vite build --mode full --outDir ${outputDirectory} --emptyOutDir && pnpm exec vite preview --outDir ${outputDirectory} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: `pnpm exec vite build --mode full --outDir ${disabledDirectory} --emptyOutDir && pnpm exec vite preview --outDir ${disabledDirectory} --host 127.0.0.1 --port ${disabledPort} --strictPort`,
    url: disabledURL,
    reuseExistingServer: false,
    timeout: 120_000,
  }],
})
