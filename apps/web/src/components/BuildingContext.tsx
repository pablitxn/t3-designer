import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Line } from '@react-three/drei'
import { BufferGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, InstancedMesh, Object3D, Path, Shape, ShapeGeometry } from 'three'
import { SITE_BUILDINGS, SITE_PARCEL, SITE_ROADS, type BuildingFootprint, type SitePoint } from '../data/building-site'
import { APARTMENT_PLACEMENT, siteToApartment, splitTargetBuildingFootprint } from '../data/apartment-placement'
import { ShadowOnly } from './ShadowOnly'

export type BuildingCutaway = 'none' | 'floor' | 'apartment'

type Box = { position: [number, number, number]; scale: [number, number, number]; angle?: number }
const target = SITE_BUILDINGS.find(item => item.isTarget)!

function polygonShape(points: SitePoint[], holes: SitePoint[][] = []) {
  const shape = new Shape()
  points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  shape.holes = holes.map(ring => {
    const path = new Path()
    ring.forEach(([x, z], i) => i ? path.lineTo(x, -z) : path.moveTo(x, -z))
    path.closePath()
    return path
  })
  return shape
}

/** Roof silhouettes are inferred, not supplied by IGN. Split at the ridge
 * before triangulation so the low-pitch target roof casts a coherent shadow. */
function roofGeometry(building: BuildingFootprint, roofDatum = building) {
  const p = building.footprint
  let axis: SitePoint = [1, 0], longest = 0
  roofDatum.footprint.forEach((a, i) => {
    const b = roofDatum.footprint[(i + 1) % roofDatum.footprint.length], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length > longest) { longest = length; axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length] }
  })
  const across = ([x, z]: SitePoint) => -axis[1] * x + axis[0] * z
  const offsets = roofDatum.footprint.map(across), min = Math.min(...offsets), max = Math.max(...offsets), middle = (min + max) / 2
  const split = (side: number) => {
    const result: SitePoint[] = []
    p.forEach((a, i) => {
      const b = p[(i + 1) % p.length], da = (across(a) - middle) * side, db = (across(b) - middle) * side
      if (da >= 0) result.push(a)
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        const t = da / (da - db)
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    })
    return result
  }
  const positions: number[] = []
  // Complex/courtyard buildings keep a flat inferred roof rather than bridge holes.
  const rise = building.holes?.length || p.length > 18 ? 0 : Math.min(5, building.roofHeight)
  const heightAt = (point: SitePoint) => building.height + (rise > .4 ? rise * Math.max(0, 1 - Math.abs(across(point) - middle) / ((max - min) / 2)) : .08)
  for (const ring of rise > 0.4 ? [split(1), split(-1)] : [p]) {
    if (ring.length < 3) continue
    const shape = new ShapeGeometry(polygonShape(ring, rise > 0.4 ? [] : building.holes))
    const points = shape.getAttribute('position'), indices = shape.index
    for (let i = 0; i < (indices?.count ?? points.count); i++) {
      const index = indices ? indices.getX(i) : i
      const x = points.getX(index), z = -points.getY(index)
      positions.push(x, heightAt([x, z]), z)
    }
    shape.dispose()
  }
  // Close the eaves and gables; a floating roof would leak light into the mass.
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length], da = across(a) - middle, db = across(b) - middle
    const edge = [a]
    if (da * db < 0) { const t = da / (da - db); edge.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) }
    edge.push(b)
    edge.slice(1).forEach((end, j) => {
      const start = edge[j], base = building.height
      positions.push(start[0], base, start[1], end[0], base, end[1], end[0], heightAt(end), end[1],
        start[0], base, start[1], end[0], heightAt(end), end[1], start[0], heightAt(start), start[1])
    })
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function Volume({ building, base = 0, height = building.height, roof = true, roofDatum = building, castShadow = true }: {
  building: BuildingFootprint; base?: number; height?: number; roof?: boolean; roofDatum?: BuildingFootprint; castShadow?: boolean
}) {
  const geometry = useMemo(() => {
    const wall = new ExtrudeGeometry(polygonShape(building.footprint, building.holes), { depth: height, bevelEnabled: false })
    wall.rotateX(-Math.PI / 2)
    return wall
  }, [building, height])
  const roofMesh = useMemo(() => roof ? roofGeometry(building, roofDatum) : null, [building, roof, roofDatum])
  useEffect(() => () => { geometry.dispose(); roofMesh?.dispose() }, [geometry, roofMesh])
  // A common ground datum is deliberate: the source has building base altitudes,
  // but no terrain surface. It avoids inventing retaining walls or buried annexes.
  return <group>
    <mesh geometry={geometry} position={[0, base, 0]} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial color={building.isTarget ? '#e4dcc0' : building.height > 12 ? '#c6cec6' : '#d0d3c8'} roughness={0.92} />
    </mesh>
    {roofMesh && <mesh geometry={roofMesh} castShadow={castShadow} receiveShadow>
      <meshStandardMaterial color={building.isTarget ? '#94a3a0' : '#88938d'} roughness={0.8} side={DoubleSide} />
    </mesh>}
  </group>
}

function Boxes({ boxes, color, roughness = 0.85, castShadow = true }: { boxes: Box[]; color: string; roughness?: number; castShadow?: boolean }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const object = new Object3D()
    boxes.forEach((box, i) => {
      object.position.set(...box.position)
      object.scale.set(...box.scale)
      object.rotation.set(0, box.angle ?? 0, 0)
      object.updateMatrix()
      ref.current!.setMatrixAt(i, object.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [boxes])
  if (!boxes.length) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow={castShadow} receiveShadow>
    <boxGeometry />
    <meshStandardMaterial color={color} roughness={roughness} />
  </instancedMesh>
}

function Facades({ cutaway = 'none', castShadow = true }: { cutaway?: BuildingCutaway; castShadow?: boolean }) {
  const details = useMemo(() => {
    const glass: Box[] = [], frames: Box[] = [], rails: Box[] = [], shutters: Box[] = [], trim: Box[] = []
    const points = target.footprint
    const signedArea = points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - b[0] * a[1] }, 0)
    points.forEach((a, edge) => {
      const b = points[(edge + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1])
      const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length
      const nx = signedArea > 0 ? dz : -dz, nz = signedArea > 0 ? -dx : dx
      const angle = Math.atan2(nx, nz)
      const add = (collection: Box[], t: number, y: number, width: number, height: number, depth: number, offset = 0.06) => collection.push({ position: [a[0] + dx * t + nx * offset, y, a[1] + dz * t + nz * offset], scale: [width, height, depth], angle })
      add(trim, length / 2, 15.28, length + .12, .18, .27, .1)
      add(trim, length / 2, .45, length, .8, .08, .015)
      // Long elevations have five levels; the short gable is blind as in photos.
      if (length < 4 || (edge === 1)) return
      const columns = Math.max(1, Math.floor(length / (length > 20 ? 2.65 : 2.8)))
      for (let column = 0; column < columns; column++) {
        const t = length * (column + .5) / columns
        const staircase = length > 20 && column % 5 === 2
        for (let floor = 0; floor < 5; floor++) {
          const width = staircase ? .72 : 1.14, height = staircase ? .85 : 1.58
          const y = 2.05 + floor * 2.91 - (staircase ? .35 : 0)
          add(frames, t, y, width + .22, height + .22, .12)
          add(glass, t, y, width, height, .04, .14)
          if ((column * 3 + floor + edge) % 7 === 0 && !staircase) add(shutters, t, y + .2, width, height - .4, .04, .17)
          else {
            add(frames, t, y, .05, height, .04, .17)
            add(frames, t, y + .24, width, .055, .04, .17)
          }
          add(trim, t, y - height / 2, width + .3, .09, .28, .15)
          if (!staircase) {
            add(rails, t, y - .36, width + .28, .045, .055, .37)
            add(rails, t - width / 2, y - .57, .035, .42, .045, .37)
            add(rails, t + width / 2, y - .57, .035, .42, .045, .37)
          }
          if (staircase && floor === 0) add(rails, t, 1.05, .95, 2, .12, .19)
        }
      }
    })
    const keep = (box: Box) => {
      const [x, y] = siteToApartment(box.position)
      const top = y + box.scale[1] / 2, bottom = y - box.scale[1] / 2
      if (cutaway === 'floor' && top > -.14) return false
      // Approximate façade windows must never paint over the real apartment's
      // openings. Test the whole decoration's longitudinal extent, not only its
      // centre; long cornices would otherwise bridge a section opening.
      const angle = (box.angle ?? 0) - APARTMENT_PLACEMENT.rotationY
      const halfWidth = Math.abs(Math.cos(angle)) * box.scale[0] / 2 + Math.abs(Math.sin(angle)) * box.scale[2] / 2
      const overlaps = x + halfWidth > APARTMENT_PLACEMENT.bounds.minX - .2
        && x - halfWidth < APARTMENT_PLACEMENT.bounds.maxX + .2
      if (!overlaps) return true
      if (cutaway === 'apartment' && top > -.14) return false
      return top <= 0 || bottom >= APARTMENT_PLACEMENT.wallHeight
    }
    return { glass: glass.filter(keep), frames: frames.filter(keep), rails: rails.filter(keep), shutters: shutters.filter(keep), trim: trim.filter(keep) }
  }, [cutaway])
  return <>
    <Boxes boxes={details.glass} color="#547071" roughness={.32} castShadow={false} />
    <Boxes boxes={details.frames} color="#e8e6d6" castShadow={castShadow} />
    <Boxes boxes={details.rails} color="#806d54" castShadow={castShadow} />
    <Boxes boxes={details.shutters} color="#c8cbbf" castShadow={castShadow} />
    <Boxes boxes={details.trim} color="#c1b594" castShadow={castShadow} />
  </>
}

export function SiteGround() {
  const parcel = useMemo(() => new ShapeGeometry(polygonShape(SITE_PARCEL.footprint)), [])
  const roads = useMemo(() => SITE_ROADS.flatMap(road => road.points.slice(1).map((b, i) => {
    const a = road.points[i]
    return { position: [(a[0] + b[0]) / 2, .025, (a[1] + b[1]) / 2] as [number, number, number], scale: [road.width, .05, Math.hypot(b[0] - a[0], b[1] - a[1]) + .3] as [number, number, number], angle: Math.atan2(b[0] - a[0], b[1] - a[1]) }
  })), [])
  useEffect(() => () => parcel.dispose(), [parcel])
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.04, 0]} receiveShadow>
      <planeGeometry args={[1000, 1000]} /><meshStandardMaterial color="#dce1d5" roughness={1} />
    </mesh>
    <mesh geometry={parcel} rotation={[-Math.PI / 2, 0, 0]} position={[0, .022, 0]} receiveShadow><meshStandardMaterial color="#c6d0b6" roughness={1} /></mesh>
    <Boxes boxes={roads} color="#c4c7bf" castShadow={false} />
    <Line points={[...SITE_PARCEL.footprint, SITE_PARCEL.footprint[0]].map(([x, z]) => [x, .09, z])} color="#a29b72" lineWidth={1} dashed dashSize={.6} gapSize={.4} />
  </>
}

/** The apartment is a genuine empty storey in the building mass. Its own
 * measured-model walls and openings are rendered by Apartment, not by a solid
 * proxy box or the decorative façade windows. The aperture crosses the full
 * building depth because the IGN outline and inferred plan differ slightly. */
function TargetStructure({ cutaway, castShadow }: { cutaway: BuildingCutaway; castShadow: boolean }) {
  const sections = useMemo(() => {
    const { before, apartmentBand, after } = splitTargetBuildingFootprint()
    return {
      sides: [before, after].filter(footprint => footprint.length >= 3).map((footprint, index) => ({ ...target, id: `${target.id}-side-${index}`, footprint })),
      middle: { ...target, id: `${target.id}-apartment-band`, footprint: apartmentBand },
    }
  }, [])
  const below = APARTMENT_PLACEMENT.floorElevation - .14
  const ceiling = APARTMENT_PLACEMENT.floorElevation + APARTMENT_PLACEMENT.wallHeight
  return <>
    <Volume building={target} height={below} roof={false} castShadow={castShadow} />
    {cutaway !== 'floor' && sections.sides.map(building => <Volume key={building.id} building={building}
      base={below} height={target.height - below} roofDatum={target} castShadow={castShadow} />)}
    {cutaway === 'none' && <Volume building={sections.middle} base={ceiling} height={target.height - ceiling}
      roofDatum={target} castShadow={castShadow} />}
  </>
}

/** Site-space building context. Turning context off or cutting the visible
 * building never changes the physical obstacles used by the sunlight pass. */
export function BuildingContext({ visible = true, cutaway = 'none', showNeighbors = true }: {
  visible?: boolean
  cutaway?: BuildingCutaway
  showNeighbors?: boolean
}) {
  const neighbors = useMemo(() => SITE_BUILDINGS.filter(building => !building.isTarget), [])
  const physical = useMemo(() => <>
    <TargetStructure cutaway="none" castShadow />
    <Facades />
    {neighbors.map(building => <Volume key={building.id} building={building} />)}
  </>, [neighbors])
  return <>
    <ShadowOnly>{physical}</ShadowOnly>
    {visible && <>
      <TargetStructure cutaway={cutaway} castShadow={false} />
      <Facades cutaway={cutaway} castShadow={false} />
      {showNeighbors && neighbors.map(building => <Volume key={building.id} building={building} castShadow={false} />)}
    </>}
  </>
}
