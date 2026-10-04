"""Validate the GLB handoff without Blender or third-party dependencies."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'apps/web/public/models/current'
manifest = json.loads((FOLDER / 'manifest.json').read_text())
results = []
for asset in manifest['assets']:
    payload = (FOLDER / (asset['id'] + '.glb')).read_bytes()
    assert payload[:4] == b'glTF', asset['id']
    length = struct.unpack_from('<I', payload, 12)[0]
    gltf = json.loads(payload[20:20 + length])
    accessors = gltf['accessors']
    bounds = []
    triangles = 0
    for node in gltf['nodes']:
        assert not set(node).intersection(['matrix', 'translation', 'rotation', 'scale']), asset['id']
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            position = accessors[primitive['attributes']['POSITION']]
            bounds.append((position['min'], position['max']))
            triangles += accessors[primitive['indices']]['count'] // 3
    lower = [min(b[0][i] for b in bounds) for i in range(3)]
    upper = [max(b[1][i] for b in bounds) for i in range(3)]
    dimensions = [upper[i] - lower[i] for i in range(3)]
    expected = [asset['dimensions'][axis] for axis in ['x', 'y', 'z']]
    assert all(abs(x-y) < 1e-5 for x, y in zip(dimensions, expected)), (asset['id'], dimensions, expected)
    assert abs(lower[1]) < 1e-5, (asset['id'], 'floor origin')
    assert abs(lower[0] + upper[0]) < 1e-5 and abs(lower[2] + upper[2]) < 1e-5, (asset['id'], 'centered origin')
    assert all('uri' not in image for image in gltf.get('images', [])), asset['id']
    assert not gltf.get('cameras'), asset['id']
    results.append({'id': asset['id'], 'bounds': dimensions, 'triangles': triangles,
                    'bytes': len(payload), 'embeddedTextures': len(gltf.get('images', []))})
report = {
    'status': 'passed', 'assetCount': len(results),
    'totalTriangles': sum(r['triangles'] for r in results),
    'totalBytes': sum(r['bytes'] for r in results),
    'checks': ['exact declared metric bounds', 'floor origin', 'centered horizontally',
               'identity node transforms', 'textures embedded', 'no cameras'],
    'assets': results,
}
(ROOT / 'assets/blender/current-assets-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'assets'}, indent=2))
