import assert from 'node:assert/strict'
import test from 'node:test'
import { ExtrudeGeometry, ShapeGeometry } from 'three'
import { projectContextShape } from '../src/private/project-context-shape.ts'

test('generated context sections may be empty and must not close a path or create a volume', () => {
  // The accepted two-floor pilot has both sections empty on each floor.
  const sections = { before: [], after: [] }
  assert.equal(projectContextShape(sections.before), null)
  assert.equal(projectContextShape(sections.after), null)
  assert.equal(projectContextShape([[0, 0]]), null)
  assert.equal(projectContextShape([[0, 0], [1, 0]]), null)
})

test('valid context footprints retain their holes and plan orientation in Three geometry', () => {
  const shape = projectContextShape([[0, 0], [4, 0], [4, 3], [0, 3]], [[], [[1, 1], [2, 1], [2, 2], [1, 2]]])
  assert.ok(shape)
  assert.equal(shape.holes.length, 1)
  const surface = new ShapeGeometry(shape)
  const volume = new ExtrudeGeometry(shape, { depth: 2.5, bevelEnabled: false })
  try {
    surface.computeBoundingBox(); volume.computeBoundingBox()
    assert.deepEqual(surface.boundingBox?.min.toArray(), [0, -3, 0])
    assert.deepEqual(surface.boundingBox?.max.toArray(), [4, 0, 0])
    assert.equal(volume.boundingBox?.max.z, 2.5)
    let area = 0
    const positions = surface.getAttribute('position'), index = surface.getIndex()!
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const [a, b, c] = [0, 1, 2].map(offset => index.getX(triangle + offset))
      area += Math.abs((positions.getX(b) - positions.getX(a)) * (positions.getY(c) - positions.getY(a)) - (positions.getY(b) - positions.getY(a)) * (positions.getX(c) - positions.getX(a))) / 2
    }
    assert.equal(area, 11, 'the one-square-metre hole remains open')
  } finally { surface.dispose(); volume.dispose() }
})
