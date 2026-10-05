"""Render compact catalog thumbnails from the existing GLBs, without reauthoring.

Run from the repository root (substitute your Blender executable as needed):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --disable-autoexec --python-exit-code 1 \
    --python scripts/blender/render_current_asset_previews.py

Optional arguments after `--`: --asset toilet --resolution 256 --samples 32.
The default run renders every current GLB to /models/current/previews/<id>.png.
PNG backgrounds are transparent; authored materials and geometry are preserved.
Only PNG previews and an audit report are written. No .blend or GLB is saved.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'apps/web/public/models/current'
OUTPUT = SOURCE / 'previews'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_asset(source: Path, output: Path, resolution: int, samples: int) -> dict:
    before = digest(source)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    if not meshes:
        raise ValueError(f'{source.name}: no mesh geometry')
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    lower = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
    upper = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
    target = (lower + upper) / 2
    size = max(upper - lower)
    if size <= 0:
        raise ValueError(f'{source.name}: empty bounding box')

    # The imported catalog uses Blender +Z up and -Y front (web +Y up, +Z front).
    camera_data = bpy.data.cameras.new('Catalog preview camera')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    camera.location = target + Vector((1.25, -2.6, 1.65)).normalized() * size * 4
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    rotation = camera.rotation_euler.to_quaternion()
    projected = [rotation.inverted() @ (corner - target) for corner in corners]
    min_x, max_x = min(p.x for p in projected), max(p.x for p in projected)
    min_y, max_y = min(p.y for p in projected), max(p.y for p in projected)
    camera.location += rotation @ Vector(((min_x + max_x) / 2, (min_y + max_y) / 2, 0))
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = max(max_x - min_x, max_y - min_y) * 1.18
    camera_data.clip_start = .001
    camera_data.clip_end = size * 20
    scene.camera = camera

    world = bpy.data.worlds.new('Neutral catalog studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.45, .45, .45, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    scene.world = world
    for name, offset, power in [
        ('Key', (-3, -4, 5), 550),
        ('Fill', (4, -2, 2), 300),
        ('Rim', (1, 4, 4), 450),
    ]:
        light_data = bpy.data.lights.new(f'Catalog {name}', 'AREA')
        light_data.energy = power * size * size
        light_data.size = size * 3
        light = bpy.data.objects.new(light_data.name, light_data)
        scene.collection.objects.link(light)
        light.location = target + Vector(offset) * size
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 90
    scene.render.film_transparent = True
    scene.render.use_stamp = False
    destination = output / f'{source.stem}.png'
    scene.render.filepath = str(destination)
    bpy.ops.render.render(write_still=True)
    if digest(source) != before:
        raise RuntimeError(f'{source.name}: source changed during preview generation')
    return {
        'id': source.stem,
        'source': f'/models/current/{source.name}',
        'sourceSha256': before,
        'preview': f'/models/current/previews/{destination.name}',
        'previewSha256': digest(destination),
        'bytes': destination.stat().st_size,
        'meshCount': len(meshes),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asset', action='append', help='Render only this asset ID; repeatable')
    parser.add_argument('--resolution', type=int, default=256)
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--report', type=Path, default=ROOT / 'artifacts/current-asset-previews/report.json')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not bpy.app.background:
        raise RuntimeError('Run in a separate Blender --background process')
    if not 64 <= args.resolution <= 1024 or not 1 <= args.samples <= 256:
        parser.error('Resolution must be 64–1024 and samples 1–256')
    sources = {path.stem: path for path in sorted(SOURCE.glob('*.glb'))}
    selected = args.asset or list(sources)
    if not selected or set(selected) - sources.keys():
        parser.error('Choose existing current GLB asset IDs')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for asset_id in dict.fromkeys(selected):
        entries.append(render_asset(sources[asset_id], OUTPUT, args.resolution, args.samples))
        print(f'T3_PREVIEW_READY {asset_id}', flush=True)
    report = {
        'blenderVersion': bpy.app.version_string,
        'scriptSha256': digest(Path(__file__)),
        'engine': 'Cycles CPU',
        'resolution': args.resolution,
        'samples': args.samples,
        'transparent': True,
        'assets': entries,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'T3_PREVIEWS_READY {len(entries)} assets; report: {args.report}', flush=True)


if __name__ == '__main__':
    main()
