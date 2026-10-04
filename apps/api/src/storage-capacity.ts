import { lstat, readdir, statfs } from 'node:fs/promises'
import { join } from 'node:path'

export class StorageCapacityError extends Error {
  readonly status = 507
}

/** Keep private generation artifacts within the explicitly allocated library budget. */
export async function ensureLibraryCapacity(directory: string, maximumBytes: number, reserveBytes = 256 * 1024 * 1024): Promise<void> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || !Number.isSafeInteger(reserveBytes) || reserveBytes < 0) throw new Error('El presupuesto de almacenamiento debe expresarse en bytes enteros válidos.')
  if (reserveBytes > maximumBytes) throw new StorageCapacityError('El taller alcanzó su límite de almacenamiento. Intentá de nuevo más tarde.')
  const filesystem = await statfs(directory)
  if (filesystem.bavail * filesystem.bsize < reserveBytes) throw new StorageCapacityError('El almacenamiento está temporalmente lleno. Intentá de nuevo más tarde.')
  let used = 0
  const visit = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await visit(child)
      else used += (await lstat(child)).size
      if (used + reserveBytes > maximumBytes) throw new StorageCapacityError('El taller alcanzó su límite de almacenamiento. Intentá de nuevo más tarde.')
    }
  }
  await visit(directory)
}
