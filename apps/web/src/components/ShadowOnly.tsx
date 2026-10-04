import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Group } from 'three'
import { applyShadowOnlyMaterials } from '../lib/shadow-only'

/** Keep physical occluders in the shadow pass without painting or hiding the
 * room beneath them. Three's shadow pass uses the viewing camera's layers, so
 * putting these meshes on another layer would silently remove their shadows.
 * Children are a synchronously mounted geometry tree; lazy assets belong in
 * the visible apartment, not in this physical envelope. */
export function ShadowOnly({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  useLayoutEffect(() => {
    if (!group.current) return
    return applyShadowOnlyMaterials(group.current)
  }, [children])
  return <group ref={group}>{children}</group>
}
