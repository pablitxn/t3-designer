import { defineConfig } from '@playwright/test'

const viewports = [
  { name: 'mobile-narrow', viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true },
  { name: 'mobile-wide', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
]
const engines = process.env.T3_QA_WEBKIT === 'true' ? ['chromium', 'webkit'] as const : ['chromium'] as const
export default defineConfig({
  testDir: './test', testMatch: 'global-admin.browser.ts', workers: 1, timeout: 90_000, fullyParallel: false,
  outputDir: '../../artifacts/qa-global-admin/browser',
  reporter: [['list'], ['json', { outputFile: '../../artifacts/qa-global-admin/results.json' }], ['html', { outputFolder: '../../artifacts/qa-global-admin/report', open: 'never' }]],
  use: { locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', trace: 'on', screenshot: 'on',
    launchOptions: { args: ['--disable-webgl'] } },
  projects: engines.flatMap(browserName => viewports.map(({ name, ...use }) => ({ name: `${browserName}-${name}`, use: { ...use, browserName,
    ...(browserName === 'chromium' && process.env.T3_QA_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.T3_QA_CHROMIUM_PATH, args: ['--disable-webgl'] } } : {}) } }))),
})
