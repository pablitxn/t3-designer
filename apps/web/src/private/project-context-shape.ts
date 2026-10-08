import type { Point2D } from '@t3-designer/scene-schema'
import { Path, Shape } from 'three'

/** Empty context sections are intentional: they have no surface to close or render. */
export function projectContextShape(points: Point2D[], holes: Point2D[][] = []): Shape | null {
  if (points.length < 3) return null
  const shape = new Shape()
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  shape.holes = holes.filter(points => points.length >= 3).map(points => {
    const hole = new Path()
    points.forEach(([x, z], index) => index ? hole.lineTo(x, -z) : hole.moveTo(x, -z))
    hole.closePath()
    return hole
  })
  return shape
}
