"""Publish a metadata-clean copy of an existing Blender source without rebuilding geometry.

Run in Blender with --background --factory-startup --disable-autoexec --python
scripts/blender/sanitize_public_source.py -- --input original.blend --output clean.blend
--replacements /private/path/replacements.json. Keep original private inputs separately.
This writes only the explicit output and checks geometry after reopening it. Publication
still requires the repository artifact audit and a review of visible labels and renders.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import bpy


def clear_file_browser_state():
    """Clear saved browser directories, including unused bytes after their terminator."""
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type != 'FILE_BROWSER':
                    continue
                previous = space.browse_mode
                try:
                    for mode in ['FILES', 'ASSETS']:
                        space.browse_mode = mode
                        params = space.params if mode == 'FILES' else getattr(space, 'asset_params', None) or space.params
                        if params:
                            capacity = params.bl_rna.properties['directory'].length_max
                            if capacity < 3:
                                raise RuntimeError('File-browser directory requires a fixed capacity for safe metadata clearing')
                            # RNA treats embedded NUL as the end of the input. A
                            # full non-sensitive value overwrites the entire old
                            # buffer before the relative path replaces its prefix.
                            params.directory = b'_' * (capacity - 1)
                            params.directory = b'//'
                finally:
                    space.browse_mode = previous


def geometry_fingerprint():
    """Order-independent fingerprints of authored geometry, transforms and material graphs."""
    if bpy.context.window and bpy.data.scenes:
        scene = max(bpy.data.scenes, key=lambda item: len(item.objects))
        bpy.context.window.scene = scene
        scene.frame_set(scene.frame_current)
    for scene in bpy.data.scenes:
        for layer in scene.view_layers:
            layer.update()
    values = []
    for mesh in bpy.data.meshes:
        values.append(('mesh', [tuple(v.co) for v in mesh.vertices],
                       [tuple(p.vertices) for p in mesh.polygons],
                       [(p.material_index, p.use_smooth) for p in mesh.polygons],
                       [[tuple(item.uv) for item in layer.data] for layer in mesh.uv_layers]))
    for curve in bpy.data.curves:
        if hasattr(curve, 'body'):
            # Only font content is deliberately permitted to change during anonymization.
            values.append(('font', curve.size, curve.extrude, curve.bevel_depth, curve.align_x))
        else:
            values.append(('curve', curve.dimensions, curve.extrude, curve.bevel_depth,
                           [[tuple(p.co) for p in spline.points] for spline in curve.splines]))
    for obj in bpy.data.objects:
        values.append(('object', obj.type, [tuple(row) for row in obj.matrix_world],
                       obj.hide_render, obj.visible_camera, obj.visible_shadow,
                       [(modifier.type, modifier.show_render) for modifier in obj.modifiers]))
    for light in bpy.data.lights:
        values.append(('light', light.type, light.energy, tuple(light.color), light.use_shadow))
    for camera in bpy.data.cameras:
        values.append(('camera', camera.type, camera.lens, camera.ortho_scale, camera.clip_start, camera.clip_end))
    for material in bpy.data.materials:
        nodes = []
        if material.use_nodes:
            for node in material.node_tree.nodes:
                sockets = []
                for socket in node.inputs:
                    if hasattr(socket, 'default_value'):
                        value = socket.default_value
                        sockets.append((socket.identifier, list(value) if hasattr(value, '__len__') and not isinstance(value, str) else value))
                nodes.append((node.bl_idname, sockets))
        values.append(('material', tuple(material.diffuse_color), material.roughness, material.metallic, nodes))
    for action in bpy.data.actions:
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    for curve in bag.fcurves:
                        curves.append((curve.data_path, curve.array_index,
                                       [(tuple(p.co), tuple(p.handle_left), tuple(p.handle_right), p.interpolation) for p in curve.keyframe_points]))
        values.append(('animation', curves))
    serialized = sorted(json.dumps(value, sort_keys=True, default=str) for value in values)
    return hashlib.sha256('\n'.join(serialized).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--replacements', type=Path, required=True)
    parser.add_argument('--latitude', type=float)
    parser.add_argument('--longitude', type=float)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.input.resolve() == args.output.resolve():
        parser.error('Preserve the original: input and output must differ')
    replacements = json.loads(args.replacements.read_text())
    bpy.ops.wm.open_mainfile(filepath=str(args.input.resolve()), load_ui=False, use_scripts=False)
    before = geometry_fingerprint()
    scene_counts = sorted(len(scene.objects) for scene in bpy.data.scenes)

    def clean(value):
        if isinstance(value, str):
            for old, new in sorted(replacements.items(), key=lambda item: -len(item[0])):
                value = value.replace(old, new)
        return value

    ids = set()
    for property in bpy.data.bl_rna.properties:
        if property.type != 'COLLECTION' or property.identifier in {'screens', 'workspaces', 'window_managers', 'libraries', 'brushes'}:
            continue
        for block in list(getattr(bpy.data, property.identifier)):
            if not isinstance(block, bpy.types.ID) or isinstance(block, (bpy.types.Screen, bpy.types.WorkSpace, bpy.types.WindowManager)) or block.library:
                continue
            ids.add(block)
            if clean(block.name) != block.name:
                block.name = clean(block.name)
            for key in list(block.keys()):
                if isinstance(block[key], str):
                    block[key] = clean(block[key])
            if isinstance(block, bpy.types.Text):
                text = clean(block.as_string())
                block.clear()
                block.write(text)
                block.filepath = ''
            if hasattr(block, 'body'):
                block.body = clean(block.body)
    for action in bpy.data.actions:
        for slot in action.slots:
            slot.name_display = clean(slot.name_display)
    for scene in bpy.data.scenes:
        if 'latitude' in scene and args.latitude is not None:
            scene['latitude'] = args.latitude
            scene['solar_note'] = 'Geographic origin generalized for the public demonstration. Historical lighting animation retained, not recalculated.'
        if 'longitude' in scene and args.longitude is not None:
            scene['longitude'] = args.longitude
        scene.render.filepath = '//' + Path(scene.render.filepath).name
        scene.render.use_stamp_filename = False
    if geometry_fingerprint() != before:
        raise RuntimeError('Sanitization changed authored geometry or materials before save')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Remove local file-browser state without altering scene data or viewport settings.
    clear_file_browser_state()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.data.libraries.write(str(args.output.resolve()), ids, path_remap='RELATIVE', fake_user=True, compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.output.resolve()), load_ui=False, use_scripts=False)
    after = geometry_fingerprint()
    if before != after or scene_counts != sorted(len(scene.objects) for scene in bpy.data.scenes):
        raise RuntimeError(f'Saved source failed preservation checks: {before} != {after}; scenes {scene_counts} -> {sorted(len(scene.objects) for scene in bpy.data.scenes)}')
    # Write a normal interactive file with the authored scene active, after the
    # library round-trip has discarded obsolete external asset-shelf references.
    clear_file_browser_state()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), check_existing=False, compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.output.resolve()), load_ui=False, use_scripts=False)
    if geometry_fingerprint() != before:
        raise RuntimeError('Final interactive save changed geometry, materials, lighting or animation')
    print(json.dumps({'status': 'passed', 'output': str(args.output), 'geometryFingerprint': after,
                      'sceneObjectCounts': scene_counts, 'readBackVerified': True}))


if __name__ == '__main__':
    main()
