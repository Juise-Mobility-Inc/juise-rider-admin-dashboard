import {
  Fragment,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DomEvent, LatLngBounds, divIcon, type LatLngLiteral } from 'leaflet'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
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
  radiusMeters?: number
}

interface PackLocationPickerProps {
  value: PackMapPoint | null
  onChange: (nextValue: PackMapPoint) => void
  onPlaceSelect?: (nextValue: PackMapPoint, label: string, detail?: string) => void
  disabled?: boolean
  otherMarkers?: PackMapMarker[]
  radiusMeters?: number
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
const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''

interface LocationSearchOption {
  id: string
  label: string
  detail?: string
  source: 'google' | 'osm'
  placeResource?: string
  point?: PackMapPoint
}

interface NominatimSearchResult {
  display_name: string
  lat: string
  lon: string
}

interface GooglePlaceSuggestion {
  placePrediction?: {
    place?: string
    placeId?: string
    text?: {
      text?: string
    }
    structuredFormat?: {
      mainText?: {
        text?: string
      }
      secondaryText?: {
        text?: string
      }
    }
  }
}

interface GoogleAutocompleteResponse {
  suggestions?: GooglePlaceSuggestion[]
}

interface GooglePlaceDetailsResponse {
  displayName?: {
    text?: string
  }
  formattedAddress?: string
  location?: {
    latitude?: number
    longitude?: number
  }
}

function createSearchSessionToken() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createSearchResultIcon() {
  return divIcon({
    className: 'school-zone-search-result-icon',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function getBoundsForPoints(points: PackMapPoint[]) {
  if (points.length === 0) {
    return null
  }

  return new LatLngBounds(points.map(({ lat, lng }) => [lat, lng] as [number, number]))
}

function getCenterForPoints(points: PackMapPoint[]) {
  const bounds = getBoundsForPoints(points)
  if (!bounds || !bounds.isValid()) {
    return null
  }

  const center = bounds.getCenter()
  return {
    lat: center.lat,
    lng: center.lng,
  }
}

function getSearchBias(markers: PackMapMarker[]) {
  const bounds = getBoundsForPoints(markers)
  if (!bounds || !bounds.isValid()) {
    return ''
  }

  const paddedBounds = bounds.pad(0.45)
  return `&viewbox=${paddedBounds.getWest()},${paddedBounds.getNorth()},${paddedBounds.getEast()},${paddedBounds.getSouth()}`
}

function getLocationBias(markers: PackMapMarker[]) {
  const bounds = getBoundsForPoints(markers)
  if (!bounds || !bounds.isValid()) {
    return null
  }

  const paddedBounds = bounds.pad(0.45)
  return {
    rectangle: {
      low: {
        latitude: paddedBounds.getSouth(),
        longitude: paddedBounds.getWest(),
      },
      high: {
        latitude: paddedBounds.getNorth(),
        longitude: paddedBounds.getEast(),
      },
    },
  }
}

async function fetchGoogleLocationOptions(
  trimmedQuery: string,
  signal: AbortSignal,
  locationBias: ReturnType<typeof getLocationBias>,
  sessionToken: string,
) {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
    },
    body: JSON.stringify({
      input: trimmedQuery,
      includedRegionCodes: ['us'],
      locationBias: locationBias ?? undefined,
      sessionToken,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error('Google location search is unavailable right now.')
  }

  const data = (await response.json()) as GoogleAutocompleteResponse
  return (
    data.suggestions
      ?.map((suggestion): LocationSearchOption | null => {
        const prediction = suggestion.placePrediction
        const placeResource = prediction?.place
        if (!prediction || !placeResource) {
          return null
        }

        return {
          id: prediction.placeId ?? placeResource,
          label:
            prediction.structuredFormat?.mainText?.text ??
            prediction.text?.text ??
            'Unnamed location',
          detail: prediction.structuredFormat?.secondaryText?.text,
          source: 'google',
          placeResource,
        }
      })
      .filter((option): option is LocationSearchOption => Boolean(option)) ?? []
  )
}

async function fetchOpenStreetMapLocationOptions(
  trimmedQuery: string,
  signal: AbortSignal,
  searchBias: string,
) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(
      trimmedQuery,
    )}${searchBias}`,
    { signal },
  )

  if (!response.ok) {
    throw new Error('Location search is unavailable right now.')
  }

  const results = (await response.json()) as NominatimSearchResult[]
  return results
    .map((result, index): LocationSearchOption | null => {
      const point = {
        lat: Number(result.lat),
        lng: Number(result.lon),
      }

      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
        return null
      }

      const [label, ...details] = result.display_name.split(', ')
      return {
        id: `${result.lat}-${result.lon}-${index}`,
        label: label || result.display_name,
        detail: details.join(', '),
        source: 'osm',
        point,
      }
    })
    .filter((option): option is LocationSearchOption => Boolean(option))
}

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
      const otherMarkers = props.otherMarkers ?? []
      const bounds = getBoundsForPoints(otherMarkers)
      if (!bounds || !bounds.isValid()) {
        return
      }

      if (otherMarkers.length === 1) {
        map.flyTo(otherMarkers[0], MARKER_MAP_ZOOM, {
          animate: true,
          duration: 0.35,
        })
        return
      }

      map.flyToBounds(bounds.pad(0.22), {
        animate: true,
        duration: 0.35,
        padding: [24, 24],
      })
      return
    }

    map.flyTo(props.value, Math.max(map.getZoom(), SELECTED_ZOOM), {
      animate: true,
      duration: 0.35,
    })
  }, [map, props.otherMarkers, props.value])

  return props.value ? (
    <>
      {typeof props.radiusMeters === 'number' && Number.isFinite(props.radiusMeters) ? (
        <Circle
          center={props.value}
          radius={props.radiusMeters}
          pathOptions={{
            color: '#f6ae2d',
            fillColor: '#f6ae2d',
            fillOpacity: 0.12,
            weight: 2,
          }}
        />
      ) : null}
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
    </>
  ) : null
}

interface PlaceSearchControlProps {
  disabled?: boolean
  markers: PackMapMarker[]
  onSelect: (point: PackMapPoint, label: string, detail?: string) => void
}

function PlaceSearchControl(props: PlaceSearchControlProps) {
  const map = useMap()
  const controlRef = useRef<HTMLDivElement | null>(null)
  const [sessionToken, setSessionToken] = useState(createSearchSessionToken)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<LocationSearchOption[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'selecting' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isSearchActive, setIsSearchActive] = useState(false)
  const searchBias = useMemo(() => getSearchBias(props.markers), [props.markers])
  const googleLocationBias = useMemo(() => getLocationBias(props.markers), [props.markers])

  useEffect(() => {
    if (!controlRef.current) {
      return
    }

    DomEvent.disableClickPropagation(controlRef.current)
    DomEvent.disableScrollPropagation(controlRef.current)
  }, [])

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (controlRef.current?.contains(event.target as Node)) {
        return
      }

      setOptions([])
      setIsSearchActive(false)
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOptions([])
        setIsSearchActive(false)
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [])

  const fetchOptions = useCallback(async (trimmedQuery: string, signal: AbortSignal) => {
    setStatus('searching')
    setMessage('')

    try {
      const nextOptions = GOOGLE_PLACES_API_KEY
        ? await fetchGoogleLocationOptions(trimmedQuery, signal, googleLocationBias, sessionToken)
        : await fetchOpenStreetMapLocationOptions(trimmedQuery, signal, searchBias)

      if (signal.aborted) {
        return
      }

      setOptions(nextOptions)
      setStatus('idle')
      setMessage(nextOptions.length === 0 ? 'No matching locations found.' : '')
    } catch (error) {
      if (signal.aborted) {
        return
      }

      setOptions([])
      setStatus('error')
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Location search is unavailable right now.',
      )
    }
  }, [googleLocationBias, searchBias, sessionToken])

  useEffect(() => {
    const trimmedQuery = query.trim()
    if (!isSearchActive || !trimmedQuery || props.disabled) {
      setOptions([])
      setMessage('')
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      void fetchOptions(trimmedQuery, controller.signal)
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [fetchOptions, isSearchActive, props.disabled, query])

  async function focusSearchOption(option: LocationSearchOption) {
    setStatus('selecting')
    setMessage('')

    try {
      const result =
        option.source === 'google' ? await fetchGooglePlaceResult(option) : optionToSearchResult(option)

      if (!result) {
        throw new Error('That location does not include map coordinates.')
      }

      map.flyTo(result.point, SELECTED_ZOOM, {
        animate: true,
        duration: 0.45,
      })
      props.onSelect(result.point, result.label, result.detail)
      setQuery(result.label)
      setOptions([])
      setIsSearchActive(false)
      setStatus('idle')
      setSessionToken(createSearchSessionToken())
      setMessage('POI pin moved to this location.')
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Location search is unavailable right now.',
      )
    }
  }

  async function fetchGooglePlaceResult(option: LocationSearchOption) {
    if (!option.placeResource) {
      return null
    }

    const response = await fetch(
      `https://places.googleapis.com/v1/${option.placeResource}?fields=location,formattedAddress,displayName&sessionToken=${encodeURIComponent(
        sessionToken,
      )}&key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}`,
    )

    if (!response.ok) {
      throw new Error('Could not load details for that location.')
    }

    const details = (await response.json()) as GooglePlaceDetailsResponse
    const point = {
      lat: Number(details.location?.latitude),
      lng: Number(details.location?.longitude),
    }

    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return null
    }

    return {
      label: details.displayName?.text ?? option.label,
      detail: details.formattedAddress ?? option.detail,
      point,
    }
  }

  function optionToSearchResult(option: LocationSearchOption) {
    if (!option.point) {
      return null
    }

    return {
      label: option.label,
      detail: option.detail,
      point: option.point,
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()

    const firstOption = options[0]
    if (!firstOption || props.disabled || status === 'selecting') {
      return
    }

    void focusSearchOption(firstOption)
  }

  return (
    <div
      className="school-zone-search-control"
      ref={controlRef}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <form onSubmit={handleSubmit}>
        <label className="school-zone-search-field">
          <span>Find place</span>
          <input
            disabled={props.disabled || status === 'selecting'}
            onFocus={() => setIsSearchActive(true)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search addresses and places"
            value={query}
          />
        </label>
        <button
          className="secondary-button"
          disabled={props.disabled || status === 'searching' || status === 'selecting' || options.length === 0}
          type="submit"
        >
          {status === 'selecting' ? 'Opening...' : 'Search'}
        </button>
      </form>
      {options.length > 0 ? (
        <div className="school-zone-search-results">
          {options.map((option) => (
            <button
              key={option.id}
              disabled={status === 'selecting'}
              onClick={() => void focusSearchOption(option)}
              type="button"
            >
              <strong>{option.label}</strong>
              {option.detail ? <span>{option.detail}</span> : null}
            </button>
          ))}
          {GOOGLE_PLACES_API_KEY ? <span className="school-zone-search-provider">Powered by Google</span> : null}
        </div>
      ) : null}
      {message ? (
        <p className={status === 'error' ? 'school-zone-search-error' : undefined}>{message}</p>
      ) : null}
    </div>
  )
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
  const otherMarkers = props.otherMarkers ?? []
  const markersForSearch = props.value
    ? [
        ...otherMarkers,
        {
          id: 'selected-poi',
          label: 'Selected POI',
          lat: props.value.lat,
          lng: props.value.lng,
        },
      ]
    : otherMarkers
  const initialCenter =
    props.value ?? getCenterForPoints(otherMarkers) ?? DEFAULT_CENTER
  const searchResultIcon = useMemo(() => createSearchResultIcon(), [])

  return (
    <div className={`pack-map-shell ${props.disabled ? 'pack-map-shell-disabled' : ''}`}>
      <MapContainer
        center={initialCenter}
        className="pack-map"
        scrollWheelZoom={!props.disabled}
        zoom={props.value ? SELECTED_ZOOM : DEFAULT_ZOOM}
      >
        <TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
        <PlaceSearchControl
          disabled={props.disabled}
          markers={markersForSearch}
          onSelect={(point, label, detail) => {
            if (props.onPlaceSelect) {
              props.onPlaceSelect(point, label, detail)
              return
            }

            props.onChange(point)
          }}
        />
        <ClickToSelectPin {...props} />
        {props.value ? (
          <Marker icon={searchResultIcon} position={props.value} zIndexOffset={1000}>
            <Popup>Selected POI location</Popup>
          </Marker>
        ) : null}
        {otherMarkers.map((marker) => (
          <Fragment key={marker.id}>
            {typeof marker.radiusMeters === 'number' && Number.isFinite(marker.radiusMeters) ? (
              <Circle
                center={marker}
                radius={marker.radiusMeters}
                pathOptions={{
                  color: '#9ca3af',
                  fillColor: '#9ca3af',
                  fillOpacity: 0.08,
                  weight: 1,
                }}
              />
            ) : null}
            <CircleMarker
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
          </Fragment>
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
          <Fragment key={marker.id}>
            {typeof marker.radiusMeters === 'number' && Number.isFinite(marker.radiusMeters) ? (
              <Circle
                center={marker}
                radius={marker.radiusMeters}
                pathOptions={{
                  color: '#27cc5e',
                  fillColor: '#27cc5e',
                  fillOpacity: 0.1,
                  weight: 2,
                }}
              />
            ) : null}
            <CircleMarker
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
          </Fragment>
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
