import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { StairGeometry } from '@t3-designer/scene-schema'
import { Floor } from './Floor'
import { stairGuardSegments } from '../walkthrough/stair-guards'

function Rail({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const transform = useMemo(() => {
    const a = new Vector3(...from), b = new Vector3(...to), direction = b.clone().sub(a)
    return { position: a.add(b).multiplyScalar(.5), rotation: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), length: direction.length() }
  }, [from, to])
  return <mesh position={transform.position} quaternion={transform.rotation} castShadow><cylinderGeometry args={[.018, .018, transform.length, 8]} /><meshStandardMaterial color="#65675d" roughness={.6} metalness={.25} /></mesh>
}

/** Steps are visual; navigation samples the continuous ramp through these endpoints. */
export function Staircase({ geometry, yOffset = 0 }: { geometry: StairGeometry; yOffset?: number }) {
  return <group name="estimated-traversable-stairs" position={[0, yOffset, 0]}>
    {geometry.flights.map((flight, index) => {
      const dx = flight.to[0] - flight.from[0], dz = flight.to[2] - flight.from[2], length = Math.hypot(dx, dz)
      const rise = flight.to[1] - flight.from[1], run = length / flight.steps
      return <group key={index}>
        {Array.from({ length: flight.steps }, (_, step) => {
          const along = (step + .5) / flight.steps, top = flight.from[1] + rise * (step + 1) / flight.steps
          return <mesh key={step} position={[flight.from[0] + dx * along, top - .06, flight.from[2] + dz * along]} rotation={[0, Math.atan2(dx, dz), 0]} castShadow receiveShadow><boxGeometry args={[geometry.width, .12, run + .008]} /><meshStandardMaterial color="#b9b39c" roughness={.8} /></mesh>
        })}
      </group>
    })}
    {geometry.landings.map((landing, index) => <Floor key={index} polygon={landing.polygon} elevation={landing.elevation} thickness={.12} color="#b9b39c" />)}
    {stairGuardSegments(geometry).map(({ from, to }, index) => {
      const count = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / .6))
      return <group key={`guard-${index}`}><Rail from={[from[0], from[1] + .95, from[2]]} to={[to[0], to[1] + .95, to[2]]} />{Array.from({ length: count + 1 }, (_, post) => {
        const t = post / count, point = from.map((value, axis) => value + (to[axis] - value) * t) as [number, number, number]
        return <Rail key={post} from={point} to={[point[0], point[1] + .95, point[2]]} />
      })}</group>
    })}
  </group>
}
