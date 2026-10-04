import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : []
  })
}

test('documentation index and relative file links survive folder organization', () => {
  const files = [resolve(root, 'README.md'), ...markdownFiles(resolve(root, 'docs'))]
  const broken: string[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1].replace(/^<|>$/g, '')
      if (/^(?:[a-z]+:|#|\/)/i.test(target)) continue
      const path = decodeURIComponent(target.split('#')[0])
      if (path && !existsSync(resolve(dirname(file), path))) broken.push(`${file}: ${target}`)
    }
  }
  assert.deepEqual(broken, [])
})
