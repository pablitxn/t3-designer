import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'shared-editor.spec.ts', workers: 1, retries: 0,
  timeout: 90_000, expect: { timeout: 10_000 }, fullyParallel: false,
  outputDir: process.env.T3_QA_RESULTS ?? '/tmp/t3-shared-editor-results',
  reporter: [['list'], ['json', { outputFile: process.env.T3_QA_REPORT ?? '/tmp/t3-shared-editor-report.json' }]],
  use: { locale: 'es-AR', trace: { mode: 'on', screenshots: false, snapshots: true, sources: true }, screenshot: 'on',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'], ...(process.env.T3_QA_CHROMIUM ? { executablePath: process.env.T3_QA_CHROMIUM } : {}) } },
  projects: ['chromium', 'webkit'].flatMap(browserName => [
    { name: `${browserName}-mobile-narrow`, use: { browserName: browserName as 'chromium' | 'webkit', viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: `${browserName}-mobile-wide`, use: { browserName: browserName as 'chromium' | 'webkit', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
    { name: `${browserName}-desktop`, use: { browserName: browserName as 'chromium' | 'webkit', viewport: { width: 1440, height: 1000 } } },
  ]).map(project => project.name.startsWith('webkit') ? { ...project, use: { ...project.use, launchOptions: {} } } : project),
})
