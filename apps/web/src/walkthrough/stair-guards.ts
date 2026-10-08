import type { StairGeometry } from '@t3-designer/scene-schema'

type Vector3 = [number, number, number]
export type StairGuardSegment = { from: Vector3; to: Vector3 }

/** The render and collision use the same guard edges. Landing portals remain
 * open across the full flight width; no invisible rail crosses the route. */
export function stairGuardSegments(geometry: StairGeometry): StairGuardSegment[] {
  const result: StairGuardSegment[] = []
  for (const flight of geometry.flights) {
    const dx = flight.to[0] - flight.from[0], dz = flight.to[2] - flight.from[2], length = Math.hypot(dx, dz)
    if (length < .001) continue
    for (const side of [-1, 1]) {
      const x = -dz / length * geometry.width / 2 * side, z = dx / length * geometry.width / 2 * side
      result.push({ from: [flight.from[0] + x, flight.from[1], flight.from[2] + z], to: [flight.to[0] + x, flight.to[1], flight.to[2] + z] })
    }
  }
  for (const [index, landing] of geometry.landings.entries()) {
    const portals = [{ flight: geometry.flights[index], point: geometry.flights[index].to }, { flight: geometry.flights[index + 1], point: geometry.flights[index + 1].from }]
    for (const [edgeIndex, from] of landing.polygon.entries()) {
      const to = landing.polygon[(edgeIndex + 1) % landing.polygon.length]
      const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz)
      if (length < .001) continue
      const gaps: [number, number][] = []
      for (const { flight, point } of portals) {
        const across = Math.abs((point[0] - from[0]) * dz - (point[2] - from[1]) * dx) / length
        if (across > .001) continue
        const fdX = flight.to[0] - flight.from[0], fdZ = flight.to[2] - flight.from[2], flightLength = Math.hypot(fdX, fdZ)
        const center = ((point[0] - from[0]) * dx + (point[2] - from[1]) * dz) / length
        const radius = Math.abs(-fdZ * dx + fdX * dz) / flightLength / length * geometry.width / 2
        const lo = Math.max(0, center - radius), hi = Math.min(length, center + radius)
        if (hi > lo) gaps.push([lo, hi])
      }
      const cuts = [...new Set([0, length, ...gaps.flat()])].sort((a, b) => a - b)
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1], midpoint = (a + b) / 2
        if (b - a < .001 || gaps.some(([lo, hi]) => midpoint >= lo && midpoint <= hi)) continue
        result.push({ from: [from[0] + dx * a / length, landing.elevation, from[1] + dz * a / length], to: [from[0] + dx * b / length, landing.elevation, from[1] + dz * b / length] })
      }
    }
  }
  return result
}
