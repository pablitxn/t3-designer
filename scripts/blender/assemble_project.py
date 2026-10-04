"""Build a standalone solar-study .blend from the renderer-neutral project JSON.

Run only in an isolated Blender background process. Historical authored .blend
files are never overwritten. Camera cuts use Cycles ray visibility: the complete
walls, ceiling, building and neighbours still block sunlight. No GUI or MCP
session is needed. The web and Blender renderers share physical wall solids and
placement; materials, façade decoration and furniture detail remain adapters.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def site_to_blender(point):
    x, y, z = point
    return (x, -z, y)


def apartment_to_site(point, placement):
    x, y, z = point
    angle = placement['rotationY']
    px, py, pz = placement['position']
    return (px + math.cos(angle) * x + math.sin(angle) * z,
            py + y, pz - math.sin(angle) * x + math.cos(angle) * z)


def door_leaf_pose(door, wall):
    """Match Door.tsx's 76 degree presentation angle and persisted hinge/side.
    The angle is a rendering convention, not a surveyed door opening."""
    if door.get('appearance') == 'passage':
        return None
    dx, dz = wall['to'][0] - wall['from'][0], wall['to'][1] - wall['from'][1]
    length = math.hypot(dx, dz)
    direction = 1 if door['hinge'] == 'start' else -1
    offset = door['offset'] + (.024 if direction == 1 else door['width'] - .024)
    hinge_x, hinge_z = wall['from'][0] + dx / length * offset, wall['from'][1] + dz / length * offset
    angle = -math.atan2(dz, dx) + math.radians(76) * door['opensToward'] * -direction
    width, height = door['width'] - .045, door['height'] - .05
    return {'position': [hinge_x + math.cos(angle) * direction * width / 2, .025 + height / 2,
                         hinge_z - math.sin(angle) * direction * width / 2],
            'scale': [width, height, .035], 'rotationY': angle}


def point_in_ring(point, ring):
    if len(ring) < 3:
        return False
    x, z = point
    inside = False
    previous = ring[-1]
    for current in ring:
        ax, az = previous
        bx, bz = current
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax:
            inside = not inside
        previous = current
    return inside


def validate_snapshot(data):
    """Check adapter boundaries before any file output or Blender mutation."""
    if data['schemaVersion'] != 1 or data['units'] != 'meters':
        raise ValueError('Expected project snapshot schema 1 in meters')
    placement = data['placement']
    target = [building for building in data['buildings'] if building['isTarget']]
    if len(target) != 1 or target[0]['id'] != placement['buildingId']:
        raise ValueError('Snapshot must identify exactly one placed target building')
    sections = data['geometry']['contextSections']
    floor = data['geometry']['floor']
    ceiling = data['geometry']['ceiling']
    if sections['belowTop'] > placement['floorElevation'] + floor['elevation'] - floor['thickness'] + 1e-7:
        raise ValueError('Building below the apartment intrudes into its floor')
    if sections['ceilingBase'] < placement['floorElevation'] + ceiling['elevation'] - 1e-7:
        raise ValueError('Upper building mass intrudes into the apartment')
    points = list(data['apartment']['perimeter'])
    for room in data['apartment']['rooms']:
        points += room['polygon']
    for x, z in points:
        sx, _, sz = apartment_to_site((x, 1, z), placement)
        if any(point_in_ring((sx, sz), sections[key]) for key in ['before', 'after']):
            raise ValueError('Building side mass fills part of the apartment')
    direction = data['solar']['selected']['direction']
    if not all(math.isfinite(n) for n in direction) or abs(math.sqrt(sum(n*n for n in direction)) - 1) > 1e-7:
        raise ValueError('Solar direction must be a finite unit vector')
    declared = {asset['id'] for asset in data['assets']}
    if any(fixture['assetId'] not in declared for fixture in data['fixtures']):
        raise ValueError('Fixture references an undeclared asset')
    wall_ids = {wall['id'] for wall in data['apartment']['walls']}
    supplied = [wall['wallId'] for wall in data['geometry']['walls']]
    if set(supplied) != wall_ids or len(supplied) != len(wall_ids):
        raise ValueError('Exported solids must cover every apartment wall exactly once')
    for wall in data['geometry']['walls']:
        if not wall['solids']:
            raise ValueError('Every wall must contain physical solids')
        for solid in wall['solids']:
            if (len(solid['position']) != 3 or len(solid['scale']) != 3
                    or not all(math.isfinite(n) for n in [*solid['position'], *solid['scale'], solid['rotationY']])
                    or any(n <= 0 for n in solid['scale'])):
                raise ValueError('Wall solids require finite transforms and positive dimensions')
    return target[0]


def asset_paths(data):
    paths = {}
    for asset in data['assets']:
        path = (ROOT / asset['repoPath']).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise ValueError(f'Asset is missing or outside the repository: {asset["repoPath"]}')
        paths[asset['id']] = path
    return paths


def polygon_prism(bpy, name, ring, base, height, collection, material, holes=()):
    """Editable extruded rings, retaining courtyards instead of capping them."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.resolution_u = 1
    curve.fill_mode = 'BOTH'
    for index, source in enumerate([ring, *holes]):
        points = [(x, -z) for x, z in source]
        area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
        if (area > 0) != (index == 0):
            points.reverse()
        spline = curve.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for item, (x, y) in zip(spline.points, points):
            item.co = (x, y, 0, 1)
        spline.use_cyclic_u = True
    curve.extrude = height / 2
    obj = bpy.data.objects.new(name, curve)
    obj.location.z = base + height / 2
    collection.objects.link(obj)
    curve.materials.append(material)
    return obj


def roof_mesh(bpy, name, ring, building, collection, material):
    """Same inferred ridge convention as the web massing, using full datum even
    when a target roof is split at the apartment section boundary."""
    footprint = building['footprint']
    a, b = max(zip(footprint, footprint[1:] + footprint[:1]), key=lambda edge: math.dist(*edge))
    length = math.dist(a, b)
    axis = ((b[0] - a[0]) / length, (b[1] - a[1]) / length)
    across = lambda point: -axis[1] * point[0] + axis[0] * point[1]
    minimum, maximum = min(map(across, footprint)), max(map(across, footprint))
    middle = (minimum + maximum) / 2
    rise = 0 if building.get('holes') or len(footprint) > 18 else min(5, building['roofHeight'])
    eaves = building['height']
    if rise <= .4:
        return [polygon_prism(bpy, name, ring, eaves, .08, collection, material, building.get('holes', []))]
    height = lambda point: eaves + rise * max(0, 1 - abs(across(point) - middle) / ((maximum - minimum) / 2))
    vertices, faces = [], []
    for side in [1, -1]:
        split = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            da, db = (across(a) - middle) * side, (across(b) - middle) * side
            if da >= 0:
                split.append(a)
            if da * db < 0:
                t = da / (da - db)
                split.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        if len(split) >= 3:
            start = len(vertices)
            vertices.extend((x, -z, height((x, z))) for x, z in split)
            faces.append(tuple(range(start, len(vertices))))
    for a, b in zip(ring, ring[1:] + ring[:1]):
        edge = [a]
        da, db = across(a) - middle, across(b) - middle
        if da * db < 0:
            t = da / (da - db)
            edge.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        edge.append(b)
        for a, b in zip(edge, edge[1:]):
            start = len(vertices)
            vertices.extend([(a[0], -a[1], eaves), (b[0], -b[1], eaves),
                             (b[0], -b[1], height(b)), (a[0], -a[1], height(a))])
            faces.append(tuple(range(start, start + 4)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    return [obj]


def make_apartment(bpy, adapter, data):
    adapter.OWNER = 't3.project-render.v1'
    adapter.setup()
    scene = adapter.scene
    scene.name = 'T3 · Apartment in building · solar study'
    adapter.floors(data['apartment'])
    # Keep the mature floor-finish adapter, replacing its historical hard-coded
    # slab with the current canonical exported solid.
    for obj in list(scene.objects):
        if obj.name == 'Apartment slab':
            bpy.data.objects.remove(obj, do_unlink=True)
    floor = data['geometry']['floor']
    polygon_prism(bpy, 'Apartment floor · canonical slab', floor['polygon'],
                  floor['elevation'] - floor['thickness'], floor['thickness'],
                  adapter.collections['Architecture'], adapter.materials['white'])
    count = 0
    for wall in data['geometry']['walls']:
        for index, solid in enumerate(wall['solids']):
            x, y, z = solid['position']
            width, height, depth = solid['scale']
            bottom, top = y - height / 2, y + height / 2
            # Split the exported solid only for visibility. Architectural
            # segmentation around openings remains owned by the TypeScript model.
            ranges = [(bottom, min(top, 1)), (max(bottom, 1), top)]
            for lower, upper in ranges:
                if upper - lower <= 1e-7:
                    continue
                obj = adapter.box(f'{wall["wallId"]} · solid {index}', (width, upper - lower, depth),
                                  (x, (lower + upper) / 2, z), rotation=solid['rotationY'], bevel=0)
                obj.visible_camera = lower < 1
                obj['wall_id'] = wall['wallId']
                obj['source_solid_index'] = index
                obj['camera_cut_only'] = lower >= 1
                count += 1
    ceiling = data['geometry']['ceiling']
    obj = polygon_prism(bpy, 'Ceiling · physical solar occluder', ceiling['polygon'], ceiling['elevation'], ceiling['thickness'],
                        adapter.collections['Architecture'], adapter.materials['plaster'])
    obj.visible_camera = False
    obj['camera_cut_only'] = True
    frames = {**data['apartment'], 'doors': [{**door, 'appearance': 'passage'} for door in data['apartment']['doors']]}
    adapter.openings(frames)
    adapter.mat('Door leaf', (.48, .55, .50), .7)
    walls = {wall['id']: wall for wall in data['apartment']['walls']}
    for door in data['apartment']['doors']:
        leaf = door_leaf_pose(door, walls[door['wallId']])
        if not leaf:
            continue
        x, y, z = leaf['position']
        width, height, depth = leaf['scale']
        for lower, upper in [(.025, min(1, y + height / 2)), (1, y + height / 2)]:
            if upper <= lower:
                continue
            obj = adapter.box(door['id'] + ' · hinged leaf', (width, upper - lower, depth),
                              (x, (lower + upper) / 2, z), 'Door leaf', 'Openings and trim', leaf['rotationY'], bevel=0)
            obj.visible_camera = lower < 1
            obj['door_leaf_id'] = door['id']
            obj['camera_cut_only'] = lower >= 1
    adapter.fixtures({'fixtures': data['fixtures']}, asset_paths(data))
    # Clear glazing transmits direct sun; old illustrative metallic blue panes
    # must not turn the architectural openings into opaque shadow blockers.
    glass = adapter.materials['glass']
    nodes = glass.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    transparent.inputs['Color'].default_value = (.96, .98, 1, 1)
    glass.node_tree.links.new(transparent.outputs[0], output.inputs['Surface'])
    parent = bpy.data.objects.new('Apartment · canonical local-to-site placement', None)
    scene.collection.objects.link(parent)
    for obj in list(scene.objects):
        if obj is not parent and obj.parent is None:
            obj.parent = parent
    parent.location = site_to_blender(data['placement']['position'])
    parent.rotation_euler.z = data['placement']['rotationY']
    parent['floor_index'] = data['placement']['floorIndex']
    parent['placement_status'] = data['placement']['confidence']
    return scene, count


def make_context(bpy, adapter, data, visible):
    collection = bpy.data.collections.new('Building + neighbours · physical solar context')
    adapter.scene.collection.children.link(collection)
    wall = adapter.mat('Context stone', (.64, .64, .56), .9)
    roof = adapter.mat('Context roof', (.34, .41, .40), .85)
    target = next(building for building in data['buildings'] if building['isTarget'])
    sections = data['geometry']['contextSections']
    if sections['belowTop'] > 0:
        below = polygon_prism(bpy, 'Target building · below apartment', target['footprint'], 0, sections['belowTop'], collection, wall)
        below.visible_camera = visible
    for key in ['before', 'after', 'apartmentBand']:
        base = sections['ceilingBase'] if key == 'apartmentBand' else sections['belowTop']
        if len(sections[key]) < 3 or target['height'] <= base:
            continue
        obj = polygon_prism(bpy, 'Target building · ' + key, sections[key], base, target['height'] - base, collection, wall)
        obj.visible_camera = visible and key != 'apartmentBand'
        for obj in roof_mesh(bpy, 'Target roof · ' + key, sections[key], target, collection, roof):
            obj.visible_camera = visible and key != 'apartmentBand'
    for building in data['buildings']:
        if building['isTarget']:
            continue
        obj = polygon_prism(bpy, building['id'], building['footprint'], 0, building['height'], collection, wall, building.get('holes', []))
        obj.visible_camera = visible
        for obj in roof_mesh(bpy, building['id'] + ' · roof', building['footprint'], building, collection, roof):
            obj.visible_camera = visible
    ground = polygon_prism(bpy, 'Ground · common unsurveyed datum', [[-250, -250], [250, -250], [250, 250], [-250, 250]],
                           -.1, .1, collection, adapter.materials['studio'])
    ground.visible_camera = visible
    return collection


def make_lighting_and_camera(bpy, data, scene, resolution, samples):
    from mathutils import Vector
    world = bpy.data.worlds.new('Sky · diffuse approximation')
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (.67, .74, .84, 1)
    background.inputs['Strength'].default_value = .8 if data['solar']['selected']['isDaylight'] else .015
    # Neutral camera backdrop is independent from the physical sky light.
    # This improves a cutaway diagram's legibility without adding fill lights.
    output = next(node for node in world.node_tree.nodes if node.type == 'OUTPUT_WORLD')
    backdrop = world.node_tree.nodes.new('ShaderNodeBackground')
    backdrop.inputs['Color'].default_value = (.88, .90, .86, 1)
    camera_ray = world.node_tree.nodes.new('ShaderNodeLightPath')
    mix = world.node_tree.nodes.new('ShaderNodeMixShader')
    world.node_tree.links.new(camera_ray.outputs['Is Camera Ray'], mix.inputs[0])
    world.node_tree.links.new(background.outputs[0], mix.inputs[1])
    world.node_tree.links.new(backdrop.outputs[0], mix.inputs[2])
    world.node_tree.links.new(mix.outputs[0], output.inputs['Surface'])
    scene.world = world
    light = bpy.data.lights.new('Sun · canonical astronomical position', 'SUN')
    light.angle = math.radians(.533)
    light.color = (1, .96, .88)
    sun = bpy.data.objects.new(light.name, light)
    scene.collection.objects.link(sun)
    sun.rotation_mode = 'QUATERNION'
    def apply_sun(sample):
        toward = Vector(site_to_blender(sample['direction']))
        sun.rotation_quaternion = (-toward).to_track_quat('-Z', 'Y')
        sun.location = toward * 100
        light.energy = 3.4 * min(1, max(0, sample['altitude']) / 8) if sample['isDaylight'] else 0
    # The saved render is the exact selected instant. Its full day samples are
    # embedded in the snapshot, avoiding a second astronomical implementation.
    apply_sun(data['solar']['selected'])
    sun['selected_utc'] = data['solar']['selected']['utc']
    sun['altitude_deg'] = data['solar']['selected']['altitude']
    sun['azimuth_deg'] = data['solar']['selected']['azimuth']
    camera_data = bpy.data.cameras.new('Camera · apartment cutaway')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    bounds = data['placement']['bounds']
    cx, cz = (bounds['minX'] + bounds['maxX']) / 2, (bounds['minZ'] + bounds['maxZ']) / 2
    span = max(bounds['width'], bounds['depth'])
    camera.location = site_to_blender(apartment_to_site((cx + span * .78, span * 1.6, cz + span * 1.1), data['placement']))
    target = Vector(site_to_blender(apartment_to_site((cx, .4, cz), data['placement'])))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = span * 1.65
    camera_data.clip_start = .01
    camera_data.clip_end = 1000
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = resolution
    scene.render.resolution_y = round(resolution * .83)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.exposure = .7
    return sun


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'assets/scenes/t3-project.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/blender/t3-project.blend')
    parser.add_argument('--render', type=Path, nargs='?', const=ROOT / 'artifacts/renders/t3-project.png')
    parser.add_argument('--resolution', type=int, default=960)
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--context', action='store_true', help='Show the physical building context to the camera')
    args = parser.parse_args(argv)
    if not 64 <= args.resolution <= 8192 or not 1 <= args.samples <= 4096:
        parser.error('Resolution must be 64..8192 and samples 1..4096')
    output = args.output.resolve()
    if output.suffix != '.blend' or output.is_relative_to(ROOT / 'assets/blender'):
        parser.error('Output must be a .blend outside the preserved assets/blender references')
    if args.render and args.render.resolve().suffix.lower() != '.png':
        parser.error('Render output must be a .png')
    data = json.loads(args.input.read_text())
    validate_snapshot(data)
    asset_paths(data)
    import bpy
    if not bpy.app.background:
        raise RuntimeError('Run this adapter in Blender --background; it never operates on the open GUI session')
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import assemble_apartment as adapter
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene, wall_count = make_apartment(bpy, adapter, data)
    context = make_context(bpy, adapter, data, args.context)
    sun = make_lighting_and_camera(bpy, data, scene, args.resolution, args.samples)
    for other in list(bpy.data.scenes):
        if other != scene:
            bpy.data.scenes.remove(other)
    for key, value in {'source': args.input.resolve().relative_to(ROOT).as_posix() if args.input.resolve().is_relative_to(ROOT) else str(args.input.resolve()),
                       'source_sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
                       'solar_utc': data['solar']['selected']['utc'], 'solar_timezone': data['solar']['timeZone'],
                       'placement_assumption': data['placement']['assumption'],
                       'cutaway': 'Camera rays only; complete walls, ceiling and neighbours still cast shadows',
                       'render_model': 'Cycles CPU; clear glass; approximate diffuse sky; canonical geometry and astronomical sun'}.items():
        scene[key] = value
    embedded = bpy.data.texts.new('t3-project.json · complete source snapshot')
    embedded.write(json.dumps(data, indent=2, ensure_ascii=False))
    source = bpy.data.texts.new('assemble_project.py · adapter source')
    source.write(Path(__file__).read_text())
    bpy.context.view_layer.update()
    from mathutils import Vector
    actual_direction = -(sun.matrix_world.to_quaternion() @ Vector((0, 0, -1)))
    wanted_direction = Vector(site_to_blender(data['solar']['selected']['direction']))
    angular_error = actual_direction.angle(wanted_direction)
    fixture_count = sum('fixture_id' in obj for obj in scene.objects)
    if angular_error > 1e-5 or fixture_count != len(data['fixtures']) or any(obj.hide_render or not obj.visible_shadow for obj in context.objects):
        raise RuntimeError('Generated scene failed solar direction, fixture count, or physical context checks')
    output.parent.mkdir(parents=True, exist_ok=True)
    preview = args.render.resolve() if args.render else ROOT / 'artifacts/renders/t3-project.png'
    preview.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = "//" + preview.name
    scene.render.use_stamp_filename = False
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    report = {'status': 'passed', 'source': str(args.input.resolve()), 'output': str(output),
              'solarUTC': data['solar']['selected']['utc'], 'wallMeshes': wall_count, 'fixtures': fixture_count,
              'buildings': len(data['buildings']), 'objects': len(scene.objects), 'cameraOnlyCuts': sum(not obj.visible_camera for obj in scene.objects),
              'solarDirectionErrorRadians': angular_error, 'apartmentVolumeClear': True, 'allContextCastsShadows': True,
              'render': str(preview) if args.render else None}
    if args.render:
        scene.render.filepath = str(preview)
        bpy.ops.render.render(write_still=True)
        if not preview.is_file():
            raise RuntimeError('Renderer did not produce the requested preview')
    output.with_suffix('.validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0


if __name__ == '__main__':
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    raise SystemExit(main(arguments))
