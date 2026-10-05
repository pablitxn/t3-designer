import type { Apartment as ApartmentData, Fixture } from '@t3-designer/scene-schema'
import { Floor } from './Floor'
import { Wall } from './Wall'
import { Fixtures, type FixtureEditing } from './Fixtures'
import { ServiceDetails } from './ServiceDetails'
import { ArchitecturalDetails } from './ArchitecturalDetails'
import { roomFinish } from '../materials/surfaces'
import { ApartmentSolarEnvelope } from './ApartmentSolarEnvelope'

type ApartmentProps = {
  apartment: ApartmentData
  cutaway: boolean
  showFixtures?: boolean
  solarStudy?: boolean
  fixtures?: Fixture[]
  editing?: FixtureEditing
}

export function Apartment({ apartment, cutaway, showFixtures = true, solarStudy = false, fixtures, editing }: ApartmentProps) {
  return (
    <group>
      {solarStudy && <ApartmentSolarEnvelope apartment={apartment} showFixtures={showFixtures} fixtures={fixtures} />}
      <Floor polygon={apartment.perimeter} color="#d4d4c9" thickness={0.14} />
      {apartment.rooms.map((room) => (
        <Floor key={room.id} polygon={room.polygon} color={room.color} elevation={0.01} finish={roomFinish(room.id)} />
      ))}
      {apartment.balcony && (
        <Floor polygon={apartment.balcony.polygon} color="#c2c2b9" thickness={0.14} finish="balcony" />
      )}
      {apartment.walls.map((wall) => (
        <Wall
          key={wall.id}
          wall={wall}
          doors={apartment.doors.filter((door) => door.wallId === wall.id)}
          windows={apartment.windows.filter((window) => window.wallId === wall.id)}
          cutaway={cutaway}
        />
      ))}
      <ArchitecturalDetails apartment={apartment} cutaway={solarStudy ? false : cutaway} />
      {showFixtures && <><Fixtures fixtures={fixtures} editing={editing} /><ServiceDetails apartment={apartment} cutaway={cutaway} fixtures={fixtures} /></>}
    </group>
  )
}
