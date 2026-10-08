import type { Point2D } from '@t3-designer/scene-schema'

/** WGS84 geodetic -> Earth-centred -> local tangent east/south. At a cadastral
 * neighbourhood scale this avoids using Web Mercator units as ground metres.
 * Elevation is unknown: both geographic points are placed on the ellipsoid. */
export function wgs84ToLocal(point: Point2D, origin: Point2D): Point2D {
  const radians = Math.PI / 180, a = 6378137, e2 = 6.6943799901413165e-3
  function ecef([longitude, latitude]: Point2D) {
    const lon = longitude * radians, lat = latitude * radians
    const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2)
    return [n * Math.cos(lat) * Math.cos(lon), n * Math.cos(lat) * Math.sin(lon), n * (1 - e2) * Math.sin(lat)]
  }
  const p = ecef(point), o = ecef(origin), [x, y, z] = p.map((value, index) => value - o[index])
  const lon = origin[0] * radians, lat = origin[1] * radians
  return [-Math.sin(lon) * x + Math.cos(lon) * y, Math.sin(lat) * Math.cos(lon) * x + Math.sin(lat) * Math.sin(lon) * y - Math.cos(lat) * z]
}
const cross = (a: Point2D, b: Point2D, c: Point2D) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const on = (p: Point2D, a: Point2D, b: Point2D) => Math.abs(cross(a, b, p)) < 1e-7 && p[0] >= Math.min(a[0], b[0]) - 1e-7 && p[0] <= Math.max(a[0], b[0]) + 1e-7 && p[1] >= Math.min(a[1], b[1]) - 1e-7 && p[1] <= Math.max(a[1], b[1]) + 1e-7
function intersects(a: Point2D, b: Point2D, c: Point2D, d: Point2D) {
  return cross(a, b, c) * cross(a, b, d) < -1e-7 && cross(c, d, a) * cross(c, d, b) < -1e-7 || on(a, c, d) || on(b, c, d) || on(c, a, b) || on(d, a, b)
}
export function localArea(ring: Point2D[]) {
  return Math.abs(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1] }, 0)) / 2
}
export function insideLocal(point: Point2D, ring: Point2D[]) {
  let inside = false
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    if (on(point, a, b)) return true
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
export function localParcelRings(rings: Point2D[][], origin: Point2D): Point2D[][] | null {
  if (!rings.length || rings.length > 21) return null
  const converted: Point2D[][] = []
  for (const geographic of rings) {
    if (geographic.length < 4 || geographic.length > 201) return null
    const ring: Point2D[] = []
    for (const coordinate of geographic) {
      if (coordinate.length !== 2 || !coordinate.every(Number.isFinite) || coordinate[0] < -74 || coordinate[0] > -52 || coordinate[1] < -56 || coordinate[1] > -21) return null
      const point = wgs84ToLocal(coordinate, origin)
      if (point.some(value => Math.abs(value) > 1000)) return null
      if (!ring.length || Math.hypot(point[0] - ring.at(-1)![0], point[1] - ring.at(-1)![1]) > 1e-7) ring.push(point)
    }
    if (Math.hypot(ring[0][0] - ring.at(-1)![0], ring[0][1] - ring.at(-1)![1]) > 1e-5) return null
    ring.pop()
    if (ring.length < 3 || localArea(ring) < .01) return null
    for (let i = 0; i < ring.length; i++) for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue
      if (intersects(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) return null
    }
    converted.push(ring)
  }
  const [outer, ...holes] = converted
  for (const [index, hole] of holes.entries()) {
    if (!hole.every(point => insideLocal(point, outer))) return null
    for (const other of [outer, ...holes.slice(0, index)]) {
      if (other !== outer && (insideLocal(hole[0], other) || insideLocal(other[0], hole))) return null
      for (let i = 0; i < hole.length; i++) for (let j = 0; j < other.length; j++) if (intersects(hole[i], hole[(i + 1) % hole.length], other[j], other[(j + 1) % other.length])) return null
    }
  }
  return localArea(outer) - holes.reduce((sum, hole) => sum + localArea(hole), 0) > .01 ? converted : null
}
