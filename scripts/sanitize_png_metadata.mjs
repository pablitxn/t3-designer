/** Remove optional descriptive PNG metadata without decoding or changing image pixels. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pngMetadata } from './audit_public_artifacts.mjs'

export function stripPngMetadata(content) {
  pngMetadata(content) // Validate the container before modifying it.
  const chunks = [content.subarray(0, 8)]
  for (let offset = 8; offset < content.length;) {
    const length = content.readUInt32BE(offset)
    const kind = content.subarray(offset + 4, offset + 8).toString('ascii')
    const end = offset + length + 12
    // Retain ICC/color/gamma/transparency/resolution chunks: visual appearance is unchanged.
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(kind)) chunks.push(content.subarray(offset, end))
    offset = end
  }
  return Buffer.concat(chunks)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length < 3) throw new Error('Usage: node scripts/sanitize_png_metadata.mjs image.png [...]')
  for (const path of process.argv.slice(2)) {
    const original = await readFile(path), clean = stripPngMetadata(original)
    if (!clean.equals(original)) await writeFile(path, clean)
    console.log(`${path}: removed ${original.length - clean.length} metadata bytes; image/color chunks retained`)
  }
}
