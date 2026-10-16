import { defineConfig } from '@playwright/test'
import viewer from './playwright.viewer.config'

// Keep the original viewer gate intact; this focused run excludes GPU/model checks.
const evidenceDir = process.env.T3_VIEWER_EVIDENCE_DIR ?? '../../artifacts/qa-project-viewer/non3d'
export default defineConfig(viewer, {
  grepInvert: /listing, reviewed bases|walkthrough|missing model bytes/,
  outputDir: `${evidenceDir}/results`,
  reporter: [['list'], ['json', { outputFile: `${evidenceDir}/results.json` }]],
  use: { launchOptions: {
    ...(process.env.T3_VIEWER_CHROMIUM_PATH
      ? { executablePath: process.env.T3_VIEWER_CHROMIUM_PATH }
      : { channel: 'chromium' }),
    args: ['--disable-webgl'],
  } },
})
