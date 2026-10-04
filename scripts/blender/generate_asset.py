"""Headless asset worker: validated JSON -> GLB, blend, preview, manifest.

These authored recipes exercise the worker boundary; they do not read product
websites or call an AI model. Blender must run with --background. Every
job writes to a new directory, never into the preserved asset catalog.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
RECIPE_VERSION = 1


def emit_event(kind, message, detail=None):
    """Bounded, explicit worker milestones, independent of Blender's raw logs."""
    event = {'kind': kind, 'message': message}
    if detail:
        event['detail'] = detail
    print('T3_ASSET_EVENT ' + json.dumps(event, ensure_ascii=False), flush=True)


def finite_number(value, label, minimum, maximum):
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or value > maximum or value < minimum):
        raise ValueError(f'{label} must be a finite number in the allowed range')
    return value


def validate_request(data):
    if not isinstance(data, dict):
        raise ValueError('Asset request must be an object')
    if type(data.get('schemaVersion')) is not int or data['schemaVersion'] != 1:
        raise ValueError('Unsupported asset request schemaVersion')
    if data.get('kind') not in ('table', 'wingback-chair', 'procedural') or data.get('units') != 'meters':
        raise ValueError('Supported recipes are table/wingback-chair/procedural with units=meters')
    if not isinstance(data.get('id'), str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', data['id']):
        raise ValueError('Asset id must be a safe lowercase identifier')
    if not isinstance(data.get('label'), str) or not data['label'].strip():
        raise ValueError('Asset label is required')
    dimensions = data.get('dimensions')
    if not isinstance(dimensions, list) or len(dimensions) != 3:
        raise ValueError('dimensions must contain width, height, depth in metres')
    for value in dimensions:
        finite_number(value, 'dimensions', .05, 20)
    width, height, depth = dimensions
    parameters = data.get('parameters')
    if not isinstance(parameters, dict):
        raise ValueError('Recipe parameters are required')
    if data['kind'] == 'table':
        top = finite_number(parameters.get('topThickness'), 'topThickness', .005, height / 2)
        leg = finite_number(parameters.get('legWidth'), 'legWidth', .005, min(width, depth) / 4)
        inset = finite_number(parameters.get('legInset'), 'legInset', 0, min(width, depth) / 2)
        if 2 * (inset + leg) >= min(width, depth):
            raise ValueError('Legs overlap; reduce legInset or legWidth')
        if height - top < .02:
            raise ValueError('Table legs must have positive usable height')
    elif data['kind'] == 'wingback-chair':
        seat = parameters.get('seatDimensions')
        if not isinstance(seat, list) or len(seat) != 3:
            raise ValueError('seatDimensions must contain nominal width, top height, depth')
        for value, limit in zip(seat, dimensions):
            finite_number(value, 'seatDimensions', .10, limit)
    else:
        parts = parameters.get('parts')
        if not isinstance(parts, list) or not 1 <= len(parts) <= 128:
            raise ValueError('Procedural assets require 1 to 128 parts')
        for part in parts:
            if not isinstance(part, dict) or part.get('shape') not in ('box', 'ellipsoid', 'cylinder', 'cone', 'cushion'):
                raise ValueError('Unsupported procedural shape')
            if not isinstance(part.get('name'), str) or not 1 <= len(part['name']) <= 100:
                raise ValueError('Part name is required (up to 100 characters)')
            for key, minimum, maximum in [('dimensions', .005, 20), ('position', -20, 20), ('rotation', -180, 180)]:
                values = part.get(key)
                if not isinstance(values, list) or len(values) != 3:
                    raise ValueError(f'Part {key} must contain three numbers')
                for value in values:
                    finite_number(value, key, minimum, maximum)
            if not isinstance(part.get('color'), str) or not re.fullmatch(r'#[a-fA-F0-9]{6}', part['color']):
                raise ValueError('Part color must be a six-digit sRGB hex color')
            for key, limit in [('roughness', 1), ('metallic', 1), ('bevel', .1)]:
                finite_number(part.get(key), key, 0, limit)
            upholstery = part.get('upholstery')
            if upholstery is not None:
                if not isinstance(upholstery, dict) or set(upholstery) != {'roundness', 'tuftRows', 'tuftColumns', 'texture'}:
                    raise ValueError('Invalid upholstery options')
                finite_number(upholstery['roundness'], 'roundness', .15, 1)
                for key in ['tuftRows', 'tuftColumns']:
                    if type(upholstery[key]) is not int or not 0 <= upholstery[key] <= 4:
                        raise ValueError('Tuft counts must be integers between 0 and 4')
                if upholstery['texture'] not in ('plain', 'woven', 'corduroy'):
                    raise ValueError('Invalid upholstery texture')
    material = data.get('material')
    if not isinstance(material, dict):
        raise ValueError('Material is required')
    if not isinstance(material.get('baseColor'), str) or not re.fullmatch(r'#[a-fA-F0-9]{6}', material['baseColor']):
        raise ValueError('baseColor must be a six-digit sRGB hex color')
    finite_number(material.get('roughness'), 'roughness', 0, 1)
    source = data.get('source')
    if not isinstance(source, dict) or not isinstance(source.get('description'), str) or not source['description'].strip():
        raise ValueError('Source description is required')
    if source.get('dimensionalStatus') not in ('estimated', 'user-supplied', 'manufacturer-specified'):
        raise ValueError('Source dimensionalStatus is required')
    url = source.get('url')
    if url is not None:
        if not isinstance(url, str):
            raise ValueError('Source URL must be an HTTP(S) URL or null')
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Source URL must be an HTTP(S) URL without credentials')
    return data


def output_path(path):
    resolved = Path(path).resolve()
    if resolved.is_relative_to(ROOT) and not resolved.is_relative_to(ROOT / 'artifacts'):
        raise ValueError('Repository output must be inside artifacts/, outside preserved sources')
    if resolved.exists():
        raise ValueError('Output directory already exists; use a new job/version directory')
    return resolved


def support_surfaces(request):
    if request['kind'] != 'table':
        return []
    width, height, depth = request['dimensions']
    # Bevelled edges are excluded from the usable planar support area.
    margin = min(.004, request['parameters']['topThickness'] / 4)
    x, z = width / 2 - margin, depth / 2 - margin
    return [{'id': 'tabletop', 'position': [0, height, 0], 'normal': [0, 1, 0],
             'polygon': [[-x, -z], [x, -z], [x, z], [-x, z]],
             'usage': 'placement-only; no load-bearing claim'}]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_export(path, dimensions):
    spec = importlib.util.spec_from_file_location('t3_asset_audit', Path(__file__).with_name('validate_assets.py'))
    auditor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(auditor)
    report = auditor.audit_glb(path, path.parent, set(),
                              {'dimensions': dict(zip(('x', 'y', 'z'), dimensions))})
    if report['errors']:
        raise ValueError('Export validation failed: ' + '; '.join(report['errors']))
    return report


def generate(request, output, resolution, samples, preview):
    import bpy
    from mathutils import Vector

    if not bpy.app.background:
        raise RuntimeError('Asset generation requires Blender --background')
    emit_event('modeling', 'Construyendo la geometría', request['label'])
    output.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'T3 generated asset: ' + request['id']
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene['asset_id'] = request['id']
    scene['recipe_version'] = RECIPE_VERSION
    scene['dimensional_status'] = request['source']['dimensionalStatus']
    material = bpy.data.materials.new('Asset finish')
    material.use_nodes = True
    srgb = [int(request['material']['baseColor'][index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in srgb]
    material.diffuse_color = (*linear, 1)
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = request['material']['roughness']
    parts = []

    def box(name, dimensions, position, bevel_width):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(position[0], -position[2], position[1]))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material)
        modifier = obj.modifiers.new('Soft edges', 'BEVEL')
        modifier.width = bevel_width
        modifier.segments = 3
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(obj)

    width, height, depth = request['dimensions']
    recipe = {'recipe': 'parametric-table', 'version': RECIPE_VERSION}
    if request['kind'] == 'table':
        top, leg, inset = (request['parameters'][key] for key in ('topThickness', 'legWidth', 'legInset'))
        box('Tabletop', (width, top, depth), (0, height - top / 2, 0), min(.004, top / 4))
        for x in (-1, 1):
            for z in (-1, 1):
                box(f'Leg {x} {z}', (leg, height - top, leg),
                    (x * (width / 2 - inset - leg / 2), (height - top) / 2,
                     z * (depth / 2 - inset - leg / 2)), min(.002, leg / 4))
    else:
        recipe_name = 'strandmon_recipe' if request['kind'] == 'wingback-chair' else 'procedural_recipe'
        recipe_path = Path(__file__).with_name(recipe_name + '.py')
        spec = importlib.util.spec_from_file_location(recipe_name, recipe_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        parts, recipe = module.build(request, material)
        recipe['recipeSha256'] = sha256(recipe_path)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    emit_event('modeling', 'Geometría creada', f'{len(parts)} piezas; exportando model.glb')
    glb = output / 'model.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
                              use_active_scene=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_cameras=False, export_lights=False)
    emit_event('validation', 'Comprobando el modelo exportado', 'Dimensiones, origen y recursos del GLB')
    validation = audit_export(glb, request['dimensions'])
    emit_event('validation', 'Dimensiones y estructura verificadas',
               ' × '.join(f'{value * 100:.1f}' for value in validation['dimensions']) + ' cm (ancho × alto × fondo)')

    # These studio objects are added after GLB export, so the web asset stays clean.
    world = bpy.data.worlds.new('Asset studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.3, .3, .3, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .6
    scene.world = world
    size = max(width, height, depth)
    target = Vector((0, 0, height / 2))
    camera_data = bpy.data.cameras.new('Preview camera')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = target + Vector((1.8 * size, -2.5 * size, 1.6 * size))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = size * 1.8
    scene.camera = camera
    for name, offset, power in [('Key', (1, -2, 3), 350), ('Fill', (-2, -1, 1.5), 150)]:
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = power * size * size
        light_data.size = size * 2
        light = bpy.data.objects.new(name, light_data)
        scene.collection.objects.link(light)
        light.location = target + Vector(tuple(value * size for value in offset))
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    scene.render.use_stamp_filename = False
    scene.render.filepath = '//preview.png'
    source_text = json.dumps(request, ensure_ascii=False, indent=2) + '\n'
    (output / 'request.json').write_text(source_text, encoding='utf-8')
    bpy.data.texts.new('asset-request.json').write(source_text)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / 'source.blend'), compress=True)
    emit_event('modeling', 'Fuente editable guardada', 'source.blend y request.json')
    views = []
    if preview:
        emit_event('render', 'Renderizando la vista principal', f'Cycles CPU · {resolution} px · {samples} muestras')
        bpy.ops.render.render(write_still=True)
        emit_event('render', 'Vista principal lista', 'preview.png')
        if preview:
            for name, position in [('front', (0, -3*size, height / 2)), ('side', (3*size, 0, height / 2))]:
                camera.location = position
                camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
                camera_data.ortho_scale = size * 1.3
                scene.render.filepath = str(output / f'{name}.png')
                emit_event('render', 'Renderizando otra vista', 'Frontal' if name == 'front' else 'Lateral')
                bpy.ops.render.render(write_still=True)
                emit_event('render', 'Vista lista', f'{name}.png')
                views.append(f'{name}.png')
    files = ['model.glb', 'source.blend', 'request.json'] + (['preview.png'] if preview else []) + views
    manifest = {
        'schemaVersion': 1, 'status': 'validated', 'id': request['id'], 'label': request['label'],
        'kind': request['kind'], 'units': 'meters', 'dimensions': validation['dimensions'],
        'origin': 'floor-center', 'upAxis': '+Y', 'frontAxis': '+Z',
        'source': request['source'], 'supportSurfaces': support_surfaces(request),
        'generator': {**recipe, 'scriptSha256': sha256(Path(__file__)), 'blenderVersion': bpy.app.version_string},
        'artifacts': {name: {'path': name, 'bytes': (output / name).stat().st_size,
                             'sha256': sha256(output / name)} for name in files},
        'validation': validation,
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    emit_event('validation', 'Archivos y manifiesto preparados', ', '.join(files))
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--resolution', type=int, default=384)
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--skip-preview', action='store_true')
    args = parser.parse_args(argv)
    if not 64 <= args.resolution <= 1024 or not 1 <= args.samples <= 256:
        parser.error('Resolution must be 64–1024 and samples 1–256')
    request = validate_request(json.loads(args.input.read_text(encoding='utf-8')))
    output = output_path(args.output_dir)
    generate(request, output, args.resolution, args.samples, not args.skip_preview)
    print(f'T3_GENERATED_ASSET_OK: {output / "manifest.json"}')


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
