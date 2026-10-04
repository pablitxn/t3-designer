import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { crc32, deflateSync, zstdCompressSync } from 'node:zlib'
import { pngMetadata, privacyFindings, parsePrivacyPolicy, loadPrivacyPolicy, safeFindingPath, auditPublicArtifacts } from '../audit_public_artifacts.mjs'
import { stripPngMetadata } from '../sanitize_png_metadata.mjs'

function chunk(kind: string, value: Buffer) {
  const header = Buffer.alloc(8), checksum = Buffer.alloc(4)
  header.writeUInt32BE(value.length)
  header.write(kind, 4)
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind), value])))
  return Buffer.concat([header, value, checksum])
}

const privatePath = ['','Users','sample-person','repos','source.blend'].join('/')
const png = readFileSync(new URL('../../apps/web/public/demo-assets/strandmon-v1/preview.png', import.meta.url))
const appendBeforeEnd = (part: Buffer) => Buffer.concat([png.subarray(0, -12), part, png.subarray(-12)])

test('publication detects compressed PNG filename metadata and removes it without changing image chunks', () => {
  const hidden = chunk('zTXt', Buffer.concat([Buffer.from('File\0\0'), deflateSync(privatePath)]))
  const leaked = appendBeforeEnd(hidden)
  assert.ok(pngMetadata(leaked).includes(privatePath))
  assert.deepEqual(privacyFindings(leaked, 'preview.png'), ['personal home directory'])
  assert.deepEqual(stripPngMetadata(leaked), png)
  assert.deepEqual(privacyFindings(png, 'preview.png'), [])
  const unicode = appendBeforeEnd(chunk('eXIf', Buffer.from(privatePath, 'utf16le')))
  assert.deepEqual(privacyFindings(unicode, 'preview.png'), ['personal home directory'])
})

test('publication detects paths inside compressed Blender sources', () => {
  const source = zstdCompressSync(Buffer.from(`BLENDER-v500\0${privatePath}\0`))
  assert.deepEqual(privacyFindings(source, 'source.blend'), ['personal home directory'])
})

test('publication distinguishes author attribution, fixtures and application routes from home paths', () => {
  const benign = Buffer.from('Copyright contributor. https://github.com/example/project /users/credits /home/example')
  assert.deepEqual(privacyFindings(benign, 'LICENSE'), [])
  assert.throws(() => privacyFindings(Buffer.from('bad'), 'broken.blend'), /Invalid Blender/)
  assert.throws(() => pngMetadata(png.subarray(0, -1)), /PNG/)
})

function glb(document: object, binary?: Buffer) {
  const encoded = Buffer.from(JSON.stringify(document))
  const json = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)])
  const chunks = [Buffer.alloc(8), json]
  chunks[0].writeUInt32LE(json.length)
  chunks[0].write('JSON', 4)
  if (binary) {
    const padded = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)])
    const header = Buffer.alloc(8)
    header.writeUInt32LE(padded.length)
    header.write('BIN\0', 4)
    chunks.push(header, padded)
  }
  const body = Buffer.concat(chunks), header = Buffer.alloc(12)
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(body.length + 12, 8)
  return Buffer.concat([header, body])
}

test('publication checks image metadata embedded inside GLB buffers and data URIs', () => {
  const leaked = appendBeforeEnd(chunk('zTXt', Buffer.concat([Buffer.from('File\0\0'), deflateSync(privatePath)])))
  const document = { asset: { version: '2.0' }, buffers: [{ byteLength: leaked.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: leaked.length }], images: [{ mimeType: 'image/png', bufferView: 0 }] }
  assert.deepEqual(privacyFindings(glb(document, leaked), 'model.glb'), ['embedded image: personal home directory'])
  assert.deepEqual(privacyFindings(glb({ ...document, buffers: [{ byteLength: leaked.length, uri: `data:application/octet-stream;base64,${leaked.toString('base64')}` }] }), 'model.glb'), ['embedded image: personal home directory'])
  assert.deepEqual(privacyFindings(glb({ asset: { version: '2.0' }, images: [{ uri: `data:image/png;base64,${leaked.toString('base64')}` }] }), 'model.glb'), ['embedded image: personal home directory'])
  assert.deepEqual(privacyFindings(glb({ asset: { version: '2.0' }, images: [{ uri: `data:image/png;base64,${png.toString('base64')}` }] }), 'model.glb'), [])
  const encoded = Array.from(leaked, byte => `%${byte.toString(16).padStart(2, '0')}`).join('')
  assert.deepEqual(privacyFindings(glb({ asset: { version: '2.0' }, images: [{ uri: `data:image/png,${encoded}` }] }), 'model.glb'), ['embedded image: personal home directory'])
  assert.throws(() => privacyFindings(glb({ ...document, bufferViews: [{ buffer: 0, byteOffset: leaked.length, byteLength: 10 }] }, leaked), 'model.glb'), /exceeds its buffer/)
})


test('generic network rules cover RFC1918 without identifying one installation', () => {
  for (const octets of [[10, 42, 3, 7], [172, 16, 4, 20], [172, 31, 9, 15], [192, 168, 12, 8]]) {
    const address = Buffer.from(octets.join('.'))
    assert.deepEqual(privacyFindings(address, 'nginx.conf'), ['private network address'])
    assert.deepEqual(privacyFindings(address, 'network.test.ts'), [])
  }
  const hexLookup = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0')).join('.')
  assert.deepEqual(privacyFindings(Buffer.from(hexLookup), 'vendor.js'), [])
  for (const address of ['127.0.0.1', '192.0.2.42', '198.51.100.20', '203.0.113.17']) {
    assert.deepEqual(privacyFindings(Buffer.from(address), 'example.conf'), [])
  }
})

test('operator policy applies to synthetic domains and names even in fixtures and nested images', () => {
  const hostname = 'services.example.test', label = 'Fictional Willow Residence'
  const policy = parsePrivacyPolicy(JSON.stringify({ version: 1, blockedTerms: [hostname, label] }))
  const category = ['operator privacy policy match']
  assert.deepEqual(privacyFindings(Buffer.from(hostname.toUpperCase()), 'example.test.ts', policy), category)
  assert.deepEqual(privacyFindings(Buffer.from(label.toUpperCase()), 'README.md', policy), category)
  assert.equal(safeFindingPath(`docs/${hostname}/report.md`, policy), '[path withheld]')
  const hidden = appendBeforeEnd(chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0'), deflateSync(hostname)])))
  assert.deepEqual(privacyFindings(hidden, 'preview.png', policy), category)
  const result = privacyFindings(glb({ asset: { version: '2.0' }, images: [{ uri: `data:image/png;base64,${hidden.toString('base64')}` }] }), 'model.glb', policy)
  assert.deepEqual(result, ['embedded image: operator privacy policy match'])
  assert.ok(!JSON.stringify(result).includes(hostname))
})

test('operator policy rejects malformed, oversized, regex or labeled input without reflecting it', () => {
  const marker = 'fixture-value.example.test'
  for (const value of [
    `{ malformed ${marker}`, JSON.stringify({ version: 1, blockedTerms: [marker], label: marker }),
    JSON.stringify({ version: 1, blockedTerms: [{ regex: marker }] }),
    JSON.stringify({ version: 1, blockedTerms: Array(257).fill(marker) }),
    JSON.stringify({ version: 1, blockedTerms: ['ab'] }), ' '.repeat(65537),
  ]) assert.throws(() => parsePrivacyPolicy(value), error => error instanceof Error && !error.message.includes(marker))
})

test('operator policy stays outside source files and accepts administrative Git storage', () => {
  const directory = mkdtempSync(join(tmpdir(), 't3-policy-test-'))
  try {
    const checkout = join(directory, 'checkout'), admin = join(checkout, '.git')
    mkdirSync(admin, { recursive: true })
    const policy = JSON.stringify({ version: 1, blockedTerms: ['reserved.example.test'] })
    const external = join(directory, 'private-policy.json'), internal = join(checkout, 'policy.json'), administrative = join(admin, 'policy.json')
    for (const path of [external, internal, administrative]) writeFileSync(path, policy)
    assert.equal(loadPrivacyPolicy(external, checkout, admin).blockedTerms.length, 1)
    assert.equal(loadPrivacyPolicy(administrative, checkout, admin).blockedTerms.length, 1)
    assert.throws(() => loadPrivacyPolicy(internal, checkout, admin), /privacy policy/)
    assert.throws(() => loadPrivacyPolicy(join(directory, 'absent.json'), checkout, admin), error => error instanceof Error && !error.message.includes(directory))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


test('source and build auditing load policy and suppress values in paths and decoder errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 't3-artifact-policy-'))
  try {
    const checkout = join(directory, 'checkout'), hostname = 'deployment.example.test'
    mkdirSync(checkout)
    execFileSync('git', ['init', '-q'], { cwd: checkout, stdio: 'ignore' })
    writeFileSync(join(checkout, '.gitignore'), 'dist/\n')
    writeFileSync(join(checkout, 'README.md'), hostname)
    const policyFile = join(directory, 'policy.json')
    writeFileSync(policyFile, JSON.stringify({ version: 1, blockedTerms: [hostname] }))
    const build = join(checkout, 'dist')
    mkdirSync(build)
    writeFileSync(join(build, `${hostname}.js`), hostname)
    writeFileSync(join(build, 'broken.glb'), `invalid ${hostname}`)
    const source = await auditPublicArtifacts(undefined, { cwd: checkout, policyFile })
    assert.ok(source.failures.some(item => item.file === 'README.md' && item.findings.includes('operator privacy policy match')))
    const full = await auditPublicArtifacts('dist', { cwd: checkout, policyFile })
    assert.ok(full.checked > source.checked)
    assert.ok(full.failures.some(item => item.file === '[path withheld]'))
    assert.ok(full.failures.some(item => item.file === 'dist/broken.glb' && item.findings.includes('artifact inspection failed')))
    assert.ok(!JSON.stringify(full).includes(hostname))
    assert.ok(!JSON.stringify(full).includes(policyFile))
    writeFileSync(policyFile, `{ invalid ${hostname}`)
    const invalid = await auditPublicArtifacts('dist', { cwd: checkout, policyFile })
    assert.equal(invalid.checked, 0); assert.ok(invalid.failures.length)
    assert.ok(!JSON.stringify(invalid).includes(hostname))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


test('binary-only policy detects residual names without blocking public author attribution', () => {
  const fictionalHandle = 'sample-contributor'
  const policy = parsePrivacyPolicy(JSON.stringify({ version: 1, blockedTerms: [], binaryBlockedTerms: [fictionalHandle] }))
  assert.equal(safeFindingPath(`models/${fictionalHandle}.blend`, policy), '[path withheld]')
  const attribution = Buffer.from(`Copyright ${fictionalHandle}. https://example.test/${fictionalHandle}`)
  for (const name of ['LICENSE', 'README.md', 'schema.ts', 'package.json']) assert.deepEqual(privacyFindings(attribution, name, policy), [])
  const blend = zstdCompressSync(Buffer.from(`BLENDER-v500\0demo-source.blend\0residual/${fictionalHandle}/source\0`))
  assert.deepEqual(privacyFindings(blend, 'model.blend', policy), ['operator binary privacy policy match'])
  const hidden = appendBeforeEnd(chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0'), deflateSync(fictionalHandle)])))
  assert.deepEqual(privacyFindings(hidden, 'preview.png', policy), ['operator binary privacy policy match'])
  const image = { uri: `data:image/png;base64,${hidden.toString('base64')}` }
  assert.ok(privacyFindings(glb({ asset: { version: '2.0' }, images: [image] }), 'model.glb', policy).includes('embedded image: operator binary privacy policy match'))
  for (const extension of ['gif', 'jpg', 'jpeg', 'webp']) {
    const bytes = Buffer.from(`synthetic metadata\0${fictionalHandle}\0`)
    assert.deepEqual(privacyFindings(bytes, `preview.${extension}`, policy), ['operator binary privacy policy match'])
  }
  assert.throws(() => parsePrivacyPolicy(JSON.stringify({ version: 1, blockedTerms: [], binaryBlockedTerms: [{ regex: fictionalHandle }] })), /privacy policy/)
})


test('window boundaries preserve home exceptions and detect paths across NUL gaps', () => {
  const step = 64 * 1024
  for (const position of [step - 8, step + 1018, 2 * step - 7]) {
    for (const allowed of ['/Users/example/project', '/home/runner/work']) {
      const text = ' '.repeat(position) + allowed + ' '.repeat(step)
      assert.deepEqual(privacyFindings(Buffer.from(text), 'example.txt'), [])
      assert.deepEqual(privacyFindings(Buffer.from(text.split('').join('\0')), 'example.txt'), [])
    }
    const text = ' '.repeat(position) + privatePath + ' '.repeat(step)
    assert.deepEqual(privacyFindings(Buffer.from(text), 'source.txt'), ['personal home directory'])
    assert.deepEqual(privacyFindings(Buffer.from(text.split('').join('\0')), 'source.txt'), ['personal home directory'])
  }
  const split = privatePath.slice(0, 5) + '\0'.repeat(3 * step) + privatePath.slice(5)
  assert.deepEqual(privacyFindings(Buffer.from(split), 'source.txt'), ['personal home directory'])
  const allowedSplit = '/home/' + '\0'.repeat(3 * step) + 'runner/work'
  assert.deepEqual(privacyFindings(Buffer.from(allowedSplit), 'source.txt'), [])
  const lookup = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0')).join('.')
  assert.deepEqual(privacyFindings(Buffer.from(lookup.repeat(200)), 'vendor.js'), [])
})

test('window overlap retains normalized Unicode policy terms at and across NUL boundaries', () => {
  const step = 64 * 1024
  const policy = parsePrivacyPolicy(JSON.stringify({ version: 1, blockedTerms: ['Café Magnolia'], binaryBlockedTerms: ['fictional-contributor'] }))
  for (const position of [step - 4, step + 1020, 2 * step - 5]) {
    const text = ' '.repeat(position) + 'CAFE\u0301 MAGNOLIA' + ' '.repeat(step)
    assert.deepEqual(privacyFindings(Buffer.from(text), 'evidence.md', policy), ['operator privacy policy match'])
    assert.deepEqual(privacyFindings(Buffer.from(text.split('').join('\0')), 'evidence.md', policy), ['operator privacy policy match'])
  }
  const term = 'fictional-contributor'
  const text = Buffer.from('BLENDER-v500' + ' '.repeat(step - 20) + term.slice(0, 8) + '\0'.repeat(3 * step) + term.slice(8))
  assert.deepEqual(privacyFindings(text, 'source.blend', policy), ['operator binary privacy policy match'])
})
