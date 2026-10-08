import { useLayoutEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { Path, PerspectiveCamera, Shape, Vector3 } from 'three'
import type { FoundationCandidate, Point2D } from '@t3-designer/scene-schema'
import { WebGLGuard } from '../components/WebGLGuard'
import { Floor } from '../components/Floor'
import { Wall } from '../components/Wall'
import { ApartmentSurfaces } from '../components/ApartmentSurfaces'
import { Staircase } from '../components/Staircase'
import { button, Field, input, muted } from './ui'

function Volume({ footprint, holes = [], height, elevation, target }: { footprint: Point2D[]; holes?: Point2D[][]; height: number; elevation: number; target: boolean }) {
  const shape = useMemo(() => {
    const shape = new Shape()
    footprint.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath()
    shape.holes = holes.map(points => { const hole = new Path(); points.forEach(([x, z], i) => i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)); hole.closePath(); return hole })
    return shape
  }, [footprint, holes])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elevation, 0]}><extrudeGeometry args={[shape, { depth: height, bevelEnabled: false }]} /><meshStandardMaterial color={target ? '#91a680' : '#d4d8ce'} transparent opacity={target ? 1 : .7} /></mesh>
}

/** Fit projected bounds against the actual viewport, including long narrow plans. */
function PreviewCamera({ bounds, view }: { bounds: [number, number, number, number, number, number]; view: 'oblique' | 'top' }) {
  const { camera, size } = useThree()
  const [minX, maxX, minY, maxY, minZ, maxZ] = bounds
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const center = new Vector3(cx, cy, cz)
    const direction = view === 'top' ? new Vector3(0, 1, 0) : new Vector3(1, 1.25, 1).normalize()
    const preferredUp = view === 'top' ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(preferredUp, direction).normalize()
    const up = new Vector3().crossVectors(direction, right).normalize()
    const vertical = Math.tan(camera.fov * Math.PI / 360), horizontal = vertical * size.width / size.height
    let distance = 2
    for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) {
      const corner = new Vector3(x, y, z).sub(center)
      distance = Math.max(distance, Math.abs(corner.dot(right)) / horizontal + corner.dot(direction), Math.abs(corner.dot(up)) / vertical + corner.dot(direction))
    }
    camera.up.copy(preferredUp)
    camera.position.copy(center).addScaledVector(direction, distance * 1.16)
    camera.lookAt(center)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, view, cx, cy, cz, minX, maxX, minY, maxY, minZ, maxZ])
  return <OrbitControls makeDefault target={[cx, cy, cz]} enableRotate={view !== 'top'} />
}

function BuildingCorrections({ candidate, language }: { candidate: Extract<FoundationCandidate, { target: 'building' }>; language: string }) {
  const corrections = candidate.buildingCorrections
  if (!corrections) return null
  const c = language.startsWith('es') ? { title: 'Modificaciones geométricas del usuario', original: 'Registro original', edited: 'Propuesta editada', measure: 'Medida', body: 'Altura del cuerpo', roof: 'Altura de cubierta', total: 'Altura total', width: 'Ancho este-oeste', depth: 'Profundidad norte-sur', x: 'Centro este-oeste', z: 'Centro norte-sur', note: 'Los cambios son estimados y conservan por separado el registro de la fuente.', quote: 'Indicación del usuario' } : language.startsWith('fr') ? { title: 'Modifications géométriques de l’utilisateur', original: 'Donnée d’origine', edited: 'Proposition modifiée', measure: 'Mesure', body: 'Hauteur du corps', roof: 'Hauteur du toit', total: 'Hauteur totale', width: 'Largeur est-ouest', depth: 'Profondeur nord-sud', x: 'Centre est-ouest', z: 'Centre nord-sud', note: 'Les modifications sont estimées et conservent séparément les données de la source.', quote: 'Consigne de l’utilisateur' } : { title: 'User geometry changes', original: 'Original record', edited: 'Edited proposal', measure: 'Measurement', body: 'Body height', roof: 'Roof height', total: 'Total height', width: 'East-west width', depth: 'North-south depth', x: 'East-west center', z: 'North-south center', note: 'Edits are estimates; the original source record is preserved separately.', quote: 'User instruction' }
  const metric = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  const extents = (points: Point2D[]) => {
    const xs = points.map(point => point[0]), zs = points.map(point => point[1])
    return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2]
  }
  return <details open className="tw:mt-3 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-3 tw:text-xs tw:leading-5"><summary className="tw:cursor-pointer tw:font-medium">{c.title}</summary><p className={`${muted} tw:mb-2`}>{c.note}</p>{corrections.baseBuildings.map(original => {
    const edited = candidate.buildings.find(building => building.id === original.id)
    if (!edited) return null
    const before = extents(original.footprint), after = extents(edited.footprint)
    const measurements = [[c.body, original.height, edited.height], [c.roof, original.roofHeight, edited.roofHeight], [c.total, original.height + original.roofHeight, edited.height + edited.roofHeight], ...[c.width, c.depth, c.x, c.z].flatMap((label, index) => Math.abs(before[index] - after[index]) > .0001 ? [[label, before[index], after[index]]] : [])] as [string, number, number][]
    return <div key={original.id} className="tw:mt-3"><div className="tw:overflow-x-auto"><table className="tw:w-full tw:border-collapse tw:text-left"><caption className="tw:mb-2 tw:text-left tw:font-medium">{edited.label}</caption><thead><tr>{[c.measure, c.original, c.edited].map(label => <th key={label} className="tw:border-0 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:px-2 tw:py-1 tw:font-medium">{label}</th>)}</tr></thead><tbody>{measurements.map(([label, oldValue, newValue]) => <tr key={label}><th scope="row" className="tw:px-2 tw:py-1 tw:font-normal">{label}</th><td className={`${muted} tw:px-2 tw:py-1`}>{metric.format(oldValue)} m</td><td className="tw:px-2 tw:py-1">{metric.format(newValue)} m</td></tr>)}</tbody></table></div>{[...new Set(corrections.operations.filter(operation => operation.buildingId === original.id).map(operation => operation.quote))].map(quote => <p key={quote} className={`${muted} tw:mb-0 tw:break-words`}>{c.quote}: «{quote}»</p>)}</div>
  })}</details>
}

export function FoundationPreview({ candidate, language }: { candidate: FoundationCandidate; language: string }) {
  const [levelId, setLevelId] = useState('')
  const [buildingView, setBuildingView] = useState<'context' | 'target'>('context')
  const [cameraView, setCameraView] = useState<'oblique' | 'top'>('oblique')
  const [allFloors, setAllFloors] = useState(false)
  const level = candidate.target === 'dwelling' ? candidate.levels.find(level => level.levelId === levelId) ?? candidate.levels[0] : null
  const visibleLevels = candidate.target === 'dwelling' ? allFloors ? candidate.levels : level ? [level] : [] : []
  const visibleStairs = candidate.target === 'dwelling' ? candidate.connections.filter(connection => connection.geometry && (allFloors || connection.fromLevelId === level?.levelId || connection.toLevelId === level?.levelId)) : []
  const stairDatum = allFloors ? 0 : level?.elevation ?? 0
  const target = candidate.target === 'building' ? candidate.buildings.find(building => building.isTarget) : null
  const focused = candidate.target === 'building' && buildingView === 'target' && !!target
  const visibleBuildings = candidate.target === 'building' ? focused ? [target!] : candidate.buildings : []
  const points = level ? visibleLevels.flatMap(item => item.apartment.perimeter) : focused ? target!.footprint : candidate.target === 'building' ? [...candidate.buildings.flatMap(building => building.footprint), ...candidate.roads.flatMap(road => road.points), ...candidate.parcel.footprint] : []
  const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0])), minZ = Math.min(...points.map(p => p[1])), maxZ = Math.max(...points.map(p => p[1]))
  const low = candidate.target === 'building' ? Math.min(0, ...visibleBuildings.map(building => building.groundOffset)) : Math.min(...visibleLevels.flatMap(item => (item.apartment.floorRegions ?? [{ floorElevation: 0 }]).map(region => (allFloors ? item.elevation : 0) + region.floorElevation)), ...visibleStairs.flatMap(connection => connection.geometry!.flights.map(flight => flight.from[1] - stairDatum)))
  const high = candidate.target === 'building' ? Math.max(...visibleBuildings.map(building => building.groundOffset + building.height + building.roofHeight)) : Math.max(...visibleLevels.map(item => (allFloors ? item.elevation : 0) + 1), ...visibleStairs.flatMap(connection => connection.geometry!.flights.map(flight => flight.to[1] - stairDatum + .95)))
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, span = Math.max(maxX - minX, maxZ - minZ, high - low, 8)
  const words = language.startsWith('es') ? { floor: 'Planta de la propuesta', hint: 'Propuesta estimada. Arrastrá para girar; rueda para acercar. Las conexiones entre plantas requieren revisión.' } : language.startsWith('fr') ? { floor: 'Niveau proposé', hint: 'Proposition estimée. Glissez pour tourner ; molette pour zoomer. Les liaisons entre niveaux restent à vérifier.' } : { floor: 'Proposed floor', hint: 'Estimated proposal. Drag to orbit; scroll to zoom. Connections between floors need review.' }
  if (candidate.target === 'building') words.hint = language.startsWith('es') ? 'Propuesta estimada. Edificio principal en verde; arrastrá para girar y usá la rueda para acercar.' : language.startsWith('fr') ? 'Proposition estimée. Bâtiment principal en vert ; glissez pour tourner et zoomez avec la molette.' : 'Estimated proposal. Main building in green; drag to orbit and scroll to zoom.'
  const buildingWords = language.startsWith('es') ? { view: 'Vista del edificio', context: 'Entorno', target: 'Edificio principal', buildings: 'edificios', roads: 'tramos viales', holes: 'patios del edificio principal', roadHint: 'Las calles usan el trazado y el ancho de las fuentes; se muestran sobre un plano de referencia, sin reconstruir el relieve.' } : language.startsWith('fr') ? { view: 'Vue du bâtiment', context: 'Environnement', target: 'Bâtiment principal', buildings: 'bâtiments', roads: 'tronçons de voirie', holes: 'cours du bâtiment principal', roadHint: 'Les rues suivent les tracés et largeurs des sources sur un plan de référence, sans reconstruction du relief.' } : { view: 'Building view', context: 'Surroundings', target: 'Main building', buildings: 'buildings', roads: 'road sections', holes: 'main building courtyards', roadHint: 'Roads use the source paths and widths on a reference plane, without reconstructed terrain.' }
  const inspection = language.startsWith('es') ? { camera: 'Ángulo de inspección', oblique: 'Perspectiva', top: 'Vista cenital', all: 'Ver todas las plantas', aligned: 'Plantas en sus coordenadas y cotas originales; borde verde en la seleccionada.', cutaway: 'Muros recortados a 1 m para inspeccionar el interior.', elevation: 'Cota de planta', connections: 'Conexiones entre plantas', noConnections: 'No hay conexiones entre plantas documentadas en esta propuesta.' } : language.startsWith('fr') ? { camera: 'Angle de vue', oblique: 'Perspective', top: 'Vue de dessus', all: 'Voir tous les niveaux', aligned: 'Niveaux aux coordonnées et altitudes d’origine ; contour vert pour la sélection.', cutaway: 'Murs coupés à 1 m pour examiner l’intérieur.', elevation: 'Altitude du niveau', connections: 'Liaisons entre niveaux', noConnections: 'Aucune liaison entre niveaux documentée dans cette proposition.' } : { camera: 'Inspection angle', oblique: 'Perspective', top: 'Top view', all: 'Show all floors', aligned: 'Floors retain their original coordinates and elevations; the selected floor has a green outline.', cutaway: 'Walls are cut at 1 m for interior inspection.', elevation: 'Floor elevation', connections: 'Connections between floors', noConnections: 'This proposal has no documented connections between floors.' }
  const metric = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  const dimensions = language.startsWith('es') ? 'Dimensiones de la propuesta' : language.startsWith('fr') ? 'Dimensions proposées' : 'Proposed dimensions'
  const heightLabel = language.startsWith('es') ? 'Altura' : language.startsWith('fr') ? 'Hauteur' : 'Height'
  return <div className="tw:min-w-0">
    {candidate.target === 'dwelling' && <Field label={words.floor}><select className={input} value={level?.levelId} onChange={event => setLevelId(event.target.value)}>{candidate.levels.map(item => <option key={item.levelId} value={item.levelId}>{item.name}</option>)}</select></Field>}
    {candidate.target === 'building' && <div className="tw:flex tw:flex-wrap tw:gap-2" role="group" aria-label={buildingWords.view}>{(['context', 'target'] as const).map(view => <button key={view} type="button" className={`${button} tw:aria-pressed:bg-[var(--settings-accent-soft)]`} aria-pressed={buildingView === view} onClick={() => setBuildingView(view)}>{buildingWords[view]}</button>)}</div>}
    <div className="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2" role="group" aria-label={inspection.camera}>{(['oblique', 'top'] as const).map(view => <button key={view} type="button" className={`${button} tw:min-h-9! tw:px-3! tw:py-1! tw:text-xs! tw:aria-pressed:bg-[var(--settings-accent-soft)]`} aria-pressed={cameraView === view} onClick={() => setCameraView(view)}>{inspection[view]}</button>)}{candidate.target === 'dwelling' && candidate.levels.length > 1 && <label className="tw:ml-1 tw:flex tw:items-center tw:gap-2 tw:text-xs"><input type="checkbox" checked={allFloors} onChange={event => setAllFloors(event.target.checked)} />{inspection.all}</label>}</div>
    <div className="tw:mt-3 tw:h-80 tw:overflow-hidden tw:rounded-xl tw:bg-[#e9ede3]" aria-label={candidate.summary}>
      <WebGLGuard fallback={<p className={`${muted} tw:p-5`}>{language.startsWith('es') ? 'La vista 3D necesita WebGL. Podés revisar las medidas y observaciones del agente abajo.' : language.startsWith('fr') ? 'La vue 3D nécessite WebGL. Les détails restent disponibles ci-dessous.' : 'The 3D preview requires WebGL. Review the agent’s details below.'}</p>}><Canvas key={`${candidate.target}-${level?.levelId}-${buildingView}-${cameraView}-${allFloors}-${span}`} camera={{ fov: 45, near: .01, far: Math.max(3000, span * 10) }}>
        <ambientLight intensity={1.2} /><directionalLight position={[cx + span, span * 2, cz - span]} intensity={2} />
        <PreviewCamera bounds={[minX, maxX, low, high, minZ, maxZ]} view={cameraView} />
        {visibleLevels.map(item => <group key={item.levelId} position={[0, allFloors ? item.elevation : 0, 0]}><ApartmentSurfaces apartment={item.apartment} floor={{ polygon: item.apartment.perimeter, elevation: 0, thickness: .15 }} />{item.apartment.walls.map(wall => <Wall key={wall.id} wall={wall} doors={item.apartment.doors.filter(door => door.wallId === wall.id)} windows={item.apartment.windows.filter(window => window.wallId === wall.id)} cutaway />)}{allFloors && item.levelId === level?.levelId && <Line points={[...item.apartment.perimeter, item.apartment.perimeter[0]].map(([x, z]) => [x, .025, z] as [number, number, number])} color="#397447" lineWidth={2} />}</group>)}
        {visibleStairs.map(connection => <Staircase key={connection.id} geometry={connection.geometry!} yOffset={-stairDatum} />)}
        {candidate.target === 'building' && <group>{!focused && <><Floor polygon={candidate.parcel.footprint} color="#e0dfc9" elevation={-.1} />{candidate.roads.flatMap(road => road.points.slice(1).map((end, index) => {
          const start = road.points[index], length = Math.hypot(end[0] - start[0], end[1] - start[1])
          return length > 0 ? <mesh key={`${road.id}-${index}`} position={[(start[0] + end[0]) / 2, -.04, (start[1] + end[1]) / 2]} rotation={[0, Math.atan2(end[0] - start[0], end[1] - start[1]), 0]}><boxGeometry args={[road.width, .02, length]} /><meshStandardMaterial color={road.isPath ? '#c8c5b5' : '#9fa69c'} roughness={1} /></mesh> : null
        }))}</>}{visibleBuildings.map(building => <Volume key={building.id} footprint={building.footprint} holes={building.holes} height={building.height + building.roofHeight} elevation={building.groundOffset} target={building.isTarget} />)}</group>}
      </Canvas></WebGLGuard>
    </div><p className={`${muted} tw:text-xs tw:leading-5`}>{words.hint}</p>
    {candidate.target === 'dwelling' && <p className={`${muted} tw:text-xs tw:leading-5`}>{allFloors && `${inspection.aligned} `}{inspection.cutaway}</p>}
    {candidate.target === 'building' && <p className={`${muted} tw:text-xs tw:leading-5`}>{candidate.buildings.length} {buildingWords.buildings} · {candidate.roads.length} {buildingWords.roads} · {target?.holes?.length ?? 0} {buildingWords.holes}. {!focused && buildingWords.roadHint}</p>}
    <div className="tw:rounded-lg tw:bg-[var(--settings-surface)] tw:p-3 tw:text-xs tw:leading-5"><p className="tw:mb-1 tw:mt-0 tw:font-medium">{dimensions}</p><p className="tw:my-1">{metric.format(target ? Math.max(...target.footprint.map(p => p[0])) - Math.min(...target.footprint.map(p => p[0])) : level ? Math.max(...level.apartment.perimeter.map(p => p[0])) - Math.min(...level.apartment.perimeter.map(p => p[0])) : maxX - minX)} × {metric.format(target ? Math.max(...target.footprint.map(p => p[1])) - Math.min(...target.footprint.map(p => p[1])) : level ? Math.max(...level.apartment.perimeter.map(p => p[1])) - Math.min(...level.apartment.perimeter.map(p => p[1])) : maxZ - minZ)} m · {heightLabel}: {metric.format(level?.ceilingHeight ?? ((target?.height ?? 0) + (target?.roofHeight ?? 0)))} m</p>{level && <><p className="tw:my-1">{inspection.elevation}: {metric.format(level.elevation)} m</p><p className={`${muted} tw:mb-0 tw:mt-1 tw:whitespace-pre-wrap`}>{level.scaleEvidence}</p></>}</div>
    {candidate.target === 'building' && <BuildingCorrections candidate={candidate} language={language} />}
    {candidate.target === 'dwelling' && (candidate.levels.length > 1 || candidate.connections.length > 0) && <details className="tw:mt-3 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:p-3 tw:text-xs tw:leading-5"><summary className="tw:cursor-pointer tw:font-medium">{inspection.connections}</summary>{candidate.connections.length ? <ul className="tw:mb-0 tw:pl-5">{candidate.connections.map((connection, index) => <li key={index}>{candidate.levels.find(item => item.levelId === connection.fromLevelId)?.name} → {candidate.levels.find(item => item.levelId === connection.toLevelId)?.name}: {connection.notes} <span className={muted}>{connection.geometry ? language.startsWith('es') ? 'Escalera modelada · dimensiones estimadas según la evidencia indicada.' : language.startsWith('fr') ? 'Escalier modélisé · dimensions estimées selon les sources indiquées.' : 'Modeled stair · estimated dimensions based on the stated evidence.' : language.startsWith('es') ? 'Solo documentada; falta geometría para recorrerla.' : language.startsWith('fr') ? 'Documentée uniquement ; géométrie manquante pour la parcourir.' : 'Documented only; geometry is needed to walk it.'}</span>{connection.geometry && <p className={muted}>{connection.geometry.evidence.note}</p>}</li>)}</ul> : <p className={`${muted} tw:mb-0`}>{inspection.noConnections}</p>}</details>}
  </div>
}
