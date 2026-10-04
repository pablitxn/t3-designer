import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BufferGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Object3D, Path, Shape, ShapeGeometry } from 'three'
import { useTranslation } from 'react-i18next'
import { roofHeightAt, type RoofSolarLayout, type RoofSurface } from '../energy/roof-layout'
import type { SitePoint } from '../data/building-site'
import type { SolarPosition } from '../lib/solar'
import { RooftopSolarPanels } from './RooftopSolarPanels'
import { WebGLGuard } from './WebGLGuard'

function shapeOf(ring: SitePoint[], holes: SitePoint[][] = []) {
  const shape = new Shape()
  ring.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  shape.holes = holes.map(points => {
    const path = new Path()
    points.forEach(([x, z], i) => i ? path.lineTo(x, -z) : path.moveTo(x, -z))
    path.closePath()
    return path
  })
  return shape
}

function RoofMass({ roof }: { roof: RoofSurface }) {
  const { walls, top } = useMemo(() => {
    const walls = new ExtrudeGeometry(shapeOf(roof.footprint, roof.holes), { depth: roof.eaveHeightM, bevelEnabled: false })
    walls.rotateX(-Math.PI / 2)
    const across = ([x, z]: SitePoint) => -roof.ridgeAxis[1] * x + roof.ridgeAxis[0] * z - roof.ridgeOffsetM
    const split = (side: number): SitePoint[] => {
      const result: SitePoint[] = []
      roof.footprint.forEach((a, i) => {
        const b = roof.footprint[(i + 1) % roof.footprint.length], da = across(a) * side, db = across(b) * side
        if (da >= 0) result.push(a)
        if (da * db < 0) { const t = da / (da - db); result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
      })
      return result
    }
    const positions: number[] = []
    for (const ring of roof.riseM > 0 ? [split(1), split(-1)] : [roof.footprint]) {
      if (ring.length < 3) continue
      const shape = new ShapeGeometry(shapeOf(ring, roof.riseM > 0 ? [] : roof.holes))
      const points = shape.getAttribute('position'), indices = shape.index
      for (let i = 0; i < (indices?.count ?? points.count); i++) {
        const index = indices ? indices.getX(i) : i, x = points.getX(index), z = -points.getY(index)
        positions.push(x, roofHeightAt(roof, [x, z]), z)
      }
      shape.dispose()
    }
    roof.footprint.forEach((a, i) => {
      const b = roof.footprint[(i + 1) % roof.footprint.length], da = across(a), db = across(b), edge = [a]
      if (da * db < 0) { const t = da / (da - db); edge.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
      edge.push(b)
      edge.slice(1).forEach((end, index) => {
        const start = edge[index], base = roof.eaveHeightM
        positions.push(start[0], base, start[1], end[0], base, end[1], end[0], roofHeightAt(roof, end), end[1],
          start[0], base, start[1], end[0], roofHeightAt(roof, end), end[1], start[0], roofHeightAt(roof, start), start[1])
      })
    })
    const top = new BufferGeometry()
    top.setAttribute('position', new Float32BufferAttribute(positions, 3))
    top.computeVertexNormals()
    return { walls, top }
  }, [roof])
  useEffect(() => () => { walls.dispose(); top.dispose() }, [walls, top])
  return <>
    <mesh geometry={walls} castShadow receiveShadow><meshStandardMaterial color="#dfd9c6" roughness={.9} /></mesh>
    <mesh geometry={top} castShadow receiveShadow><meshStandardMaterial color="#96a39a" side={DoubleSide} roughness={.8} /></mesh>
  </>
}

function PreviewCamera({ center, radius, ridgeAxis, view }: { center: [number, number, number]; radius: number; ridgeAxis: SitePoint; view: '3d' | 'top' }) {
  const { camera, size, invalidate } = useThree()
  const [x, y, z] = center
  const [ridgeX, ridgeZ] = ridgeAxis
  useEffect(() => {
    const distance = radius * .8 * Math.max(1, .9 / (size.width / Math.max(1, size.height)))
    // View across the ridge so elongated buildings use the landscape preview.
    camera.position.set(x + (view === 'top' ? 0 : -ridgeZ * distance * 1.2), y + distance * (view === 'top' ? 1.8 : 1.1), z + (view === 'top' ? .01 : ridgeX * distance * 1.2))
    camera.lookAt(x, y, z)
    invalidate()
  }, [camera, invalidate, x, y, z, radius, ridgeX, ridgeZ, view, size.width, size.height])
  return <OrbitControls makeDefault target={center} minDistance={Math.max(2, radius * .25)} maxDistance={radius * 6} maxPolarAngle={Math.PI / 2.05} />
}

/** A project-local preview; it never substitutes the public T3 building data. */
export function SolarRoofPreview({ roof, layout, sun, view = '3d' }: { roof: RoofSurface; layout: RoofSolarLayout; sun?: SolarPosition; view?: '3d' | 'top' }) {
  const { t } = useTranslation('workspace')
  const bounds = useMemo(() => {
    const xs = roof.footprint.map(point => point[0]), zs = roof.footprint.map(point => point[1])
    const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2
    return { center: [x, roof.eaveHeightM + roof.riseM / 2, z] as [number, number, number], radius: Math.max(5, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) }
  }, [roof])
  const target = useMemo(() => { const object = new Object3D(); object.position.set(...bounds.center); return object }, [bounds])
  const direction = sun?.direction ?? [.4, .85, .3]
  const source = bounds.center.map((value, i) => value + direction[i] * bounds.radius * 3) as [number, number, number]
  const fallback = <div className="canvas-fallback">{t('building.canvasFallback')}</div>
  return <div className="building-scene-surface" style={{ width: '100%', height: '100%', position: 'relative' }}>
    <WebGLGuard fallback={fallback}>
      <Canvas frameloop="demand" shadows="percentage" camera={{ fov: 42, near: .1, far: Math.max(1000, bounds.radius * 12) }} dpr={[1, 1.6]} aria-label={t('building.canvasAria')} fallback={fallback}>
        <color attach="background" args={['#e7eae2']} />
        <ambientLight intensity={.65} />
        <hemisphereLight args={['#edf3ff', '#b4b5a3', .8]} />
        <primitive object={target} />
        <directionalLight position={source} target={target} intensity={sun && !sun.isDaylight ? 0 : 2.8} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-bounds.radius} shadow-camera-right={bounds.radius} shadow-camera-top={bounds.radius} shadow-camera-bottom={-bounds.radius}
          shadow-camera-near={.1} shadow-camera-far={bounds.radius * 8} shadow-bias={-.00015} shadow-normalBias={.05} />
        <RoofMass roof={roof} />
        <RooftopSolarPanels layout={layout} />
        <mesh position={[bounds.center[0], -.03, bounds.center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[bounds.radius * 8, bounds.radius * 8]} /><meshStandardMaterial color="#d5dccf" roughness={1} />
        </mesh>
        <PreviewCamera center={bounds.center} radius={bounds.radius} ridgeAxis={roof.ridgeAxis} view={view} />
      </Canvas>
    </WebGLGuard>
  </div>
}
