import type { Apartment, Fixture } from '@t3-designer/scene-schema'
import { assetCatalog, currentFixtures } from '../data/current-state'

type Vec3 = [number, number, number]
type Rect = { west: number; east: number; north: number; south: number }
type BoxProps = { name: string; position: Vec3; size: Vec3; color: string; rotation?: Vec3 }

function DetailBox({ name, position, size, color, rotation }: BoxProps) {
  return (
    <mesh name={name} position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  )
}

function Pipe({ name, position, length, axis }: {
  name: string; position: Vec3; length: number; axis: 'x' | 'y' | 'z'
}) {
  const rotation: Vec3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
  return (
    <mesh name={name} position={position} rotation={rotation} castShadow>
      <cylinderGeometry args={[0.011, 0.011, length, 10]} />
      <meshStandardMaterial color="#dddcd2" roughness={0.67} />
    </mesh>
  )
}

function roomBounds(apartment: Apartment, id: string): Rect | undefined {
  const room = apartment.rooms.find(room => room.id === id)
  return room && {
    west: Math.min(...room.polygon.map(point => point[0])),
    east: Math.max(...room.polygon.map(point => point[0])),
    north: Math.min(...room.polygon.map(point => point[1])),
    south: Math.max(...room.polygon.map(point => point[1])),
  }
}

// These nominal extents follow the fixture catalog, including its current rotation.
// They are estimated asset bounds, never measurements inferred from photography.
function fixtureBounds(fixtures: Fixture[], id: string): (Rect & { bottom: number; top: number }) | undefined {
  const fixture = fixtures.find(fixture => fixture.id === id)
  const asset = fixture && assetCatalog.find(asset => asset.id === fixture.assetId)
  if (!fixture || !asset) return undefined
  const cosine = Math.abs(Math.cos(fixture.rotation))
  const sine = Math.abs(Math.sin(fixture.rotation))
  const halfX = (asset.dimensions[0] * cosine + asset.dimensions[2] * sine) / 2
  const halfZ = (asset.dimensions[0] * sine + asset.dimensions[2] * cosine) / 2
  return {
    west: fixture.position[0] - halfX, east: fixture.position[0] + halfX,
    north: fixture.position[2] - halfZ, south: fixture.position[2] + halfZ,
    bottom: fixture.position[1], top: fixture.position[1] + asset.dimensions[1],
  }
}

function CounterFiller({ rect, name, top }: { rect: Rect; name: string; top: number }) {
  const width = rect.east - rect.west
  const depth = rect.south - rect.north
  if (width < 0.008 || depth < 0.008) return null
  const centerX = (rect.west + rect.east) / 2
  const centerZ = (rect.north + rect.south) / 2
  const bodyBottom = 0.105
  const bodyTop = top - 0.04
  return (
    <group name={name}>
      <DetailBox name={`${name} oak carcass`} position={[centerX, (bodyBottom + bodyTop) / 2, centerZ]}
        size={[width, bodyTop - bodyBottom, depth]} color="#b69666" />
      <DetailBox name={`${name} charcoal countertop`} position={[centerX, top - 0.018, centerZ]}
        size={[width, 0.036, depth]} color="#292d2d" />
      <DetailBox name={`${name} recessed plinth`} position={[centerX, 0.058, centerZ]}
        size={[Math.max(0.008, width - 0.018), 0.095, Math.max(0.008, depth - 0.018)]} color="#756249" />
    </group>
  )
}

export function ServiceDetails({ apartment, cutaway, fixtures = currentFixtures }: { apartment: Apartment; cutaway: boolean; fixtures?: Fixture[] }) {
  const kitchen = roomBounds(apartment, 'kitchen')
  const bathroom = roomBounds(apartment, 'bathroom')
  const entrance = roomBounds(apartment, 'entrance')
  const wc = roomBounds(apartment, 'wc')
  const sink = fixtureBounds(fixtures, 'k-sink')
  const cooking = fixtureBounds(fixtures, 'k-oven')
  const drawers = fixtureBounds(fixtures, 'k-drawers')
  const southCabinet = fixtureBounds(fixtures, 'k-south-cabinet')
  const washer = fixtureBounds(fixtures, 'b-washer')
  const panel = fixtureBounds(fixtures, 'entry-electrics')
  const ceiling = Math.min(...apartment.walls.map(wall => wall.height))
  const shelfFront = panel ? panel.west - 0.085 : 0
  const shelfBack = entrance ? entrance.east - 0.051 : 0
  // Sink catalog includes the faucet; adjacent cabinet top defines worktop level.
  const counterTop = drawers?.top ?? 0.915
  const splashBottom = counterTop + 0.008
  const splashTop = cutaway ? 1 : 1.46

  const fillers: { name: string; rect: Rect }[] = sink && cooking && southCabinet ? [
    {
      name: 'Kitchen northwest corner',
      rect: { west: sink.west, east: cooking.west, north: cooking.north, south: sink.north },
    },
    {
      name: 'Kitchen north counter joint',
      rect: { west: sink.east, east: cooking.west, north: sink.north, south: cooking.south },
    },
    {
      name: 'Kitchen southwest corner',
      rect: { west: sink.west, east: southCabinet.west, north: sink.south, south: southCabinet.south },
    },
    {
      name: 'Kitchen south counter joint',
      rect: { west: sink.east, east: southCabinet.west, north: southCabinet.north, south: sink.south },
    },
  ] : []

  // P01/P05: localized lifted finish at the service-hall corner. These irregular
  // strips communicate the observed condition without claiming an exact damage map.
  const damageX = wc ? wc.east + 0.30 : 1
  const damageZ = entrance ? entrance.south - 0.18 : 4.3

  return (
    <group name="Photo-informed service details">
      {fillers.map(filler => <CounterFiller key={filler.name} {...filler} top={counterTop} />)}

      {kitchen && sink && drawers && splashTop > splashBottom && (
        <group name="Kitchen charcoal backsplashes">
          <DetailBox name="Kitchen north backsplash"
            position={[(sink.west + drawers.east) / 2, (splashBottom + splashTop) / 2, kitchen.north + 0.055]}
            size={[drawers.east - sink.west, splashTop - splashBottom, 0.01]} color="#25292a" />
          <DetailBox name="Kitchen west backsplash"
            position={[kitchen.west + 0.095, (splashBottom + splashTop) / 2, (kitchen.north + kitchen.south) / 2]}
            size={[0.01, splashTop - splashBottom, kitchen.south - kitchen.north - 0.16]} color="#25292a" />
        </group>
      )}

      {washer && (
        <group name="P02 butcher-block washer cap">
          <DetailBox name="Wood top above washer"
            position={[(washer.west + washer.east) / 2, washer.top + 0.024, (washer.north + washer.south) / 2]}
            size={[washer.east - washer.west, 0.036, washer.south - washer.north]} color="#9f7149" />
          {[0, 1, 2, 3, 4, 5].map(index => (
            <DetailBox key={index} name={`Butcher-block narrow stave ${index + 1}`}
              position={[washer.west + (index + 0.5) * (washer.east - washer.west) / 6,
                washer.top + 0.043, (washer.north + washer.south) / 2]}
              size={[(washer.east - washer.west) / 6 - 0.003, 0.003, washer.south - washer.north]}
              color={index % 3 === 0 ? '#b38b62' : index % 3 === 1 ? '#88603e' : '#a97b51'} />
          ))}
        </group>
      )}

      {entrance && wc && (
        <group name="P01 approximate lifted entrance flooring">
          <DetailBox name="Dark exposed substrate" position={[damageX, 0.021, damageZ]}
            size={[0.44, 0.012, 0.24]} color="#39362d" />
          {[0, 1, 2, 3, 4].map(index => (
            <DetailBox key={index} name={`Loose damaged floor strip ${index + 1}`}
              position={[damageX - 0.18 + index * 0.088, 0.036 + index % 2 * 0.014,
                damageZ + (index % 2 ? -0.028 : 0.022)]}
              rotation={[index % 2 ? 0.09 : -0.05, index % 2 ? -0.12 : 0.08, 0.02 * index]}
              size={[0.062, 0.018, 0.17 + index % 3 * 0.025]}
              color={index % 2 ? '#6d4d32' : '#9b7648'} />
          ))}
        </group>
      )}

      {!cutaway && entrance && panel && ceiling > panel.top + 0.03 && (
        <group name="P04 utility recess and high entrance pipes">
          <DetailBox name="Utility recess lower shelf"
            position={[(shelfFront + shelfBack) / 2, panel.bottom - 0.026, (entrance.north + entrance.south) / 2]}
            size={[shelfBack - shelfFront, 0.03, entrance.south - entrance.north - 0.15]} color="#d6d3c4" />
          <DetailBox name="Utility recess upper shelf"
            position={[(shelfFront + shelfBack) / 2, ceiling - 0.035, (entrance.north + entrance.south) / 2]}
            size={[shelfBack - shelfFront, 0.03, entrance.south - entrance.north - 0.15]} color="#d6d3c4" />
          {[entrance.north + 0.07, entrance.south - 0.07].map((z, index) => (
            <DetailBox key={z} name={`Utility recess side ${index + 1}`}
              position={[(shelfFront + shelfBack) / 2, (panel.bottom + ceiling - 0.05) / 2, z]}
              size={[shelfBack - shelfFront, ceiling - 0.05 - panel.bottom, 0.025]} color="#dedbcc" />
          ))}
          {[0, 1].map(index => (
            <group key={index}>
              <Pipe name={`Utility horizontal pipe ${index + 1}`}
                position={[panel.west - 0.055, panel.bottom + 0.025 + index * 0.045, (entrance.north + entrance.south) / 2]}
                length={entrance.south - entrance.north - 0.20} axis="z" />
              <Pipe name={`Entrance high pipe ${index + 1}`}
                position={[(entrance.west + panel.west - 0.15) / 2, ceiling - 0.31 - index * 0.05, entrance.north + 0.115]}
                length={panel.west - entrance.west - 0.35} axis="x" />
            </group>
          ))}
        </group>
      )}

      {!cutaway && bathroom && (
        <group name="P02 bathroom surface pipework">
          {[0, 1].map(index => (
            <Pipe key={index} name={`Bathroom high pipe ${index + 1}`}
              position={[bathroom.east - 0.10, ceiling - 0.32 - index * 0.05, (bathroom.north + bathroom.south) / 2]}
              length={bathroom.south - bathroom.north - 0.18} axis="z" />
          ))}
        </group>
      )}
    </group>
  )
}
