import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { publicAssetFile, publicAssets } from '../src/data/public-assets.ts'
import { privacyFindings } from '../../../scripts/audit_public_artifacts.mjs'

const publicRoot = new URL('../public/', import.meta.url)
type PackagedAsset = { id: string; sourceUrl: string; dimensions: number[]; fidelityStatus: string; files: Record<string, { bytes: number; sha256: string }> }
const catalog = JSON.parse(await readFile(new URL('demo-assets/catalog.json', publicRoot), 'utf8')) as { assets: PackagedAsset[] }

test('every public demo version has its original, self-contained generated model and rendered views', async () => {
  assert.equal(publicAssets.length, 3)
  assert.equal(new Set(publicAssets.map(asset => asset.id)).size, 3)
  const versions = publicAssets.flatMap(asset => asset.revisions)
  assert.equal(versions.length, catalog.assets.length)
  for (const asset of publicAssets) {
    assert.ok(asset.revisions.length)
    for (const revision of asset.revisions) {
      const packaged = catalog.assets.find(item => item.id === revision.id)
      assert.ok(packaged)
      assert.equal(packaged.sourceUrl, asset.sourceUrl)
      assert.deepEqual(packaged.dimensions, asset.dimensions)
      assert.equal(packaged.fidelityStatus, 'draft-needs-visual-review')
      const directory = new URL(`demo-assets/${revision.id}/`, publicRoot)
      // The public bundle must not accidentally grow to include private requests,
      // reference uploads, transcripts or workshop exports when it is refreshed.
      assert.deepEqual((await readdir(directory)).sort(), ['front.png', 'model.glb', 'preview.png', 'side.png'])
      for (const file of ['model.glb', 'preview.png', 'front.png', 'side.png'] as const) {
        const content = await readFile(new URL(publicAssetFile(revision, file).slice(1), publicRoot))
        assert.equal(content.length, packaged.files[file].bytes)
        assert.equal(createHash('sha256').update(content).digest('hex'), packaged.files[file].sha256)
        if (file === 'model.glb') {
          assert.equal(content.readUInt32LE(0), 0x46546c67)
          assert.equal(content.readUInt32LE(4), 2)
          assert.equal(content.readUInt32LE(8), content.length)
          const document = JSON.parse(content.subarray(20, 20 + content.readUInt32LE(12)).toString()) as { buffers?: { uri?: string }[]; images?: { uri?: string }[]; meshes?: unknown[] }
          assert.ok(document.meshes?.length)
          assert.ok([...(document.buffers ?? []), ...(document.images ?? [])].every(resource => resource.uri === undefined), 'Models must not request external or private resources')
        } else {
          assert.equal(content.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
          assert.deepEqual(privacyFindings(content, file), [], 'Published previews must not expose private metadata')
        }
      }
    }
  }
  const dyvlinge = publicAssets.find(asset => asset.id === 'dyvlinge')!
  assert.deepEqual(dyvlinge.revisions.map(revision => revision.version), [2, 1])
  assert.equal(dyvlinge.revisions[0].needsCorrection, true)
})
