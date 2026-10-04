import { segmentWall, wallRotation } from '@t3-designer/geometry'
import type { DesignCustomization, Door as DoorData, Wall as WallData, Window as WindowData } from '@t3-designer/scene-schema'
import { Door } from './Door'
import { Window } from './Window'

type WallProps = {
  wall: WallData
  doors: DoorData[]
  windows: WindowData[]
  cutaway: boolean
  customization?: DesignCustomization
}

export function Wall({ wall, doors, windows, cutaway, customization }: WallProps) {
  const visibleHeight = cutaway ? Math.min(1, wall.height) : wall.height
  const segments = segmentWall(wall, [...doors, ...windows])

  return (
    <group position={[wall.from[0], 0, wall.from[1]]} rotation={[0, wallRotation(wall), 0]}>
      {segments.map((segment, index) => {
        const height = Math.min(segment.height, visibleHeight - segment.bottom)
        if (height <= 0) return null
        return (
          <mesh
            key={index}
            position={[segment.offset + segment.length / 2, segment.bottom + height / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[segment.length, height, wall.thickness]} />
            <meshStandardMaterial color={customization?.wallColors[wall.id] ?? (wall.kind === 'exterior' ? '#e9e7dc' : '#f1eee1')} roughness={0.94} />
          </mesh>
        )
      })}
      {/* Skirting follows the actual solid intervals and stops at every doorway. */}
      {segments.filter((segment) => segment.bottom === 0).map((segment, index) => (
        <group key={`skirting-${index}`}>
          {(wall.kind === 'exterior' ? [1] : [-1, 1]).map((side) => (
            <group key={side}>
              <mesh position={[segment.offset + segment.length / 2, 0.055, side * (wall.thickness / 2 + 0.009)]} castShadow receiveShadow>
                <boxGeometry args={[segment.length, 0.09, 0.018]} />
                <meshStandardMaterial color="#aeb7b0" roughness={0.65} />
              </mesh>
              <mesh position={[segment.offset + segment.length / 2, 0.102, side * (wall.thickness / 2 + 0.007)]} receiveShadow>
                <boxGeometry args={[segment.length, 0.008, 0.014]} />
                <meshStandardMaterial color="#c3c9bc" roughness={0.62} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {doors.map((door) => <Door key={door.id} door={door} wall={wall} visibleWallHeight={visibleHeight} customization={customization?.doors[door.id]} />)}
      {windows.map((window) => <Window key={window.id} window={window} wall={wall} visibleWallHeight={visibleHeight} customization={customization?.windows[window.id]} />)}
    </group>
  )
}
