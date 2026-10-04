import { Mesh, type Material, type Object3D } from 'three'

/** Give an occluder tree private materials for the main pass. The originals may
 * also be used by visible meshes, so never change their color/depth flags.
 * castShadow, custom depth materials and alpha-test settings remain intact. */
export function applyShadowOnlyMaterials(root: Object3D): () => void {
  const originals: { mesh: Mesh; material: Material | Material[] }[] = []
  const copies = new Map<Material, Material>()
  const hide = (material: Material) => {
    let copy = copies.get(material)
    if (!copy) {
      copy = material.clone()
      copy.colorWrite = false
      copy.depthWrite = false
      copies.set(material, copy)
    }
    return copy
  }

  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    originals.push({ mesh: object, material: object.material })
    object.material = Array.isArray(object.material) ? object.material.map(hide) : hide(object.material)
  })

  return () => {
    originals.forEach(({ mesh, material }) => { mesh.material = material })
    copies.forEach(material => material.dispose())
    copies.clear()
  }
}
