import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import type { Point2D } from '@t3-designer/scene-schema'

const epsilon = 1e-9
const cross = (a: Point2D, b: Point2D, p: Point2D) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

function triangles(polygon: Point2D[]): Point2D[][] {
  return ShapeUtils.triangulateShape(polygon.map(([x, z]) => new Vector2(x, z)), []).map(indices => {
    const triangle = indices.map(index => polygon[index])
    return cross(triangle[0], triangle[1], triangle[2]) < 0 ? triangle.reverse() : triangle
  })
}

function halfPlane(polygon: Point2D[], a: Point2D, b: Point2D, inside: boolean): Point2D[] {
  const result: Point2D[] = []
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index], to = polygon[(index + 1) % polygon.length]
    const d1 = cross(a, b, from), d2 = cross(a, b, to)
    const keep1 = inside ? d1 >= -epsilon : d1 <= epsilon, keep2 = inside ? d2 >= -epsilon : d2 <= epsilon
    if (keep1) result.push(from)
    if (keep1 !== keep2 && Math.abs(d1 - d2) > epsilon) {
      const t = d1 / (d1 - d2)
      result.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
    }
  }
  return result
}

/** Convex pieces allow openings to cross room/region boundaries, unlike Shape holes. */
export function surfacePolygons(polygon: Point2D[], holes: Point2D[][] = [], clipPolygon?: Point2D[]): Point2D[][] {
  let pieces = triangles(polygon)
  if (clipPolygon) pieces = pieces.flatMap(piece => triangles(clipPolygon).map(clip => clip.reduce((current, a, index) => halfPlane(current, a, clip[(index + 1) % clip.length], true), piece)).filter(piece => piece.length >= 3))
  for (const triangle of holes.flatMap(triangles)) pieces = pieces.flatMap(piece => {
    let remainder = piece
    const outside: Point2D[][] = []
    for (let index = 0; index < triangle.length && remainder.length >= 3; index++) {
      const a = triangle[index], b = triangle[(index + 1) % triangle.length]
      const cut = halfPlane(remainder, a, b, false)
      if (cut.length >= 3) outside.push(cut)
      remainder = halfPlane(remainder, a, b, true)
    }
    return outside
  })
  return pieces.filter(piece => Math.abs(piece.reduce((area, p, index) => { const q = piece[(index + 1) % piece.length]; return area + p[0] * q[1] - q[0] * p[1] }, 0)) > epsilon)
}

export function surfaceGeometry(polygon: Point2D[], holes: Point2D[][], clipPolygon: Point2D[] | undefined, thickness: number): BufferGeometry {
  const positions: number[] = [], uv: number[] = []
  const add = (a: Point2D, ay: number, b: Point2D, by: number, c: Point2D, cy: number) => { positions.push(a[0], ay, a[1], b[0], by, b[1], c[0], cy, c[1]); uv.push(...a, ...b, ...c) }
  for (const piece of surfacePolygons(polygon, holes, clipPolygon)) {
    for (let index = 1; index < piece.length - 1; index++) {
      add(piece[0], 0, piece[index + 1], 0, piece[index], 0)
      if (thickness > 0) add(piece[0], -thickness, piece[index], -thickness, piece[index + 1], -thickness)
    }
    // Interior seams are coplanar; including their sides keeps cut edges closed.
    if (thickness > 0) for (let index = 0; index < piece.length; index++) {
      const a = piece[index], b = piece[(index + 1) % piece.length]
      add(a, 0, b, -thickness, b, 0); add(a, 0, a, -thickness, b, -thickness)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.computeVertexNormals()
  return geometry
}
