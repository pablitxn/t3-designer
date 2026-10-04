import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ReferenceLibrary, imageFormat, isPublicAddress, productImages } from '../src/references.ts'
import { ensureLibraryCapacity } from '../src/storage-capacity.ts'

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')

test('parallel reference uploads serialize budget checks and reject without leaving partial files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't3-reference-capacity-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const library = new ReferenceLibrary(directory, { beforeSave: bytes => ensureLibraryCapacity(directory, 400, bytes) })
  const upload = () => library.upload({ name: 'photo.png', dataUrl: `data:image/png;base64,${pixel.toString('base64')}` })
  const results = await Promise.allSettled([upload(), upload(), upload()])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 2)
  const files = await readdir(join(directory, 'references'))
  assert.equal(files.length, 2, 'Only the accepted image and metadata are present')
  for (const file of files) await rm(join(directory, 'references', file))
  assert.ok((await upload()).id, 'A failed capacity check does not poison subsequent saves')
})

test('reference retrieval refuses private, mapped, multicast and reserved destinations', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.31.2.4', '192.168.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::ffff:127.0.0.1', '198.18.0.1']) assert.equal(isPublicAddress(ip), false, ip)
  assert.equal(isPublicAddress('93.184.215.14'), true)
})

test('product references use actual metadata and reject credential/private URL forms', () => {
  const html = `<meta content="https://images.example.com/chair.jpg?a=1&amp;b=2" property="og:image">
    <script type="application/ld+json">{"@type":"Product","image":["https://images.example.com/side.png", "file:///etc/passwd", "http://127.0.0.1/admin"]}</script>`
  assert.deepEqual(productImages(html, 'https://store.example.com/product'), ['https://images.example.com/side.png'])
})

test('product metadata excludes organization logos, prefers Product photos and retains Open Graph fallback', () => {
  const organization = { '@type': 'Organization', image: 'https://images.example.com/logo.png' }
  const product = { '@type': ['Thing', 'Product'], image: [{ url: '/front.jpg' }, '/side.jpg', '/front.jpg'] }
  const page = 'https://store.example.com/product'
  const metadata = '<meta property="og:image" content="https://images.example.com/social.jpg?a=1&amp;b=2">'
  const structured = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`
  assert.deepEqual(productImages(structured({ '@graph': [organization, product] }) + metadata, page), ['https://store.example.com/front.jpg', 'https://store.example.com/side.jpg'])
  assert.deepEqual(productImages(structured(organization) + metadata, page), ['https://images.example.com/social.jpg?a=1&b=2'])
  assert.deepEqual(productImages(structured(organization), page), [])
  assert.deepEqual(productImages(structured({ ...product, '@type': 'https://schema.org/Product', image: 'file:///private/photo.png' }) + metadata, page), ['https://images.example.com/social.jpg?a=1&b=2'])
})

test('reference uploads survive reopening, prepare exact images and never follow a substituted file symlink', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-reference-'))
  try {
    const library = new ReferenceLibrary(directory)
    const reference = await library.upload({ name: 'chair.png', dataUrl: `data:image/png;base64,${pixel.toString('base64')}` })
    assert.deepEqual(await new ReferenceLibrary(directory).get(reference.id), reference)
    const prepared = await library.prepare({ url: 'https://example.com/chair', notes: '', referenceImageIds: [reference.id] }, directory, { signal: new AbortController().signal })
    assert.equal(prepared.images.length, 1)
    assert.deepEqual(prepared.references, [reference])
    const file = (await library.file(reference.id))!
    await rm(file.path)
    await symlink('/etc/hosts', file.path)
    assert.equal(await library.file(reference.id), null)
    await assert.rejects(library.prepare({ url: 'https://example.com/chair', notes: '', referenceImageIds: [reference.id] }, directory, { signal: new AbortController().signal }), /adjuntarla/)
    assert.equal(await library.get('../anything'), null)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('uploads reject SVG, MIME spoofing, excessive bytes and decompression-sized dimensions', async () => {
  const library = new ReferenceLibrary('/unused')
  await assert.rejects(library.upload({ name: 'x', dataUrl: `data:image/jpeg;base64,${pixel.toString('base64')}` }), /formato/)
  await assert.rejects(library.upload({ name: 'x', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }), /PNG/)
  assert.throws(() => imageFormat(Buffer.alloc(5 * 1024 * 1024 + 1)), /5 MB/)
  assert.throws(() => imageFormat(pixel.subarray(0, 24)), /válida/)
  assert.throws(() => imageFormat(pixel.subarray(0, 50)), /incompleta/)
  const tooLarge = Buffer.from(pixel)
  tooLarge.writeUInt32BE(100_000, 16)
  assert.throws(() => imageFormat(tooLarge), /megapíxeles/)
})
