import { useEffect } from 'react'
import type { LatLngLiteral } from 'leaflet'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'

export interface PackMapPoint {
  lat: number
  lng: number
}

interface PackLocationPickerProps {
  value: PackMapPoint | null
  onChange: (nextValue: PackMapPoint) => void
  disabled?: boolean
}

const DEFAULT_CENTER: LatLngLiteral = {
  lat: 39.8283,
  lng: -98.5795,
}

const DEFAULT_ZOOM = 4
const SELECTED_ZOOM = 17

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

export function PackLocationPicker(props: PackLocationPickerProps) {
  return (
    <div className={`pack-map-shell ${props.disabled ? 'pack-map-shell-disabled' : ''}`}>
      <MapContainer
        center={props.value ?? DEFAULT_CENTER}
        className="pack-map"
        scrollWheelZoom={!props.disabled}
        zoom={props.value ? SELECTED_ZOOM : DEFAULT_ZOOM}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToSelectPin {...props} />
      </MapContainer>
      <div className="pack-map-caption">
        {props.disabled
          ? 'Select a school first to place a pack pin.'
          : 'Click anywhere on the map to drop or move the Juise Pack pin.'}
      </div>
    </div>
  )
}
