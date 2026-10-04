import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'
import type { RoofSolarLayout } from '../energy/roof-layout'

/** Racks are a visualization of the scenario, not construction details. */
export function RooftopSolarPanels({ layout }: { layout: RoofSolarLayout }) {
  const frames = useRef<InstancedMesh>(null)
  const cells = useRef<InstancedMesh>(null)
  const legs = useRef<InstancedMesh>(null)
  const object = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    if (!frames.current || !cells.current || !legs.current) return
    layout.panels.forEach((panel, i) => {
      object.position.set(...panel.position)
      object.rotation.set(...panel.rotation, 'YXZ')
      object.scale.set(layout.panelWidthM, .04, layout.panelLengthM)
      object.updateMatrix()
      frames.current!.setMatrixAt(i, object.matrix)
      object.position.set(panel.position[0] + panel.normal[0] * .027, panel.position[1] + panel.normal[1] * .027, panel.position[2] + panel.normal[2] * .027)
      object.scale.set(Math.max(.02, layout.panelWidthM - .055), .015, Math.max(.02, layout.panelLengthM - .055))
      object.updateMatrix()
      cells.current!.setMatrixAt(i, object.matrix)
      panel.supports.forEach(({ bottom, top }, j) => {
        object.rotation.set(0, 0, 0)
        object.position.set(bottom[0], (bottom[1] + top[1]) / 2, bottom[2])
        object.scale.set(.045, Math.max(.01, top[1] - bottom[1]), .045)
        object.updateMatrix()
        legs.current!.setMatrixAt(i * 4 + j, object.matrix)
      })
    })
    for (const mesh of [frames.current, cells.current, legs.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [layout, object])
  if (!layout.panels.length) return null
  return <group name="building-rooftop-solar">
    <instancedMesh ref={legs} args={[undefined, undefined, layout.panels.length * 4]} castShadow receiveShadow>
      <boxGeometry /><meshStandardMaterial color="#95a3a5" metalness={.65} roughness={.45} />
    </instancedMesh>
    <instancedMesh ref={frames} args={[undefined, undefined, layout.panels.length]} castShadow receiveShadow>
      <boxGeometry /><meshStandardMaterial color="#aebec4" metalness={.65} roughness={.35} />
    </instancedMesh>
    <instancedMesh ref={cells} args={[undefined, undefined, layout.panels.length]} castShadow receiveShadow>
      <boxGeometry /><meshStandardMaterial color="#123958" metalness={.28} roughness={.3} />
    </instancedMesh>
  </group>
}
