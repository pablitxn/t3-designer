import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { SITE_BUILDINGS, SITE_PARCEL } from '../data/building-site'
import { t3Apartment } from '../data/t3'

export function DossierIcon({ name, size = 18 }: { name: 'book' | 'home' | 'building' | 'sun' | 'source' | 'question' | 'search' | 'arrow' | 'close' | 'download' | 'print' | 'check'; size?: number }) {
  const paths = {
    book: <><path d="M12 5c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /><path d="M12 5v15M6 8h3M6 11h3M15 8h3M15 11h3" /></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
    building: <><path d="M4 21V5h10v16M14 10h6v11M2 21h20M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
    source: <><path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h5" /></>,
    question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    print: <><path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6ZM17 11h1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

/** Real local IGN/cadastral geometry. North is up; this is not an aerial photo. */
export function DossierSitePlan() {
  const { t } = useTranslation('dossier')
  const id = useId()
  const points = SITE_PARCEL.footprint
  const xMin = Math.min(...points.map(point => point[0])) - 22
  const zMin = Math.min(...points.map(point => point[1])) - 12
  const width = Math.max(...points.map(point => point[0])) - xMin + 22
  const height = Math.max(...points.map(point => point[1])) - zMin + 12
  return <svg viewBox={`${xMin} ${zMin} ${width} ${height}`} role="img" aria-label={t('ui.sitePlanAlt')}>
    <defs><pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="0.3" cy="0.3" r="0.17" fill="#b8c1b1" /></pattern></defs>
    <rect x={xMin} y={zMin} width={width} height={height} fill={`url(#${id})`} />
    {SITE_BUILDINGS.filter(building => !building.isTarget).map(building => <polygon key={building.id} points={building.footprint.map(point => point.join(',')).join(' ')} fill="#dee3d6" stroke="#ccd3c6" strokeWidth="0.3" />)}
    <polygon points={points.map(point => point.join(',')).join(' ')} fill="#dce5b3" fillOpacity="0.5" stroke="#8b9c58" strokeWidth="0.4" strokeDasharray="1.2 0.9" />
    {SITE_BUILDINGS.filter(building => building.isTarget).map(building => <polygon key={building.id} points={building.footprint.map(point => point.join(',')).join(' ')} fill="#69795e" stroke="#455841" strokeWidth="0.5" />)}
    <circle cx="0" cy="0" r="1.5" fill="#fffef9" stroke="#526647" strokeWidth="0.6" />
    <path d={`M${xMin + width - 7} ${zMin + 15}v-7m-2.2 3 2.2-3 2.2 3`} stroke="#526348" strokeWidth="0.6" fill="none" />
    <text x={xMin + width - 7} y={zMin + 6} fontSize="2.5" textAnchor="middle" fill="#526348">N</text>
  </svg>
}

export function DossierApartmentPlan() {
  const { t } = useTranslation('dossier')
  const allPoints = t3Apartment.perimeter
  const minX = Math.min(...allPoints.map(point => point[0]))
  const minZ = Math.min(...allPoints.map(point => point[1]))
  const width = Math.max(...allPoints.map(point => point[0])) - minX
  const height = Math.max(...allPoints.map(point => point[1])) - minZ
  const colors = ['#e5e7d9', '#e8ddd0', '#d8dfd3', '#e8e2d5', '#deded0', '#e2d5c5', '#d5ddd4', '#dce1cd']
  return <svg viewBox={`${minX - 0.4} ${minZ - 0.4} ${width + 0.8} ${height + 0.8}`} role="img" aria-label={t('ui.apartmentPlanAlt')}>
    {t3Apartment.rooms.map((room, index) => <polygon key={room.id} points={room.polygon.map(point => point.join(',')).join(' ')} fill={colors[index % colors.length]} stroke="#fafaf3" strokeWidth="0.05" />)}
    {t3Apartment.walls.map(wall => <line key={wall.id} x1={wall.from[0]} y1={wall.from[1]} x2={wall.to[0]} y2={wall.to[1]} stroke="#62715c" strokeWidth={wall.kind === 'exterior' ? 0.09 : 0.055} />)}
  </svg>
}
