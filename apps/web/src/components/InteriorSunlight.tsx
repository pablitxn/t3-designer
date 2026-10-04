import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Color, DirectionalLight, Object3D, PMREMGenerator, Vector3 } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { apartmentBounds } from '@t3-designer/geometry'
import type { Apartment } from '@t3-designer/scene-schema'
import type { SolarPosition } from '../lib/solar'
import { siteDirectionToApartment } from '../data/apartment-placement'

export function InteriorSunlight({ apartment, sun }: { apartment: Apartment; sun: SolarPosition }) {
  const light = useRef<DirectionalLight>(null)
  const { gl, scene, invalidate } = useThree()
  const bounds = useMemo(() => apartmentBounds(apartment), [apartment])
  const target = useMemo(() => {
    const object = new Object3D()
    object.position.set(bounds.center[0], 1, bounds.center[1])
    return object
  }, [bounds])
  const direction = siteDirectionToApartment(sun.direction)

  useEffect(() => {
    const environment = new RoomEnvironment()
    const generator = new PMREMGenerator(gl)
    const output = generator.fromScene(environment, .04)
    const previous = scene.environment
    scene.environment = output.texture
    invalidate()
    environment.dispose()
    generator.dispose()
    return () => { scene.environment = previous; output.dispose() }
  }, [gl, scene, invalidate])

  useLayoutEffect(() => {
    const previous = scene.environmentIntensity
    scene.environmentIntensity = sun.isDaylight ? .13 : .025
    invalidate()
    return () => { scene.environmentIntensity = previous }
  }, [scene, sun.isDaylight, invalidate])

  useLayoutEffect(() => {
    const source = light.current
    if (!source) return
    source.updateMatrixWorld(true)
    target.updateMatrixWorld(true)
    source.shadow.updateMatrices(source)
    const camera = source.shadow.camera
    const corners: Vector3[] = []
    for (const x of [bounds.min[0], bounds.max[0]]) for (const z of [bounds.min[1], bounds.max[1]]) {
      for (const y of [0, apartment.walls[0].height + .3]) corners.push(new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
    }
    // Crop to receiving rooms, rather than spending interior shadow resolution
    // on the entire town. Upstream neighbours still render into this frustum.
    camera.left = Math.min(...corners.map(p => p.x)) - 1.5
    camera.right = Math.max(...corners.map(p => p.x)) + 1.5
    camera.bottom = Math.min(...corners.map(p => p.y)) - 1.5
    camera.top = Math.max(...corners.map(p => p.y)) + 1.5
    camera.updateProjectionMatrix()
    source.shadow.needsUpdate = true
    invalidate()
  }, [apartment, bounds, sun, target, invalidate])

  const color = new Color('#ffce8e').lerp(new Color('#fff7e5'), Math.min(1, Math.max(0, sun.altitude / 22)))
  return <>
    <primitive object={target} />
    <ambientLight intensity={sun.isDaylight ? .12 : .075} />
    <hemisphereLight args={['#dce8ff', '#bdb39b', sun.isDaylight ? .25 : .10]} />
    <directionalLight ref={light} target={target}
      position={[target.position.x + direction[0] * 300, target.position.y + direction[1] * 300, target.position.z + direction[2] * 300]}
      intensity={sun.isDaylight ? 3.4 * Math.min(1, sun.altitude / 8) : 0} color={color}
      castShadow={sun.isDaylight} shadow-mapSize={[4096, 4096]}
      shadow-camera-near={.1} shadow-camera-far={700}
      shadow-bias={-.000015} shadow-normalBias={.006} shadow-radius={1} />
  </>
}
