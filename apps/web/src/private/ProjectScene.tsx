import { useUnits } from '../lib/useUnits'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { apartmentBounds, polygonCentroid } from '@t3-designer/geometry'
import { getAssetMobility, isFixtureMovable, type Fixture, type Point2D, type ProjectSnapshot } from '@t3-designer/scene-schema'
import { Mesh, Path, PCFShadowMap, PerspectiveCamera, Shape } from 'three'
import { useTranslation } from 'react-i18next'
import { Wall } from '../components/Wall'
import { WebGLGuard } from '../components/WebGLGuard'
import { addProjectFixture, projectModelUrl, removeProjectFixture, updateProjectFixture } from './project-scene'
import { sceneCopy } from './scene-copy'
import { editorCopy } from '../editor/copy'
import { Floor } from '../components/Floor'
import { DesignEnvelope, DesignLighting, LightEmitter } from '../components/DesignLighting'
import { activeFixtureLightIds, fixtureLight } from '../lib/design-lighting'
import { roomFinish } from '../materials/surfaces'

type ProjectSceneProps = { snapshot: ProjectSnapshot; onChange: (snapshot: ProjectSnapshot) => void; readOnly: boolean }
type SceneAsset = ProjectSnapshot['assets'][number]
const button = 'tw:cursor-pointer tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-sm tw:text-[var(--settings-text)] tw:transition-colors tw:hover:bg-[var(--settings-accent-soft)] tw:disabled:cursor-not-allowed tw:disabled:opacity-50'
const input = 'tw:box-border tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-sm tw:text-[var(--settings-text)] tw:disabled:opacity-60'

function footprintShape(points: Point2D[], holes: Point2D[][] = []): Shape {
  const shape = new Shape()
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  shape.holes = holes.map(points => {
    const hole = new Path()
    points.forEach(([x, z], index) => index ? hole.lineTo(x, -z) : hole.moveTo(x, -z))
    hole.closePath()
    return hole
  })
  return shape
}

function Surface({ polygon, elevation, color }: { polygon: Point2D[]; elevation: number; color: string }) {
  const shape = useMemo(() => footprintShape(polygon), [polygon])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elevation, 0]} receiveShadow>
    <shapeGeometry args={[shape]} /><meshStandardMaterial color={color} roughness={.92} />
  </mesh>
}

function Volume({ polygon, holes, base, height, color }: { polygon: Point2D[]; holes?: Point2D[][]; base: number; height: number; color: string }) {
  const shape = useMemo(() => footprintShape(polygon, holes), [polygon, holes])
  if (height <= 0 || polygon.length < 3) return null
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, base, 0]} castShadow receiveShadow>
    <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false }]} />
    <meshStandardMaterial color={color} roughness={.94} />
  </mesh>
}

function ProjectContext({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { placement, geometry, buildings } = snapshot
  const section = geometry.contextSections
  return <group rotation={[0, -placement.rotationY, 0]}>
    <group position={[-placement.position[0], -placement.position[1], -placement.position[2]]}>
      <Surface polygon={snapshot.parcel.footprint} elevation={-.04} color="#dce1cf" />
      {buildings.map(building => building.isTarget ? <group key={building.id}>
        <Volume polygon={building.footprint} holes={building.holes} base={building.groundOffset} height={section.belowTop - building.groundOffset} color="#ddd7c5" />
        {[section.before, section.after].map((polygon, index) => <Volume key={index} polygon={polygon} base={section.belowTop} height={section.ceilingBase - section.belowTop} color="#ddd7c5" />)}
      </group> : <Volume key={building.id} polygon={building.footprint} holes={building.holes} base={building.groundOffset} height={building.height} color="#bdc6bd" />)}
    </group>
  </group>
}

class ModelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse(node => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true } })
    return copy
  }, [scene])
  return <primitive object={clone} dispose={null} />
}

function ModelPlaceholder({ asset, label }: { asset: SceneAsset; label?: string }) {
  return <group>
    <mesh position={[0, asset.dimensions[1] / 2, 0]}>
      <boxGeometry args={asset.dimensions} /><meshStandardMaterial color="#829074" wireframe />
    </mesh>
    {label && <Html position={[0, asset.dimensions[1] + .1, 0]} center><span className="tw:block tw:w-28 tw:rounded tw:bg-[var(--settings-bg)] tw:p-1 tw:text-center tw:text-xs tw:text-[var(--settings-text)]">{label}</span></Html>}
  </group>
}

function PlacedObject({ fixture, asset, projectId, selected, onSelect, unavailable, lightActive }: { fixture: Fixture; asset: SceneAsset; projectId: string; selected: boolean; onSelect: () => void; unavailable: string; lightActive: boolean }) {
  const url = projectModelUrl(asset.url, projectId)
  const fallback = <ModelPlaceholder asset={asset} label={unavailable} />
  const light = fixtureLight(fixture)
  return <group position={fixture.position} rotation={[0, fixture.rotation, 0]} onClick={event => { event.stopPropagation(); onSelect() }}>
    {url ? <ModelBoundary key={url} fallback={fallback}>
      <Suspense fallback={<ModelPlaceholder asset={asset} />}><Model url={url} /></Suspense>
    </ModelBoundary> : fallback}
    {light && <LightEmitter source={{ ...light, enabled: lightActive }} position={light.offset} />}
    {selected && <mesh position={[0, asset.dimensions[1] / 2, 0]}>
      <boxGeometry args={asset.dimensions.map(value => value + .025) as [number, number, number]} />
      <meshBasicMaterial color="#65832a" wireframe depthTest={false} />
    </mesh>}
  </group>
}

function SceneCamera({ snapshot, top, context, reset, cutaway }: { snapshot: ProjectSnapshot; top: boolean; context: boolean; reset: number; cutaway: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, size, invalidate } = useThree()
  const bounds = useMemo(() => apartmentBounds(snapshot.apartment), [snapshot.apartment])
  const verticalFocus = cutaway ? 0 : Math.max(0, snapshot.geometry.ceiling.elevation - snapshot.geometry.floor.elevation) * .35
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    const span = Math.max(bounds.width, bounds.depth, bounds.width / Math.max(.3, size.width / Math.max(size.height, 1))) * (context ? 1.7 : 1)
    const [x, z] = bounds.center
    camera.up.set(0, 1, 0)
    camera.position.set(x + (top ? 0 : span * .75), span * (top ? 1.65 : 1.15) + verticalFocus, z + (top ? .01 : span * .85))
    controls.current.target.set(x, verticalFocus, z)
    controls.current.update()
    camera.updateProjectionMatrix()
    invalidate()
  }, [bounds, camera, context, invalidate, reset, size.height, size.width, top, verticalFocus])
  return <OrbitControls ref={controls} makeDefault minDistance={1} maxDistance={500} minPolarAngle={.001} maxPolarAngle={Math.PI / 2.02} enableDamping />
}

function NumberField({ label, value, minimum, onCommit, disabled, length = false }: { label: string; value: number; minimum?: number; onCommit: (value: number) => void; disabled: boolean; length?: boolean }) {
  const units = useUnits()
  const displayed = length ? units.toDisplayLength(value) : value
  const rounded = Number(displayed.toFixed(3))
  return <label className="tw:grid tw:gap-1 tw:text-xs tw:text-[var(--settings-muted)]">{length ? label.replace('(m)', `(${units.lengthUnit})`) : label}
    <input key={`${value}-${length ? units.system : 'number'}`} type="number" className={input} min={minimum === undefined ? undefined : length ? units.toDisplayLength(minimum) : minimum} step="any" defaultValue={rounded} disabled={disabled}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
      onBlur={event => {
        const raw = event.currentTarget.valueAsNumber
        const next = length ? units.toMeters(raw) : raw
        if (event.currentTarget.validity.valid && Number.isFinite(next) && (minimum === undefined || next >= minimum)) {
          if (raw !== rounded && Math.abs(next - value) > .0005) onCommit(next)
        } else event.currentTarget.value = String(rounded)
      }} />
  </label>
}

export function ProjectScene({ snapshot, onChange, readOnly }: ProjectSceneProps) {
  const units = useUnits()
  const { i18n } = useTranslation('common')
  const locale = i18n.resolvedLanguage === 'es' || i18n.resolvedLanguage === 'fr' ? i18n.resolvedLanguage : 'en'
  const copy = sceneCopy[locale], mobilityCopy = editorCopy[locale]
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assetId, setAssetId] = useState('')
  const [top, setTop] = useState(false)
  const [lowWalls, setLowWalls] = useState(true)
  const [context, setContext] = useState(false)
  const [labels, setLabels] = useState(false)
  const [reset, setReset] = useState(0)
  const selected = snapshot.fixtures.find(item => item.id === selectedId)
  const placementAssets = snapshot.assets.filter(asset => getAssetMobility(asset) === 'movable')
  const nextAsset = placementAssets.find(item => item.id === assetId) ?? placementAssets[0]
  const selectedAsset = snapshot.assets.find(item => item.id === selected?.assetId)
  const selectedMovable = selected ? isFixtureMovable(selected, selectedAsset) : false
  const assetMap = useMemo(() => new Map(snapshot.assets.map(asset => [asset.id, asset])), [snapshot.assets])
  const bounds = useMemo(() => apartmentBounds(snapshot.apartment), [snapshot.apartment])
  const activeLights = useMemo(() => activeFixtureLightIds(snapshot), [snapshot])
  function changePosition(axis: number, value: number) {
    if (!selected || readOnly || !selectedMovable) return
    const position = [...selected.position] as Fixture['position']
    position[axis] = value
    onChange(updateProjectFixture(snapshot, selected.id, { position }))
  }
  return <section className="tw:overflow-hidden tw:rounded-2xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:text-[var(--settings-text)]" aria-label={copy.title}>
    <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:border-solid tw:border-[var(--settings-border)] tw:p-4">
      <div><h3 className="tw:m-0 tw:text-lg tw:font-semibold">{copy.title}</h3><p className="tw:mb-0 tw:mt-1 tw:max-w-2xl tw:text-sm tw:text-[var(--settings-muted)]">{readOnly ? copy.readonly : copy.hint}</p></div>
      <div className="tw:flex tw:flex-wrap tw:gap-2">
        <button className={button} type="button" aria-pressed={!top} onClick={() => setTop(false)}>{copy.three}</button>
        <button className={button} type="button" aria-pressed={top} onClick={() => setTop(true)}>{copy.top}</button>
        <button className={button} type="button" onClick={() => setReset(value => value + 1)}>{copy.reset}</button>
      </div>
    </div>
    <div className="tw:grid tw:lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="tw:min-w-0">
        <div className="tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-2 tw:px-4 tw:py-3 tw:text-sm">
          {([{ text: copy.lowWalls, value: lowWalls, change: setLowWalls }, { text: copy.context, value: context, change: setContext }, { text: copy.labels, value: labels, change: setLabels }]).map(option => <label key={option.text} className="tw:flex tw:cursor-pointer tw:items-center tw:gap-2"><input type="checkbox" checked={option.value} onChange={event => option.change(event.target.checked)} />{option.text}</label>)}
        </div>
        <div className="tw:relative tw:h-[480px] tw:min-h-80 tw:bg-[#e8ecdf]">
          <WebGLGuard fallback={<p className="tw:m-0 tw:p-8 tw:text-center tw:text-[#354139]">{copy.fallback}</p>}>
            <Canvas shadows={{ type: PCFShadowMap }} frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 42, near: .1, far: 1000 }} onPointerMissed={() => setSelectedId(null)} aria-label={copy.title}>
              <color attach="background" args={['#e8ecdf']} />
              <SceneCamera snapshot={snapshot} top={top} context={context} reset={reset} cutaway={lowWalls} />
              <DesignLighting scene={snapshot} />
              <DesignEnvelope scene={snapshot} cutaway={lowWalls} />
              {!context && <gridHelper args={[Math.max(bounds.width, bounds.depth) * 3, 30, '#c1cbb6', '#d5dccb']} position={[bounds.center[0], -.15, bounds.center[1]]} />}
              {context && <ProjectContext snapshot={snapshot} />}
              <Volume polygon={snapshot.geometry.floor.polygon} base={snapshot.geometry.floor.elevation - snapshot.geometry.floor.thickness} height={snapshot.geometry.floor.thickness} color="#c5c8b9" />
              {snapshot.apartment.rooms.map(room => {
                const finish = snapshot.customization?.floors[room.id]
                return <group key={room.id}>
                <Floor polygon={room.polygon} elevation={snapshot.geometry.floor.elevation + .002} color={room.color}
                  tint={finish?.color ?? '#ffffff'}
                  finish={finish?.material === 'concrete' ? undefined : finish?.material ?? roomFinish(room.id)} />
                {labels && <Html position={[polygonCentroid(room.polygon)[0], .05, polygonCentroid(room.polygon)[1]]} center style={{ pointerEvents: 'none' }}><span className="tw:block tw:whitespace-nowrap tw:rounded-md tw:bg-[#fffffae8] tw:px-2 tw:py-1 tw:text-xs tw:text-[#354139]">{room.name}</span></Html>}
                </group>
              })}
              {snapshot.apartment.balcony && <Surface polygon={snapshot.apartment.balcony.polygon} elevation={.002} color="#c9c7ae" />}
              {snapshot.apartment.walls.map(wall => <Wall key={wall.id} wall={wall} doors={snapshot.apartment.doors.filter(door => door.wallId === wall.id)} windows={snapshot.apartment.windows.filter(window => window.wallId === wall.id)} cutaway={lowWalls} customization={snapshot.customization} />)}
              {snapshot.fixtures.map(fixture => {
                const asset = assetMap.get(fixture.assetId)
                return asset ? <PlacedObject key={fixture.id} fixture={fixture} asset={asset} projectId={snapshot.project.id} selected={selectedId === fixture.id} onSelect={() => setSelectedId(fixture.id)} unavailable={copy.modelUnavailable} lightActive={activeLights.has(fixture.id)} /> : null
              })}
            </Canvas>
          </WebGLGuard>
          <p className="tw:pointer-events-none tw:absolute tw:bottom-3 tw:left-4 tw:right-4 tw:m-0 tw:text-center tw:text-xs tw:text-[#4f6243]">{copy.controls}</p>
        </div>
        <p className="tw:m-0 tw:px-4 tw:py-3 tw:text-xs tw:text-[var(--settings-muted)]">{copy.source}: {snapshot.solar.date} · {String(Math.floor(snapshot.solar.selected.minutes / 60)).padStart(2, '0')}:{String(snapshot.solar.selected.minutes % 60).padStart(2, '0')} · {snapshot.solar.timeZone}. {copy.notice}</p>
      </div>
      <aside className="tw:grid tw:content-start tw:gap-5 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-4 tw:lg:border-l tw:lg:border-t-0">
        <label className="tw:grid tw:gap-2 tw:text-sm tw:font-medium">{copy.objects} ({snapshot.fixtures.length})
          <select className={input} value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value || null)}>
            <option value="">{snapshot.fixtures.length ? copy.choose : copy.empty}</option>
            {snapshot.fixtures.map(fixture => <option key={fixture.id} value={fixture.id}>{fixture.label} · {isFixtureMovable(fixture, assetMap.get(fixture.assetId)) ? mobilityCopy.movable : mobilityCopy.fixed}</option>)}
          </select>
        </label>
        {selected && <div className="tw:grid tw:gap-3" aria-label={copy.selected}>
          <div><strong className="tw:text-sm">{selected.label}</strong>{selectedAsset && <p className="tw:mb-0 tw:mt-1 tw:text-xs tw:text-[var(--settings-muted)]">{units.formatDimensions(selectedAsset.dimensions, 1)}</p>}</div>
          <p className="tw:m-0 tw:text-xs tw:text-[var(--settings-muted)]">{selectedMovable ? mobilityCopy.movableHint : mobilityCopy.fixedHint}</p>
          <label className="tw:grid tw:gap-1 tw:text-xs tw:text-[var(--settings-muted)]">{copy.room}<select className={input} value={selected.roomId} disabled={readOnly || !selectedMovable} onChange={event => { if (!readOnly && selectedMovable) onChange(updateProjectFixture(snapshot, selected.id, { roomId: event.target.value })) }}>{snapshot.apartment.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <div className="tw:grid tw:grid-cols-2 tw:gap-3">
            {([copy.x, copy.y, copy.z]).map((label, axis) => <NumberField key={`${selected.id}-${axis}`} label={label} length value={selected.position[axis]} minimum={axis === 1 ? 0 : undefined} disabled={readOnly || !selectedMovable} onCommit={value => changePosition(axis, value)} />)}
            <NumberField key={`${selected.id}-rotation`} label={copy.rotation} value={selected.rotation * 180 / Math.PI} disabled={readOnly || !selectedMovable} onCommit={value => { if (!readOnly && selectedMovable) onChange(updateProjectFixture(snapshot, selected.id, { rotation: value * Math.PI / 180 })) }} />
          </div>
          {!readOnly && <button className={button} type="button" disabled={!selectedMovable} onClick={() => { if (!selectedMovable) return; onChange(removeProjectFixture(snapshot, selected.id)); setSelectedId(null) }}>{copy.remove}</button>}
        </div>}
        {!readOnly && placementAssets.length > 0 && <div className="tw:grid tw:gap-2 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:pt-4">
          <label className="tw:grid tw:gap-2 tw:text-sm tw:font-medium">{copy.add}<select className={input} value={nextAsset?.id ?? ''} onChange={event => setAssetId(event.target.value)}>{placementAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}</select></label>
          <button className={button} type="button" disabled={!nextAsset} onClick={() => {
            if (!nextAsset) return
            const id = crypto.randomUUID()
            onChange(addProjectFixture(snapshot, nextAsset.id, id, selected?.roomId))
            setSelectedId(id)
          }}>{copy.addAction}</button>
          <p className="tw:m-0 tw:text-xs tw:leading-relaxed tw:text-[var(--settings-muted)]">{copy.addHint}</p>
        </div>}
      </aside>
    </div>
  </section>
}
