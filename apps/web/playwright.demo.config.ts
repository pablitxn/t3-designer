import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outputDirectory = process.env.T3_DEMO_BUILD_DIR ??= mkdtempSync(join(tmpdir(), 't3-demo-build-'))
const port = Number(process.env.T3_DEMO_E2E_PORT ?? 4185)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e', testMatch: 'demo.spec.ts', fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, retries: 0, reporter: 'list',
  outputDir: join(outputDirectory, 'test-results'),
  use: { baseURL, locale: 'en-GB', viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: {
      args: ['--disable-webgl'], ...(process.env.T3_PLAYWRIGHT_CHANNEL ? { channel: process.env.T3_PLAYWRIGHT_CHANNEL } : {}),
    } },
  webServer: {
    command: `pnpm build --manifest --outDir ${outputDirectory} --emptyOutDir && pnpm exec vite preview --outDir ${outputDirectory} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 120_000,
  },
})
