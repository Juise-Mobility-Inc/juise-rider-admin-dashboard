import { useEffect, useRef } from 'react'
import { LatLngBounds, divIcon, type LatLngLiteral } from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Marker,
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
  onMovePoint: (pointIndex: number, point: SchoolZoneMapPoint) => void
  onInsertPoint: (pointIndex: number, point: SchoolZoneMapPoint) => void
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

function buildGeometrySignature(polygons: SchoolZoneMapPolygon[]) {
  return polygons
    .map((polygon) =>
      polygon.points
        .map(({ lat, lng }) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
        .join('|'),
    )
    .join(';;')
}

function getSegmentInsertHandles(points: SchoolZoneMapPoint[]) {
  if (points.length < 2) {
    return []
  }

  const handles = points.slice(0, -1).map((point, index) => {
    const nextPoint = points[index + 1]
    return {
      id: `${index}-${index + 1}`,
      insertIndex: index + 1,
      point: {
        lat: (point.lat + nextPoint.lat) / 2,
        lng: (point.lng + nextPoint.lng) / 2,
      },
    }
  })

  if (points.length >= 3) {
    const lastPoint = points[points.length - 1]
    const firstPoint = points[0]
    handles.push({
      id: `${points.length - 1}-0`,
      insertIndex: points.length,
      point: {
        lat: (lastPoint.lat + firstPoint.lat) / 2,
        lng: (lastPoint.lng + firstPoint.lng) / 2,
      },
    })
  }

  return handles
}

function createHandleIcon(fillColor: string, borderColor: string, size: number) {
  return divIcon({
    className: 'school-zone-handle-icon',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:999px;border:2px solid ${borderColor};background:${fillColor};box-shadow:0 8px 18px rgba(17,45,78,0.18);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function ZoneMapClickCapture(props: SchoolZoneMapEditorProps) {
  const map = useMap()
  const previousSelectedPolygonId = useRef<string | null>(null)

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
    const selectedPolygonId = props.selectedPolygon?.id ?? null
    if (selectedPolygonId === previousSelectedPolygonId.current) {
      return
    }

    previousSelectedPolygonId.current = selectedPolygonId

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
  const previousGeometrySignature = useRef<string | null>(null)
  const geometrySignature = buildGeometrySignature(props.polygons)

  useEffect(() => {
    if (geometrySignature === previousGeometrySignature.current) {
      return
    }

    previousGeometrySignature.current = geometrySignature

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
  }, [geometrySignature, map, props.polygons])

  return null
}

interface PolygonGroupProps {
  polygon: SchoolZoneMapPolygon
  editable?: boolean
  onMovePoint?: (pointIndex: number, point: SchoolZoneMapPoint) => void
  onInsertPoint?: (pointIndex: number, point: SchoolZoneMapPoint) => void
}

function renderZonePolygon(zone: SchoolZoneMapPolygon, props?: PolygonGroupProps) {
  if (zone.points.length === 0) {
    return null
  }

  const palette = getZonePalette(zone.zoneType, zone.highlighted)
  const showPointMarkers = zone.highlighted || zone.points.length < 3
  const dragHandleIcon = createHandleIcon(palette.stroke, '#112d4e', zone.highlighted ? 18 : 16)
  const insertHandleIcon = createHandleIcon('#ffffff', palette.stroke, 12)
  const segmentInsertHandles = props?.editable ? getSegmentInsertHandles(zone.points) : []

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
      {props?.editable
        ? zone.points.map((point, index) => (
            <Marker
              key={`${zone.id}-${index}`}
              draggable
              eventHandlers={{
                dragend(event) {
                  const { lat, lng } = event.target.getLatLng()
                  props.onMovePoint?.(index, { lat, lng })
                },
              }}
              icon={dragHandleIcon}
              position={point}
              zIndexOffset={900}
            />
          ))
        : null}
      {segmentInsertHandles.map((handle) => (
        <Marker
          key={`${zone.id}-insert-${handle.id}`}
          eventHandlers={{
            click(event) {
              event.originalEvent.stopPropagation()
              props?.onInsertPoint?.(handle.insertIndex, handle.point)
            },
          }}
          icon={insertHandleIcon}
          position={handle.point}
          zIndexOffset={700}
        />
      ))}
      {!props?.editable && showPointMarkers
        ? zone.points.map((point, index) => (
            <CircleMarker
              key={`${zone.id}-${index}`}
              center={point}
              radius={zone.highlighted ? 7 : 5}
              pathOptions={{
                color: '#112d4e',
                fillColor: palette.stroke,
                fillOpacity: zone.highlighted ? 0.95 : 0.8,
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
          <PolygonGroup
            key={polygon.id}
            editable={!props.disabled && polygon.id === props.selectedPolygon?.id}
            onInsertPoint={props.onInsertPoint}
            onMovePoint={props.onMovePoint}
            polygon={polygon}
          />
        ))}
      </MapContainer>
      <div className="pack-map-caption">
        {props.disabled
          ? 'Select a school zone before editing the polygon.'
          : `Click to add vertices for ${selectedZoneName}, drag existing points to reshape, and tap midpoint handles to insert new vertices.`}
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

function PolygonGroup(props: PolygonGroupProps) {
  return renderZonePolygon(props.polygon, props)
}
