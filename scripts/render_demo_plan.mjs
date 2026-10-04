/** Render the canonical room polygons and openings as a shareable demonstration plan. */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
const { chromium } = createRequire(new URL('../apps/web/package.json', import.meta.url))('@playwright/test')
const data = JSON.parse(await readFile(resolve(root, 'docs/snapshots/t3-apartment.json'), 'utf8'))
const names = { 'bedroom-1': 'Bedroom 1', 'bedroom-2': 'Bedroom 2', living: 'Living room', kitchen: 'Kitchen', bathroom: 'Bathroom', entrance: 'Entrance', toilet: 'WC', wc: 'WC', closet: 'Storage' }
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const scale = 130, ox = 220, oy = 340
const point = ([x, y]) => [ox + x * scale, oy + y * scale]
const polygon = (points, fill, stroke = 'none', width = 0) => `<polygon points="${points.map(p => point(p).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`
const line = (a, b, stroke, width) => `<line x1="${point(a)[0]}" y1="${point(a)[1]}" x2="${point(b)[0]}" y2="${point(b)[1]}" stroke="${stroke}" stroke-width="${width}"/>`
const text = (x, y, value, size = 28, weight = 400, anchor = 'start', color = '#414b42') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${escape(value)}</text>`
const shapes = data.rooms.map(room => polygon(room.polygon, room.color))
if (data.balcony) shapes.push(polygon(data.balcony.polygon, '#e9ebdf', '#465046', 5))
for (const wall of data.walls) shapes.push(line(wall.from, wall.to, '#465046', wall.thickness * scale))
for (const opening of [...(data.doors ?? []), ...(data.windows ?? [])]) {
  const wall = data.walls.find(item => item.id === opening.wallId)
  if (!wall) continue
  const dx = wall.to[0] - wall.from[0], dy = wall.to[1] - wall.from[1], length = Math.hypot(dx, dy)
  const a = [wall.from[0] + dx / length * opening.offset, wall.from[1] + dy / length * opening.offset]
  const b = [a[0] + dx / length * opening.width, a[1] + dy / length * opening.width]
  shapes.push(line(a, b, '#fcfaf6', wall.thickness * scale + 2))
  if (opening.sillHeight !== undefined) shapes.push(line(a, b, '#91aba7', 4))
}
for (const room of data.rooms) {
  const center = room.polygon.reduce((a, p) => [a[0] + p[0] / room.polygon.length, a[1] + p[1] / room.polygon.length], [0, 0])
  if (room.id === 'bathroom') { center[0] = 1.46; center[1] = 5.5 }
  const [x, y] = point(center), small = ['toilet', 'wc', 'closet', 'entrance', 'bathroom'].includes(room.id)
  shapes.push(text(x, y - 10, names[room.id] ?? room.name, small ? 23 : 30, 600, 'middle'), text(x, y + 30, `${room.reportedArea.toFixed(2)} m²`, room.id === 'wc' ? 18 : small ? 23 : 27, 400, 'middle'))
}
if (data.balcony) {
  const points = data.balcony.polygon, x = points.reduce((s, p) => s + point(p)[0] / points.length, 0), y = points.reduce((s, p) => s + point(p)[1] / points.length, 0)
  shapes.push(text(x, y + 10, `Balcony · ${data.balcony.reportedArea.toFixed(2)} m²`, 25, 500, 'middle'))
}
const rows = data.rooms.map((room, index) => `<rect x="1310" y="${430 + index * 65}" width="23" height="23" rx="5" fill="${room.color}"/>${text(1360, 450 + index * 65, names[room.id] ?? room.name, 29)}${text(2110, 450 + index * 65, `${room.reportedArea.toFixed(2)} m²`, 29, 400, 'end')}`).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2300" height="1658" viewBox="0 0 2300 1658"><rect width="2300" height="1658" fill="#fcfaf6"/><g font-family="Arial, sans-serif">${text(90, 100, 'T3 DESIGNER / OPEN DEMONSTRATION', 27, 700, 'start', '#808a75')}${text(90, 180, 'Demonstration apartment', 61, 700)}${text(90, 236, 'Source-rendered plan · approximate illustrative geometry', 30)}<rect x="1770" y="64" width="410" height="175" rx="26" fill="#e9eddf"/>${text(1810, 117, 'ILLUSTRATIVE FLOOR AREA', 21, 700)}${text(1810, 191, `${data.metadata.reportedCarrezArea.toFixed(2)} m²`, 60, 700)}${shapes.join('')}${text(1310, 365, 'ROOMS', 28, 700, 'start', '#808a75')}${rows}<line x1="1310" x2="2110" y1="995" y2="995" stroke="#d6d9ca" stroke-width="2"/>${text(1310, 1047, 'Total room polygons', 33, 700)}${text(2110, 1047, `${data.metadata.reportedCarrezArea.toFixed(2)} m²`, 33, 700, 'end')}<rect x="1290" y="1150" width="875" height="265" rx="26" fill="#eef0e8"/>${text(1330, 1205, 'EDITABLE GEOMETRY, EXPLICIT LIMITS', 26, 700)}${text(1330, 1260, 'Drawn from the versioned scene snapshot.', 27)}${text(1330, 1310, 'Wall lengths, heights and openings are estimates.', 27)}${text(1330, 1360, 'This illustration is not a survey or certified floor plan.', 27)}<line x1="90" x2="2190" y1="1510" y2="1510" stroke="#d6d9ca" stroke-width="2"/>${text(90, 1560, 'Source: docs/snapshots/t3-apartment.json · regenerate with node scripts/render_demo_plan.mjs', 23)}${text(90, 1600, 'Schematic room areas include wall overlap. Drawing axes do not establish a surveyed compass orientation.', 23)}</g></svg>`
await writeFile(resolve(root, 'docs/reference/demo-plan.svg'), svg)
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 2300, height: 1658 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;padding:0}</style>${svg}`)
  const png = await page.screenshot({ type: 'png' })
  for (const path of ['docs/reference/t3-plan.png', 'apps/web/public/dossier/apartment-plan.png']) await writeFile(resolve(root, path), png)
} finally { await browser.close() }
