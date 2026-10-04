import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAccounts } from './accounts.ts'
import { openAppDatabase } from './app-database.ts'
import { runtimeConfig } from './config.ts'
import { AssetStore } from './store.ts'

async function main() {
  process.umask(0o077)
  const [action, email] = process.argv.slice(2)
  if (!['bootstrap', 'claim-library', 'recovery'].includes(action) || !email) throw new Error('Uso: pnpm account <bootstrap|claim-library|recovery> <email>')
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const config = await runtimeConfig(root)
  const database = openAppDatabase({ url: config.databaseURL, sqlitePath: resolve(config.accountDirectory, 'accounts.sqlite') })
  try {
    const accounts = await createAccounts({ database, baseURL: config.publicURL, secret: config.secret, production: config.production })
    if (action === 'claim-library') {
      const user = await database.db.selectFrom('user').select(['id', 'role']).where('email', '=', email.toLowerCase()).executeTakeFirst()
      if (!user || user.role !== 'admin') throw new Error('La biblioteca anterior solo puede asignarse a una cuenta administradora existente.')
      const store = new AssetStore(resolve(config.directory, 'library.sqlite'))
      try { store.claimLegacyLibrary(user.id) } finally { store.close() }
      console.log('Biblioteca anterior asignada. Ningún archivo fue movido ni eliminado.')
      return
    }
    const result = action === 'bootstrap' ? await accounts.createBootstrapInvitation(email) : await accounts.createRecovery(email)
    const route = action === 'bootstrap' ? 'invite' : 'recover'
    const output = resolve(config.accountDirectory, `${action}-link.txt`)
    await writeFile(output, `${config.publicURL}/${route}#token=${encodeURIComponent(result.token)}\n`, { mode: 0o600 })
    console.log(`Enlace de un solo uso guardado en ${output}. No se envió ningún email.`)
  } finally { await database.close() }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo completar la operación.')
  process.exitCode = 1
})
