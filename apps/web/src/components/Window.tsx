import type { DesignCustomization, Window as WindowData, Wall as WallData } from '@t3-designer/scene-schema'

type WindowCustomization = DesignCustomization['windows'][string]

type WindowProps = {
  window: WindowData
  wall: WallData
  visibleWallHeight: number
  customization?: WindowCustomization
}

function Covering({ opening, wall, visibleHeight, customization }: { opening: WindowData; wall: WallData; visibleHeight: number; customization: WindowCustomization }) {
  const { covering, closure, coveringColor } = customization
  if (covering === 'none') return null
  const top = opening.height + .06
  const depth = wall.thickness / 2 + .08
  if (covering === 'curtain') {
    const width = .09 + (opening.width / 2 - .04) * closure
    const bottom = Math.max(-opening.sillHeight + .06, -.14)
    const height = Math.max(0, Math.min(top, visibleHeight) - bottom)
    return <group>
      {visibleHeight >= opening.height && <mesh position={[0, top + .04, depth]} castShadow><boxGeometry args={[opening.width + .25, .025, .025]} /><meshStandardMaterial color="#646965" metalness={.5} roughness={.4} /></mesh>}
      {height > 0 && [-1, 1].map(side => <group key={side} position={[side * ((opening.width + .08 - width) / 2), bottom + height / 2, depth]}>
        {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[-width / 2 + width * (i + .5) / 12, 0, Math.sin(i * Math.PI / 2) * .025]} castShadow receiveShadow>
          <boxGeometry args={[width / 12 + .002, height, .025]} />
          <meshStandardMaterial color={coveringColor} roughness={1} />
        </mesh>)}
      </group>)}
    </group>
  }
  const bottom = top - (opening.height + .09) * closure
  const height = Math.max(0, Math.min(top, visibleHeight) - bottom)
  return <group>
    {visibleHeight >= opening.height && <mesh position={[0, top + .025, depth]} castShadow receiveShadow><boxGeometry args={[opening.width + .08, .1, .1]} /><meshStandardMaterial color={coveringColor} roughness={.7} /></mesh>}
    {height > 0 && <group position={[0, bottom + height / 2, depth]}>
      <mesh castShadow receiveShadow><boxGeometry args={[opening.width + .025, height, .026]} /><meshStandardMaterial color={coveringColor} roughness={covering === 'blind' ? .94 : .6} /></mesh>
      {covering === 'shutter' && Array.from({ length: Math.ceil(height / .065) }, (_, i) => <mesh key={i} position={[0, -height / 2 + Math.min(height - .008, i * .065 + .015), .017]} castShadow receiveShadow>
        <boxGeometry args={[opening.width + .025, .012, .012]} /><meshStandardMaterial color={coveringColor} roughness={.6} />
      </mesh>)}
    </group>}
  </group>
}

export function Window({ window: opening, wall, visibleWallHeight, customization }: WindowProps) {
  const height = Math.min(opening.height, visibleWallHeight - opening.sillHeight)
  if (height <= 0) return null
  const frameWidth = 0.045
  const isComplete = height >= opening.height
  const panels = customization?.style === 'fixed' ? 1 : customization?.style === 'sliding' ? 2 : opening.width > 1.8 ? 3 : 2
  const panelWidth = (opening.width - frameWidth * 2) / panels
  const frameColor = customization?.frameColor ?? '#e6e7df'

  return (
    <group position={[opening.offset + opening.width / 2, opening.sillHeight, 0]}>
      {/* Recessed reveal, separate casement frames, clear panes and a painted sill. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (opening.width / 2 - frameWidth / 2), height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[frameWidth, height, wall.thickness + 0.024]} />
          <meshStandardMaterial color={frameColor} roughness={0.48} />
        </mesh>
      ))}
      <mesh position={[0, frameWidth / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[opening.width, frameWidth, wall.thickness + 0.024]} />
        <meshStandardMaterial color={frameColor} roughness={0.48} />
      </mesh>
      {Array.from({ length: panels }, (_, index) => {
        const center = -opening.width / 2 + frameWidth + panelWidth * (index + 0.5)
        return (
          <group key={index} position={[center, 0, customization?.style === 'sliding' ? .018 + index * .05 : .018]}>
            <mesh position={[0, height / 2, 0]}>
              <boxGeometry args={[panelWidth - 0.045, Math.max(0.01, height - 0.085), 0.008]} />
              <meshPhysicalMaterial color="#c7dde0" transparent opacity={0.19} roughness={0.08} metalness={0.04} depthWrite={false} />
            </mesh>
            {opening.kind === 'balcony-door' && (
              <mesh position={[0, Math.min(height, 0.66) / 2, 0.01]} castShadow receiveShadow>
                <boxGeometry args={[panelWidth - 0.035, Math.min(height, 0.66), 0.034]} />
                <meshStandardMaterial color="#dcdfd5" roughness={0.56} />
              </mesh>
            )}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * (panelWidth / 2 - 0.016), height / 2, 0.016]} castShadow receiveShadow>
                <boxGeometry args={[0.032, height, 0.045]} />
                <meshStandardMaterial color={frameColor} roughness={0.44} />
              </mesh>
            ))}
            <mesh position={[0, 0.064, 0.016]} castShadow>
              <boxGeometry args={[panelWidth, 0.037, 0.045]} />
              <meshStandardMaterial color={frameColor} roughness={0.44} />
            </mesh>
            {isComplete && (
              <mesh position={[0, height - 0.062, 0.016]} castShadow>
                <boxGeometry args={[panelWidth, 0.037, 0.045]} />
                <meshStandardMaterial color={frameColor} roughness={0.44} />
              </mesh>
            )}
            {height > 0.65 && customization?.style !== 'fixed' && (
              <mesh position={[panelWidth / 2 - 0.035, Math.min(0.73, height * 0.55), 0.062]} castShadow>
                <boxGeometry args={[0.019, 0.11, 0.024]} />
                <meshStandardMaterial color="#cbd1c9" metalness={0.3} roughness={0.32} />
              </mesh>
            )}
          </group>
        )
      })}
      {isComplete && (
        <group>
          <mesh position={[0, height - frameWidth / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[opening.width, frameWidth, wall.thickness + 0.024]} />
            <meshStandardMaterial color={frameColor} roughness={0.48} />
          </mesh>
          {/* Keep the observed shutter housing for source geometry only. */}
          {!customization && <mesh position={[0, height + 0.083, 0.062]} castShadow receiveShadow>
            <boxGeometry args={[opening.width + 0.08, 0.16, wall.thickness + 0.08]} />
            <meshStandardMaterial color="#dedfd6" roughness={0.6} />
          </mesh>}
        </group>
      )}
      {opening.sillHeight > 0.05 && (
        <mesh position={[0, -0.014, 0.025]} castShadow receiveShadow>
          <boxGeometry args={[opening.width + 0.095, 0.046, wall.thickness + 0.15]} />
          <meshStandardMaterial color="#deddd2" roughness={0.56} />
        </mesh>
      )}
      {customization && <Covering opening={opening} wall={wall} visibleHeight={height} customization={customization} />}
    </group>
  )
}
