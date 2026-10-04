/** Fail-closed publication audit of one revision and all of its reachable history. */
import { execFileSync } from 'node:child_process'
import { readSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privacyFindings, loadPrivacyPolicy, parsePrivacyPolicy, isTestFixturePath, safeFindingPath } from './audit_public_artifacts.mjs'

const ownFile = fileURLToPath(import.meta.url)
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const zeroId = /^(?:0{40}|0{64})$/
const defaults = Object.freeze({
  maxObjects: 100_000, maxCommits: 10_000, maxTreeEntries: 1_000_000,
  maxBlobBytes: 64 * 1024 * 1024, maxTotalBytes: 1024 * 1024 * 1024,
  maxCommandBytes: 64 * 1024 * 1024, commandTimeoutMs: 30_000,
  scanTimeoutMs: 10_000, maxFailures: 500,
})
const gitEnv = {
  ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1',
  GIT_GRAFT_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_OPTIONAL_LOCKS: '0',
}

class AuditError extends Error {
  constructor(reason) { super(reason); this.name = 'AuditError' }
}
function git(cwd, args, limits, input, maxBuffer = limits.maxCommandBytes) {
  try {
    return execFileSync('git', args, {
      cwd, env: gitEnv, input, maxBuffer: Math.max(maxBuffer, 1024),
      timeout: limits.commandTimeoutMs, stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch { throw new AuditError('git object read failed or exceeded its bound') }
}
function scanObject(cwd, oid, type, extension, size, limits, policy) {
  try {
    // Isolate synchronous binary decoders. A crash, timeout, invalid output or
    // unreadable object is a rejection, never a skipped object or clean result.
    const raw = execFileSync(process.execPath, [
      '--max-old-space-size=384', ownFile, '--scan-object', oid, type,
      extension || '.txt', String(size),
    ], {
      cwd, env: gitEnv, timeout: limits.scanTimeoutMs, input: JSON.stringify({ version: 1, ...policy }),
      maxBuffer: 64 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const findings = JSON.parse(raw.toString('utf8'))
    if (!Array.isArray(findings) || findings.length > 32 || findings.some(value => typeof value !== 'string' || value.length > 160)) throw new Error()
    return findings
  } catch { return ['artifact decoding failed or exceeded its bound'] }
}

/** cwd is the repository being published, never the directory containing this tool. */
export function auditPublicHistory({ cwd = process.cwd(), revision = 'HEAD', limits: overrides = {}, policyFile = process.env.T3_PRIVACY_POLICY_FILE } = {}) {
  const limits = { ...defaults, ...overrides }
  const result = { checkedBlobs: 0, checkedCommits: 0, checkedTags: 0, failures: [] }
  const uniqueFailures = new Set()
  let policy = { blockedTerms: [], binaryBlockedTerms: [] }
  function fail(path, type, findings) {
    if (!findings.length) return
    const finding = { path: safeFindingPath(path, policy), type, findings }
    const key = JSON.stringify(finding)
    if (!uniqueFailures.has(key)) {
      if (result.failures.length >= limits.maxFailures) throw new AuditError('finding limit exceeded; history remains rejected')
      uniqueFailures.add(key); result.failures.push(finding)
    }
  }
  try {
    if (Object.keys(overrides).some(key => !(key in defaults)) || Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)) throw new AuditError('invalid audit limits')
    cwd = resolve(cwd)
    const gitDirectory = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'], limits).toString().trim()
    const repositoryRoot = git(cwd, ['rev-parse', '--is-bare-repository'], limits).toString().trim() === 'true'
      ? undefined : git(cwd, ['rev-parse', '--show-toplevel'], limits).toString().trim()
    policy = loadPrivacyPolicy(policyFile, repositoryRoot, gitDirectory)
    if (git(cwd, ['rev-parse', '--is-shallow-repository'], limits).toString().trim() !== 'false') throw new AuditError('shallow history cannot establish a publication boundary')
    const tip = git(cwd, ['rev-parse', '--verify', '--end-of-options', revision], limits).toString().trim()
    if (!objectId.test(tip)) throw new AuditError('revision does not resolve to one object')
    git(cwd, ['rev-parse', '--verify', '--end-of-options', `${tip}^{commit}`], limits)
    const ids = git(cwd, ['rev-list', '--objects', '--no-object-names', tip, '--'], limits).toString().trim().split('\n').filter(Boolean)
    if (!ids.length || ids.length > limits.maxObjects || ids.some(id => !objectId.test(id))) throw new AuditError('invalid or excessive reachable object inventory')
    const lines = git(cwd, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], limits, ids.join('\n') + '\n').toString().trim().split('\n')
    if (lines.length !== ids.length) throw new AuditError('incomplete object type inventory')
    const objects = new Map()
    let totalBytes = 0
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^([0-9a-f]+) (blob|tree|commit|tag) (\d+)$/)
      if (!match || match[1] !== ids[i]) throw new AuditError('missing or malformed reachable object')
      const size = Number(match[3])
      if (!Number.isSafeInteger(size) || size > limits.maxBlobBytes) throw new AuditError('reachable object exceeds the byte limit')
      totalBytes += size
      if (totalBytes > limits.maxTotalBytes) throw new AuditError('reachable history exceeds the byte limit')
      objects.set(match[1], { type: match[2], size })
    }
    const commits = [...objects].filter(([, value]) => value.type === 'commit')
    if (commits.length > limits.maxCommits) throw new AuditError('commit limit exceeded')
    const trees = new Set()
    for (const [oid, { size }] of commits) {
      const raw = git(cwd, ['cat-file', 'commit', oid], limits, undefined, size + 1)
      const rootTree = raw.toString('utf8', 0, Math.min(raw.length, 80)).match(/^tree ([0-9a-f]+)\n/)?.[1]
      if (!rootTree || objects.get(rootTree)?.type !== 'tree') throw new AuditError('commit tree is missing from reachable history')
      trees.add(rootTree)
      fail('[commit metadata]', 'commit', scanObject(cwd, oid, 'commit', '.txt', size, limits, policy))
      result.checkedCommits++
    }
    for (const [oid, { type, size }] of objects) {
      if (type !== 'tag') continue
      fail('[tag metadata]', 'tag', scanObject(cwd, oid, 'tag', '.txt', size, limits, policy))
      result.checkedTags++
    }
    const blobPaths = new Map()
    let entries = 0
    for (const tree of trees) {
      // NUL-delimited tree paths preserve whitespace/newlines and every filename
      // extension, including renamed copies of a blob across historical trees.
      const listing = git(cwd, ['ls-tree', '-r', '-z', '--full-tree', tree], limits).toString('utf8').split('\0').filter(Boolean)
      entries += listing.length
      if (entries > limits.maxTreeEntries) throw new AuditError('tree-entry limit exceeded')
      for (const entry of listing) {
        const match = entry.match(/^(\d{6}) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/)
        if (!match) throw new AuditError('malformed tree entry')
        const [, mode, type, oid, path] = match
        fail(path, 'path', privacyFindings(Buffer.from(path), 'path.txt', policy))
        if (type === 'commit') { fail(path, 'submodule', ['submodule history requires separate publication review']); continue }
        if (objects.get(oid)?.type !== 'blob') throw new AuditError('tree blob missing from object inventory')
        if (mode === '120000') fail(path, 'symlink', ['historical symlink requires explicit publication review'])
        const paths = blobPaths.get(oid) ?? new Set()
        paths.add(path); blobPaths.set(oid, paths)
      }
    }
    for (const [oid, { type, size }] of objects) {
      if (type !== 'blob') continue
      const paths = blobPaths.get(oid)
      if (!paths?.size) throw new AuditError('reachable blob has no auditable historical path')
      const byExtension = new Map()
      for (const path of paths) {
        const extension = (isTestFixturePath(path) ? '.test' : '') + extname(path).toLowerCase()
        const names = byExtension.get(extension) ?? []
        names.push(path); byExtension.set(extension, names)
      }
      for (const [extension, names] of byExtension) {
        const findings = scanObject(cwd, oid, 'blob', extension, size, limits, policy)
        for (const path of names) fail(path, 'blob', findings)
      }
      result.checkedBlobs++
    }
  } catch (error) {
    result.failures.push({ path: '[history]', type: 'audit-error', findings: [error instanceof AuditError ? error.message : 'history inspection failed'] })
  }
  return result
}

/** Every proposed non-deletion tip is scanned with all ancestors, even new refs. */
export function auditPrePush(input, options = {}) {
  if (Buffer.byteLength(input) > 1024 * 1024) return [{ checkedBlobs: 0, checkedCommits: 0, checkedTags: 0, failures: [{ path: '[push]', type: 'audit-error', findings: ['push input exceeds its bound'] }] }]
  const tips = new Set()
  for (const line of input.split('\n').filter(Boolean)) {
    const fields = line.split(' ')
    if (fields.length !== 4 || !fields[0] || !fields[2] || !objectId.test(fields[1]) || !objectId.test(fields[3])) {
      return [{ checkedBlobs: 0, checkedCommits: 0, checkedTags: 0, failures: [{ path: '[push]', type: 'audit-error', findings: ['invalid push update record'] }] }]
    }
    if (!zeroId.test(fields[1])) tips.add(fields[1])
  }
  return [...tips].map(revision => auditPublicHistory({ ...options, revision }))
}
function boundedStdin() {
  const pieces = []; let total = 0
  while (true) {
    const chunk = Buffer.alloc(64 * 1024)
    const count = readSync(0, chunk, 0, chunk.length, null)
    if (!count) return Buffer.concat(pieces).toString('utf8')
    total += count
    if (total > 1024 * 1024) throw new AuditError('push input exceeds its bound')
    pieces.push(chunk.subarray(0, count))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === ownFile) {
  try {
    const args = process.argv.slice(2)
    if (args[0] === '--scan-object') {
      const [, oid, type, extension, bytes] = args
      const size = Number(bytes)
      if (args.length !== 5 || !objectId.test(oid) || !['blob', 'commit', 'tag'].includes(type) || !/^\.(?:test\.)?[a-z0-9_-]{1,24}$/i.test(extension) || !Number.isSafeInteger(size) || size < 0 || size > defaults.maxBlobBytes) throw new AuditError('invalid decoder input')
      const content = git(process.cwd(), ['cat-file', type, oid], defaults, undefined, size + 1)
      if (content.length !== size) throw new AuditError('object size changed during read')
      const policy = parsePrivacyPolicy(boundedStdin())
      console.log(JSON.stringify(privacyFindings(content, `artifact${extension}`, policy)))
    } else {
      if (args.length > 1 || (args[0]?.startsWith('-') && args[0] !== '--pre-push')) throw new AuditError('usage: node scripts/audit_public_history.mjs [revision|--pre-push]')
      const results = args[0] === '--pre-push' ? auditPrePush(boundedStdin()) : [auditPublicHistory({ revision: args[0] ?? 'HEAD' })]
      console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2))
      process.exitCode = results.some(result => result.failures.length) ? 1 : 0
    }
  } catch {
    console.log(JSON.stringify({ failures: [{ path: '[history]', type: 'audit-error', findings: ['audit invocation or decoder failed'] }] }))
    process.exitCode = 1
  }
}
