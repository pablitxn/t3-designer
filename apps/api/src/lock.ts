import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** Hold an OS-released SQLite lock on a separate file, never on the job database.
 * Container restarts routinely reuse PID 1, so PID files cannot identify owners.
 * Keep the lock file in place: unlinking it could allow a second locked inode. */
export function acquireLibraryLock(directory: string): () => void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(join(directory, '.backend-lock.sqlite'))
  try {
    database.exec('PRAGMA busy_timeout = 0; PRAGMA journal_mode = DELETE; BEGIN EXCLUSIVE;')
  } catch (error) {
    database.close()
    const code = (error as { errcode?: number }).errcode
    if (code === 5 || code === 6) {
      throw new Error('Otro backend ya está usando esta biblioteca. Cerralo antes de iniciar otra instancia.', { cause: error })
    }
    throw error
  }
  let released = false
  return () => {
    if (released) return
    released = true
    try { database.exec('ROLLBACK') }
    finally { database.close() }
  }
}
