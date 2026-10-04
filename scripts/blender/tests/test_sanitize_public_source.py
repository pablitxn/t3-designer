"""Model Blender RNA's observed C-string writes to catch metadata padding leaks."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class DirectoryParameters:
    def __init__(self, capacity=128):
        self.capacity = capacity
        self.buffer = bytearray(max(capacity, 128))
        self.bl_rna = SimpleNamespace(properties={'directory': SimpleNamespace(length_max=capacity)})
        self.directory = b'directory/private-marker/workspace'
        self.directory = b'//'

    @property
    def directory(self):
        return bytes(self.buffer).split(b'\0', 1)[0]

    @directory.setter
    def directory(self, value):
        # Like RNA, a shorter string writes its terminator but leaves the rest.
        value = value.split(b'\0', 1)[0][:max(0, self.capacity - 1)]
        self.buffer[:len(value) + 1] = value + b'\0'


class BrowserSpace:
    type = 'FILE_BROWSER'
    browse_mode = 'ASSETS'

    def __init__(self, files, assets):
        self.files = files
        self.assets = assets

    @property
    def params(self):
        return self.files if self.browse_mode == 'FILES' else None

    @property
    def asset_params(self):
        return self.assets if self.browse_mode == 'ASSETS' else None


class SanitizePublicSourceTest(unittest.TestCase):
    def setUp(self):
        self.files = DirectoryParameters()
        self.assets = DirectoryParameters()
        self.space = BrowserSpace(self.files, self.assets)
        screen = SimpleNamespace(areas=[SimpleNamespace(spaces=[self.space])])
        runtime = SimpleNamespace(data=SimpleNamespace(screens=[screen]))
        path = Path(__file__).resolve().parents[1] / 'sanitize_public_source.py'
        spec = importlib.util.spec_from_file_location('sanitizer_under_test', path)
        self.sanitizer = importlib.util.module_from_spec(spec)
        with patch.dict('sys.modules', {'bpy': runtime}):
            spec.loader.exec_module(self.sanitizer)

    def test_shortened_paths_leave_no_private_padding_in_either_browser_slot(self):
        for params in [self.files, self.assets]:
            self.assertIn(b'private-marker', params.buffer)
        self.sanitizer.clear_file_browser_state()
        for params in [self.files, self.assets]:
            self.assertEqual(params.directory, b'//')
            self.assertNotIn(b'private-marker', params.buffer)
        self.assertEqual(self.space.browse_mode, 'ASSETS')
        self.assertIs(self.space.files, self.files)
        self.assertIs(self.space.assets, self.assets)

    def test_unbounded_or_insufficient_capacity_fails_closed_and_restores_mode(self):
        for capacity in [0, 1, 2]:
            with self.subTest(capacity=capacity):
                self.space.files = DirectoryParameters(capacity)
                with self.assertRaisesRegex(RuntimeError, 'fixed capacity'):
                    self.sanitizer.clear_file_browser_state()
                self.assertEqual(self.space.browse_mode, 'ASSETS')


if __name__ == '__main__':
    unittest.main()
