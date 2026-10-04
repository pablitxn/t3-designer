import { useMemo } from 'react'
import { Shape } from 'three'
import type { Point2D } from '@t3-designer/scene-schema'
import { floorSurface, type FloorFinish } from '../materials/surfaces'

type FloorProps = {
  polygon: Point2D[]
  color: string
  elevation?: number
  thickness?: number
  finish?: FloorFinish
  /** Optional finish tint; omitted for the unchanged source reconstruction. */
  tint?: string
}

export function Floor({ polygon, color, elevation = 0, thickness = 0, finish, tint }: FloorProps) {
  const surface = useMemo(() => finish ? floorSurface(finish) : undefined, [finish])
  const shape = useMemo(() => {
    const outline = new Shape()
    polygon.forEach(([x, z], index) => {
      // Shape uses XY. Negating Z before rotating keeps plan north at world -Z.
      if (index === 0) outline.moveTo(x, -z)
      else outline.lineTo(x, -z)
    })
    outline.closePath()
    return outline
  }, [polygon])

  return (
    <mesh position={[0, elevation - thickness, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      {thickness > 0 ? (
        <extrudeGeometry args={[shape, { depth: thickness, bevelEnabled: false }]} />
      ) : (
        <shapeGeometry args={[shape]} />
      )}
      <meshStandardMaterial
        color={tint ?? (surface ? '#ffffff' : color)}
        map={surface?.color ?? null}
        bumpMap={surface?.relief ?? null}
        bumpScale={finish === 'parquet' ? 0.008 : 0.012}
        roughness={surface?.roughness ?? 0.95}
      />
    </mesh>
  )
}
