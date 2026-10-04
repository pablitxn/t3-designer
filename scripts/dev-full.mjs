import { spawn } from 'node:child_process'
import { closeSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

export function packageManagerCommand(managerPath) {
  // npm_execpath can point to pnpm's standalone binary or its Node entrypoint.
  // Corepack and other shims may use an extensionless Node script.
  const descriptor = openSync(managerPath, 'r')
  const header = Buffer.alloc(256)
  let length
  try { length = readSync(descriptor, header, 0, header.length, 0) }
  finally { closeSync(descriptor) }
  const nodeScript = /\.[cm]?js$/i.test(managerPath)
    || /^#![^\r\n]*\bnode(?:\s|$)/.test(header.subarray(0, length).toString('utf8').trimStart())
  return nodeScript ? [process.execPath, managerPath] : [managerPath]
}

function main() {
  if (!process.env.npm_execpath) throw new Error('Run this through pnpm dev:full.')
  const [command, ...prefix] = packageManagerCommand(process.env.npm_execpath)
  const children = [
    ['--filter', '@t3-designer/api', 'dev'],
    ['--filter', '@t3-designer/web', 'dev:full'],
  ].map(args => spawn(command, [...prefix, ...args], {
    cwd: root, stdio: 'inherit', env: process.env,
    detached: process.platform !== 'win32',
  }))
  let stopping = false
  function stop(code) {
    if (stopping) return
    stopping = true
    process.exitCode = code
    const groups = children.flatMap(child => child.pid ? [child.pid] : [])
    if (process.platform === 'win32') {
      // Windows has no POSIX process groups; include each runner's descendants.
      for (const pid of groups) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
      return
    }
    const signalGroup = (pid, signal) => {
      try { process.kill(-pid, signal); return true }
      catch (error) { if (error.code !== 'ESRCH') throw error; return false }
    }
    // Stop pnpm, its script shell and node --watch/Vite together. Killing only
    // pnpm can otherwise leave listeners alive after this launcher exits.
    for (const pid of groups) signalGroup(pid, 'SIGTERM')
    const deadline = Date.now() + 3000
    const pending = setInterval(() => {
      const remaining = groups.filter(pid => signalGroup(pid, 0))
      if (!remaining.length || Date.now() >= deadline) {
        for (const pid of remaining) signalGroup(pid, 'SIGKILL')
        clearInterval(pending)
      }
    }, 50)
  }
  for (const child of children) {
    child.on('error', error => { console.error(error.message); stop(1) })
    child.on('exit', code => { if (!stopping) stop(code ?? 1) })
  }
  process.on('SIGINT', () => stop(0))
  process.on('SIGTERM', () => stop(0))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
