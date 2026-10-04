import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const directory = new URL('../deploy/local/', import.meta.url)
const target = new URL('.env', directory)
await mkdir(directory, { recursive: true })
const template = await readFile(new URL('.env.example', directory), 'utf8')
const content = template
  .replace(/^T3_POSTGRES_PASSWORD=$/m, `T3_POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`)
  .replace(/^T3_AUTH_SECRET=$/m, `T3_AUTH_SECRET=${randomBytes(48).toString('hex')}`)
try {
  await writeFile(target, content, { flag: 'wx', mode: 0o600 })
  console.log('Created deploy/local/.env with independent local secrets. Next: pnpm local:up')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('deploy/local/.env already exists; kept all existing values. Next: pnpm local:up')
}
