import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { DEMO_GOOGLE_MAPS_URL, DEMO_LOCATION } from '../data/demo-location'
import { useLocale } from '../i18n/useLocale'
import { buildingMapCopy } from './building-map-copy'
import '../building-map.css'

// A public square is the demo's illustrative location, independent from the
// regional solar reference. Never project reconstructed footprints onto it.
const center: [number, number] = [DEMO_LOCATION.longitude, DEMO_LOCATION.latitude]
const camera = { center, zoom: 16.3, bearing: 0, pitch: 0 }

export function BuildingMap({ resetRevision }: { resetRevision: number }) {
  const { locale } = useLocale()
  const copy = buildingMapCopy[locale]
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tilesFailed, setTilesFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let disposed = false
    let map: MapLibreMap | undefined
    let marker: MapLibreMarker | undefined
    let observer: ResizeObserver | undefined
    let loaded = false
    let tileLoaded = false
    setStatus('loading')
    setTilesFailed(false)
    const deadline = window.setTimeout(() => {
      if (!disposed && !loaded) setStatus('failed')
    }, 15000)

    async function initializeMap() {
      const maplibre = await import('maplibre-gl')
      if (disposed || !container.current) return
      // Use the same bundled worker setup as Dénicheur Breizh / MapLibre 6.
      maplibre.setWorkerUrl(mapWorkerUrl)
      map = new maplibre.Map({
        container: container.current,
        ...camera,
        minZoom: 3,
        maxZoom: 18,
        renderWorldCopies: false,
        cooperativeGestures: true,
        attributionControl: { compact: false },
        refreshExpiredTiles: true,
        // OSM requires a valid Referer. Send only the site origin for its tile
        // requests, even when the site's default policy is no-referrer; never
        // send app paths, account data or credentials. Keep HTTP cache defaults.
        transformRequest: url => url.startsWith('https://tile.openstreetmap.org/')
          ? { url, referrerPolicy: 'strict-origin', credentials: 'same-origin' }
          : { url },
        locale: {
          'NavigationControl.ZoomIn': copy.zoomIn,
          'NavigationControl.ZoomOut': copy.zoomOut,
          'AttributionControl.ToggleAttribution': copy.attribution,
        },
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 19,
              attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
            },
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.12 } },
          ],
        },
      })
      mapRef.current = map
      marker = new maplibre.Marker({ color: '#7774a8', scale: .9 }).setLngLat(center).addTo(map)
      const markerElement = marker.getElement()
      markerElement.classList.add('building-map-marker')
      markerElement.setAttribute('role', 'img')
      markerElement.setAttribute('aria-label', copy.marker)
      markerElement.setAttribute('title', copy.marker)
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right')
      map.getCanvas().setAttribute('aria-label', copy.title)
      map.on('sourcedata', event => {
        if (disposed || event.sourceId !== 'osm' || event.tile?.state !== 'loaded') return
        tileLoaded = true
        if (loaded) setStatus('ready')
      })
      map.on('load', () => {
        if (disposed) return
        loaded = true
        window.clearTimeout(deadline)
        // MapLibre can finish loading after every tile has failed. A marker on
        // an empty background must still offer the complete failure fallback.
        setStatus(tileLoaded ? 'ready' : 'failed')
      })
      map.on('error', () => { if (!disposed) setTilesFailed(true) })
      map.on('webglcontextlost', () => { if (!disposed) setStatus('failed') })
      observer = new ResizeObserver(() => map?.resize())
      observer.observe(container.current)
    }

    void initializeMap().catch(() => { if (!disposed) setStatus('failed') })
    return () => {
      disposed = true
      window.clearTimeout(deadline)
      observer?.disconnect()
      marker?.remove()
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
    }
  }, [attempt, copy])

  useEffect(() => {
    mapRef.current?.jumpTo(camera)
  }, [resetRevision])

  function recenter() {
    const map = mapRef.current
    if (!map) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) map.jumpTo(camera)
    else map.easeTo({ ...camera, duration: 600 })
  }

  return <div className="building-map" aria-label={copy.title} data-map-state={status}>
    <div className="building-map-canvas" ref={container} />
    {status !== 'ready' && <div className="building-map-state" role="status">
      <span aria-hidden="true">⌖</span>
      <p>{status === 'loading' ? copy.loading : copy.failed}</p>
      {status === 'failed' && <div><button onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button><a href={DEMO_GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">{copy.openMap} ↗</a></div>}
    </div>}
    <div className="building-map-context">
      <strong><i aria-hidden="true" />{copy.location}</strong>
      <p>{copy.scope}</p>
      <div className="building-map-actions"><button onClick={recenter} disabled={status !== 'ready'}>⌖ {copy.recenter}</button><a href={DEMO_GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">{copy.openMap} ↗</a></div>
      {tilesFailed && status === 'ready' && <div className="building-map-warning" role="status"><span>{copy.tilesFailed}</span><button onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button></div>}
    </div>
  </div>
}
