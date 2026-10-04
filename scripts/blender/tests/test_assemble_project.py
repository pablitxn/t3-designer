"""Geometry boundary checks need ordinary Python, not the Blender runtime."""
import copy
import importlib.util
import json
import math
from pathlib import Path
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('assemble_project', SCRIPTS / 'assemble_project.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
ROOT = SCRIPTS.parents[1]


class ProjectAdapterTest(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads((ROOT / 'assets/scenes/t3-project.json').read_text())

    def test_site_axes_are_east_north_up_in_blender(self):
        self.assertEqual(adapter.site_to_blender([1, 2, 3]), (1, -3, 2))

    def test_placement_rotation_keeps_three_yaw_sign(self):
        result = adapter.apartment_to_site([1, 2, 3], {'position': [10, 20, 30], 'rotationY': math.pi / 2})
        for actual, expected in zip(result, [13, 22, 29]):
            self.assertAlmostEqual(actual, expected)

    def test_hinged_leaves_follow_persisted_side_and_clear_passages(self):
        wall = {'from': [0, 0], 'to': [4, 0]}
        door = {'width': .8, 'height': 2.1, 'offset': 1, 'hinge': 'start', 'opensToward': 1, 'appearance': 'panel'}
        leaf = adapter.door_leaf_pose(door, wall)
        self.assertAlmostEqual(leaf['rotationY'], -math.radians(76))
        self.assertGreater(leaf['position'][2], 0)
        door['opensToward'] = -1
        self.assertLess(adapter.door_leaf_pose(door, wall)['position'][2], 0)
        door['hinge'] = 'end'
        self.assertAlmostEqual(adapter.door_leaf_pose(door, wall)['rotationY'], -math.radians(76))
        door['appearance'] = 'passage'
        self.assertIsNone(adapter.door_leaf_pose(door, wall))

    def test_canonical_snapshot_keeps_rooms_clear(self):
        self.assertTrue(adapter.validate_snapshot(self.snapshot)['isTarget'])

    def test_conceptual_full_footprint_accepts_absent_side_context(self):
        self.snapshot['geometry']['contextSections']['before'] = []
        self.snapshot['geometry']['contextSections']['after'] = []
        self.assertFalse(adapter.point_in_ring((0, 0), []))
        self.assertTrue(adapter.validate_snapshot(self.snapshot)['isTarget'])

    def test_full_building_cannot_replace_empty_apartment_band(self):
        target = next(building for building in self.snapshot['buildings'] if building['isTarget'])
        self.snapshot['geometry']['contextSections']['before'] = copy.deepcopy(target['footprint'])
        with self.assertRaisesRegex(ValueError, 'fills part'):
            adapter.validate_snapshot(self.snapshot)

    def test_upper_and_lower_building_mass_cannot_enter_room_volume(self):
        for key, value in [('belowTop', 10), ('ceilingBase', 10)]:
            snapshot = copy.deepcopy(self.snapshot)
            snapshot['geometry']['contextSections'][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'intrudes'):
                adapter.validate_snapshot(snapshot)

    def test_invalid_solar_vector_is_rejected(self):
        self.snapshot['solar']['selected']['direction'] = [0, 4, 0]
        with self.assertRaisesRegex(ValueError, 'unit vector'):
            adapter.validate_snapshot(self.snapshot)

    def test_missing_fixture_asset_is_rejected(self):
        self.snapshot['fixtures'][0]['assetId'] = 'unavailable-asset'
        with self.assertRaisesRegex(ValueError, 'undeclared'):
            adapter.validate_snapshot(self.snapshot)

    def test_missing_or_duplicate_wall_solids_are_rejected(self):
        for change in ['missing', 'duplicate', 'empty', 'negative']:
            snapshot = copy.deepcopy(self.snapshot)
            walls = snapshot['geometry']['walls']
            if change == 'missing':
                walls.clear()
            elif change == 'duplicate':
                walls.append(copy.deepcopy(walls[0]))
            elif change == 'empty':
                walls[0]['solids'].clear()
            else:
                walls[0]['solids'][0]['scale'][0] = -1
            with self.subTest(change=change), self.assertRaises(ValueError):
                adapter.validate_snapshot(snapshot)

    def test_all_declared_asset_files_exist_inside_repository(self):
        self.assertEqual(len(adapter.asset_paths(self.snapshot)), len(self.snapshot['assets']))

    def test_asset_path_cannot_escape_repository(self):
        self.snapshot['assets'][0]['repoPath'] = '../../outside.glb'
        with self.assertRaisesRegex(ValueError, 'outside the repository'):
            adapter.asset_paths(self.snapshot)


if __name__ == '__main__':
    unittest.main()
