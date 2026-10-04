import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

export type FloorFinish = 'parquet' | 'slate' | 'ivory-tile' | 'entry-tile' | 'balcony'
type Surface = { color: CanvasTexture; relief: CanvasTexture; roughness: number }
const surfaces = new Map<FloorFinish, Surface>()

function randomSequence(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const context = element.getContext('2d')
  if (!context) throw new Error('Surface texture generation requires a 2D canvas.')
  return { element, context }
}

function texture(element: HTMLCanvasElement, metersWide: number, metersLong: number, color = false) {
  const map = new CanvasTexture(element)
  map.wrapS = map.wrapT = RepeatWrapping
  // ShapeGeometry UVs use world meters, so boards and tile joints stay the same
  // size in every room, including the concave bathroom footprint.
  map.repeat.set(1 / metersWide, 1 / metersLong)
  map.anisotropy = 8
  if (color) map.colorSpace = SRGBColorSpace
  return map
}

function parquet(): Surface {
  const { element, context: c } = canvas(1024, 2048)
  const { element: relief, context: r } = canvas(1024, 2048)
  const rng = randomSequence(78236)
  const width = 1024 / 12
  c.fillStyle = '#59452e'
  c.fillRect(0, 0, 1024, 2048)
  r.fillStyle = '#686868'
  r.fillRect(0, 0, 1024, 2048)

  for (let column = 0; column < 12; column++) {
    const x = column * width
    let y = -(180 + rng() * 530)
    while (y < 2048) {
      const length = 420 + rng() * 540
      const tone = rng()
      const hue = 30 + rng() * 6
      c.fillStyle = `hsl(${hue} ${39 + rng() * 9}% ${30 + tone * 12}%)`
      c.fillRect(x + 0.85, y + 0.7, width - 1.7, length - 1.4)
      r.fillStyle = `rgb(${177 + tone * 35},${177 + tone * 35},${177 + tone * 35})`
      r.fillRect(x + 1, y + 1, width - 2, length - 2)
      c.save()
      c.beginPath()
      c.rect(x + 1, y + 1, width - 2, length - 2)
      c.clip()

      // Fine, irregular longitudinal grain, with broad translucent fibres below.
      // This remains a material reconstruction, never a photograph of the floor.
      for (let grain = 0; grain < 58; grain++) {
        const gx = x + rng() * width
        const drift = (rng() - 0.5) * 15
        c.strokeStyle = `rgba(${rng() > 0.25 ? '70,43,17' : '245,213,162'},${0.035 + rng() * 0.12})`
        c.lineWidth = grain % 6 === 0 ? 3 : 0.5 + rng()
        c.beginPath()
        c.moveTo(gx, y)
        c.bezierCurveTo(gx + drift, y + length * 0.25, gx - drift * 0.6, y + length * 0.7, gx + drift * 0.3, y + length)
        c.stroke()
      }
      if (rng() > 0.62) {
        const kx = x + width * (0.2 + rng() * 0.6)
        const ky = y + length * (0.25 + rng() * 0.5)
        for (let ring = 1; ring < 6; ring++) {
          c.strokeStyle = `rgba(70,42,19,${0.15 - ring * 0.017})`
          c.lineWidth = 0.85
          c.beginPath()
          c.ellipse(kx, ky, ring * 2.1, ring * 9, 0.02, 0, Math.PI * 2)
          c.stroke()
        }
      }
      c.restore()
      c.fillStyle = 'rgba(243,214,167,0.14)'
      c.fillRect(x + 1, y + 1, 0.8, length - 2)
      y += length
    }
  }
  return { color: texture(element, 1.2, 2.4, true), relief: texture(relief, 1.2, 2.4), roughness: 0.67 }
}

function ceramic(finish: Exclude<FloorFinish, 'parquet'>): Surface {
  const { element, context: c } = canvas(768, 768)
  const { element: relief, context: r } = canvas(768, 768)
  const rng = randomSequence(8920)
  const ivory = finish === 'ivory-tile'
  const entry = finish === 'entry-tile'
  const balcony = finish === 'balcony'
  const joint = ivory ? '#a8a99d' : entry ? '#707369' : '#b9b7ad'
  c.fillStyle = joint
  c.fillRect(0, 0, 768, 768)
  r.fillStyle = '#666666'
  r.fillRect(0, 0, 768, 768)
  const tilePixels = 384
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      const x = ix * tilePixels
      const y = iy * tilePixels
      const lightness = (ivory ? 77 : entry ? 45 : balcony ? 56 : 34) + rng() * 4
      c.fillStyle = `hsl(${ivory ? 48 : entry ? 66 : 43} ${ivory ? 12 : entry ? 7 : 6}% ${lightness}%)`
      c.fillRect(x + 2, y + 2, tilePixels - 4, tilePixels - 4)
      r.fillStyle = '#cccccc'
      r.fillRect(x + 2, y + 2, tilePixels - 4, tilePixels - 4)
      c.save()
      c.beginPath()
      c.rect(x + 3, y + 3, tilePixels - 6, tilePixels - 6)
      c.clip()
      for (let n = 0; n < 1800; n++) {
        const px = x + rng() * tilePixels
        const py = y + rng() * tilePixels
        const radius = 2 + rng() * 19
        c.fillStyle = rng() > 0.5 ? `rgba(240,239,221,${ivory ? 0.035 : 0.016})` : 'rgba(31,34,29,0.013)'
        c.beginPath()
        c.ellipse(px, py, radius, radius * 0.38, -0.4, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
      c.fillStyle = 'rgba(255,255,255,0.12)'
      c.fillRect(x + 2, y + 2, tilePixels - 4, 1)
    }
  }
  const side = ivory ? 0.6 : entry ? 0.66 : 0.9
  return { color: texture(element, side, side, true), relief: texture(relief, side, side), roughness: ivory ? 0.52 : 0.86 }
}

export function floorSurface(finish: FloorFinish): Surface {
  let surface = surfaces.get(finish)
  if (!surface) {
    surface = finish === 'parquet' ? parquet() : ceramic(finish)
    surfaces.set(finish, surface)
  }
  return surface
}

export function roomFinish(roomId: string): FloorFinish {
  if (roomId === 'bathroom') return 'ivory-tile'
  if (roomId === 'kitchen') return 'slate'
  if (roomId === 'entrance' || roomId === 'wc') return 'entry-tile'
  return 'parquet'
}
