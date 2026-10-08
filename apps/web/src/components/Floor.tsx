import { useEffect, useMemo } from 'react'
import { Shape } from 'three'
import type { Point2D } from '@t3-designer/scene-schema'
import { floorSurface, type FloorFinish } from '../materials/surfaces'
import { surfaceGeometry } from './surface-geometry'

type FloorProps = {
  polygon: Point2D[]
  color: string
  elevation?: number
  thickness?: number
  finish?: FloorFinish
  /** Optional finish tint; omitted for the unchanged source reconstruction. */
  tint?: string
  holes?: Point2D[][]
  clipPolygon?: Point2D[]
}

export function Floor({ polygon, color, elevation = 0, thickness = 0, finish, tint, holes, clipPolygon }: FloorProps) {
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
  const clipped = useMemo(() => holes?.length || clipPolygon ? surfaceGeometry(polygon, holes ?? [], clipPolygon, thickness) : null, [polygon, holes, clipPolygon, thickness])
  useEffect(() => () => clipped?.dispose(), [clipped])

  return (
    <mesh position={[0, clipped ? elevation : elevation - thickness, 0]} rotation={[clipped ? 0 : -Math.PI / 2, 0, 0]} receiveShadow>
      {clipped ? <primitive object={clipped} attach="geometry" /> : thickness > 0 ? (
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
