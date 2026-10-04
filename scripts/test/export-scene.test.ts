import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../export_scene.ts', import.meta.url))
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })

test('CLI rejects an empty output path instead of choosing the repository defaults', () => {
  const result = run('--check', '--output', '')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--output must name a JSON file/)
})

test('CLI exports the exact requested minute and verifies snapshot drift without writing', () => {
  const directory = mkdtempSync(join(tmpdir(), 't3-export-'))
  try {
    const output = join(directory, 'nested', 'winter.json')
    const args = ['--output', output, '--date', '2026-12-21', '--time', '15:01']
    const exported = run(...args)
    assert.equal(exported.status, 0, exported.stderr)
    const content = readFileSync(output, 'utf8')
    const snapshot = JSON.parse(content)
    assert.equal(snapshot.schemaVersion, 1)
    assert.equal(snapshot.solar.selected.utc, '2026-12-21T14:01:00.000Z')
    assert.equal(run(...args, '--check').status, 0)
    assert.equal(readFileSync(output, 'utf8'), content)
    const stale = content.replace('2026-12-21T14:01:00.000Z', '2026-12-21T14:02:00.000Z')
    writeFileSync(output, stale)
    const checked = run(...args, '--check')
    assert.equal(checked.status, 1)
    assert.match(checked.stderr, /Stale or missing snapshots/)
    assert.equal(readFileSync(output, 'utf8'), stale, 'verification must not repair or overwrite a snapshot')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('CLI rejects invalid civil times before creating any output', () => {
  const directory = mkdtempSync(join(tmpdir(), 't3-export-'))
  try {
    const output = join(directory, 'invalid.json')
    for (const args of [
      ['--time', '24:00'],
      ['--date', '2026-02-30'],
      ['--date', '2026-03-29', '--time', '02:30'],
      ['--date', '2026-10-25', '--time', '02:30'],
    ]) {
      const result = run('--output', output, ...args)
      assert.equal(result.status, 1)
      assert.equal(existsSync(output), false)
    }
    const resolved = run('--output', output, '--date', '2026-10-25', '--time', '02:30', '--occurrence', 'later')
    assert.equal(resolved.status, 0, resolved.stderr)
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).solar.selected.utc, '2026-10-25T01:30:00.000Z')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
