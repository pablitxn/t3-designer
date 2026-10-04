import { defineConfig } from '@playwright/test'

const port = Number(process.env.T3_E2E_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  // Analytics has a separate production-only server/configuration.
  testIgnore: ['**/analytics.spec.ts', '**/demo.spec.ts'],
  // Concurrent work in this checkout must not delete another run's traces.
  outputDir: process.env.CI ? 'test-results/i18n' : `/tmp/t3-designer-i18n-results-${process.pid}`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Exercise the documented fallback without depending on a host GPU.
    launchOptions: { args: ['--disable-webgl'], ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}) },
  },
  webServer: {
    command: `pnpm dev:full --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
})
