/** Audit source and published artifacts without requiring Blender or third-party tools. */
import { readFile, readdir, lstat } from 'node:fs/promises'
import { closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, relative, extname, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, inflateSync, zstdDecompressSync } from 'node:zlib'

const rules = [
  ['personal home directory', /\/(?:Users|home)\/(?!example(?:[/'"\s]|$)|runner(?:[/'"\s]|$))[^\s\0"'<>]+/g],
  ['Windows user directory', /[A-Z]:[\\/]Users[\\/](?!example\b)[^\s\0"'<>]+/gi],
  ['private network address', /(?<![\w.])(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(?![\w.])/g],
]

const policyLimit = 64 * 1024
const emptyPolicy = Object.freeze({ blockedTerms: Object.freeze([]), binaryBlockedTerms: Object.freeze([]) })
const binaryExtensions = new Set(['.png', '.blend', '.glb', '.gif', '.jpg', '.jpeg', '.webp'])

/** Policies contain only bounded literal terms; labels and regular expressions are forbidden. */
export function parsePrivacyPolicy(source) {
  try {
    if (Buffer.byteLength(source) > policyLimit) throw new Error()
    const value = JSON.parse(source)
    const validTerms = terms => Array.isArray(terms) && terms.length <= 256
      && terms.every(term => typeof term === 'string' && term.trim().length >= 3 && term.length <= 512
        && ![...term].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !['version', 'blockedTerms', 'binaryBlockedTerms'].includes(key))
      || value.version !== 1 || !validTerms(value.blockedTerms)
      || (value.binaryBlockedTerms !== undefined && !validTerms(value.binaryBlockedTerms))) throw new Error()
    const normalize = terms => Object.freeze([...new Set(terms.map(term => term.normalize('NFKC').toLowerCase()))])
    return Object.freeze({ blockedTerms: normalize(value.blockedTerms), binaryBlockedTerms: normalize(value.binaryBlockedTerms ?? []) })
  } catch { throw new Error('privacy policy is invalid or exceeds its limits') }
}

function within(directory, path) {
  const difference = relative(directory, path)
  return difference === '' || (difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference))
}

/** Administrative Git storage is permitted; publishable working-tree policy files are rejected. */
export function loadPrivacyPolicy(policyFile, repositoryRoot, gitDirectory) {
  if (policyFile === undefined || policyFile === '') return emptyPolicy
  let descriptor
  try {
    if (!isAbsolute(policyFile)) throw new Error()
    const path = realpathSync(policyFile)
    if (repositoryRoot && within(realpathSync(repositoryRoot), path)
      && !(gitDirectory && within(realpathSync(gitDirectory), path))) throw new Error()
    descriptor = openSync(path, 'r')
    const info = fstatSync(descriptor)
    if (!info.isFile() || info.size > policyLimit) throw new Error()
    const bytes = Buffer.alloc(policyLimit + 1)
    let size = 0, count
    do { count = readSync(descriptor, bytes, size, bytes.length - size, null); size += count } while (count && size < bytes.length)
    return parsePrivacyPolicy(bytes.subarray(0, size).toString('utf8'))
  } catch { throw new Error('privacy policy is unavailable, invalid or inside the publishable tree') }
  finally { if (descriptor !== undefined) closeSync(descriptor) }
}

/** RFC1918 addresses are legitimate fixtures; every other rule still applies to tests. */
export function isTestFixturePath(filename) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(filename)
}

export function safeFindingPath(path, policy = emptyPolicy) {
  try {
    const reportPolicy = { blockedTerms: [...policy.blockedTerms, ...policy.binaryBlockedTerms], binaryBlockedTerms: [] }
    return privacyFindings(Buffer.from(path), 'path.txt', reportPolicy).length ? '[path withheld]' : path
  }
  catch { return '[path withheld]' }
}

/** Decode textual PNG chunks, including compressed comments; pixels remain untouched. */
export function pngMetadata(content) {
  if (content.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG signature')
  const values = []
  let offset = 8
  let ended = false
  while (offset + 12 <= content.length) {
    const length = content.readUInt32BE(offset)
    const kind = content.subarray(offset + 4, offset + 8).toString('ascii')
    if (offset + length + 12 > content.length) throw new Error('Truncated PNG chunk')
    const data = content.subarray(offset + 8, offset + 8 + length)
    if (kind === 'tEXt') values.push(data.toString('utf8'))
    if (kind === 'zTXt') {
      const separator = data.indexOf(0)
      if (separator < 0 || data[separator + 1] !== 0) throw new Error('Invalid PNG compressed text')
      values.push(data.subarray(0, separator).toString(), inflateSync(data.subarray(separator + 2)).toString())
    }
    if (kind === 'iTXt') {
      const separator = data.indexOf(0)
      if (separator < 0) throw new Error('Invalid PNG international text')
      const languageEnd = data.indexOf(0, separator + 3)
      const translatedEnd = data.indexOf(0, languageEnd + 1)
      if (languageEnd < 0 || translatedEnd < 0) throw new Error('Invalid PNG international text')
      const text = data.subarray(translatedEnd + 1)
      values.push(data.subarray(0, separator).toString(), (data[separator + 1] ? inflateSync(text) : text).toString())
    }
    if (kind === 'eXIf') values.push(data.toString('latin1'))
    if (kind === 'iCCP') {
      const separator = data.indexOf(0)
      if (separator < 0 || data[separator + 1] !== 0) throw new Error('Invalid PNG color profile')
      values.push(inflateSync(data.subarray(separator + 2)).toString('latin1'))
    }
    offset += length + 12
    if (kind === 'IEND') { ended = true; break }
  }
  if (!ended || offset !== content.length) throw new Error('Invalid PNG ending')
  return values.join('\n')
}

// Bound intermediate strings while retaining context on both sides of a window.
// The NUL-stripped stream keeps its own carry, including across all-NUL blocks.
function* textWindows(source, overlap, stripNulls) {
  const step = 64 * 1024
  let pending = '', previous = ''
  for (let offset = 0; offset < source.length; offset += step) {
    const part = source.slice(offset, offset + step)
    pending += stripNulls ? part.replaceAll('\0', '') : part
    while (pending.length > step + overlap) {
      yield { text: previous + pending.slice(0, step + overlap), start: previous.length, end: previous.length + step }
      previous = pending.slice(step - overlap, step)
      pending = pending.slice(step)
    }
  }
  if (pending.length) yield { text: previous + pending, start: previous.length, end: previous.length + pending.length }
}

function scanText(source, filename, policy, findings, { general = true, binary = false } = {}) {
  const overlap = Math.max(1024, ...policy.blockedTerms.map(term => term.length + 16), ...policy.binaryBlockedTerms.map(term => term.length + 16))
  const activeRules = general ? rules.filter(([name]) => name !== 'private network address' || !isTestFixturePath(filename)) : []
  if (general && extname(filename).toLowerCase() === '.blend') activeRules.push(['external application resource', /(?:\/Applications\/|[A-Z]:\\Program Files\\)/g])
  for (const stripNulls of source.includes('\0') ? [false, true] : [false]) {
    for (const window of textWindows(source, overlap, stripNulls)) {
      for (const [name, rule] of activeRules) {
        if (findings.has(name)) continue
        // Matches belong to the central interval; the surrounding context avoids
        // treating a truncated home name or a numeric lookup table as a leak.
        rule.lastIndex = window.start
        const match = rule.exec(window.text)
        if (match && match.index < window.end) findings.add(name)
      }
      const scanGeneral = general && policy.blockedTerms.length && !findings.has('operator privacy policy match')
      const scanBinary = binary && policy.binaryBlockedTerms.length && !findings.has('operator binary privacy policy match')
      if (!scanGeneral && !scanBinary) continue
      const normalized = window.text.normalize('NFKC').toLowerCase()
      if (scanGeneral && policy.blockedTerms.some(term => normalized.includes(term))) findings.add('operator privacy policy match')
      if (scanBinary && policy.binaryBlockedTerms.some(term => normalized.includes(term))) findings.add('operator binary privacy policy match')
    }
  }
}

export function privacyFindings(content, filename, policy = emptyPolicy) {
  const extension = extname(filename).toLowerCase()
  let text
  const nestedFindings = []
  if (extension === '.png' && content.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') text = pngMetadata(content)
  else if (extension === '.blend') {
    const magic = content.subarray(0, 4).toString('hex')
    const decoded = magic === '28b52ffd' ? zstdDecompressSync(content) : magic.startsWith('1f8b') ? gunzipSync(content) : content
    if (!decoded.subarray(0, 7).equals(Buffer.from('BLENDER'))) throw new Error('Invalid Blender file')
    text = decoded.toString('latin1')
  } else if (extension === '.glb') {
    if (content.length < 20 || content.toString('ascii', 0, 4) !== 'glTF' || content.readUInt32LE(4) !== 2 || content.readUInt32LE(8) !== content.length) throw new Error('Invalid GLB header')
    const length = content.readUInt32LE(12)
    if (content.toString('ascii', 16, 20) !== 'JSON' || 20 + length > content.length) throw new Error('Invalid GLB JSON chunk')
    text = content.subarray(20, 20 + length).toString()
    const document = JSON.parse(text)
    if ([...(document.images ?? []), ...(document.buffers ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) return ['external model resource']
    let binary
    for (let offset = 12; offset < content.length;) {
      if (offset + 8 > content.length) throw new Error('Truncated GLB chunk')
      const size = content.readUInt32LE(offset)
      if (size % 4 || offset + 8 + size > content.length) throw new Error('Invalid GLB chunk length')
      if (content.toString('ascii', offset + 4, offset + 8) === 'BIN\0') {
        if (binary) throw new Error('Multiple GLB binary chunks')
        binary = content.subarray(offset + 8, offset + 8 + size)
      }
      offset += 8 + size
    }
    const dataUri = uri => {
      const separator = uri.indexOf(',')
      if (!uri.startsWith('data:') || separator < 0) throw new Error('Invalid embedded GLB data URI')
      const header = uri.slice(5, separator), value = uri.slice(separator + 1)
      if (!header.endsWith(';base64') && /%(?![0-9a-f]{2})/i.test(value)) throw new Error('Invalid embedded GLB data URI escape')
      const bytes = header.endsWith(';base64') ? Buffer.from(value, 'base64')
        : Buffer.concat(value.split(/(%[0-9a-f]{2})/i).map(part => /^%[0-9a-f]{2}$/i.test(part) ? Buffer.from([parseInt(part.slice(1), 16)]) : Buffer.from(part)))
      return { mimeType: header.split(';')[0], bytes }
    }
    for (const image of document.images ?? []) {
      let bytes, mimeType = image.mimeType
      if (image.uri) {
        const embedded = dataUri(image.uri)
        bytes = embedded.bytes
        mimeType ||= embedded.mimeType
      } else {
        const view = document.bufferViews?.[image.bufferView]
        if (!view) throw new Error('GLB image references a missing buffer view')
        const buffer = document.buffers?.[view.buffer]
        const source = buffer?.uri ? dataUri(buffer.uri).bytes : view.buffer === 0 ? binary : undefined
        const offset = view.byteOffset ?? 0
        if (!source || !Number.isSafeInteger(offset) || !Number.isSafeInteger(view.byteLength) || offset < 0 || view.byteLength < 0 || offset + view.byteLength > source.length) throw new Error('GLB image exceeds its buffer')
        bytes = source.subarray(offset, offset + view.byteLength)
      }
      const magic = bytes.subarray(0, 12)
      const imageName = mimeType === 'image/png' || magic.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'embedded.png'
        : mimeType === 'image/jpeg' || magic.subarray(0, 2).toString('hex') === 'ffd8' ? 'embedded.jpeg'
          : mimeType === 'image/gif' || /^GIF8[79]a/.test(magic.toString('ascii')) ? 'embedded.gif'
            : mimeType === 'image/webp' || magic.toString('ascii', 8, 12) === 'WEBP' ? 'embedded.webp' : 'embedded.image'
      nestedFindings.push(...privacyFindings(bytes, imageName, policy).map(finding => `embedded image: ${finding}`))
    }
  } else text = content.toString('utf8')
  const findings = new Set(nestedFindings)
  const binary = binaryExtensions.has(extension)
  // Scan decoded metadata without concatenating complete copies of the payload.
  // EXIF and residual buffers may encode strings with interleaved NUL bytes.
  scanText(text, filename, policy, findings, { binary })
  if (binary && policy.binaryBlockedTerms.length) {
    scanText(content.toString('utf8'), filename, policy, findings, { general: false, binary: true })
  }
  return [...findings]
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (entry.isFile()) files.push(path)
    else if (entry.isSymbolicLink()) throw new Error('published directory contains a symlink')
  }
  return files
}

export async function auditPublicArtifacts(buildDirectory, { cwd = process.cwd(), policyFile = process.env.T3_PRIVACY_POLICY_FILE } = {}) {
  let policy, root
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    const gitDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    policy = loadPrivacyPolicy(policyFile, root, gitDirectory)
  } catch { return { checked: 0, failures: [{ file: '[policy]', findings: ['privacy policy or repository could not be validated'] }] } }
  const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  const files = new Set(tracked.map(path => resolve(root, path)))
  if (buildDirectory) for (const path of await walk(resolve(root, buildDirectory))) files.add(path)
  const failures = []
  let checked = 0
  for (const path of files) {
    const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (info?.isSymbolicLink()) { failures.push({ file: safeFindingPath(relative(root, path), policy), findings: ['source symlink requires explicit publication review'] }); continue }
    if (!info?.isFile()) continue
    checked++
    try {
      const findings = [...new Set([...privacyFindings(Buffer.from(relative(root, path)), 'path.txt', policy), ...privacyFindings(await readFile(path), path, policy)])]
      if (findings.length) failures.push({ file: safeFindingPath(relative(root, path), policy), findings })
    } catch { failures.push({ file: safeFindingPath(relative(root, path), policy), findings: ['artifact inspection failed'] }) }
  }
  return { checked, failures }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length && (args[0] !== '--build' || args.length !== 2)) throw new Error()
    const result = await auditPublicArtifacts(args[1])
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.failures.length ? 1 : 0
  } catch {
    console.log(JSON.stringify({ checked: 0, failures: [{ file: '[audit]', findings: ['artifact audit failed'] }] }))
    process.exitCode = 1
  }
}
