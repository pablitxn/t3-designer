import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { ProductUrlSchema, type CreateJobInput, type JobEventInput, type ReferenceImage } from '@t3-designer/asset-schema'

const imageLimit = 5 * 1024 * 1024
const idPattern = /^[a-f0-9-]{36}$/
type StoredReference = ReferenceImage & { filename: string; mime: string }

/** Fetch only pinned public IPv4 addresses, including every redirect hop. */
export function isPublicAddress(address: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false
  const [a, b] = address.split('.').map(Number)
  return a > 0 && a < 224 && a !== 10 && a !== 127
    && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31)
    && !(a === 192 && [0, 168].includes(b)) && !(a === 100 && b >= 64 && b <= 127)
    && !(a === 198 && [18, 19, 51].includes(b)) && !(a === 203 && b === 0)
}

async function publicFetch(value: string, limit: number, signal: AbortSignal, redirects = 0): Promise<{ bytes: Buffer; mime: string; url: string }> {
  const url = new URL(ProductUrlSchema.parse(value))
  if (redirects > 4) throw new Error('Demasiadas redirecciones en la referencia.')
  signal.throwIfAborted()
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  signal.throwIfAborted()
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('La referencia debe ser pública.')
  const result = await new Promise<{ bytes: Buffer; mime: string; location?: string }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal, family: 4, agent: false,
      lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { 'User-Agent': 'T3-Designer/1.0 (local product reference)', Accept: 'text/html,image/png,image/jpeg,image/webp', 'Accept-Encoding': 'identity' },
    }, (response) => {
      const status = response.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy()
        resolve({ bytes: Buffer.alloc(0), mime: '', location: response.headers.location }); return
      }
      if (status !== 200 || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
          || Number(response.headers['content-length']) > limit) {
        response.destroy(); reject(new Error('No se pudo leer esta referencia.')); return
      }
      let size = 0
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > limit) { response.destroy(); reject(new Error('La referencia supera el tamaño permitido.')) }
        else chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), mime: String(response.headers['content-type'] ?? '').split(';')[0] }))
    })
    request.setTimeout(12_000, () => request.destroy(new Error('La referencia tardó demasiado.')))
    request.on('error', reject)
  })
  if (result.location) return publicFetch(new URL(result.location, url).href, limit, signal, redirects + 1)
  return { ...result, url: url.href }
}

/** Validate type and dimensions before storing any user-selected raster. No SVG. */
export function imageFormat(bytes: Buffer): { mime: string; extension: string } {
  if (!bytes.length || bytes.length > imageLimit) throw new Error('Cada imagen debe ocupar como máximo 5 MB.')
  let width = 0, height = 0, mime = '', extension = ''
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); mime = 'image/png'; extension = 'png'
    if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Cabecera PNG inválida.')
    const chunks: Buffer[] = []
    let end = false
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset)
      if (length > bytes.length - offset - 12) throw new Error('Imagen PNG incompleta.')
      const type = bytes.toString('ascii', offset + 4, offset + 8)
      if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length))
      offset += length + 12
      if (type === 'IEND') { end = length === 0; break }
    }
    if (!end || !chunks.length) throw new Error('Imagen PNG incompleta.')
    if (width > 0 && height > 0 && width * height <= 24_000_000 && width <= 8192 && height <= 8192) {
      try {
        if (!inflateSync(Buffer.concat(chunks), { maxOutputLength: 128 * 1024 * 1024 }).length) throw new Error()
      } catch { throw new Error('Los píxeles del PNG no se pueden leer.') }
    }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 255) break
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218) break
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue
      const length = bytes.readUInt16BE(offset)
      if (length < 2 || offset + length > bytes.length) break
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break
      }
      offset += length
    }
    mime = 'image/jpeg'; extension = 'jpg'
    if (!bytes.includes(Buffer.from([255, 218])) || !bytes.subarray(-2).equals(Buffer.from([255, 217]))) throw new Error('Imagen JPEG incompleta.')
  } else if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8X') { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3) }
    else if (chunk === 'VP8 ') { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff }
    else if (chunk === 'VP8L' && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21); width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff)
    }
    mime = 'image/webp'; extension = 'webp'
    if (bytes.readUInt32LE(4) + 8 !== bytes.length || bytes.readUInt32LE(16) > bytes.length - 20) throw new Error('Imagen WebP incompleta.')
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 24_000_000) {
    throw new Error('Usá una imagen PNG, JPEG o WebP válida de hasta 24 megapíxeles.')
  }
  return { mime, extension }
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Math.min(0x10ffff, Number(code))))
}

export function productImages(html: string, pageUrl: string): string[] {
  const metadataImages: string[] = []
  const productImageValues: string[] = []
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(item => [item[1].toLowerCase(), item[2]]))
    if (['og:image', 'og:image:url', 'twitter:image'].includes(attributes.property || attributes.name)) metadataImages.push(decodeEntities(attributes.content || ''))
  }
  function visit(value: unknown, depth = 0): void {
    if (depth > 12 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const item of value.slice(0, 100)) visit(item, depth + 1); return }
    const object = value as Record<string, unknown>
    const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']]
    if (types.some(type => typeof type === 'string' && ['Product', 'https://schema.org/Product', 'http://schema.org/Product', 'schema:Product'].includes(type))) {
      const images = Array.isArray(object.image) ? object.image : [object.image]
      for (const image of images) {
        if (typeof image === 'string') productImageValues.push(image)
        else if (image && typeof image === 'object' && typeof (image as Record<string, unknown>).url === 'string') productImageValues.push((image as { url: string }).url)
      }
    }
    for (const item of Object.values(object)) visit(item, depth + 1)
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])) } catch { /* Unavailable metadata is not visual evidence. */ }
  }
  function validImages(values: string[]): string[] {
    return [...new Set(values.flatMap(value => {
      try { const url = new URL(value, pageUrl).href; return ProductUrlSchema.safeParse(url).success ? [url] : [] } catch { return [] }
    }))].slice(0, 8)
  }
  // Organization logos and unrelated JSON-LD images are not product evidence.
  const productUrls = validImages(productImageValues)
  return productUrls.length ? productUrls : validImages(metadataImages)
}

export class ReferenceLibrary {
  private directory: string
  private beforeSave?: (additionalBytes: number) => Promise<void>
  private saves: Promise<unknown> = Promise.resolve()
  constructor(directory: string, options: { beforeSave?: (additionalBytes: number) => Promise<void> } = {}) {
    this.directory = join(directory, 'references')
    this.beforeSave = options.beforeSave
  }

  private async save(name: string, bytes: Buffer): Promise<ReferenceImage> {
    const { mime, extension } = imageFormat(bytes)
    // The guard and both writes share one queue. Parallel uploads must see the
    // disk usage left by the previous save, including automatically fetched photos.
    const pending = this.saves.then(async () => {
      const id = randomUUID()
      await mkdir(this.directory, { recursive: true })
      // eslint-disable-next-line no-control-regex -- Remove control characters from uploaded display names.
      const reference: StoredReference = { id, name: name.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 120) || 'Referencia', url: `/api/references/${id}/image`, filename: `${id}.${extension}`, mime }
      const metadata = JSON.stringify(reference)
      await this.beforeSave?.(bytes.length + Buffer.byteLength(metadata))
      const imagePath = join(this.directory, reference.filename), metadataPath = join(this.directory, `${id}.json`)
      try {
        await writeFile(imagePath, bytes, { flag: 'wx' })
        await writeFile(metadataPath, metadata, { flag: 'wx' })
      } catch (error) {
        await Promise.all([rm(imagePath, { force: true }), rm(metadataPath, { force: true })]).catch(() => undefined)
        throw error
      }
      return { id, name: reference.name, url: reference.url }
    })
    this.saves = pending.catch(() => undefined)
    return pending
  }

  async upload(input: { name: string; dataUrl: string }): Promise<ReferenceImage> {
    if (typeof input?.name !== 'string' || typeof input?.dataUrl !== 'string') throw new Error('Falta la imagen de referencia.')
    const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(input.dataUrl)
    if (!match || input.dataUrl.length > 7_000_000) throw new Error('Usá PNG, JPEG o WebP de hasta 5 MB.')
    const bytes = Buffer.from(match[2], 'base64')
    const format = imageFormat(bytes)
    if (format.mime !== `image/${match[1]}`) throw new Error('El contenido no coincide con el formato de la imagen.')
    return this.save(input.name, bytes)
  }

  private async stored(id: string): Promise<StoredReference | null> {
    if (!idPattern.test(id)) return null
    try {
      const record = JSON.parse(await readFile(join(this.directory, `${id}.json`), 'utf8')) as StoredReference
      if (record.id !== id || !['png', 'jpg', 'webp'].some(ext => record.filename === `${id}.${ext}`)) return null
      return record
    } catch { return null }
  }
  async get(id: string): Promise<ReferenceImage | null> {
    const reference = await this.stored(id)
    return reference ? { id, name: reference.name, url: reference.url } : null
  }
  async file(id: string): Promise<{ path: string; mime: string } | null> {
    const reference = await this.stored(id)
    if (!reference) return null
    try {
      const path = join(await realpath(this.directory), reference.filename)
      if (await realpath(path) !== path) return null
      return { path, mime: reference.mime }
    } catch { return null }
  }

  async prepare(input: CreateJobInput, _workingDirectory: string, options: { signal: AbortSignal; onEvent?: (event: JobEventInput) => void }) {
    const references: ReferenceImage[] = []
    const warnings: string[] = []
    for (const id of [...new Set(input.referenceImageIds ?? [])].slice(0, 4)) {
      const reference = await this.get(id)
      if (!reference || !await this.file(id)) throw new Error('No se encontró una imagen de referencia. Volvé a adjuntarla.')
      references.push(reference)
    }
    if (!references.length) {
      const signal = AbortSignal.any([options.signal, AbortSignal.timeout(40_000)])
      options.onEvent?.({ kind: 'reference', message: 'Buscando fotografías del producto', url: input.url })
      try {
        const page = await publicFetch(input.url, 3 * 1024 * 1024, signal)
        if (!page.mime.includes('html')) throw new Error('La página no contiene una ficha HTML.')
        for (const url of productImages(page.bytes.toString('utf8'), page.url)) {
          if (references.length >= 3) break
          try {
            const image = await publicFetch(url, imageLimit, signal)
            references.push(await this.save(`Foto del producto ${references.length + 1}`, image.bytes))
            options.onEvent?.({ kind: 'reference', message: 'Fotografía disponible para comparar', url })
          } catch { if (signal.aborted) break }
        }
      } catch { /* Ask for photos below instead of authoring blindly. */ }
      options.signal.throwIfAborted()
      if (!references.length) warnings.push('No se pudieron obtener fotografías del producto. Adjuntá una vista frontal y otra lateral para modelarlo.')
    }
    const images = []
    for (const reference of references) {
      const file = await this.file(reference.id)
      if (file) images.push({ path: file.path, label: reference.name })
    }
    options.onEvent?.({ kind: 'reference', message: `${images.length} referencias visuales preparadas`, detail: images.length ? 'Las fotografías se enviarán junto a los renders para revisar forma y materiales.' : warnings[0] })
    return { images, references, warnings }
  }
}
