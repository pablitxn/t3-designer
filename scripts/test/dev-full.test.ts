import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const launcherModule = await import(new URL('../dev-full.mjs', import.meta.url).href)
const packageManagerCommand = launcherModule.packageManagerCommand as (managerPath: string) => string[]

test('package manager launcher executes a native binary without parsing it as JavaScript', async () => {
  const [command, ...args] = packageManagerCommand(process.execPath)
  const result = await execute(command, [...args, '--eval', 'console.log("native runner works")'])
  assert.equal(result.stdout.trim(), 'native runner works')
})

test('package manager launcher supports JavaScript and extensionless Node shims', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-runner-'))
  try {
    for (const name of ['pnpm.cjs', 'pnpm']) {
      const managerPath = join(directory, name)
      await writeFile(managerPath, '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)))\n')
      const [command, ...args] = packageManagerCommand(managerPath)
      const result = await execute(command, [...args, '--filter', '@t3-designer/web', 'dev:full'])
      assert.deepEqual(JSON.parse(result.stdout), ['--filter', '@t3-designer/web', 'dev:full'])
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
