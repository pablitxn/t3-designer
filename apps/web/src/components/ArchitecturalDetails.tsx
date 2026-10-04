import { polygonBounds, wallRotation } from '@t3-designer/geometry'
import type { Apartment } from '@t3-designer/scene-schema'

function Guard({ length, height = 1.03, simple = false }: { length: number; height?: number; simple?: boolean }) {
  const bars = Math.max(2, Math.round(length / (simple ? 0.42 : 0.12)))
  return (
    <group>
      {[height - 0.015, simple ? Math.max(0.03, height - 0.21) : 0.11].map((y) => (
        <mesh key={y} position={[length / 2, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[length + 0.025, simple ? 0.026 : 0.035, 0.035]} />
          <meshStandardMaterial color="#333b3b" metalness={0.55} roughness={0.49} />
        </mesh>
      ))}
      {Array.from({ length: bars + 1 }, (_, index) => (
        <mesh key={index} position={[index * length / bars, height / 2, 0]} castShadow>
          <boxGeometry args={[index === 0 || index === bars ? 0.03 : 0.014, height, 0.027]} />
          <meshStandardMaterial color="#333b3b" metalness={0.55} roughness={0.49} />
        </mesh>
      ))}
    </group>
  )
}

export function ArchitecturalDetails({ apartment, cutaway }: { apartment: Apartment; cutaway: boolean }) {
  const balcony = apartment.balcony ? polygonBounds(apartment.balcony.polygon) : undefined
  return (
    <group name="observed-architectural-details">
      {balcony && (
        <group>
          <group position={[balcony.min[0], 0.012, balcony.max[1] - 0.04]}>
            <Guard length={balcony.width} />
          </group>
          {[balcony.min[0] + 0.025, balcony.max[0] - 0.025].map((x) => (
            <group key={x} position={[x, 0.012, balcony.min[1]]} rotation={[0, -Math.PI / 2, 0]}>
              <Guard length={balcony.depth - 0.04} />
            </group>
          ))}
        </group>
      )}
      {apartment.windows.filter((opening) => opening.id.startsWith('bedroom')).map((opening) => {
        const wall = apartment.walls.find((candidate) => candidate.id === opening.wallId)!
        const height = Math.max(0.05, (cutaway ? 1 : 1.2) - opening.sillHeight + 0.03)
        return (
          <group key={opening.id} position={[wall.from[0], 0, wall.from[1]]} rotation={[0, wallRotation(wall), 0]}>
            <group position={[opening.offset + 0.025, opening.sillHeight - 0.03, -wall.thickness / 2 - 0.085]}>
              <Guard length={opening.width - 0.05} height={height} simple />
            </group>
          </group>
        )
      })}
    </group>
  )
}
