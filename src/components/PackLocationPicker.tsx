import { useEffect } from 'react'
import { LatLngBounds, type LatLngLiteral } from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'

export interface PackMapPoint {
  lat: number
  lng: number
}

export interface PackMapMarker extends PackMapPoint {
  id: string
  label: string
  description?: string
  spotCount?: number
}

interface PackLocationPickerProps {
  value: PackMapPoint | null
  onChange: (nextValue: PackMapPoint) => void
  disabled?: boolean
  otherMarkers?: PackMapMarker[]
}

interface PackLocationsMapProps {
  markers: PackMapMarker[]
}

const DEFAULT_CENTER: LatLngLiteral = {
  lat: 39.8283,
  lng: -98.5795,
}

const DEFAULT_ZOOM = 4
const SELECTED_ZOOM = 17
const MARKER_MAP_ZOOM = 15
const TILE_LAYER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

function ClickToSelectPin(props: PackLocationPickerProps) {
  const map = useMap()

  useMapEvents({
    click(event) {
      if (props.disabled) {
        return
      }

      props.onChange({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })

  useEffect(() => {
    if (!props.value) {
      return
    }

    map.flyTo(props.value, Math.max(map.getZoom(), SELECTED_ZOOM), {
      animate: true,
      duration: 0.35,
    })
  }, [map, props.value])

  return props.value ? (
    <CircleMarker
      center={props.value}
      radius={10}
      pathOptions={{
        color: '#112d4e',
        fillColor: '#f6ae2d',
        fillOpacity: 0.95,
        weight: 3,
      }}
    />
  ) : null
}

function FitPackLocations(props: PackLocationsMapProps) {
  const map = useMap()

  useEffect(() => {
    if (props.markers.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }

    if (props.markers.length === 1) {
      map.flyTo(props.markers[0], MARKER_MAP_ZOOM, {
        animate: true,
        duration: 0.35,
      })
      return
    }

    const bounds = new LatLngBounds(
      props.markers.map(({ lat, lng }) => [lat, lng] as [number, number]),
    )
    map.flyToBounds(bounds.pad(0.2), {
      animate: true,
      duration: 0.35,
      padding: [24, 24],
    })
  }, [map, props.markers])

  return null
}

export function PackLocationPicker(props: PackLocationPickerProps) {
  return (
    <div className={`pack-map-shell ${props.disabled ? 'pack-map-shell-disabled' : ''}`}>
      <MapContainer
        center={props.value ?? DEFAULT_CENTER}
        className="pack-map"
        scrollWheelZoom={!props.disabled}
        zoom={props.value ? SELECTED_ZOOM : DEFAULT_ZOOM}
      >
        <TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
        <ClickToSelectPin {...props} />
        {(props.otherMarkers ?? []).map((marker) => (
          <CircleMarker
            key={marker.id}
            center={marker}
            radius={7}
            pathOptions={{
              color: '#112d4e',
              fillColor: '#9ca3af',
              fillOpacity: 0.55,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{marker.label}</strong>
              {marker.description ? <div>{marker.description}</div> : null}
              <div>{marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}</div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="pack-map-caption">
        {props.disabled
          ? 'Select a POI from the list to place its pin.'
          : 'Click anywhere on the map to drop or move this POI\'s pin.'}
      </div>
    </div>
  )
}

export function PackLocationsMap(props: PackLocationsMapProps) {
  const initialCenter = props.markers[0] ?? DEFAULT_CENTER

  return (
    <div className="pack-map-shell">
      <MapContainer
        center={initialCenter}
        className="pack-map"
        scrollWheelZoom
        zoom={props.markers.length > 0 ? MARKER_MAP_ZOOM : DEFAULT_ZOOM}
      >
        <TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
        <FitPackLocations markers={props.markers} />
        {props.markers.map((marker) => (
          <CircleMarker
            key={marker.id}
            center={marker}
            radius={9}
            pathOptions={{
              color: '#112d4e',
              fillColor: '#27cc5e',
              fillOpacity: 0.9,
              weight: 3,
            }}
          >
            <Popup>
              <strong>{marker.label}</strong>
              {marker.description ? <div>{marker.description}</div> : null}
              {typeof marker.spotCount === 'number' ? (
                <div>{marker.spotCount} spots</div>
              ) : null}
              <div>
                {marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="pack-map-caption">
        {props.markers.length === 0
          ? 'No Juise Pack pins are available yet.'
          : `${props.markers.length} Juise Pack pin${props.markers.length === 1 ? '' : 's'} shown on the map.`}
      </div>
    </div>
  )
}
