"""Build bounded declarative furniture parts. No generated code is evaluated.

Inputs use web axes (X right, Y up, Z front), degrees and metres. Whole-asset
bounds are normalized to the declared dimensions and centered on the floor.
This preserves the measurement contract; it does not certify visual fidelity.
"""
from __future__ import annotations

import math
import importlib.util
import hashlib
from pathlib import Path


def build(request, _default_material):
    import bpy
    from mathutils import Euler, Matrix, Vector
    spec = importlib.util.spec_from_file_location('upholstery', Path(__file__).with_name('upholstery.py'))
    upholstery = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upholstery)

    parts = []
    materials = {}
    basis = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
    for part in request['parameters']['parts']:
        shape = part['shape']
        if shape == 'cushion':
            vertices, faces = upholstery.cushion_mesh(part['dimensions'], part.get('upholstery', {}))
            data = bpy.data.meshes.new(part['name'])
            data.from_pydata(vertices, [], faces)
            data.update()
            import bmesh
            mesh = bmesh.new()
            mesh.from_mesh(data)
            bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
            mesh.to_mesh(data)
            mesh.free()
            obj = bpy.data.objects.new(part['name'], data)
            bpy.context.collection.objects.link(obj)
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
        elif shape == 'box':
            bpy.ops.mesh.primitive_cube_add(size=1)
        elif shape == 'ellipsoid':
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.5)
        elif shape == 'cylinder':
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.5, depth=1)
        else:
            bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=.5, radius2=.25, depth=1)
        obj = bpy.context.object
        obj.name = part['name']
        width, height, depth = part['dimensions']
        obj.dimensions = (width, depth, height)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if shape == 'box' and part['bevel']:
            modifier = obj.modifiers.new('Soft edges', 'BEVEL')
            modifier.width = min(part['bevel'], min(width, height, depth) / 3)
            modifier.segments = 3
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        if shape != 'box':
            for polygon in obj.data.polygons:
                polygon.use_smooth = len(polygon.vertices) <= 4
        texture_kind = part.get('upholstery', {}).get('texture', 'plain')
        key = (part['color'], part['roughness'], part['metallic'], texture_kind)
        if key not in materials:
            material = bpy.data.materials.new(f'Finish {len(materials) + 1}')
            material.use_nodes = True
            srgb = [int(part['color'][i:i + 2], 16) / 255 for i in (1, 3, 5)]
            linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in srgb]
            material.diffuse_color = (*linear, 1)
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Base Color'].default_value = (*linear, 1)
            shader.inputs['Roughness'].default_value = part['roughness']
            shader.inputs['Metallic'].default_value = part['metallic']
            upholstery.textile(material, texture_kind)
            materials[key] = material
        obj.data.materials.append(materials[key])
        if texture_kind != 'plain':
            upholstery.add_uv(obj)
        rotation = Euler(tuple(math.radians(v) for v in part['rotation']), 'XYZ').to_matrix()
        obj.rotation_euler = (basis @ rotation @ basis.transposed()).to_euler()
        obj.location = basis @ Vector(part['position'])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(obj)

    points = [vertex.co for obj in parts for vertex in obj.data.vertices]
    lower = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    upper = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    size = upper - lower
    target = Vector((request['dimensions'][0], request['dimensions'][2], request['dimensions'][1]))
    if any(value <= 0 for value in size):
        raise ValueError('Procedural asset must occupy three dimensions')
    center = Vector(((lower.x + upper.x) / 2, (lower.y + upper.y) / 2, lower.z))
    for obj in parts:
        for vertex in obj.data.vertices:
            vertex.co = Vector(tuple((vertex.co[i] - center[i]) * target[i] / size[i] for i in range(3)))
        obj.data.update()
    return parts, {
        'recipe': 'declarative-parts', 'version': 2,
        'upholsterySha256': hashlib.sha256(Path(__file__).with_name('upholstery.py').read_bytes()).hexdigest(),
        'fidelityStatus': 'draft-needs-visual-review',
        'normalization': 'outer-bounds-to-declared-dimensions',
        'inputBounds': list(size),
        'partCount': len(parts),
    }
