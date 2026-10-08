import { useMemo } from 'react'
import type { Apartment, DesignCustomization, Point2D } from '@t3-designer/scene-schema'
import { roomFinish } from '../materials/surfaces'
import { Floor } from './Floor'

type Surface = { polygon: Point2D[]; elevation: number; thickness: number }

/** Architectural surfaces and finishes use the same openings and level regions. */
export function ApartmentSurfaces({ apartment, floor, ceiling, customization, includeCeiling = false }: {
  apartment: Apartment; floor: Surface; ceiling?: Surface; customization?: DesignCustomization; includeCeiling?: boolean
}) {
  const regions = useMemo(() => apartment.floorRegions?.length ? apartment.floorRegions : [{ id: 'base', polygon: floor.polygon, floorElevation: floor.elevation, ceilingElevation: ceiling?.elevation ?? 2.7 }], [apartment.floorRegions, floor, ceiling])
  const floorHoles = useMemo(() => apartment.floorOpenings?.map(opening => opening.polygon), [apartment.floorOpenings])
  const ceilingHoles = useMemo(() => apartment.ceilingOpenings?.map(opening => opening.polygon), [apartment.ceilingOpenings])
  const canonical = apartment.id === 'demo-t3' || apartment.id === 'quimper-t3'
  return <group name="apartment-floor-regions">{regions.map(region => <group key={region.id} name={`floor-region-${region.id}`}>
    <Floor polygon={region.polygon} holes={floorHoles} color="#c5c6b9" elevation={region.floorElevation} thickness={floor.thickness} />
    {apartment.rooms.map(room => {
      const finish = customization?.floors[room.id]
      return <Floor key={room.id} polygon={room.polygon} clipPolygon={apartment.floorRegions?.length ? region.polygon : undefined} holes={floorHoles} color={room.color} elevation={region.floorElevation + .006}
        finish={finish ? (finish.material === 'concrete' ? undefined : finish.material) : canonical ? roomFinish(room.id) : undefined} tint={finish?.color} />
    })}
    {includeCeiling && ceiling && <Floor polygon={region.polygon} holes={ceilingHoles} color="#ecebe2" elevation={region.ceilingElevation + ceiling.thickness} thickness={ceiling.thickness} />}
  </group>)}</group>
}
