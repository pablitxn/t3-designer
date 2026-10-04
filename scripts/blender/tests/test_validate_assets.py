"""Container validation runs without Blender, third-party libraries, or assets."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'validate_assets.py'
spec = importlib.util.spec_from_file_location('validate_assets', MODULE)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def glb(document, binary=b'\0' * 12):
    data = json.dumps(document).encode()
    data += b' ' * (-len(data) % 4)
    chunks = struct.pack('<I4s', len(data), b'JSON') + data
    if binary is not None:
        chunks += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    return struct.pack('<4sII', b'glTF', 2, len(chunks) + 12) + chunks


def fixture():
    return {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 12}],
            'bufferViews': [{'buffer': 0, 'byteLength': 12}],
            'accessors': [{'count': 3, 'min': [-1, 0, -1], 'max': [1, 2, 1]}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}], 'nodes': [{}]}


class GLBValidationTest(unittest.TestCase):
    def test_parses_embedded_buffer(self):
        self.assertEqual(validator.parse_glb(glb(fixture())), fixture())

    def test_rejects_truncated_header_and_chunk(self):
        payload = glb(fixture())
        for invalid in [b'glTF', payload[:-1], payload[:20]]:
            with self.subTest(length=len(invalid)), self.assertRaises(ValueError):
                validator.parse_glb(invalid)

    def test_rejects_invalid_container_version_and_declared_length(self):
        payload = bytearray(glb(fixture()))
        struct.pack_into('<I', payload, 4, 1)
        with self.assertRaises(ValueError):
            validator.parse_glb(payload)
        payload = bytearray(glb(fixture()))
        struct.pack_into('<I', payload, 8, len(payload) + 8)
        with self.assertRaises(ValueError):
            validator.parse_glb(payload)

    def test_rejects_buffer_view_outside_buffer(self):
        document = fixture()
        document['bufferViews'][0]['byteLength'] = 13
        with self.assertRaisesRegex(ValueError, 'exceeds'):
            validator.parse_glb(glb(document))

    def test_rejects_unavailable_binary_buffer(self):
        with self.assertRaisesRegex(ValueError, 'BIN'):
            validator.parse_glb(glb(fixture(), binary=None))

    def test_rejects_misaligned_chunk(self):
        payload = bytearray(glb(fixture()))
        size = struct.unpack_from('<I', payload, 12)[0]
        struct.pack_into('<I', payload, 12, size - 1)
        with self.assertRaisesRegex(ValueError, 'alignment'):
            validator.parse_glb(payload)

    def test_manifest_dimensions_and_origin(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'fixture.glb'
            path.write_bytes(glb(fixture()))
            expected = {'dimensions': {'x': 2, 'y': 2, 'z': 2}}
            result = validator.audit_glb(path, root, {'fixture.glb'}, expected)
            self.assertEqual(result['errors'], [])
            expected['dimensions']['x'] = 3
            result = validator.audit_glb(path, root, {'fixture.glb'}, expected)
            self.assertIn('dimensions differ', result['errors'][0])

    def test_external_texture_must_be_present_and_tracked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'fixture.glb'
            texture = root / 'map.png'
            document = fixture()
            document['images'] = [{'uri': 'map.png'}]
            path.write_bytes(glb(document))
            self.assertTrue(validator.audit_glb(path, root, {'fixture.glb'})['errors'])
            texture.write_bytes(b'png')
            self.assertTrue(validator.audit_glb(path, root, {'fixture.glb'})['errors'])
            self.assertEqual(validator.audit_glb(path, root, {'fixture.glb', 'map.png'})['errors'], [])

    def test_network_resource_is_not_portable(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'fixture.glb'
            document = fixture()
            document['images'] = [{'uri': 'https://example.com/texture.png'}]
            path.write_bytes(glb(document))
            self.assertIn('Nonportable', validator.audit_glb(path, root, {'fixture.glb'})['errors'][0])


if __name__ == '__main__':
    unittest.main()
