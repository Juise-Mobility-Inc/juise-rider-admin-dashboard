import { useEffect } from 'react'
import { LatLngBounds, type LatLngLiteral } from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'

export interface SchoolZoneMapPoint {
  lat: number
  lng: number
}

export interface SchoolZoneMapPolygon {
  id: string
  label: string
  description?: string
  zoneType: 'no_go' | 'speed_limit'
  speedLimitMph?: number | null
  points: SchoolZoneMapPoint[]
  highlighted?: boolean
}

interface SchoolZoneMapEditorProps {
  selectedPolygon: SchoolZoneMapPolygon | null
  polygons: SchoolZoneMapPolygon[]
  onAddPoint: (point: SchoolZoneMapPoint) => void
  disabled?: boolean
}

interface SchoolZonesMapProps {
  polygons: SchoolZoneMapPolygon[]
}

const DEFAULT_CENTER: LatLngLiteral = {
  lat: 39.8283,
  lng: -98.5795,
}

const DEFAULT_ZOOM = 4
const SELECTED_ZOOM = 16
const TILE_LAYER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

function getZonePalette(zoneType: SchoolZoneMapPolygon['zoneType'], highlighted = false) {
  if (zoneType === 'no_go') {
    return {
      stroke: highlighted ? '#ff5c5c' : '#f48b82',
      fill: highlighted ? '#ff5c5c' : '#f5b8b1',
    }
  }

  return {
    stroke: highlighted ? '#eec253' : '#f3d88f',
    fill: highlighted ? '#eec253' : '#f6e6b0',
  }
}

function getBoundsForPoints(points: SchoolZoneMapPoint[]) {
  if (points.length === 0) {
    return null
  }

  return new LatLngBounds(points.map(({ lat, lng }) => [lat, lng] as [number, number]))
}

function ZoneMapClickCapture(props: SchoolZoneMapEditorProps) {
  const map = useMap()

  useMapEvents({
    click(event) {
      if (props.disabled || !props.selectedPolygon) {
        return
      }

      props.onAddPoint({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })

  useEffect(() => {
    const selectedPoints = props.selectedPolygon?.points ?? []
    const bounds = getBoundsForPoints(selectedPoints)
    if (!bounds || !bounds.isValid()) {
      return
    }

    if (selectedPoints.length === 1) {
      map.flyTo(selectedPoints[0], Math.max(map.getZoom(), SELECTED_ZOOM), {
        animate: true,
        duration: 0.35,
      })
      return
    }

    map.flyToBounds(bounds.pad(0.24), {
      animate: true,
      duration: 0.35,
      padding: [24, 24],
    })
  }, [map, props.selectedPolygon])

  return null
}

function FitSchoolZones(props: SchoolZonesMapProps) {
  const map = useMap()

  useEffect(() => {
    const points = props.polygons.flatMap((polygon) => polygon.points)
    const bounds = getBoundsForPoints(points)
    if (!bounds || !bounds.isValid()) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }

    if (points.length === 1) {
      map.flyTo(points[0], SELECTED_ZOOM - 1, {
        animate: true,
        duration: 0.35,
      })
      return
    }

    map.flyToBounds(bounds.pad(0.18), {
      animate: true,
      duration: 0.35,
      padding: [24, 24],
    })
  }, [map, props.polygons])

  return null
}

function renderZonePolygon(zone: SchoolZoneMapPolygon) {
  if (zone.points.length === 0) {
    return null
  }

  const palette = getZonePalette(zone.zoneType, zone.highlighted)

  return (
    <>
      {zone.points.length >= 2 ? (
        <Polyline
          pathOptions={{
            color: palette.stroke,
            weight: zone.highlighted ? 4 : 3,
            opacity: zone.highlighted ? 1 : 0.8,
          }}
          positions={zone.points}
        />
      ) : null}
      {zone.points.length >= 3 ? (
        <Polygon
          pathOptions={{
            color: palette.stroke,
            fillColor: palette.fill,
            fillOpacity: zone.highlighted ? 0.28 : 0.18,
            weight: zone.highlighted ? 4 : 3,
          }}
          positions={zone.points}
        >
          <Popup>
            <strong>{zone.label}</strong>
            {zone.description ? <div>{zone.description}</div> : null}
            <div>{zone.zoneType === 'no_go' ? 'No-go zone' : 'Speed limit zone'}</div>
            {typeof zone.speedLimitMph === 'number' ? (
              <div>{zone.speedLimitMph} mph limit</div>
            ) : null}
            <div>{zone.points.length} vertices</div>
          </Popup>
        </Polygon>
      ) : null}
      {zone.highlighted
        ? zone.points.map((point, index) => (
            <CircleMarker
              key={`${zone.id}-${index}`}
              center={point}
              radius={7}
              pathOptions={{
                color: '#112d4e',
                fillColor: palette.stroke,
                fillOpacity: 0.95,
                weight: 2,
              }}
            />
          ))
        : null}
    </>
  )
}

export function SchoolZoneMapEditor(props: SchoolZoneMapEditorProps) {
  const initialCenter = props.selectedPolygon?.points[0] ?? DEFAULT_CENTER
  const selectedZoneName = props.selectedPolygon?.label ?? 'No zone selected'

  return (
    <div className={`pack-map-shell ${props.disabled ? 'pack-map-shell-disabled' : ''}`}>
      <MapContainer
        center={initialCenter}
        className="pack-map"
        scrollWheelZoom={!props.disabled}
        zoom={props.selectedPolygon?.points.length ? SELECTED_ZOOM : DEFAULT_ZOOM}
      >
        <TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
        <ZoneMapClickCapture {...props} />
        {props.polygons.map((polygon) => (
          <PolygonGroup key={polygon.id} polygon={polygon} />
        ))}
      </MapContainer>
      <div className="pack-map-caption">
        {props.disabled
          ? 'Select a school zone before editing the polygon.'
          : `Click the map to add polygon vertices for ${selectedZoneName}.`}
      </div>
    </div>
  )
}

export function SchoolZonesMap(props: SchoolZonesMapProps) {
  const initialCenter = props.polygons[0]?.points[0] ?? DEFAULT_CENTER

  return (
    <div className="pack-map-shell">
      <MapContainer
        center={initialCenter}
        className="pack-map"
        scrollWheelZoom
        zoom={props.polygons.length > 0 ? SELECTED_ZOOM - 1 : DEFAULT_ZOOM}
      >
        <TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
        <FitSchoolZones polygons={props.polygons} />
        {props.polygons.map((polygon) => (
          <PolygonGroup key={polygon.id} polygon={polygon} />
        ))}
      </MapContainer>
      <div className="pack-map-caption">
        {props.polygons.length === 0
          ? 'No school zones are available yet.'
          : `${props.polygons.length} school zone${props.polygons.length === 1 ? '' : 's'} shown on the map.`}
      </div>
    </div>
  )
}

function PolygonGroup(props: { polygon: SchoolZoneMapPolygon }) {
  return renderZonePolygon(props.polygon)
}
