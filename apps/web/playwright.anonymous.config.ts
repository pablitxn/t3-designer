import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Each invocation gets fresh accounts/assets and evidence. No .env or inference.
const webgl = process.env.T3_ANONYMOUS_WEBGL === '1'
const directory = process.env.T3_ANONYMOUS_RUN_DIR ?? (process.env.CI
  ? resolve('test-results/anonymous', webgl ? 'webgl' : 'ui')
  : mkdtempSync(join(tmpdir(), 't3-anonymous-')))
// CI uploads test-results, so session secrets and databases stay outside it.
const dataDirectory = process.env.T3_ANONYMOUS_DATA_DIR ?? mkdtempSync(join(tmpdir(), 't3-anonymous-data-'))
const port = Number(process.env.T3_ANONYMOUS_WEB_PORT ?? 4190)
const apiPort = Number(process.env.T3_ANONYMOUS_API_PORT ?? 8790)
const baseURL = `http://127.0.0.1:${port}`
const browserName = process.env.T3_ANONYMOUS_BROWSER === 'webkit' ? 'webkit' : 'chromium'
const executablePath = process.env.T3_ANONYMOUS_EXECUTABLE

export default defineConfig({
  testDir: './e2e',
  testMatch: webgl ? ['anonymous-webgl.spec.ts', 'building-map.spec.ts', 'demo-drag.spec.ts'] : [
    'anonymous.spec.ts', 'anonymous-details.spec.ts', 'i18n.spec.ts', 'settings.spec.ts', 'public-assets.spec.ts',
    'demo-layout.spec.ts', 'arrangement-controls.spec.ts', 'apartment-viewer.spec.ts',
    'building-studio.spec.ts', 'energy.spec.ts',
  ],
  grepInvert: webgl ? undefined : /@webgl/,
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: webgl ? 180_000 : 45_000,
  expect: { timeout: 10_000 },
  outputDir: join(directory, 'browser'),
  reporter: [['list'], ['json', { outputFile: join(directory, 'results.json') }], ['html', { outputFolder: join(directory, 'report'), open: 'never' }]],
  use: {
    baseURL, browserName, locale: 'en-GB', timezoneId: 'Europe/Paris',
    trace: 'on', screenshot: 'only-on-failure',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      ...(browserName === 'chromium' ? { args: webgl
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
        : ['--disable-webgl'] } : {}),
    },
  },
  projects: [
    { name: `${browserName}-touch-320`, use: { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true } },
    { name: `${browserName}-touch-430`, use: { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true } },
    { name: `${browserName}-desktop`, use: { viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false } },
  ],
  webServer: [
    {
      command: 'node ../../apps/api/src/index.ts', url: `http://127.0.0.1:${apiPort}/api/live`, reuseExistingServer: false,
      env: { NODE_ENV: 'development', T3_API_HOST: '127.0.0.1', T3_API_PORT: String(apiPort), T3_PUBLIC_URL: baseURL,
        T3_ACCOUNT_DATA_DIR: join(dataDirectory, 'accounts'), T3_ASSET_DATA_DIR: join(dataDirectory, 'assets'), T3_DATABASE_URL: '',
        T3_GENERATION_ENABLED: 'false', T3_BILLING_MODE: 'disabled', T3_INFERENCE_PROVIDER: 'openai', OPENAI_API_KEY: '',
        T3_AUTH_SECRET: '', OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '' },
    },
    {
      command: `pnpm exec vite --mode full --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false,
      env: { T3_API_PROXY_URL: `http://127.0.0.1:${apiPort}` },
    },
  ],
})
