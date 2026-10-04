import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, statfs, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureLibraryCapacity } from '../src/storage-capacity.ts'

test('capacity counts persisted references, candidate iterations, published copies and SQLite WAL', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-capacity-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const folder of ['references', 'jobs/job/round-1', 'assets/asset']) await mkdir(join(directory, folder), { recursive: true })
  for (const file of ['references/photo.png', 'jobs/job/round-1/source.blend', 'assets/asset/source.blend', 'library.sqlite-wal']) await writeFile(join(directory, file), Buffer.alloc(25))
  await ensureLibraryCapacity(directory, 140, 40)
  await assert.rejects(ensureLibraryCapacity(directory, 139, 40), /límite de almacenamiento/)
  await rm(join(directory, 'jobs/job/round-1/source.blend'))
  await ensureLibraryCapacity(directory, 139, 40)
  await symlink(directory, join(directory, 'jobs/cycle'))
  await ensureLibraryCapacity(directory, 139, 40) // Never follow symlinks outside/around the tree.
})

test('empty libraries still require the reserved budget and sufficient physical free space', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-capacity-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await assert.rejects(ensureLibraryCapacity(directory, 10, 11), /límite de almacenamiento/)
  const filesystem = await statfs(directory)
  const impossibleReserve = filesystem.blocks * filesystem.bsize + 1024
  await assert.rejects(ensureLibraryCapacity(directory, impossibleReserve + 1, impossibleReserve), /temporalmente lleno/)
  await assert.rejects(ensureLibraryCapacity(directory, NaN, 1), /bytes enteros/)
})
