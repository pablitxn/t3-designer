import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { acquireLibraryLock } from '../src/lock.ts'
import { AssetStore } from '../src/store.ts'

test('library lock is released by the operating system after an unclean process exit', { timeout: 10_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-lock-crash-'))
  const child = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { acquireLibraryLock } from ${JSON.stringify(new URL('../src/lock.ts', import.meta.url).href)};
    const release = acquireLibraryLock(${JSON.stringify(directory)});
    process.on('SIGTERM', () => { release(); process.exit(0); });
    process.stdout.write('locked\\n');
    setInterval(() => {}, 1000);
  `], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  try {
    await Promise.race([
      once(child.stdout, 'data').then(([data]) => assert.match(String(data), /locked/)),
      exited.then(() => { throw new Error('Lock owner stopped before acquiring its lock') }),
    ])
    assert.throws(() => acquireLibraryLock(directory), /Otro backend/)
    // The separate lock must not block the WAL database used by the application.
    const store = new AssetStore(join(directory, 'library.sqlite'))
    try { assert.ok(store.createJob({ url: 'https://example.com/product', notes: '' }).id) }
    finally { store.close() }
    child.kill('SIGKILL')
    await exited
    const release = acquireLibraryLock(directory)
    release()
    release()
    assert.ok((await stat(join(directory, '.backend-lock.sqlite'))).isFile())
    acquireLibraryLock(directory)()
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exited
    await rm(directory, { recursive: true, force: true })
  }
})
