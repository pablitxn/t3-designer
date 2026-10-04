import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scripts = new Set(['create_door_frame.py', 'create_current_assets.py', 'assemble_apartment.py', 'assemble_building.py', 'assemble_project.py', 'generate_asset.py'])
const [script, ...args] = process.argv.slice(2)
if (!scripts.has(script)) {
  console.error(`Choose a repository Blender entry point: ${[...scripts].join(', ')}`)
  process.exit(1)
}
const mac = '/Applications/Blender.app/Contents/MacOS/Blender'
const binary = process.env.BLENDER_BIN || (process.platform === 'darwin' && existsSync(mac) ? mac : 'blender')
if (isAbsolute(binary) && !existsSync(binary)) {
  console.error(`Blender executable not found: ${binary}. Set BLENDER_BIN to its executable path.`)
  process.exit(1)
}
const root = fileURLToPath(new URL('../', import.meta.url))
const result = spawnSync(binary, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(root, 'scripts/blender', script), '--', ...args], {
  cwd: root, stdio: 'inherit', env: process.env,
})
if (result.error) console.error(`Could not start Blender: ${result.error.message}. Set BLENDER_BIN if Blender is not on PATH.`)
if (result.signal) console.error(`Blender stopped with signal ${result.signal}.`)
process.exitCode = result.status ?? 1
