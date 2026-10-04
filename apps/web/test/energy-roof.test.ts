import assert from 'node:assert/strict'
import test from 'node:test'
import { Euler, Vector3 } from 'three'
import { createRoofSolarLayout, roofHeightAt, roofSurfaceFromBuilding, TARGET_SOLAR_ROOF } from '../src/energy/roof-layout.ts'
import type { SitePoint } from '../src/data/building-site.ts'

const rectangle = (width = 12, length = 10, rise = 0) => roofSurfaceFromBuilding({ footprint: [[-width / 2, -length / 2], [width / 2, -length / 2], [width / 2, length / 2], [-width / 2, length / 2]], height: 6, roofHeight: rise })
const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`)

test('the fitted installation caps requested production count and keeps every tilted module within setback', () => {
  const layout = createRoofSolarLayout(rectangle(), { panelCount: 1000, tiltDeg: 35, azimuthDeg: 147, edgeSetbackM: .75 })
  assert.ok(layout.installedCount > 0)
  assert.equal(layout.installedCount, layout.maxPanelCount)
  assert.equal(layout.requestedCount, 1000)
  assert.equal(layout.limitedByRoof, true)
  for (const panel of layout.panels) for (const [x, , z] of panel.corners) {
    assert.ok(Math.abs(x) <= 6 - .75 + 1e-8)
    assert.ok(Math.abs(z) <= 5 - .75 + 1e-8)
  }
  near(layout.panelAreaM2, layout.installedCount * 1.134 * 1.762)
  near(layout.footprintAreaM2, 120)
})

test('render Euler, physical dimensions and normal share true north/east/south/west conventions', () => {
  for (const azimuth of [0, 90, 180, 270]) {
    const layout = createRoofSolarLayout(rectangle(), { panelCount: 1, tiltDeg: 30, azimuthDeg: azimuth })
    const panel = layout.panels[0]
    const normal = new Vector3(0, 1, 0).applyEuler(new Euler(...panel.rotation, 'YXZ'))
    near(normal.x, panel.normal[0]); near(normal.y, Math.sqrt(3) / 2); near(normal.z, panel.normal[2])
    const expected: [number, number][] = [[0, -.5], [.5, 0], [0, .5], [-.5, 0]]
    near(normal.x, expected[azimuth / 90][0]); near(normal.z, expected[azimuth / 90][1])
    const [a, b, c] = panel.corners.map(point => new Vector3(...point))
    near(a.distanceTo(b), layout.panelWidthM)
    near(b.distanceTo(c), layout.panelLengthM)
  }
})

test('panels clear a pitched ridge across their full surfaces and support legs meet the roof', () => {
  const roof = rectangle(12, 10, 2)
  const layout = createRoofSolarLayout(roof, { panelCount: 100, tiltDeg: 8, azimuthDeg: 35 })
  assert.ok(layout.panels.length > 10)
  for (const panel of layout.panels) {
    // Sampling the actual rectangle interior catches a roof ridge hidden between corners.
    const [a, b, , d] = panel.corners
    for (let u = 0; u <= 10; u++) for (let v = 0; v <= 10; v++) {
      const point = a.map((value, i) => value + (b[i] - value) * u / 10 + (d[i] - value) * v / 10)
      assert.ok(point[1] - roofHeightAt(roof, [point[0], point[2]]) >= .15)
    }
    for (const { bottom, top } of panel.supports) {
      near(bottom[1], roofHeightAt(roof, [bottom[0], bottom[2]]))
      assert.ok(top[1] > bottom[1])
    }
  }
})

test('courtyards and a concave roof notch cannot be bridged by panel edges', () => {
  const hole: SitePoint[] = [[-.2, -.2], [.2, -.2], [.2, .2], [-.2, .2]]
  const roof = roofSurfaceFromBuilding({ footprint: [[-6, -5], [6, -5], [6, 5], [.5, 5], [.5, 2], [-.5, 2], [-.5, 5], [-6, 5]], holes: [hole], height: 4, roofHeight: 0 })
  const layout = createRoofSolarLayout(roof, { panelCount: 100, tiltDeg: 0, azimuthDeg: 180, edgeSetbackM: .1, columnGapM: .1, rowGapM: .1 })
  assert.ok(layout.panels.length > 0)
  for (const panel of layout.panels) {
    const xs = panel.corners.map(p => p[0]), zs = panel.corners.map(p => p[2])
    assert.ok(Math.max(...xs) < -.2 || Math.min(...xs) > .2 || Math.max(...zs) < -.2 || Math.min(...zs) > .2)
    assert.ok(Math.max(...xs) < -.5 || Math.min(...xs) > .5 || Math.max(...zs) < 2)
  }
  near(layout.footprintAreaM2, 116.84)
})

test('zero count and unusably small roofs remain valid without invented panels', () => {
  assert.equal(createRoofSolarLayout(rectangle(), { panelCount: 0, tiltDeg: 30, azimuthDeg: 180 }).installedCount, 0)
  const tiny = createRoofSolarLayout(rectangle(.5, .5), { panelCount: 12, tiltDeg: 30, azimuthDeg: 180 })
  assert.equal(tiny.installedCount, 0)
  assert.equal(tiny.maxPanelCount, 0)
  assert.equal(tiny.limitedByRoof, true)
  assert.throws(() => createRoofSolarLayout(rectangle(), { panelCount: NaN, tiltDeg: 30, azimuthDeg: 180 }), RangeError)
  assert.throws(() => createRoofSolarLayout(rectangle(), { panelCount: 1, tiltDeg: 91, azimuthDeg: 180 }), RangeError)
})

test('vertical 90 degree modules have finite capacity and a horizontal normal', () => {
  const layout = createRoofSolarLayout(rectangle(), { panelCount: 12, tiltDeg: 90, azimuthDeg: 90 })
  assert.equal(layout.installedCount, 12)
  assert.ok(Number.isFinite(layout.maxPanelCount))
  for (const panel of layout.panels) {
    near(panel.normal[0], 1); near(panel.normal[1], 0); near(panel.normal[2], 0)
    assert.ok(panel.corners.flat().every(Number.isFinite))
    near(new Vector3(...panel.corners[1]).distanceTo(new Vector3(...panel.corners[2])), layout.panelLengthM)
  }
})

test('T3 mounts use its inferred low pitch roof and remain finite for all cardinal orientations', () => {
  near(TARGET_SOLAR_ROOF.eaveHeightM, 15.5)
  near(TARGET_SOLAR_ROOF.riseM, .8)
  for (const azimuthDeg of [0, 90, 180, 270]) {
    const layout = createRoofSolarLayout(TARGET_SOLAR_ROOF, { panelCount: 12, tiltDeg: 30, azimuthDeg })
    assert.equal(layout.installedCount, 12)
    assert.ok(layout.maxPanelCount >= 12)
    assert.ok(layout.panels.every(panel => panel.corners.flat().every(Number.isFinite)))
  }
})
