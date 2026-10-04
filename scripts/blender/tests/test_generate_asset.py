"""Job boundary checks run without importing Blender or requiring a display."""
import copy
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('generate_asset', SCRIPTS / 'generate_asset.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class GenerateAssetTest(unittest.TestCase):
    def setUp(self):
        self.request = json.loads((SCRIPTS / 'fixtures/table-job.json').read_text())

    def test_job_is_metric_and_retains_provenance(self):
        request = worker.validate_request(self.request)
        self.assertEqual(request['dimensions'], [1.2, .75, .7])
        self.assertEqual(request['source']['dimensionalStatus'], 'estimated')

    def test_rejects_nonfinite_dimensions_units_and_unsafe_ids(self):
        for key, value in [('dimensions', [1, math.nan, 1]), ('dimensions', [1, True, 1]),
                           ('dimensions', [1, -1, 1]), ('dimensions', [1, 1]),
                           ('units', 'centimeters'), ('id', '../catalog'),
                           ('schemaVersion', True), ('kind', 'arbitrary-python')]:
            request = copy.deepcopy(self.request)
            request[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                worker.validate_request(request)

    def test_legs_cannot_overlap_or_escape_top(self):
        self.request['parameters']['legInset'] = .3
        with self.assertRaisesRegex(ValueError, 'Legs overlap'):
            worker.validate_request(self.request)

    def test_invalid_material_and_provenance_rejected(self):
        for key, value in [('material', {'baseColor': 'wood', 'roughness': .5}),
                           ('material', {'baseColor': '#ffffff', 'roughness': math.inf}),
                           ('source', {'url': 'file:///etc/passwd', 'description': 'Example', 'dimensionalStatus': 'estimated'}),
                           ('source', {'url': 'https://name:secret@example.com/a', 'description': 'Example', 'dimensionalStatus': 'estimated'})]:
            request = copy.deepcopy(self.request)
            request[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                worker.validate_request(request)

    def test_output_never_replaces_reference_or_prior_job(self):
        with self.assertRaisesRegex(ValueError, 'preserved sources'):
            worker.output_path(worker.ROOT / 'assets/blender/new-output')
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, 'already exists'):
                worker.output_path(temporary)
            self.assertEqual(worker.output_path(Path(temporary) / 'new-job'), (Path(temporary) / 'new-job').resolve())

    def test_support_surface_matches_the_top_in_web_axes(self):
        surface = worker.support_surfaces(self.request)[0]
        self.assertEqual(surface['position'], [0, .75, 0])
        self.assertEqual(surface['normal'], [0, 1, 0])
        self.assertAlmostEqual(surface['polygon'][0][0], -.596)
        self.assertAlmostEqual(surface['polygon'][0][1], -.346)

    def test_actual_export_validator_rejects_corrupt_glb(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'model.glb'
            path.write_bytes(b'not-a-glb')
            with self.assertRaisesRegex(ValueError, 'Export validation failed'):
                worker.audit_export(path, self.request['dimensions'])

    def test_chair_preserves_conflicting_source_measurements(self):
        request = json.loads((SCRIPTS / 'fixtures/strandmon-job.json').read_text())
        self.assertEqual(worker.validate_request(request)['dimensions'], [.82, 1.01, .96])
        self.assertEqual(request['source']['measurementPolicy'], 'source-text-provisional')
        self.assertEqual(request['source']['conflicts'][0]['illustrationWidthHeightDepth'], [.5, .43, .54])
        self.assertEqual(worker.support_surfaces(request), [])
        request['parameters']['seatDimensions'][0] = .9
        with self.assertRaises(ValueError):
            worker.validate_request(request)

    def test_procedural_recipe_accepts_data_and_bounds_geometry_complexity(self):
        self.request['kind'] = 'procedural'
        part = {'name': 'Screen', 'shape': 'box', 'dimensions': [1.2, .7, .04],
                'position': [0, .4, 0], 'rotation': [0, 0, 0], 'color': '#121212',
                'roughness': .4, 'metallic': .1, 'bevel': .004}
        self.request['parameters'] = {'parts': [part]}
        self.assertEqual(worker.validate_request(self.request)['kind'], 'procedural')
        for key, value in [('shape', 'python'), ('rotation', [0, math.nan, 0]),
                           ('dimensions', [1, 0, 1]), ('bevel', 2), ('color', 'exec(code)')]:
            request = copy.deepcopy(self.request)
            request['parameters']['parts'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                worker.validate_request(request)
        self.request['parameters']['parts'] = [part] * 129
        with self.assertRaises(ValueError):
            worker.validate_request(self.request)


if __name__ == '__main__':
    unittest.main()
