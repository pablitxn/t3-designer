import { useMemo } from 'react'
import { DoubleSide, Shape } from 'three'
import type { Apartment, Fixture } from '@t3-designer/scene-schema'
import { Wall } from './Wall'
import { ShadowOnly } from './ShadowOnly'
import { ServiceDetails } from './ServiceDetails'

/** The viewing cut never changes the physical walls/windows or ceiling. */
export function ApartmentSolarEnvelope({ apartment, showFixtures, fixtures }: { apartment: Apartment; showFixtures: boolean; fixtures?: Fixture[] }) {
  const physicalEnvelope = useMemo(() => {
    const ceiling = new Shape()
    apartment.perimeter.forEach(([x, z], index) => index ? ceiling.lineTo(x, -z) : ceiling.moveTo(x, -z))
    ceiling.closePath()
    return <>
      {showFixtures && <ServiceDetails apartment={apartment} cutaway={false} fixtures={fixtures} />}
      {apartment.walls.map(wall => <Wall key={wall.id} wall={wall}
        doors={apartment.doors.filter(door => door.wallId === wall.id)}
        windows={apartment.windows.filter(window => window.wallId === wall.id)} cutaway={false} />)}
      <mesh position={[0, apartment.walls[0].height, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <extrudeGeometry args={[ceiling, { depth: .18, bevelEnabled: false }]} />
        <meshBasicMaterial side={DoubleSide} />
      </mesh>
    </>
  }, [apartment, showFixtures, fixtures])
  return <ShadowOnly>{physicalEnvelope}</ShadowOnly>
}
