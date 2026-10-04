#!/usr/bin/env node
import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

// The SDK does not expose these CLI isolation switches. execve replaces this
// wrapper, so cancellation reaches Codex directly instead of leaving a child.
const executable = process.env.T3_CODEX_BIN || 'codex'
const candidates = isAbsolute(executable)
  ? [executable]
  : (process.env.PATH || '').split(delimiter).map((directory) => join(directory, executable))
const command = candidates.find((candidate) => {
  try { accessSync(candidate, constants.X_OK); return true } catch { return false }
})
if (!command || process.argv[2] !== 'exec' || typeof process.execve !== 'function') {
  process.stderr.write('The local Codex integration requires Node 24+ and a Codex CLI on PATH.\n')
  process.exit(1)
}
const args = [command, 'exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', ...process.argv.slice(3)]
process.execve(command, args, process.env)
