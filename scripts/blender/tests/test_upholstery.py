import importlib.util
import math
from pathlib import Path
import unittest
from collections import Counter

spec = importlib.util.spec_from_file_location('upholstery', Path(__file__).resolve().parents[1] / 'upholstery.py')
upholstery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upholstery)


class UpholsteryTest(unittest.TestCase):
    def test_cushion_retains_full_envelope_and_has_bounded_geometry(self):
        vertices, faces = upholstery.cushion_mesh([.6, .15, .5], {'roundness': .3, 'tuftRows': 2, 'tuftColumns': 2})
        self.assertLess(len(vertices), 8000)
        self.assertTrue(all(math.isfinite(value) for vertex in vertices for value in vertex))
        self.assertTrue(all(0 <= index < len(vertices) for face in faces for index in face))
        for axis, expected in enumerate([.6, .5, .15]):
            extent = max(v[axis] for v in vertices) - min(v[axis] for v in vertices)
            self.assertAlmostEqual(extent, expected, delta=.004)

    def test_tufting_changes_the_visible_surface_not_only_a_material(self):
        plain, _ = upholstery.cushion_mesh([.6, .15, .5], {'roundness': .3})
        tufted, _ = upholstery.cushion_mesh([.6, .15, .5], {'roundness': .3, 'tuftRows': 2, 'tuftColumns': 2})
        depression = max(a[2] - b[2] for a, b in zip(plain[:4514], tufted[:4514]))
        self.assertGreater(depression, .012)
        self.assertGreater(len(tufted), len(plain))

    def test_all_cushion_shells_are_closed_including_square_profiles(self):
        _, faces = upholstery.cushion_mesh([.6, .15, .5], {'roundness': .15, 'tuftRows': 2, 'tuftColumns': 2})
        edges = Counter(tuple(sorted((face[i], face[(i+1) % len(face)]))) for face in faces for i in range(len(face)))
        self.assertTrue(all(count == 2 for count in edges.values()))


if __name__ == '__main__':
    unittest.main()
