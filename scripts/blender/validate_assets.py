"""Read-only integrity audit of the repository's tracked Blender and GLB assets.

Run with ordinary Python, not inside the open Blender GUI:
    python3 scripts/blender/validate_assets.py
    python3 scripts/blender/validate_assets.py --blender /path/to/blender

Every .blend is opened with script execution disabled in its own background
process. Nothing is saved or rendered. The JSON report goes to a new temporary
directory by default; --report may select another untracked output file. This
checks asset integrity, not parity between historical .blend snapshots and the
current web scene, nor the physical validity of a lighting study.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]


def tracked_files(root: Path) -> list[str]:
    result = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'], check=True, capture_output=True)
    return result.stdout.decode().strip('\0').split('\0')


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_glb(payload: bytes) -> dict:
    """Read the GLB 2 container without trusting chunk lengths or header values."""
    if len(payload) < 20:
        raise ValueError('GLB header or first chunk is truncated')
    magic, version, length = struct.unpack_from('<4sII', payload)
    if magic != b'glTF' or version != 2 or length != len(payload):
        raise ValueError('Invalid GLB magic, version, or declared length')
    chunks = []
    offset = 12
    while offset < len(payload):
        if offset + 8 > len(payload):
            raise ValueError('Truncated GLB chunk header')
        size, kind = struct.unpack_from('<I4s', payload, offset)
        offset += 8
        if size % 4 or offset + size > len(payload):
            raise ValueError('Invalid GLB chunk size or alignment')
        chunks.append((kind, payload[offset:offset + size]))
        offset += size
    if not chunks or chunks[0][0] != b'JSON' or sum(kind == b'JSON' for kind, _ in chunks) != 1:
        raise ValueError('GLB must begin with exactly one JSON chunk')
    document = json.loads(chunks[0][1])
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0':
        raise ValueError('GLB JSON must describe glTF 2.0')
    binaries = [data for kind, data in chunks if kind == b'BIN\0']
    if len(binaries) > 1:
        raise ValueError('GLB contains multiple BIN chunks')
    for index, buffer in enumerate(document.get('buffers', [])):
        size = buffer.get('byteLength', -1)
        if not isinstance(size, int) or size < 0:
            raise ValueError('Invalid buffer byteLength')
        if 'uri' not in buffer:
            if index != 0 or not binaries or not size <= len(binaries[0]) <= size + 3:
                raise ValueError('Embedded buffer does not match the BIN chunk')
    for view in document.get('bufferViews', []):
        buffers = document.get('buffers', [])
        index = view.get('buffer', -1)
        if not isinstance(index, int) or not 0 <= index < len(buffers):
            raise ValueError('Buffer view references a missing buffer')
        start, size = view.get('byteOffset', 0), view.get('byteLength', -1)
        if not isinstance(start, int) or not isinstance(size, int) or start < 0 or size < 0 or start + size > buffers[index]['byteLength']:
            raise ValueError('Buffer view exceeds its buffer')
    return document


def resource_status(path: Path, root: Path, tracked: set[str]) -> dict:
    resolved = path.resolve()
    relative = resolved.relative_to(root.resolve()).as_posix() if resolved.is_relative_to(root.resolve()) else None
    return {'path': str(resolved), 'exists': resolved.is_file(), 'inRepository': relative is not None,
            'tracked': relative in tracked if relative else False}


def audit_glb(path: Path, root: Path, tracked: set[str], expected: dict | None = None) -> dict:
    if not path.is_file():
        return {'file': path.relative_to(root).as_posix(), 'errors': ['Tracked GLB is missing from disk']}
    result = {'file': path.relative_to(root).as_posix(), 'sha256': digest(path), 'bytes': path.stat().st_size,
              'errors': [], 'externalResources': []}
    try:
        document = parse_glb(path.read_bytes())
        meshes = document.get('meshes', [])
        if not meshes:
            raise ValueError('GLB has no meshes')
        accessors = document.get('accessors', [])
        bounds = []
        triangles = 0
        for mesh in meshes:
            for primitive in mesh.get('primitives', []):
                position = accessors[primitive['attributes']['POSITION']]
                lo, hi = position['min'], position['max']
                if len(lo) != 3 or len(hi) != 3 or not all(math.isfinite(v) for v in lo + hi) or any(a > b for a, b in zip(lo, hi)):
                    raise ValueError('Invalid position bounds')
                bounds.append((lo, hi))
                if primitive.get('mode', 4) == 4:
                    count = accessors[primitive['indices']]['count'] if 'indices' in primitive else position['count']
                    triangles += count // 3
        if not bounds:
            raise ValueError('GLB has no position geometry')
        result.update(meshes=len(meshes), triangles=triangles, materials=len(document.get('materials', [])),
                      images=len(document.get('images', [])), cameras=len(document.get('cameras', [])),
                      lights=len(document.get('extensions', {}).get('KHR_lights_punctual', {}).get('lights', [])))
        for resource in document.get('images', []) + document.get('buffers', []):
            uri = resource.get('uri')
            if not uri or uri.startswith('data:'):
                continue
            parsed = urlparse(uri)
            if parsed.scheme or parsed.netloc:
                result['errors'].append(f'Nonportable external URI: {uri}')
                continue
            status = resource_status(path.parent / unquote(parsed.path), root, tracked)
            result['externalResources'].append(status)
            if not all(status[key] for key in ['exists', 'inRepository', 'tracked']):
                result['errors'].append(f'Missing or untracked external resource: {uri}')
        if expected:
            # The current fixture pipeline bakes node transforms before export.
            # Accessor bounds can therefore be compared directly to the manifest.
            if any(set(node) & {'matrix', 'translation', 'rotation', 'scale'} for node in document.get('nodes', [])):
                raise ValueError('Fixture node transforms are not baked')
            lower = [min(pair[0][axis] for pair in bounds) for axis in range(3)]
            upper = [max(pair[1][axis] for pair in bounds) for axis in range(3)]
            dimensions = [upper[axis] - lower[axis] for axis in range(3)]
            declared = [expected['dimensions'][axis] for axis in ['x', 'y', 'z']]
            if any(abs(a - b) > 1e-5 for a, b in zip(dimensions, declared)):
                raise ValueError(f'Manifest dimensions differ: {dimensions} != {declared}')
            if abs(lower[1]) > 1e-5 or abs(lower[0] + upper[0]) > 1e-5 or abs(lower[2] + upper[2]) > 1e-5:
                raise ValueError('Fixture origin is not floor-centred')
            if result['cameras'] or result['lights']:
                raise ValueError('Fixture GLB contains studio cameras or lights')
            result['dimensions'] = dimensions
    except (ValueError, KeyError, IndexError, TypeError, struct.error) as error:
        result['errors'].append(str(error))
    return result


def inspect_blend(path: Path, output: Path) -> None:
    """Executed only by the isolated background Blender child process."""
    import bpy
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    resources = sorted(set(bpy.utils.blend_paths(absolute=True, packed=False)))
    libraries = []
    for library in bpy.data.libraries:
        users = {}
        for prop in bpy.data.bl_rna.properties:
            if prop.type != 'COLLECTION':
                continue
            names = [item.name for item in getattr(bpy.data, prop.identifier, []) if getattr(item, 'library', None) == library]
            if names:
                users[prop.identifier] = names
        libraries.append({'path': bpy.path.abspath(library.filepath), 'dataTypes': users})
    scenes = []
    for scene in bpy.data.scenes:
        counts = Counter(obj.type for obj in scene.objects)
        lights = [{'name': obj.name, 'type': obj.data.type, 'energy': obj.data.energy,
                   'animated': bool(obj.animation_data or obj.data.animation_data), 'hiddenForRender': obj.hide_render}
                  for obj in scene.objects if obj.type == 'LIGHT']
        collections = [{'name': col.name, 'hiddenForRender': col.hide_render, 'objects': len(col.all_objects)}
                       for col in scene.collection.children]
        scenes.append({'name': scene.name, 'objectCount': len(scene.objects), 'objectTypes': dict(counts),
                       'activeCamera': scene.camera.name if scene.camera else None,
                       'cameras': [obj.name for obj in scene.objects if obj.type == 'CAMERA'],
                       'lights': lights, 'world': scene.world.name if scene.world else None,
                       'frameRange': [scene.frame_start, scene.frame_end], 'currentFrame': scene.frame_current,
                       'collections': collections, 'renderEngine': scene.render.engine,
                       'properties': {key: scene[key] for key in scene.keys() if isinstance(scene[key], (str, int, float, bool))}})
    result = {'blenderVersion': bpy.app.version_string, 'scenes': scenes,
              'externalPaths': resources, 'images': [{'name': image.name, 'source': image.source,
                 'packed': bool(image.packed_file or image.packed_files)} for image in bpy.data.images],
              'linkedLibraries': libraries,
              'blenderResources': [bpy.utils.resource_path(kind) for kind in ['LOCAL', 'SYSTEM']],
              'embeddedTexts': [text.name for text in bpy.data.texts]}
    output.write_text(json.dumps(result, indent=2) + '\n')


def audit_blend(path: Path, blender: str | None, scratch: Path, root: Path, tracked: set[str]) -> dict:
    label = path.relative_to(root).as_posix() if path.is_relative_to(root) else str(path)
    if not path.is_file():
        return {'file': label, 'errors': ['Requested .blend is missing from disk'], 'warnings': []}
    before = digest(path)
    result = {'file': label, 'sha256': before, 'bytes': path.stat().st_size,
              'errors': [], 'warnings': []}
    if not blender:
        result['errors'].append('Blender executable not found; loading has not been verified')
        return result
    output = scratch / (path.stem + '.json')
    command = [blender, '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1',
               '--python', str(Path(__file__).resolve()), '--', '--inspect-blend', str(path), '--report', str(output)]
    try:
        process = subprocess.run(command, capture_output=True, text=True, timeout=120)
        if process.returncode != 0 or not output.exists():
            result['errors'].append(f'Blender inspection failed (exit {process.returncode}): {(process.stdout + process.stderr)[-2500:]}')
        else:
            details = json.loads(output.read_text())
            result.update(details)
            resources = [resource_status(Path(resource), root, tracked) for resource in details.pop('externalPaths')]
            result.pop('externalPaths', None)
            result['externalResources'] = resources
            for resource in resources:
                library = next((item for item in details['linkedLibraries'] if str(Path(item['path']).resolve()) == resource['path']), None)
                resource_path = Path(resource['path'])
                # Blender also saves weak references to asset-shelf brushes;
                # those have no linked data blocks at all. They are editing
                # tools shipped by Blender, not geometry used by the scene.
                bundled_brush = ((not library or set(library['dataTypes']) == {'brushes'})
                                 and resource_path.name.startswith('essentials_brushes-')
                                 and resource_path.parent.name == 'brushes'
                                 and any(folder and resource_path.is_relative_to(Path(folder)) for folder in details['blenderResources'])
                                 and resource['exists'])
                if bundled_brush:
                    resource['purpose'] = 'Bundled Blender editing brush; not a render dependency'
                    result['warnings'].append('Optional brush library comes from this Blender installation; scene rendering does not use it')
                    continue
                if not all(resource[key] for key in ['exists', 'inRepository', 'tracked']):
                    result['errors'].append(f'Missing or nonportable dependency: {resource["path"]}')
            for scene in details['scenes']:
                if not scene['activeCamera']:
                    result['warnings'].append(f'{scene["name"]}: no active render camera')
                if not scene['lights'] and not scene['world']:
                    result['warnings'].append(f'{scene["name"]}: no lights or world')
    except (subprocess.TimeoutExpired, OSError, ValueError) as error:
        result['errors'].append(f'Blender inspection failed: {error}')
    result['unchanged'] = digest(path) == before
    if not result['unchanged']:
        result['errors'].append('Input file changed during read-only validation')
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blender', default=os.environ.get('BLENDER_BIN'), help='Blender executable; otherwise auto-detected')
    parser.add_argument('--report', type=Path, help='JSON output outside tracked files; default is a fresh temporary directory')
    parser.add_argument('--blend', type=Path, action='append', default=[], help='Also audit an explicit generated .blend; may be repeated')
    parser.add_argument('--inspect-blend', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.inspect_blend:
        if not args.report:
            parser.error('The internal inspector requires --report')
        inspect_blend(args.inspect_blend, args.report)
        return 0
    tracked = set(tracked_files(ROOT))
    if args.report and (args.report.resolve() in {ROOT / name for name in tracked} or args.report.suffix == '.blend'):
        parser.error('Report must not overwrite a tracked file or a .blend')
    blender = args.blender or shutil.which('blender')
    mac_binary = Path('/Applications/Blender.app/Contents/MacOS/Blender')
    if not blender and mac_binary.is_file():
        blender = str(mac_binary)
    scratch = Path(tempfile.mkdtemp(prefix='t3-assets-audit-'))
    report_path = args.report or scratch / 'report.json'
    manifest_path = 'apps/web/public/models/current/manifest.json'
    manifest = json.loads((ROOT / manifest_path).read_text())
    expected = {f'apps/web/public{asset["url"]}': asset for asset in manifest['assets']}
    errors = [f'Manifest references an untracked GLB: {name}' for name in expected if name not in tracked]
    blend_paths = {ROOT / name for name in tracked if name.endswith('.blend')} | {path.resolve() for path in args.blend}
    blends = [audit_blend(path, blender, scratch, ROOT, tracked) for path in sorted(blend_paths)]
    glbs = [audit_glb(ROOT / name, ROOT, tracked, expected.get(name)) for name in sorted(tracked) if name.endswith('.glb')]
    if not blends or not glbs:
        errors.append('Expected tracked .blend and .glb assets, but one set is empty')
    passed = not errors and all(not item['errors'] for item in blends + glbs)
    report = {'status': 'passed' if passed else 'failed', 'readOnly': True, 'blenderExecutable': blender,
              'scope': 'File integrity and portable resources; not current web/Blender scene parity or lighting accuracy',
              'errors': errors, 'blendCount': len(blends), 'glbCount': len(glbs), 'blends': blends, 'glbs': glbs}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'status': report['status'], 'blendCount': len(blends), 'glbCount': len(glbs),
                      'errorCount': len(errors) + sum(len(item['errors']) for item in blends + glbs),
                      'report': str(report_path)}, indent=2))
    return 0 if passed else 1


if __name__ == '__main__':
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    raise SystemExit(main(arguments))
