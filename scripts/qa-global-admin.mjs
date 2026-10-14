import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { globalAdminFixture, seedUsage } from '../apps/web/test/global-admin-fixture.ts'

// The fixture chooses fresh /tmp databases and loopback ports. No .env is loaded.
const f = await globalAdminFixture(process.argv.includes('--disabled') ? 'disabled' : 'mock')
const credentials = resolve('artifacts/qa-global-admin/demo-credentials.txt')
try {
  await seedUsage(f, f.admin, 26)
  await seedUsage(f, f.standard, 1)
  await mkdir(resolve('artifacts/qa-global-admin'), { recursive: true, mode: 0o700 })
  await writeFile(credentials, `Temporary LOCAL fixture only. Deleted on shutdown.\n${f.origin}/login\n${[f.admin, f.standard, f.premium, f.secondAdmin].map(user => user.email).join('\n')}\nPassword: ${f.password}\n`, { mode: 0o600 })
  console.log(`Local QA: ${f.origin}/login\nDisposable credentials: ${credentials}\nGeneration disabled; billing ${process.argv.includes('--disabled') ? 'disabled' : 'mock'}. Stop with Ctrl-C.`)
  await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve) })
} finally { await f.close(); await rm(credentials, { force: true }) }
