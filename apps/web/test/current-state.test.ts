import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { assetCatalog, currentFixtures } from '../src/data/current-state.ts'
import { t3Apartment } from '../src/data/t3.ts'

function bounds(f: typeof currentFixtures[number]) {
  const [w, h, d] = assetCatalog.find(a => a.id === f.assetId)!.dimensions
  const [x, y, z] = f.position
  const dx = Math.abs(Math.cos(f.rotation)) * w + Math.abs(Math.sin(f.rotation)) * d
  const dz = Math.abs(Math.sin(f.rotation)) * w + Math.abs(Math.cos(f.rotation)) * d
  return { min: [x - dx / 2, y, z - dz / 2], max: [x + dx / 2, y + h, z + dz / 2] }
}

test('authored asset files contain glTF meshes and match catalog dimensions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/models/current/manifest.json', import.meta.url), 'utf8'))
  const entries = Array.isArray(manifest) ? manifest : manifest.assets
  for (const asset of assetCatalog) {
    const bytes = readFileSync(new URL(`../public${asset.url}`, import.meta.url))
    assert.equal(bytes.toString('utf8', 0, 4), 'glTF', asset.id)
    assert.equal(bytes.readUInt32LE(4), 2)
    assert.equal(bytes.readUInt32LE(8), bytes.length)
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    assert.ok(json.meshes.length > 0, `${asset.id} has meshes`)
    assert.ok(json.materials.length > 0, `${asset.id} has PBR materials`)
    assert.ok(!json.cameras?.length, `${asset.id} exports geometry only`)
    const entry = entries.find((item: {id: string}) => item.id === asset.id)
    assert.ok(entry, `${asset.id} in manifest`)
    const dimensions = Array.isArray(entry.dimensions) ? entry.dimensions : [entry.dimensions.x, entry.dimensions.y, entry.dimensions.z]
    dimensions.forEach((value: number, i: number) => assert.ok(Math.abs(value - asset.dimensions[i]) < 0.015, `${asset.id} dimension ${i}`))
  }
})

test('fixtures reference real rooms/assets and have unique stable IDs', () => {
  assert.equal(new Set(currentFixtures.map(f => f.id)).size, currentFixtures.length)
  for (const f of currentFixtures) {
    assert.ok(t3Apartment.rooms.some(r => r.id === f.roomId), f.id)
    assert.ok(assetCatalog.some(a => a.id === f.assetId), f.id)
    assert.equal(f.placementStatus, 'estimated')
    assert.ok(f.evidence.length > 0)
    assert.ok(bounds(f).max[1] <= t3Apartment.walls[0].height, `${f.id} below ceiling`)
  }
  assert.equal(currentFixtures.filter(f => f.assetId === 'bathroom-vanity').length, 1, 'mirror is not a second basin')
})

test('fixture nominal volumes do not intersect each other', () => {
  for (let i = 0; i < currentFixtures.length; i++) {
    for (const other of currentFixtures.slice(i + 1)) {
      const first = currentFixtures[i]
      if (first.roomId !== other.roomId) continue
      const a = bounds(first), b = bounds(other)
      const overlap = a.min.map((value, axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(value, b.min[axis]))
      assert.ok(overlap.some(value => value <= 0.001), `${first.id} intersects ${other.id}: ${overlap.join(', ')}`)
    }
  }
})
