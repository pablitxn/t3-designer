import { useMemo } from 'react'
import { Path, Shape } from 'three'
import type { DesignCustomization, Door as DoorData, Wall as WallData } from '@t3-designer/scene-schema'

type DoorProps = {
  door: DoorData
  wall: WallData
  visibleWallHeight: number
  customization?: DesignCustomization['doors'][string]
}

function DamagedPanel({ width, height, color }: { width: number; height: number; color: string }) {
  const shape = useMemo(() => {
    const panel = new Shape()
    panel.moveTo(0, 0)
    panel.lineTo(width, 0)
    panel.lineTo(width, height)
    panel.lineTo(0, height)
    panel.closePath()
    const hole = new Path()
    const x = width * 0.45
    const y = height * 0.54
    const points = [[-0.047, -0.075], [-0.039, 0.03], [-0.049, 0.08], [-0.019, 0.052], [0.003, 0.065], [0.019, 0.021], [0.048, 0.009], [0.034, -0.039], [0.032, -0.079]]
    points.forEach(([px, py], index) => index === 0 ? hole.moveTo(x + px, y + py) : hole.lineTo(x + px, y + py))
    hole.closePath()
    panel.holes.push(hole)
    return panel
  }, [width, height])
  return (
    <mesh position={[0, 0, -0.008]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, { depth: 0.016, bevelEnabled: false }]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  )
}

function PaneledLeaf({ width, fullHeight, visibleHeight, color, damaged, glazed = false }: { width: number; fullHeight: number; visibleHeight: number; color: string; damaged: boolean; glazed?: boolean }) {
  const rail = 0.085
  const panelWidth = width - rail * 2
  const panelHeight = (fullHeight - rail * 5) / 4
  const leafHeight = Math.min(fullHeight, visibleHeight)
  return (
    <group>
      {[rail / 2, width - rail / 2].map((x) => (
        <mesh key={x} position={[x, leafHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[rail, leafHeight, 0.035]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
      {Array.from({ length: 5 }, (_, index) => {
        const bottom = index * (panelHeight + rail)
        const height = Math.min(rail, leafHeight - bottom)
        if (height <= 0) return null
        return (
          <mesh key={index} position={[width / 2, bottom + height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[panelWidth, height, 0.035]} />
            <meshStandardMaterial color={color} roughness={0.68} />
          </mesh>
        )
      })}
      {Array.from({ length: 4 }, (_, index) => {
        const bottom = rail + index * (panelHeight + rail)
        const height = Math.min(panelHeight, leafHeight - bottom)
        if (height <= 0) return null
        return (
          <group key={index} position={[rail, bottom, 0]}>
            {damaged && index === 2 && height === panelHeight ? (
              <DamagedPanel width={panelWidth} height={height} color={color} />
            ) : (
              <mesh position={[panelWidth / 2, height / 2, 0]} castShadow={!(glazed && index > 0)} receiveShadow>
                <boxGeometry args={[panelWidth, height, 0.016]} />
                {glazed && index > 0
                  ? <meshPhysicalMaterial color="#dae5df" transparent opacity={.22} roughness={.08} depthWrite={false} />
                  : <meshStandardMaterial color={color} roughness={0.77} />}
              </mesh>
            )}
            {[-1, 1].map((face) => (
              <group key={face}>
                {[0.012, panelWidth - 0.012].map((x) => (
                  <mesh key={x} position={[x, height / 2, face * 0.012]} receiveShadow>
                    <boxGeometry args={[0.024, height, 0.014]} />
                    <meshStandardMaterial color={color} roughness={0.6} />
                  </mesh>
                ))}
                {[0.012, panelHeight - 0.012].filter((y) => y < height).map((y) => (
                  <mesh key={y} position={[panelWidth / 2, y, face * 0.012]} receiveShadow>
                    <boxGeometry args={[panelWidth, 0.024, 0.014]} />
                    <meshStandardMaterial color={color} roughness={0.6} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        )
      })}
      {visibleHeight > 1.1 && [-1, 1].map((face) => (
        <group key={face} position={[width - 0.065, 1.01, face * 0.027]}>
          <mesh castShadow>
            <boxGeometry args={[0.037, 0.18, 0.012]} />
            <meshStandardMaterial color="#929892" metalness={0.86} roughness={0.26} />
          </mesh>
          <mesh position={[-0.046, 0.019, face * 0.028]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.092, 10]} />
            <meshStandardMaterial color="#b4bbb5" metalness={0.88} roughness={0.22} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// All positions are in the wall's local frame: X follows wall.from → wall.to.
export function Door({ door, wall, visibleWallHeight, customization }: DoorProps) {
  const height = Math.min(door.height, visibleWallHeight)
  const hingeAtStart = door.hinge === 'start'
  const leafDirection = hingeAtStart ? 1 : -1
  const leafWidth = door.width - 0.045
  const hingeX = door.offset + (hingeAtStart ? 0.024 : door.width - 0.024)
  const swing = (customization ? customization.openness * Math.PI / 2 : (Math.PI * 76) / 180) * door.opensToward * -leafDirection
  const frameColor = customization?.color ?? (door.finish === 'blue-gray' ? '#526f80' : door.finish === 'white' ? '#e3e6dc' : '#a2afa9')
  const leafColor = customization?.color ?? (door.finish === 'blue-gray' ? '#d0d5ca' : '#b7c0b6')
  const passage = customization ? customization.style === 'passage' : door.appearance === 'passage'

  return (
    <group>
      {[door.offset + 0.014, door.offset + door.width - 0.014].map((x) => (
        <mesh key={x} position={[x, height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.028, height, wall.thickness + 0.008]} />
          <meshStandardMaterial color={frameColor} roughness={0.66} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[door.offset - 0.019, door.offset + door.width + 0.019].map((x) => (
            <group key={x}>
              <mesh position={[x, height / 2, side * (wall.thickness / 2 + 0.014)]} castShadow receiveShadow>
                <boxGeometry args={[0.066, height, 0.027]} />
                <meshStandardMaterial color={frameColor} roughness={0.62} />
              </mesh>
              <mesh position={[x, height / 2, side * (wall.thickness / 2 + 0.031)]} receiveShadow>
                <boxGeometry args={[0.025, height, 0.013]} />
                <meshStandardMaterial color={frameColor} roughness={0.58} />
              </mesh>
            </group>
          ))}
          {visibleWallHeight >= door.height + 0.07 && (
            <group position={[door.offset + door.width / 2, door.height + 0.02, side * (wall.thickness / 2 + 0.014)]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[door.width + 0.105, 0.075, 0.027]} />
                <meshStandardMaterial color={frameColor} roughness={0.62} />
              </mesh>
              <mesh position={[0, 0.016, side * 0.017]} receiveShadow>
                <boxGeometry args={[door.width + 0.105, 0.025, 0.013]} />
                <meshStandardMaterial color={frameColor} roughness={0.58} />
              </mesh>
            </group>
          )}
        </group>
      ))}
      {visibleWallHeight >= door.height && (
        <mesh position={[door.offset + door.width / 2, door.height - 0.013, 0]} castShadow>
          <boxGeometry args={[door.width, 0.026, wall.thickness]} />
          <meshStandardMaterial color={frameColor} roughness={0.66} />
        </mesh>
      )}
      <mesh position={[door.offset + door.width / 2, 0.016, 0]} receiveShadow>
        <boxGeometry args={[door.width - 0.028, 0.012, 0.085]} />
        <meshStandardMaterial color={passage ? '#997649' : '#979d97'} metalness={passage ? 0 : 0.65} roughness={0.48} />
      </mesh>
      {!passage && (
        <group position={[hingeX, 0.025, 0]} rotation={[0, swing, 0]}>
          <group scale={[leafDirection, 1, 1]}>
            <PaneledLeaf width={leafWidth} fullHeight={door.height - 0.05} visibleHeight={Math.max(0, height - 0.025)} color={leafColor} damaged={!customization && door.condition === 'damaged-panel'} glazed={customization?.style === 'glazed'} />
          </group>
        </group>
      )}
    </group>
  )
}
