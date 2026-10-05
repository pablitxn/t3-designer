import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTranslation } from 'react-i18next'
import { PCFShadowMap, PerspectiveCamera, PointLight } from 'three'
import { apartmentBounds, segmentWall } from '@t3-designer/geometry'
import type { ProjectSnapshot } from '@t3-designer/scene-schema'
import { useLocale } from '../i18n/useLocale'
import { useUnits } from '../lib/useUnits'
import { roomLabel } from '../i18n/workspace-labels'
import { WebGLGuard } from '../components/WebGLGuard'
import { ViewerIcon, ViewerPanel } from '../components/ViewerPanel'
import { getSolarPosition, resolveLocalDateTime } from '../lib/solar'
import { walkCopy } from './copy'
import { buildWalkWorld, canSetWalkDoorOpenness, findWalkDoorTarget, findWalkSpawn, initialWalkDoorStates, withWalkDoorStates, type WalkDoorStates, type WalkWorld } from './navigation'
import { WalkController, type WalkInput, type WalkPose } from './WalkController'
import { WalkthroughWorld } from './WalkthroughWorld'
import './walkthrough.css'

const emptyInput = (): WalkInput => ({ forward: 0, right: 0, turn: 0, lookX: 0, lookY: 0, fast: false, crouch: false, jump: false, interact: false })
const clockValue = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

function CameraSettings({ fov, torch }: { fov: number; torch: boolean }) {
  const light = useRef<PointLight>(null)
  useFrame(({ camera }) => {
    if (camera instanceof PerspectiveCamera && camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
    light.current?.position.copy(camera.position)
  })
  return <pointLight ref={light} visible={torch} intensity={7} distance={8} decay={2} color="#fff3df" />
}

function Minimap({ snapshot, world, doorStates, pose, label }: { snapshot: ProjectSnapshot; world: WalkWorld; doorStates: WalkDoorStates; pose: WalkPose | null; label: string }) {
  const bounds = useMemo(() => apartmentBounds(snapshot.apartment), [snapshot.apartment])
  return <svg className="walk-map" data-pitch={pose?.pitch ?? 0} data-feet-offset={pose?.feetOffset ?? 0} data-grounded={pose?.grounded ?? true} viewBox={`${bounds.min[0] - .4} ${bounds.min[1] - .4} ${bounds.width + .8} ${bounds.depth + .8}`} role="img" aria-label={label}>
    {snapshot.apartment.rooms.map(room => <polygon key={room.id} points={room.polygon.map(p => p.join(',')).join(' ')} fill={room.color} fillOpacity={.6} stroke="#b0b6a8" strokeWidth={.025} />)}
    {snapshot.apartment.walls.flatMap(wall => {
      const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1])
      const ux = (wall.to[0] - wall.from[0]) / length, uz = (wall.to[1] - wall.from[1]) / length
      return segmentWall(wall, snapshot.apartment.doors).filter(segment => segment.bottom === 0).map((segment, index) => <line key={`${wall.id}-${index}`}
        x1={wall.from[0] + ux * segment.offset} y1={wall.from[1] + uz * segment.offset}
        x2={wall.from[0] + ux * (segment.offset + segment.length)} y2={wall.from[1] + uz * (segment.offset + segment.length)} stroke="#4b584d" strokeWidth={wall.thickness} />)
    })}
    {world.blockers.flatMap(leaf => leaf.doorId ? [<line key={`door-${leaf.doorId}`} data-door-id={leaf.doorId} data-openness={doorStates[leaf.doorId]}
      x1={leaf.center[0] - leaf.cos * leaf.halfWidth} y1={leaf.center[1] + leaf.sin * leaf.halfWidth}
      x2={leaf.center[0] + leaf.cos * leaf.halfWidth} y2={leaf.center[1] - leaf.sin * leaf.halfWidth}
      stroke="#956a3c" strokeWidth={.065} strokeLinecap="round" />] : [])}
    {pose && <g transform={`translate(${pose.x} ${pose.z}) rotate(${-pose.yaw * 180 / Math.PI})`}>
      <path d="M 0,-.8 L -.38,-.1 L .38,-.1 Z" fill="#436d50" fillOpacity={.3} />
      <circle r=".16" fill="#285c41" stroke="white" strokeWidth=".055" />
      <path d="M 0,-.36 L -.12,-.14 L .12,-.14 Z" fill="white" />
    </g>}
  </svg>
}

function HoldButton({ label, children, field, value, input }: { label: string; children: string; field: 'forward' | 'right' | 'turn'; value: number; input: RefObject<WalkInput> }) {
  return <button type="button" aria-label={label} title={label} onPointerDown={event => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); input.current[field] = value
  }} onPointerUp={() => { input.current[field] = 0 }} onPointerCancel={() => { input.current[field] = 0 }} onLostPointerCapture={() => { input.current[field] = 0 }}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); input.current[field] = value } }}
    onKeyUp={() => { input.current[field] = 0 }} onBlur={() => { input.current[field] = 0 }}>{children}</button>
}

/** A disposable visit of the supplied active version; never calls project persistence. */
export function Walkthrough({ snapshot, onClose, initialMoment, reference = false }: {
  snapshot: ProjectSnapshot; onClose: () => void; initialMoment?: { date: string; minutes: number }; reference?: boolean
}) {
  const { locale } = useLocale()
  const { formatLength } = useUnits(), c = walkCopy[locale]
  const { t } = useTranslation('workspace')
  const roomName = (room: ProjectSnapshot['apartment']['rooms'][number]) => reference ? roomLabel(t, room.id) : room.name
  const root = useRef<HTMLElement>(null), canvas = useRef<HTMLCanvasElement | null>(null)
  const input = useRef<WalkInput>(emptyInput())
  const initialDoors = useMemo(() => initialWalkDoorStates(snapshot), [snapshot])
  const [visitDoors, setVisitDoors] = useState(() => ({ snapshot, values: initialDoors }))
  const doorStates = visitDoors.snapshot === snapshot ? visitDoors.values : initialDoors
  const initialWorld = useMemo(() => buildWalkWorld(snapshot, initialDoors), [snapshot, initialDoors])
  const world = useMemo(() => withWalkDoorStates(initialWorld, doorStates), [initialWorld, doorStates])
  const [roomId, setRoomId] = useState('')
  const [eyeHeight, setEyeHeight] = useState(1.65), [sensitivity, setSensitivity] = useState(1), [fov, setFov] = useState(70)
  // Once a visit begins, changing eye height must animate in place, not search
  // for a new spawn in the initial door configuration and teleport the visitor.
  const [spawnHeight, setSpawnHeight] = useState(1.65)
  const spawn = useMemo(() => findWalkSpawn(initialWorld, roomId || undefined, spawnHeight), [initialWorld, roomId, spawnHeight])
  const [reset, setReset] = useState(0), [active, setActive] = useState(false), [entered, setEntered] = useState(false)
  const [ready, setReady] = useState(false), [pose, setPose] = useState<WalkPose | null>(null)
  const [artificialLights, setArtificialLights] = useState(() => snapshot.customization?.lighting.artificialEnabled !== false), [torch, setTorch] = useState(false)
  const [screenControls, setScreenControls] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  const [fullscreen, setFullscreen] = useState(false), [message, setMessage] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mouseCaptured, setMouseCaptured] = useState(false)
  const [moment, setMoment] = useState(() => initialMoment ?? { date: snapshot.solar.date, minutes: snapshot.solar.selected.minutes })
  const solar = useMemo(() => {
    try {
      const resolution = resolveLocalDateTime(moment.date, moment.minutes, snapshot.site.timeZone)
      return { resolution, sun: resolution.instants[0] ? getSolarPosition(resolution.instants[0], snapshot.site.latitude, snapshot.site.longitude) : snapshot.solar.selected }
    } catch { return { resolution: null, sun: snapshot.solar.selected } }
  }, [moment, snapshot.site, snapshot.solar.selected])
  const validMoment = !!solar.resolution?.instants.length
  const architecture = snapshot.editor?.architectures.find(item => item.id === snapshot.editor?.activeArchitectureId)
  const layout = architecture?.layouts.find(item => item.id === architecture.activeLayoutId)
  const currentRoom = snapshot.apartment.rooms.find(room => room.id === pose?.roomId)
  const interaction = active && pose ? findWalkDoorTarget(world, doorStates, pose) : null
  const doorBlocked = interaction && pose && !canSetWalkDoorOpenness(world, doorStates, interaction.id, interaction.open ? 0 : 1, pose)
  const interact = useCallback((currentPose: WalkPose) => {
    const target = findWalkDoorTarget(world, doorStates, currentPose)
    if (!target) return
    const openness = target.open ? 0 : 1
    if (!canSetWalkDoorOpenness(world, doorStates, target.id, openness, currentPose)) return
    setVisitDoors({ snapshot, values: { ...doorStates, [target.id]: openness } })
    setPose(currentPose)
  }, [world, doorStates, snapshot])
  const pause = useCallback(() => {
    setActive(false); input.current = emptyInput()
    if (document.pointerLockElement === canvas.current && document.pointerLockElement) document.exitPointerLock()
  }, [])
  useEffect(() => {
    // A server save/reload can replace the scene while this view stays mounted.
    // Stop before adopting its new collision world, and discard stale location UI.
    pause(); setPose(null)
    setRoomId(previous => snapshot.apartment.rooms.some(room => room.id === previous) ? previous : '')
  }, [snapshot, pause])
  useEffect(() => {
    function changed() { setFullscreen(document.fullscreenElement === root.current) }
    document.addEventListener('fullscreenchange', changed)
    const element = root.current
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      if (document.fullscreenElement === element && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])
  useEffect(() => () => { if (document.pointerLockElement === canvas.current && document.pointerLockElement) document.exitPointerLock() }, [])
  useEffect(() => {
    const changed = () => setMouseCaptured(!!canvas.current && document.pointerLockElement === canvas.current)
    document.addEventListener('pointerlockchange', changed)
    return () => document.removeEventListener('pointerlockchange', changed)
  }, [])

  function start() {
    if (!ready || !spawn || !validMoment || settingsOpen) return
    input.current = emptyInput(); setActive(true); setEntered(true)
    canvas.current?.focus({ preventScroll: true })
    if (!window.matchMedia('(pointer: coarse)').matches) {
      // Browsers require the initial entry gesture to capture the mouse. The
      // embedded browser may omit this API; hover look works there immediately.
      try { const request = canvas.current?.requestPointerLock?.(); if (request) void request.catch(() => undefined) } catch { /* browser denied capture */ }
    }
  }
  function restart() { pause(); setPose(null); setEntered(false); setSpawnHeight(eyeHeight); setVisitDoors({ snapshot, values: initialDoors }); setReset(value => value + 1) }
  function toggleSettings() { pause(); setSettingsOpen(previous => !previous) }
  async function toggleFullscreen() {
    pause(); setMessage('')
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen()
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen()
      else setMessage(c.fullscreenError)
    } catch { setMessage(c.fullscreenError) }
  }
  const fallback = <div className="walk-fallback" role="status">{c.fallback}</div>
  return <section className={`walkthrough${active ? ' walk-running' : ''}${settingsOpen ? ' walk-settings-open' : ''}`} ref={root} aria-label={c.title} data-testid="walkthrough" data-active={active}>
    <header className="walk-header">
      <div><span className="walk-eyebrow">{c.eyebrow}</span><h2>{c.title}</h2><p>{c.intro}</p></div>
      <button className="walk-button" onClick={() => { pause(); onClose() }}>← {c.back}</button>
    </header>
    <div className="walk-layout">
      <div className="walk-stage" data-testid="walk-stage">
        <WebGLGuard fallback={fallback}>
          <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ fov, near: .04, far: 600 }} fallback={fallback} tabIndex={0} aria-label={c.title}
            onCreated={({ gl }) => { canvas.current = gl.domElement; gl.domElement.tabIndex = 0; setReady(true) }}>
            <WalkthroughWorld snapshot={snapshot} sun={solar.sun} artificialLights={artificialLights} doorStates={doorStates} />
            <WalkController world={initialWorld} collisionWorld={world} spawn={spawn} resetKey={reset} active={active} input={input} eyeHeight={eyeHeight} sensitivity={sensitivity} onPose={setPose} onPause={pause} onInteract={interact} />
            <CameraSettings fov={fov} torch={torch} />
          </Canvas>
        </WebGLGuard>
        <div className="walk-status"><span className={active ? 'walk-live' : ''} />{active ? c.live : c.paused}{currentRoom && <> · {roomName(currentRoom)}</>}</div>
        <div className="viewer-toolbar walk-viewer-toolbar" role="group" aria-label={c.viewerControls}>
          {active && <button type="button" className="viewer-action" aria-label={c.pause} title={`${c.pause} · Esc`} onClick={pause}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></button>}
          <button type="button" className="viewer-action" aria-label={c.settings} title={c.settings} aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="walk-settings" onClick={toggleSettings}><ViewerIcon kind="settings" /></button>
          <button type="button" className="viewer-action" aria-label={fullscreen ? c.exitFullscreen : c.fullscreen} title={fullscreen ? c.exitFullscreen : c.fullscreen} aria-pressed={fullscreen} onClick={() => { void toggleFullscreen() }}><ViewerIcon kind={fullscreen ? 'collapse' : 'expand'} /></button>
        </div>
        {message && <p className="walk-message" role="status">{message}</p>}
        {active && <div className={`walk-crosshair${interaction ? ' walk-crosshair-target' : ''}`} aria-hidden="true" />}
        {interaction && <div className="walk-interaction">
          <button type="button" className="walk-button" data-testid="walk-interact" data-door-id={interaction.id} data-door-open={interaction.open}
            onClick={() => { input.current.interact = true }}><kbd>E</kbd> {interaction.open ? c.closeDoor : c.openDoor}</button>
          {doorBlocked && <span role="status">{c.doorBlocked}</span>}
        </div>}
        {!active && ready && !settingsOpen && <div className="walk-overlay"><div className="walk-start-card">
          <span className="walk-eyebrow">{architecture?.name ?? c.reference}{layout && ` / ${layout.name}`}</span>
          <h3>{entered ? c.resume : c.start}</h3>
          <div className="walk-key-guide"><span><kbd>W A S D</kbd> {c.move}</span><span><kbd>↑ ↓ ← →</kbd> {c.look}</span><span><kbd>⇧</kbd> {c.run}</span><span><kbd>C</kbd> {c.crouch}</span><span><kbd>{c.space}</kbd> {c.jump}</span><span><kbd>E</kbd> {c.interact}</span><span><kbd>Esc</kbd> {c.release}</span></div>
          <p>{c.hint}</p><button className="walk-button walk-primary" disabled={!spawn || !validMoment} onClick={start}>{entered ? c.resume : c.start} →</button>
          {!spawn && <p role="alert">{c.noSpawn}</p>}
        </div></div>}
        {active && screenControls && <div className="walk-screen-controls" aria-label={c.controls}>
          <div><HoldButton label={c.turnLeft} field="turn" value={-1} input={input}>↶</HoldButton><HoldButton label={c.forward} field="forward" value={1} input={input}>↑</HoldButton><HoldButton label={c.turnRight} field="turn" value={1} input={input}>↷</HoldButton>
          <HoldButton label={c.left} field="right" value={-1} input={input}>←</HoldButton><HoldButton label={c.backward} field="forward" value={-1} input={input}>↓</HoldButton><HoldButton label={c.right} field="right" value={1} input={input}>→</HoldButton>
          <button type="button" className="walk-jump" aria-label={c.jump} onClick={() => { input.current.jump = true }}>{c.jump} ↑</button></div>
        </div>}
        {ready && <div className="walk-map-wrap"><Minimap snapshot={snapshot} world={world} doorStates={doorStates} pose={pose} label={c.map} /></div>}
        {active && <span className="walk-bottom-hint">{c.keyboard} · {window.matchMedia('(pointer: coarse)').matches ? c.mouseTouch : mouseCaptured ? c.mouse : c.mouseFree} · {c.space}: {c.jump} · E: {c.interact}</span>}
        {settingsOpen && <ViewerPanel id="walk-settings" title={c.settings} onClose={() => setSettingsOpen(false)} className="walk-settings-panel">
        <div className="walk-settings">
        <div className="walk-version"><span className="walk-eyebrow">{c.version}</span><strong>{reference ? c.reference : snapshot.project.name}</strong>{architecture && <span>{architecture.name} / {layout?.name}</span>}<p>{c.draft}</p></div>
        <fieldset disabled={active}>
          <legend>{c.settings}</legend>
          <label>{c.room}<select value={roomId} onChange={event => { setRoomId(event.target.value); restart() }}><option value="">{c.entrance}</option>{snapshot.apartment.rooms.map(room => <option key={room.id} value={room.id}>{roomName(room)}</option>)}</select></label>
          <button className="walk-button" onClick={restart}>{c.reset} ↺</button>
          <div className="walk-form-row"><label>{c.date}<input type="date" min="1900-01-01" max="2100-12-31" value={moment.date} onChange={event => setMoment(previous => ({ ...previous, date: event.target.value }))} /></label><label>{c.time}<input type="time" value={clockValue(moment.minutes)} onChange={event => { const [hours, minutes] = event.target.value.split(':').map(Number); if (Number.isFinite(hours + minutes)) setMoment(previous => ({ ...previous, minutes: hours * 60 + minutes })) }} /></label></div>
          <small>{snapshot.site.timeZone}</small>
          {!validMoment && <p role="alert">{c.invalidTime}</p>}{solar.resolution?.status === 'ambiguous' && <small>{c.repeatedTime}</small>}
          <button className="walk-text-button" onClick={() => setMoment(initialMoment ?? { date: snapshot.solar.date, minutes: snapshot.solar.selected.minutes })}>{c.savedSun}</button>
          <label className="walk-check"><input type="checkbox" checked={artificialLights} onChange={event => setArtificialLights(event.target.checked)} />{c.artificial}</label>
          <label className="walk-check"><input type="checkbox" checked={torch} onChange={event => setTorch(event.target.checked)} />{c.torch}</label>
          <label>{c.height} <output>{formatLength(eyeHeight)}</output><input type="range" min="1.2" max="1.9" step=".05" value={eyeHeight} onChange={event => { const height = Number(event.target.value); setEyeHeight(height); if (!entered) setSpawnHeight(height) }} /></label>
          <label>{c.fov} <output>{fov}°</output><input type="range" min="50" max="95" step="1" value={fov} onChange={event => setFov(Number(event.target.value))} /></label>
          <label>{c.sensitivity} <output>{sensitivity.toFixed(1)}×</output><input type="range" min=".3" max="2" step=".1" value={sensitivity} onChange={event => setSensitivity(Number(event.target.value))} /></label>
          <label className="walk-check"><input type="checkbox" checked={screenControls} onChange={event => setScreenControls(event.target.checked)} />{c.controls}</label>
        </fieldset>
        </div>
        </ViewerPanel>}
      </div>
    </div>
    <footer className="walk-footer">{c.notice}</footer>
  </section>
}
