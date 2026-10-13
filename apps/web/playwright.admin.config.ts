import { defineConfig } from '@playwright/test'

const evidenceDir = process.env.T3_ADMIN_EVIDENCE_DIR ?? '../../artifacts/qa-global-admin'

const viewports = [
  { name: 'mobile-narrow', viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true },
  { name: 'mobile-wide', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
]
const engines = process.env.T3_QA_WEBKIT === 'true' ? ['chromium', 'webkit'] as const : ['chromium'] as const
export default defineConfig({
  testDir: './test', testMatch: 'global-admin.browser.ts', workers: 1, timeout: 90_000, fullyParallel: false,
  outputDir: `${evidenceDir}/browser`,
  reporter: [['list'], ['json', { outputFile: `${evidenceDir}/results.json` }], ['html', { outputFolder: `${evidenceDir}/report`, open: 'never' }]],
  use: { locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', trace: 'on', screenshot: 'on',
    launchOptions: { args: ['--disable-webgl'] } },
  projects: engines.flatMap(browserName => viewports.map(({ name, ...use }) => ({ name: `${browserName}-${name}`, use: { ...use, browserName,
    ...(browserName === 'chromium' && process.env.T3_QA_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.T3_QA_CHROMIUM_PATH, args: ['--disable-webgl'] } } : {}) } }))),
})
