import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_DESIGN_LIGHTS, defaultDesignCustomization, type Fixture, type ProjectSnapshot, type Wall } from '@t3-designer/scene-schema'
import { useLocale } from '../i18n/useLocale'
import { useUnits } from '../lib/useUnits'
import { roomLabel } from '../i18n/workspace-labels'
import { roomFinish } from '../materials/surfaces'
import { customizationCopy, type CustomizationCopy } from './customization-copy'
import { addFixedLight, pointInPolygon, removeFixedLight, setFixtureLight, updateCustomization, updateFixedLight } from './model'

type Customization = NonNullable<ProjectSnapshot['customization']>
type FloorFinish = Customization['floors'][string]
type DoorFinish = Customization['doors'][string]
type WindowFinish = Customization['windows'][string]
type LightSource = NonNullable<Fixture['light']>
type LightValues = Pick<LightSource, 'enabled' | 'kelvin' | 'lumens'>
type Props = { scene: ProjectSnapshot; readOnly: boolean; selectedFixtureId: string | null; onApply: (change: (current: ProjectSnapshot) => ProjectSnapshot) => boolean }

const button = 'tw:cursor-pointer tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-xs tw:font-medium tw:text-[color:var(--settings-text)] tw:transition-colors tw:hover:bg-[var(--settings-accent-soft)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:disabled:cursor-not-allowed tw:disabled:opacity-40'
const input = 'tw:box-border tw:w-full tw:min-w-0 tw:rounded-lg tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-bg)] tw:px-3 tw:py-2 tw:text-xs tw:text-[color:var(--settings-text)] tw:disabled:opacity-50'
const label = 'tw:grid tw:gap-1.5 tw:text-xs tw:font-medium'
const muted = 'tw:text-[color:var(--settings-muted)] tw:text-xs tw:leading-5'
const card = 'tw:grid tw:min-w-0 tw:content-start tw:gap-3 tw:rounded-xl tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-[var(--settings-surface)] tw:p-4'
const detail = 'tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:p-4'
const heading = 'tw:m-0 tw:text-sm tw:font-medium'
const twoColumns = 'tw:mt-4 tw:grid tw:gap-4 tw:lg:grid-cols-2'
const knownRoomIds = new Set(['bedroom-1', 'bedroom-2', 'living', 'entrance', 'wc', 'bathroom', 'kitchen', 'closet', 'balcony'])
const swatches = [['white', '#f1eee1'], ['cream', '#e5ddc9'], ['sand', '#c9b49a'], ['sage', '#9ba88e'], ['blue', '#869dab'], ['clay', '#bb8673']] as const

function NumberField({ name, value, readOnly, onChange, min = -1000, max = 1000 }: { name: string; value: number; readOnly: boolean; onChange: (value: number) => void; min?: number; max?: number }) {
  const units = useUnits()
  const rounded = Number(units.toDisplayLength(value).toFixed(3))
  return <label className={label}>{name.replace('(m)', `(${units.lengthUnit})`)}<input key={`${value}-${units.system}`} className={input} type="number" step="any" min={units.toDisplayLength(min)} max={units.toDisplayLength(max)} defaultValue={rounded} disabled={readOnly}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    onBlur={event => {
      const raw = event.currentTarget.valueAsNumber
      const next = units.toMeters(raw)
      if (raw !== rounded && Number.isFinite(next) && next >= min && next <= max && Math.abs(next - value) > .0001) onChange(next)
      event.currentTarget.value = String(rounded)
    }} /></label>
}

function ColorField({ name, value, readOnly, onChange, c }: { name: string; value: string; readOnly: boolean; onChange: (value: string) => void; c: CustomizationCopy }) {
  return <fieldset disabled={readOnly} className="tw:m-0 tw:min-w-0 tw:border-0 tw:p-0">
    <legend className="tw:mb-2 tw:text-xs tw:font-medium">{name}</legend>
    <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      {swatches.map(([key, color]) => <button key={key} type="button" className="tw:h-8 tw:w-8 tw:cursor-pointer tw:rounded-full tw:border tw:border-solid tw:border-[var(--settings-border)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:disabled:cursor-not-allowed tw:disabled:opacity-40" style={{ backgroundColor: color, outline: value.toLowerCase() === color ? '2px solid var(--settings-text)' : undefined, outlineOffset: 2 }} title={c[key]} aria-label={`${name}: ${c[key]}`} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)} />)}
      <label className="tw:ml-1 tw:flex tw:items-center tw:gap-2 tw:text-xs"><input className="tw:h-8 tw:w-10 tw:cursor-pointer tw:rounded tw:border tw:border-solid tw:border-[var(--settings-border)] tw:bg-transparent tw:p-0.5" type="color" value={value} onChange={event => onChange(event.target.value)} aria-label={`${name}: ${c.color}`} /><span className={muted}>{value.toUpperCase()}</span></label>
    </div>
  </fieldset>
}

function RangeField({ name, value, max, min = 0, step = 1, unit = '', readOnly, onChange }: { name: string; value: number; max: number; min?: number; step?: number; unit?: string; readOnly: boolean; onChange: (value: number) => void }) {
  return <label className={label}><span className="tw:flex tw:justify-between tw:gap-2"><span>{name}</span><span className={muted}>{Math.round(value)}{unit}</span></span><input className="tw:m-0 tw:w-full tw:cursor-pointer tw:accent-[var(--settings-text)] tw:disabled:cursor-not-allowed tw:disabled:opacity-40" type="range" min={min} max={max} step={step} value={value} disabled={readOnly} onChange={event => onChange(event.target.valueAsNumber)} /></label>
}

function Toggle({ name, checked, disabled, onChange }: { name: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-medium"><input className="tw:m-0 tw:h-4 tw:w-4 tw:accent-[var(--settings-text)]" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />{name}</label>
}

function LightFields({ value, readOnly, onChange, c }: { value: LightValues; readOnly: boolean; onChange: (value: Partial<LightValues>) => void; c: CustomizationCopy }) {
  return <>
    <Toggle name={c.enabled} checked={value.enabled} disabled={readOnly} onChange={enabled => onChange({ enabled })} />
    <div className="tw:flex tw:flex-wrap tw:gap-2" role="group" aria-label={c.temperature}>{([[c.warm, 2700], [c.neutral, 4000], [c.cool, 6500]] as const).map(([name, kelvin]) => <button type="button" key={kelvin} className={`${button} ${value.kelvin === kelvin ? 'tw:bg-[var(--settings-accent-soft)]!' : ''}`} disabled={readOnly} aria-pressed={value.kelvin === kelvin} onClick={() => onChange({ kelvin })}>{name} · {kelvin} K</button>)}</div>
    <RangeField name={c.temperature} value={value.kelvin} min={1800} max={6500} step={100} unit=" K" readOnly={readOnly} onChange={kelvin => onChange({ kelvin })} />
    <RangeField name={c.brightness} value={value.lumens} max={3000} step={25} unit=" lm" readOnly={readOnly} onChange={lumens => onChange({ lumens })} />
  </>
}

/** Human labels describe the rooms reached on either side of a wall. */
function adjacentRooms(wall: Wall, scene: ProjectSnapshot) {
  const dx = wall.to[0] - wall.from[0], dz = wall.to[1] - wall.from[1], length = Math.hypot(dx, dz)
  const offset = wall.thickness / 2 + .06
  return scene.apartment.rooms.filter(room => [.25, .5, .75].some(t => [-1, 1].some(side => pointInPolygon([
    wall.from[0] + t * dx - dz / length * offset * side,
    wall.from[1] + t * dz + dx / length * offset * side,
  ], room.polygon))))
}

export function CustomizationPanel({ scene, readOnly, selectedFixtureId, onApply }: Props) {
  const { locale } = useLocale(), { t } = useTranslation('workspace'), c = customizationCopy[locale]
  const [wallId, setWallId] = useState(''), [floorRoomId, setFloorRoomId] = useState('')
  const [doorId, setDoorId] = useState(''), [windowId, setWindowId] = useState('')
  const [lightId, setLightId] = useState(''), [lightRoomId, setLightRoomId] = useState('')
  const customization = scene.customization ?? defaultDesignCustomization()
  const roomName = (id: string) => knownRoomIds.has(id) ? roomLabel(t, id) : scene.apartment.rooms.find(room => room.id === id)?.name ?? id
  const wallName = (wall: Wall, index: number) => `${c.wall} ${index + 1} · ${adjacentRooms(wall, scene).map(room => roomName(room.id)).join(' / ') || c[wall.kind]}`
  const openingName = (item: { wallId: string }, index: number, kind: 'door' | 'window') => {
    const wall = scene.apartment.walls.find(wall => wall.id === item.wallId)
    return `${c[kind]} ${index + 1}${wall ? ` · ${adjacentRooms(wall, scene).map(room => roomName(room.id)).join(' / ')}` : ''}`
  }
  const selectedWallId = scene.apartment.walls.some(wall => wall.id === wallId) ? wallId : ''
  const selectedFloorRoomId = scene.apartment.rooms.some(room => room.id === floorRoomId) ? floorRoomId : ''
  const walls = scene.apartment.walls.filter(wall => !selectedWallId || wall.id === selectedWallId)
  const rooms = scene.apartment.rooms.filter(room => !selectedFloorRoomId || room.id === selectedFloorRoomId)
  const wallColor = (wall: Wall) => customization.wallColors[wall.id] ?? (wall.kind === 'exterior' ? '#e9e7dc' : '#f1eee1')
  const floorFinish = (id: string): FloorFinish => customization.floors[id] ?? { material: roomFinish(id) === 'balcony' ? 'entry-tile' : roomFinish(id) as FloorFinish['material'], color: '#ffffff' }
  const floor = floorFinish(rooms[0].id)
  const mixedWalls = new Set(walls.map(wallColor)).size > 1, mixedFloors = new Set(rooms.map(room => JSON.stringify(floorFinish(room.id)))).size > 1
  const door = scene.apartment.doors.find(item => item.id === doorId) ?? scene.apartment.doors[0]
  const window = scene.apartment.windows.find(item => item.id === windowId) ?? scene.apartment.windows[0]
  const doorFinish: DoorFinish = door ? customization.doors[door.id] ?? { style: door.appearance ?? 'panel', color: door.finish === 'blue-gray' ? '#526f80' : door.finish === 'white' ? '#e3e6dc' : '#a2afa9', openness: 76 / 90 } : { style: 'panel', color: '#e3e6dc', openness: 76 / 90 }
  const windowFinish: WindowFinish = window ? customization.windows[window.id] ?? { style: 'casement', frameColor: '#e6e7df', covering: 'none', coveringColor: '#e5ddc9', closure: 0 } : { style: 'casement', frameColor: '#e6e7df', covering: 'none', coveringColor: '#e5ddc9', closure: 0 }
  const fixedLight = customization.lighting.lights.find(light => light.id === lightId) ?? customization.lighting.lights[0]
  const lightRoom = scene.apartment.rooms.find(room => room.id === lightRoomId) ?? scene.apartment.rooms[0]
  const fixture = scene.fixtures.find(item => item.id === selectedFixtureId), fixtureAsset = scene.assets.find(asset => asset.id === fixture?.assetId)
  const lightCount = customization.lighting.lights.length + scene.fixtures.filter(item => item.light).length

  function change(update: (value: Customization) => Customization) {
    if (!readOnly) onApply(current => updateCustomization(current, update(current.customization ?? defaultDesignCustomization())))
  }
  function changeFloors(edit: Partial<FloorFinish>) {
    change(current => ({ ...current, floors: { ...current.floors, ...Object.fromEntries(rooms.map(room => [room.id, { ...floorFinish(room.id), ...edit }])) } }))
  }
  function reset(kind: 'wallColors' | 'floors' | 'doors' | 'windows', ids: string[]) {
    change(current => ({ ...current, [kind]: Object.fromEntries(Object.entries(current[kind]).filter(([id]) => !ids.includes(id))) }))
  }
  function changeDoor(edit: Partial<DoorFinish>) { if (door) change(current => ({ ...current, doors: { ...current.doors, [door.id]: { ...doorFinish, ...edit } } })) }
  function changeWindow(edit: Partial<WindowFinish>) { if (window) change(current => ({ ...current, windows: { ...current.windows, [window.id]: { ...windowFinish, ...edit } } })) }
  function changeFixtureLight(edit: Partial<LightSource>) {
    if (fixture?.light && !readOnly) onApply(current => setFixtureLight(current, fixture.id, { ...fixture.light!, ...edit }))
  }
  function addLight() {
    if (readOnly || lightCount >= MAX_DESIGN_LIGHTS) return
    const id = crypto.randomUUID()
    if (onApply(current => updateFixedLight(addFixedLight(current, lightRoom.id, id), id, { name: `${c.fixedLight} ${customization.lighting.lights.length + 1} · ${roomName(lightRoom.id)}`.slice(0, 80) }))) setLightId(id)
  }

  return <section aria-label={c.title}>
    <header className="tw:border-0 tw:border-t tw:border-solid tw:border-[var(--settings-border)] tw:px-4 tw:py-3"><h3 className={heading}>{c.title}</h3><p className={`${muted} tw:mb-0 tw:mt-1`}>{c.subtitle}</p></header>
    <details className={detail} open>
      <summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.materials}</summary>
      <div className={twoColumns}>
        <div className={card}>
          <label className={label}>{c.walls}<select className={input} value={selectedWallId} onChange={event => setWallId(event.target.value)}><option value="">{c.allWalls}</option>{scene.apartment.walls.map((wall, index) => <option key={wall.id} value={wall.id}>{wallName(wall, index)}</option>)}</select></label>
          <ColorField name={c.wallColor} c={c} value={wallColor(walls[0])} readOnly={readOnly} onChange={color => change(current => ({ ...current, wallColors: { ...current.wallColors, ...Object.fromEntries(walls.map(wall => [wall.id, color])) } }))} />
          {mixedWalls && <p className={`${muted} tw:m-0`}>{c.mixed}</p>}
          <button type="button" className={`${button} tw:justify-self-start`} disabled={readOnly || !walls.some(wall => customization.wallColors[wall.id])} onClick={() => reset('wallColors', walls.map(wall => wall.id))}>{c.reset}</button>
        </div>
        <div className={card}>
          <label className={label}>{c.floorRoom}<select className={input} value={selectedFloorRoomId} onChange={event => setFloorRoomId(event.target.value)}><option value="">{c.allRooms}</option>{scene.apartment.rooms.map(room => <option key={room.id} value={room.id}>{roomName(room.id)}</option>)}</select></label>
          <label className={label}>{c.floorMaterial}<select className={input} value={floor.material} disabled={readOnly} onChange={event => changeFloors({ material: event.target.value as FloorFinish['material'] })}>{([['parquet', c.parquet], ['slate', c.slate], ['ivory-tile', c.ivoryTile], ['entry-tile', c.entryTile], ['concrete', c.concrete]] as const).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <ColorField name={c.floorColor} c={c} value={floor.color} readOnly={readOnly} onChange={color => changeFloors({ color })} />
          {mixedFloors && <p className={`${muted} tw:m-0`}>{c.mixed}</p>}
          <button type="button" className={`${button} tw:justify-self-start`} disabled={readOnly || !rooms.some(room => customization.floors[room.id])} onClick={() => reset('floors', rooms.map(room => room.id))}>{c.reset}</button>
        </div>
      </div>
    </details>
    <details className={detail}>
      <summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.openings}</summary>
      <p className={`${muted} tw:mb-0`}>{c.openingHint}</p>
      <div className={twoColumns}>
        <div className={card}>{door ? <>
          <label className={label}>{c.doors}<select className={input} value={door.id} onChange={event => setDoorId(event.target.value)}>{scene.apartment.doors.map((item, index) => <option key={item.id} value={item.id}>{openingName(item, index, 'door')}</option>)}</select></label>
          <label className={label}>{c.doorStyle}<select className={input} disabled={readOnly} value={doorFinish.style} onChange={event => changeDoor({ style: event.target.value as DoorFinish['style'] })}>{(['panel', 'glazed', 'passage'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>
          {doorFinish.style !== 'passage' && <><ColorField name={c.doorColor} c={c} value={doorFinish.color} readOnly={readOnly} onChange={color => changeDoor({ color })} /><RangeField name={c.openness} value={doorFinish.openness * 100} max={100} unit="%" readOnly={readOnly} onChange={openness => changeDoor({ openness: openness / 100 })} /></>}
          <button type="button" className={`${button} tw:justify-self-start`} disabled={readOnly || !customization.doors[door.id]} onClick={() => reset('doors', [door.id])}>{c.reset}</button>
        </> : <p className={`${muted} tw:m-0`}>{c.noDoors}</p>}</div>
        <div className={card}>{window ? <>
          <label className={label}>{c.windows}<select className={input} value={window.id} onChange={event => setWindowId(event.target.value)}>{scene.apartment.windows.map((item, index) => <option key={item.id} value={item.id}>{openingName(item, index, 'window')}</option>)}</select></label>
          <label className={label}>{c.windowStyle}<select className={input} disabled={readOnly} value={windowFinish.style} onChange={event => changeWindow({ style: event.target.value as WindowFinish['style'] })}>{(['casement', 'sliding', 'fixed'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>
          <ColorField name={c.frameColor} c={c} value={windowFinish.frameColor} readOnly={readOnly} onChange={frameColor => changeWindow({ frameColor })} />
          <label className={label}>{c.covering}<select className={input} disabled={readOnly} value={windowFinish.covering} onChange={event => changeWindow({ covering: event.target.value as WindowFinish['covering'] })}>{(['none', 'curtain', 'blind', 'shutter'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>
          {windowFinish.covering !== 'none' && <><ColorField name={c.coveringColor} c={c} value={windowFinish.coveringColor} readOnly={readOnly} onChange={coveringColor => changeWindow({ coveringColor })} /><RangeField name={c.closure} value={windowFinish.closure * 100} max={100} unit="%" readOnly={readOnly} onChange={closure => changeWindow({ closure: closure / 100 })} /></>}
          <button type="button" className={`${button} tw:justify-self-start`} disabled={readOnly || !customization.windows[window.id]} onClick={() => reset('windows', [window.id])}>{c.reset}</button>
        </> : <p className={`${muted} tw:m-0`}>{c.noWindows}</p>}</div>
      </div>
    </details>
    <details className={detail} open>
      <summary className="tw:cursor-pointer tw:text-sm tw:font-medium">{c.lighting} <span className={muted}>· {lightCount}/{MAX_DESIGN_LIGHTS}</span></summary>
      <div className="tw:mt-4 tw:flex tw:flex-wrap tw:gap-5"><Toggle name={c.naturalEnabled} checked={customization.lighting.naturalEnabled} disabled={readOnly} onChange={naturalEnabled => change(current => ({ ...current, lighting: { ...current.lighting, naturalEnabled } }))} /><Toggle name={c.artificialEnabled} checked={customization.lighting.artificialEnabled} disabled={readOnly} onChange={artificialEnabled => change(current => ({ ...current, lighting: { ...current.lighting, artificialEnabled } }))} /></div>
      <div className={twoColumns}>
        <div className={card}><h4 className={heading}>{c.fixedLights}</h4>
          <div className="tw:grid tw:gap-2 tw:sm:grid-cols-[minmax(0,1fr)_auto]"><label className={label}>{c.lightRoom}<select className={input} value={lightRoom.id} onChange={event => setLightRoomId(event.target.value)}>{scene.apartment.rooms.map(room => <option key={room.id} value={room.id}>{roomName(room.id)}</option>)}</select></label><button type="button" className={`${button} tw:self-end`} disabled={readOnly || lightCount >= MAX_DESIGN_LIGHTS} onClick={addLight}>+ {c.addLight}</button></div>
          {fixedLight ? <>
            <label className={label}>{c.chooseLight}<select className={input} value={fixedLight.id} onChange={event => setLightId(event.target.value)}>{customization.lighting.lights.map(light => <option key={light.id} value={light.id}>{light.name}</option>)}</select></label>
            <label className={label}>{c.lightName}<input key={`${fixedLight.id}-${fixedLight.name}`} className={input} maxLength={80} defaultValue={fixedLight.name} disabled={readOnly} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} onBlur={event => { const name = event.currentTarget.value.trim(); if (name && name !== fixedLight.name) onApply(current => updateFixedLight(current, fixedLight.id, { name })); event.currentTarget.value = fixedLight.name }} /></label>
            <LightFields c={c} value={fixedLight} readOnly={readOnly} onChange={edit => onApply(current => updateFixedLight(current, fixedLight.id, edit))} />
            <div className="tw:grid tw:grid-cols-3 tw:gap-2" role="group" aria-label={c.sourcePosition}>{[c.x, c.y, c.z].map((name, axis) => <NumberField key={`${fixedLight.id}-${axis}`} name={name} value={fixedLight.position[axis]} readOnly={readOnly} min={axis === 1 ? 0 : undefined} max={axis === 1 ? scene.geometry.ceiling.elevation : undefined} onChange={value => { const position = [...fixedLight.position] as [number, number, number]; position[axis] = value; onApply(current => updateFixedLight(current, fixedLight.id, { position })) }} />)}</div>
            <button type="button" className={`${button} tw:justify-self-start`} disabled={readOnly} onClick={() => onApply(current => removeFixedLight(current, fixedLight.id))}>{c.removeLight}</button>
          </> : <p className={`${muted} tw:m-0`}>{c.noLights}</p>}
        </div>
        <div className={card}><h4 className={heading}>{c.fixtureLight}{fixture ? ` · ${fixture.label}` : ''}</h4>
          {fixture ? <>
            <Toggle name={c.emitLight} checked={!!fixture.light} disabled={readOnly || !fixture.light && lightCount >= MAX_DESIGN_LIGHTS} onChange={enabled => onApply(current => setFixtureLight(current, fixture.id, enabled ? { enabled: true, kelvin: 2700, lumens: 800, offset: [0, Math.max(0, Math.min((fixtureAsset?.dimensions[1] ?? 1) + .08, scene.geometry.ceiling.elevation - fixture.position[1] - .08, 10)), 0] } : undefined))} />
            {fixture.light && <><LightFields c={c} value={fixture.light} readOnly={readOnly} onChange={changeFixtureLight} /><div className="tw:grid tw:grid-cols-3 tw:gap-2">{[c.offsetX, c.offsetY, c.offsetZ].map((name, axis) => <NumberField key={`${fixture.id}-${axis}`} name={name} value={fixture.light!.offset[axis]} readOnly={readOnly} min={-10} max={10} onChange={value => { const offset = [...fixture.light!.offset] as [number, number, number]; offset[axis] = value; changeFixtureLight({ offset }) }} />)}</div><p className={`${muted} tw:m-0`}>{c.fixtureHint}</p></>}
          </> : <p className={`${muted} tw:m-0`}>{c.selectFixture}</p>}
          <p className={`${muted} tw:m-0`}>{c.lightLimit}</p>
        </div>
      </div>
      <p className={`${muted} tw:mb-0 tw:mt-3`}>{c.lightingHint}</p>
    </details>
    <p className={`${muted} tw:m-0 tw:px-4 tw:pb-4`}>{c.saveHint}</p>
  </section>
}
