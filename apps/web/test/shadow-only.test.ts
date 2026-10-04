import assert from 'node:assert/strict'
import test from 'node:test'
import { BoxGeometry, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial } from 'three'
import { applyShadowOnlyMaterials } from '../src/lib/shadow-only.ts'

test('hiding physical walls preserves shadow participation and shared visible materials', () => {
  const original = new MeshStandardMaterial({ alphaTest: 0.5 })
  const geometry = new BoxGeometry()
  const visible = new Mesh(geometry, original), hidden = new Mesh(geometry, original)
  hidden.castShadow = true
  hidden.customDepthMaterial = new MeshDepthMaterial()
  const depthMaterial = hidden.customDepthMaterial
  const root = new Group().add(hidden)
  const restore = applyShadowOnlyMaterials(root)
  assert.notEqual(hidden.material, original)
  assert.equal(hidden.material.colorWrite, false)
  assert.equal(hidden.material.depthWrite, false)
  assert.equal(hidden.material.alphaTest, 0.5)
  assert.equal(hidden.castShadow, true)
  assert.equal(hidden.visible, true, 'mesh remains available to the shadow pass')
  assert.equal(hidden.customDepthMaterial, depthMaterial)
  assert.equal(visible.material, original)
  assert.equal(original.colorWrite, true)
  assert.equal(original.depthWrite, true)
  restore()
  assert.equal(hidden.material, original)
  geometry.dispose()
  original.dispose()
  depthMaterial.dispose()
})

test('multi-material meshes restore their exact material array and dispose only private copies', () => {
  const first = new MeshStandardMaterial(), second = new MeshStandardMaterial()
  const geometry = new BoxGeometry()
  const materials = [first, second]
  const hidden = new Mesh(geometry, materials), nonCaster = new Mesh(geometry, first)
  const root = new Group().add(new Group().add(hidden), nonCaster)
  let originalDisposals = 0, copyDisposals = 0
  first.addEventListener('dispose', () => originalDisposals++)
  second.addEventListener('dispose', () => originalDisposals++)
  const restore = applyShadowOnlyMaterials(root)
  for (const material of new Set([...hidden.material, nonCaster.material])) material.addEventListener('dispose', () => copyDisposals++)
  assert.equal(nonCaster.castShadow, false, 'transparent non-casters must not become opaque shadow blockers')
  assert.ok(hidden.material.every(material => !material.colorWrite && !material.depthWrite))
  restore()
  restore()
  assert.equal(hidden.material, materials)
  assert.equal(nonCaster.material, first)
  assert.equal(copyDisposals, 2, 'dispose each private material once, including shared references')
  assert.equal(originalDisposals, 0)
  geometry.dispose()
  first.dispose()
  second.dispose()
})
