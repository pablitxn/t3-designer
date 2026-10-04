import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { assetCatalog, currentFixtures } from '../apps/web/src/data/current-state.ts'
import { buildBuildingSnapshot, buildProjectSnapshot } from './lib/project-snapshot.ts'
import { buildDemoDossierEvidence } from '../apps/web/src/data/dossier.ts'
import { snapshotsMatch } from './lib/snapshot-comparison.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({ options: {
  check: { type: 'boolean', default: false },
  date: { type: 'string', default: '2026-09-26' },
  time: { type: 'string', default: '15:00' },
  occurrence: { type: 'string', default: 'reject' },
  output: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} })

if (values.help) {
  console.log('Export deterministic scene data. With no --output, refresh the scene and demonstration dossier snapshots.\n'
    + 'Options: --check (read only), --date YYYY-MM-DD, --time HH:MM,\n'
    + '         --occurrence reject|earlier|later (ambiguous Paris time), --output path.json')
} else {
  try {
    if (values.output !== undefined && values.output.trim() === '') throw new Error('--output must name a JSON file')
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) throw new Error('--time must be HH:MM between 00:00 and 23:59')
    if (!['reject', 'earlier', 'later'].includes(values.occurrence)) throw new Error('--occurrence must be reject, earlier or later')
    const [hours, minutes] = values.time.split(':').map(Number)
    const options = { date: values.date, minutes: hours * 60 + minutes, disambiguation: values.occurrence as 'reject' | 'earlier' | 'later' }
    const project = buildProjectSnapshot(options)
    for (const asset of project.assets) {
      if (!existsSync(resolve(root, asset.repoPath))) throw new Error(`Missing render asset: ${asset.repoPath}`)
    }
    const outputs = values.output ? [[resolve(values.output), project] as const] : [
      [resolve(root, 'docs/snapshots/t3-apartment.json'), project.apartment],
      [resolve(root, 'docs/snapshots/current-fixtures.json'), { assets: assetCatalog, fixtures: currentFixtures }],
      [resolve(root, 'docs/snapshots/building-site.json'), buildBuildingSnapshot(options)],
      [resolve(root, 'assets/scenes/t3-project.json'), project],
      [resolve(root, 'apps/web/public/dossier/demo-evidence.json'), buildDemoDossierEvidence()],
    ] as const
    const stale: string[] = []
    for (const [path, data] of outputs) {
      const text = JSON.stringify(data, null, 2) + '\n'
      if (values.check) {
        try {
          if (!existsSync(path) || !snapshotsMatch(JSON.parse(readFileSync(path, 'utf8')), JSON.parse(text))) stale.push(path)
        } catch {
          stale.push(path)
        }
      } else {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, text)
      }
    }
    if (stale.length) throw new Error(`Stale or missing snapshots:\n${stale.join('\n')}\nRun pnpm scene:snapshot with the same date/time options.`)
    console.log(`${values.check ? 'Verified' : 'Exported'} ${outputs.length} snapshots; ${project.apartment.rooms.length} rooms, ${project.fixtures.length} fixtures, ${project.buildings.length} buildings.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
