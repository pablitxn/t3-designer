import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 't3-blender-image-smoke-'))
const binary = process.env.BLENDER_BIN || '/opt/blender/blender'
const base = {
  schemaVersion: 1, id: 'image-smoke', label: 'Trusted runtime smoke', units: 'meters',
  material: { baseColor: '#556677', roughness: .7 },
  source: { description: 'Deterministic image validation; no provider call.', dimensionalStatus: 'user-supplied', url: null },
}
const recipes = [
  { ...base, kind: 'table', dimensions: [1, .75, .6], parameters: { topThickness: .03, legWidth: .04, legInset: .06 } },
  { ...base, kind: 'wingback-chair', dimensions: [.82, 1.01, .96], parameters: { seatDimensions: [.49, .45, .54] } },
  { ...base, kind: 'procedural', dimensions: [.6, .2, .5], parameters: { parts: [{
    name: 'Woven cushion', shape: 'cushion', dimensions: [.6, .2, .5], position: [0, .1, 0], rotation: [0, 0, 0],
    color: '#556677', roughness: .7, metallic: 0, bevel: 0,
    upholstery: { roundness: .6, tuftRows: 1, tuftColumns: 1, texture: 'woven' },
  }] } },
]
try {
  for (const request of recipes) {
    const input = join(directory, `${request.kind}.json`), output = join(directory, request.kind)
    await writeFile(input, JSON.stringify(request))
    try {
      await run(binary, ['--background', '--factory-startup', '--disable-autoexec', '--threads', '2', '--python-exit-code', '1',
        '--python', join(root, 'scripts/blender/generate_asset.py'), '--', '--input', input, '--output-dir', output, '--resolution', '64', '--samples', '1'],
      { timeout: 180_000, maxBuffer: 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
    } catch (error) {
      throw new Error(`Blender image smoke failed for ${request.kind}: ${error.stderr ?? ''}\n${error.stdout ?? ''}`, { cause: error })
    }
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
    assert.equal(manifest.status, 'validated')
    assert.equal(manifest.generator.blenderVersion, '5.2.2 LTS')
    for (const artifact of ['model.glb', 'source.blend', 'request.json', 'preview.png', 'front.png', 'side.png']) {
      const content = await readFile(join(output, artifact))
      assert.ok(content.length > 0, artifact)
      assert.equal(createHash('sha256').update(content).digest('hex'), manifest.artifacts[artifact].sha256, artifact)
    }
    console.log(`Blender runtime smoke passed: ${request.kind}, Blender ${manifest.generator.blenderVersion}, GLB validation, editable source and three CPU previews.`)
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
