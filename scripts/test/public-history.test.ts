import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync } from 'node:zlib'
import { auditPrePush, auditPublicHistory } from '../audit_public_history.mjs'

const scripts = fileURLToPath(new URL('..', import.meta.url))
const privatePath = ['', 'Users', 'sample-person', 'project', 'source.blend'].join('/')
const privateAddress = ['192', '168', '7', '23'].join('.')
const zero = '0'.repeat(40)
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Example contributor', GIT_AUTHOR_EMAIL: 'contributor@example.test',
  GIT_COMMITTER_NAME: 'Example contributor', GIT_COMMITTER_EMAIL: 'contributor@example.test' }
function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
function fixture(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), 't3-history-test-'))
  try { git(cwd, 'init', '-q', '-b', 'main'); run(cwd) }
  finally { rmSync(cwd, { recursive: true, force: true }) }
}
function save(cwd: string, path: string, content: string | Buffer) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), content)
}
function commit(cwd: string, message = 'Example content') {
  git(cwd, 'add', '-A'); git(cwd, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', message)
  return git(cwd, 'rev-parse', 'HEAD')
}

test('history scans only the selected tip, excluding unrelated local branches', () => fixture(cwd => {
  save(cwd, 'README.md', 'Portable example: /home/example'); const clean = commit(cwd)
  git(cwd, 'checkout', '-q', '-b', 'private-fixture')
  save(cwd, 'local.txt', privatePath); commit(cwd)
  git(cwd, 'checkout', '-q', 'main')
  const result = auditPublicHistory({ cwd })
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), clean)
  assert.equal(result.checkedCommits, 1); assert.equal(result.checkedBlobs, 1)
  assert.deepEqual(result.failures, [])
}))

test('history rejects an ancestor leak even when the current tree is clean', () => fixture(cwd => {
  save(cwd, 'docs/reference.md', privatePath); commit(cwd)
  save(cwd, 'docs/reference.md', 'Public methods only.'); commit(cwd, 'Generalize example')
  const result = auditPublicHistory({ cwd })
  assert.equal(result.checkedCommits, 2)
  assert.ok(result.failures.some(item => item.path === 'docs/reference.md' && item.findings.includes('personal home directory')))
  assert.ok(!JSON.stringify(result).includes(privatePath))
}))

test('commit and annotated tag metadata are audited without printing their contents', () => fixture(cwd => {
  save(cwd, 'README.md', 'Safe contents'); commit(cwd, `Historical endpoint ${privateAddress}`)
  git(cwd, 'tag', '-a', 'example-release', '-m', `Historical location ${privatePath}`)
  const result = auditPublicHistory({ cwd, revision: 'example-release' })
  assert.ok(result.failures.some(item => item.type === 'commit'))
  assert.ok(result.failures.some(item => item.type === 'tag'))
  assert.ok(!JSON.stringify(result).includes(privateAddress))
  assert.ok(!JSON.stringify(result).includes(privatePath))
}))

test('historical extensions preserve decoding after compressed Blender blobs are renamed', () => fixture(cwd => {
  save(cwd, 'models/source.blend', zstdCompressSync(Buffer.from(`BLENDER-v500\0${privatePath}\0`))); commit(cwd)
  git(cwd, 'mv', 'models/source.blend', 'models/notes.dat'); commit(cwd, 'Rename fixture')
  const result = auditPublicHistory({ cwd })
  assert.ok(result.failures.some(item => item.path === 'models/source.blend' && item.findings.includes('personal home directory')))
}))

test('unreadable binary content, shallow history and exhausted bounds fail closed', () => fixture(cwd => {
  save(cwd, 'broken.glb', `invalid ${privatePath}`); const tip = commit(cwd)
  const broken = auditPublicHistory({ cwd })
  assert.ok(broken.failures.some(item => item.findings.includes('artifact decoding failed or exceeded its bound')))
  assert.ok(!JSON.stringify(broken).includes(privatePath))
  assert.ok(auditPublicHistory({ cwd, limits: { maxObjects: 1 } }).failures.length)
  assert.ok(auditPublicHistory({ cwd, revision: 'missing-reference' }).failures.length)
  save(cwd, '.git/shallow', `${tip}\n`)
  assert.ok(auditPublicHistory({ cwd }).failures.some(item => item.findings.some(reason => reason.includes('shallow'))))
}))

test('pre-push audits each proposed tip and ignores deleted refs', () => fixture(cwd => {
  save(cwd, 'README.md', 'Safe contents'); const clean = commit(cwd)
  save(cwd, 'private.txt', privateAddress); const bad = commit(cwd)
  const results = auditPrePush(`refs/heads/main ${clean} refs/heads/main ${zero}\nrefs/heads/extra ${bad} refs/heads/extra ${zero}\n(delete) ${zero} refs/heads/old ${bad}\n`, { cwd })
  assert.equal(results.length, 2)
  assert.equal(results[0].failures.length, 0); assert.ok(results[1].failures.length)
  assert.deepEqual(auditPrePush(`(delete) ${zero} refs/heads/old ${bad}\n`, { cwd }), [])
  assert.ok(auditPrePush('malformed input', { cwd })[0].failures.length)
}))

test('standalone hook auto-loads administrative policy across worktrees and honors an explicit override', () => fixture(cwd => {
  save(cwd, 'README.md', 'Safe contents'); const clean = commit(cwd)
  const hostname = 'restricted.example.test'
  save(cwd, 'private.txt', hostname); const bad = commit(cwd)
  const guard = join(cwd, '.git/privacy-guard'), hook = join(cwd, '.git/hooks/pre-push')
  mkdirSync(guard)
  save(cwd, '.git/privacy-guard/policy.json', JSON.stringify({ version: 1, blockedTerms: [hostname] }))
  for (const name of ['audit_public_history.mjs', 'audit_public_artifacts.mjs']) copyFileSync(join(scripts, name), join(guard, name))
  copyFileSync(join(scripts, 'hooks/pre-push'), hook)
  const other = join(cwd, 'secondary-worktree')
  git(cwd, 'worktree', 'add', '-q', '--detach', other, clean)
  // This scenario exercises auto-load, independently of the invoking CI policy.
  const hookEnv: NodeJS.ProcessEnv = { ...gitEnv }
  delete hookEnv.T3_PRIVACY_POLICY_FILE
  const pushed = spawnSync('sh', [hook], { cwd: other, env: hookEnv, encoding: 'utf8', timeout: 30_000,
    input: `refs/heads/old ${bad} refs/heads/old ${zero}\n` })
  assert.equal(pushed.status, 1)
  assert.ok(pushed.stdout.includes('operator privacy policy match'))
  assert.ok(!pushed.stdout.includes(hostname))
  const deletion = spawnSync('sh', [hook], { cwd: other, env: hookEnv, encoding: 'utf8', timeout: 30_000,
    input: `(delete) ${zero} refs/heads/old ${bad}\n` })
  assert.equal(deletion.status, 0)
  const overrideFile = join(cwd, '.git/override-policy.json')
  save(cwd, '.git/override-policy.json', JSON.stringify({ version: 1, blockedTerms: ['different.example.test'] }))
  const overridden = spawnSync('sh', [hook], { cwd: other, env: { ...hookEnv, T3_PRIVACY_POLICY_FILE: overrideFile }, encoding: 'utf8', timeout: 30_000,
    input: `refs/heads/old ${bad} refs/heads/old ${zero}\n` })
  assert.equal(overridden.status, 0)
  assert.deepEqual(JSON.parse(overridden.stdout).failures, [])
}))


test('history applies operator policy to ancestors, filenames and commit metadata without reflecting values', () => fixture(cwd => {
  const hostname = 'historical.example.test'
  save(cwd, `docs/${hostname}.md`, hostname); commit(cwd, `Remove later: ${hostname}`)
  git(cwd, 'rm', `docs/${hostname}.md`)
  save(cwd, 'README.md', 'Safe current contents'); commit(cwd)
  const policyFile = join(cwd, '.git/operator-policy.json')
  save(cwd, '.git/operator-policy.json', JSON.stringify({ version: 1, blockedTerms: [hostname] }))
  const result = auditPublicHistory({ cwd, policyFile })
  assert.ok(result.failures.some(item => item.type === 'commit' && item.findings.includes('operator privacy policy match')))
  assert.ok(result.failures.some(item => item.type === 'blob' && item.path === '[path withheld]'))
  assert.ok(!JSON.stringify(result).includes(hostname))
  assert.ok(!JSON.stringify(result).includes(policyFile))
  save(cwd, '.git/operator-policy.json', `{ malformed ${hostname}`)
  const invalid = auditPublicHistory({ cwd, policyFile })
  assert.ok(invalid.failures.length)
  assert.ok(!JSON.stringify(invalid).includes(hostname))
  assert.ok(!JSON.stringify(invalid).includes(policyFile))
}))

test('history preserves the generic fixture exception without exempting operator policy', () => fixture(cwd => {
  const hostname = 'fixture.example.test'
  save(cwd, 'network.test.ts', `${privateAddress} ${hostname}`); commit(cwd)
  assert.equal(auditPublicHistory({ cwd }).failures.length, 0)
  const policyFile = join(cwd, '.git/operator-policy.json')
  save(cwd, '.git/operator-policy.json', JSON.stringify({ version: 1, blockedTerms: [hostname] }))
  assert.ok(auditPublicHistory({ cwd, policyFile }).failures.some(item => item.findings.includes('operator privacy policy match')))
}))


test('history applies binary-only terms through decoder children while preserving text attribution', () => fixture(cwd => {
  const handle = 'fictional-contributor'
  save(cwd, 'README.md', `Public author ${handle}`)
  save(cwd, 'scene.blend', zstdCompressSync(Buffer.from(`BLENDER-v500\0demo.blend\0residual/${handle}/source\0`)))
  commit(cwd)
  git(cwd, 'rm', 'scene.blend'); commit(cwd, 'Remove source fixture')
  const policyFile = join(cwd, '.git/operator-policy.json')
  save(cwd, '.git/operator-policy.json', JSON.stringify({ version: 1, blockedTerms: [], binaryBlockedTerms: [handle] }))
  const result = auditPublicHistory({ cwd, policyFile })
  assert.ok(result.failures.some(item => item.path === 'scene.blend' && item.findings.includes('operator binary privacy policy match')))
  assert.ok(result.failures.every(item => item.path !== 'README.md'))
  assert.ok(!JSON.stringify(result).includes(handle))
}))


test('bounded decoder scans a large compressed Blender fixture and detects a late residual term', () => fixture(cwd => {
  const handle = 'fictional-large-source'
  // Compatibility characters and many NULs reproduce the allocation pressure
  // of real Blender buffers without including any private source asset.
  const decoded = Buffer.alloc(32 * 1024 * 1024).fill(Buffer.from([0xb5, 0, 65, 0, 0xbd, 0, 0xff, 0]))
  decoded.write('BLENDER-v500', 0, 'ascii')
  decoded.write(handle, decoded.length - handle.length - 17, 'ascii')
  save(cwd, 'large.blend', zstdCompressSync(decoded)); commit(cwd)
  const policyFile = join(cwd, '.git/operator-policy.json')
  save(cwd, '.git/operator-policy.json', JSON.stringify({ version: 1,
    blockedTerms: Array.from({ length: 106 }, (_, index) => `reserved-${index}.example.test`), binaryBlockedTerms: [handle] }))
  const result = auditPublicHistory({ cwd, policyFile })
  assert.equal(result.checkedBlobs, 1)
  assert.deepEqual(result.failures, [{ path: 'large.blend', type: 'blob', findings: ['operator binary privacy policy match'] }])
}))
