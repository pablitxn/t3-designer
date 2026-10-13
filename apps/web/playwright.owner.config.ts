import { defineConfig } from '@playwright/test'

const port = Number(process.env.T3_QA_WEB_PORT ?? 4189)
const apiPort = Number(process.env.T3_QA_API_PORT ?? 8798)
const webgl = process.env.T3_QA_WEBGL === 'true'
const baseURL = `http://127.0.0.1:${port}`
const regressionSpecs = ['private-auth', 'project-foundations', 'foundation-agent', 'foundation-agent-credits', 'foundation-registration-status', 'project-generation', 'editor', 'assets', 'asset-revisions', 'asset-history-links', 'account-usage', 'account-credits', 'official-research'].map(name => `${name}.spec.ts`)
const directory = process.env.T3_QA_DIRECTORY ?? `artifacts/owner-qa/run-${Date.now()}`
process.env.T3_QA_DIRECTORY = directory

export default defineConfig({
  testDir: './e2e', testMatch: webgl ? 'owner-webgl.spec.ts' : process.env.T3_QA_REGRESSIONS === 'true' ? regressionSpecs : 'owner-qa.spec.ts', fullyParallel: false, workers: 1,
  forbidOnly: true, retries: 0, timeout: 90_000, expect: { timeout: 10_000 },
  outputDir: `../../${directory}/browser-results`,
  reporter: [['list'], ['json', { outputFile: `../../${directory}/results.json` }], ['html', { outputFolder: `../../${directory}/html`, open: 'never' }]],
  use: { actionTimeout: 20_000, baseURL, locale: 'es-AR', trace: 'on', screenshot: 'on',
    launchOptions: { executablePath: process.env.T3_QA_CHROMIUM ?? '/usr/bin/chromium', args: webgl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] : ['--disable-webgl'] } },
  projects: [
    { name: 'chromium-touch-360', use: { viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true } },
    { name: 'chromium-touch-430', use: { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true } },
    { name: 'chromium-desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: [
    { command: 'node ../api/test/owner-qa-backend.ts', url: `http://127.0.0.1:${apiPort}/api/live`, reuseExistingServer: false,
      env: { NODE_ENV: 'development', T3_OWNER_QA: 'isolated-fixtures', T3_QA_DIRECTORY: directory, T3_QA_ORIGIN: baseURL, T3_QA_API_PORT: String(apiPort), T3_DATABASE_URL: '', OPENAI_API_KEY: '', CODEX_API_KEY: '', OTEL_EXPORTER_OTLP_ENDPOINT: '' } },
    { command: `pnpm dev:full --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false, env: { T3_API_PROXY_URL: `http://127.0.0.1:${apiPort}` } },
  ],
})
