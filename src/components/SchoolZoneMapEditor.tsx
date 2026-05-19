import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DomEvent, LatLngBounds, divIcon, type LatLngLiteral } from 'leaflet'
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
const SEARCH_ZOOM = 17
const TILE_LAYER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

function getZonePalette(zoneType: SchoolZoneMapPolygon['zoneType'], highlighted = false) {
  if (zoneType === 'no_go') {
    return {
      stroke: highlighted ? '#b91c1c' : '#dc2626',
      fill: highlighted ? '#ef4444' : '#f87171',
    }
  }

  return {
    stroke: highlighted ? '#b45309' : '#d97706',
    fill: highlighted ? '#f59e0b' : '#fbbf24',
  }
}

function getBoundsForPoints(points: SchoolZoneMapPoint[]) {
  if (points.length === 0) {
    return null
  }

  return new LatLngBounds(points.map(({ lat, lng }) => [lat, lng] as [number, number]))
}

function getCenterForPoints(points: SchoolZoneMapPoint[]) {
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

function buildGeometrySignature(polygons: SchoolZoneMapPolygon[]) {
  return polygons
    .map((polygon) =>
      polygon.points
        .map(({ lat, lng }) => `${lat.toFixed(6)},${lng.toFixed(6)}`)
        .join('|'),
    )
    .join(';;')
}

function getSearchBias(polygons: SchoolZoneMapPolygon[]) {
  const bounds = getBoundsForPoints(polygons.flatMap((polygon) => polygon.points))
  if (!bounds || !bounds.isValid()) {
    return ''
  }

  const paddedBounds = bounds.pad(0.45)
  const west = paddedBounds.getWest()
  const north = paddedBounds.getNorth()
  const east = paddedBounds.getEast()
  const south = paddedBounds.getSouth()
  return `&viewbox=${west},${north},${east},${south}`
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

function createSearchResultIcon() {
  return divIcon({
    className: 'school-zone-search-result-icon',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

interface SearchResult {
  label: string
  detail?: string
  point: SchoolZoneMapPoint
}

interface LocationSearchOption {
  id: string
  label: string
  detail?: string
  source: 'google' | 'osm'
  placeResource?: string
  point?: SchoolZoneMapPoint
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

const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''

function createSearchSessionToken() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getLocationBias(polygons: SchoolZoneMapPolygon[]) {
  const bounds = getBoundsForPoints(polygons.flatMap((polygon) => polygon.points))
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
    const focusPoints =
      selectedPoints.length > 0
        ? selectedPoints
        : props.polygons.flatMap((polygon) => polygon.points)
    const bounds = getBoundsForPoints(focusPoints)
    if (!bounds || !bounds.isValid()) {
      return
    }

    if (focusPoints.length === 1) {
      map.flyTo(focusPoints[0], Math.max(map.getZoom(), SELECTED_ZOOM), {
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
  }, [map, props.polygons, props.selectedPolygon])

  return null
}

interface AddressSearchControlProps {
  disabled?: boolean
  polygons: SchoolZoneMapPolygon[]
  onResult: (result: SearchResult) => void
}

function AddressSearchControl(props: AddressSearchControlProps) {
  const map = useMap()
  const controlRef = useRef<HTMLDivElement | null>(null)
  const [sessionToken, setSessionToken] = useState(createSearchSessionToken)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<LocationSearchOption[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'selecting' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [isSearchActive, setIsSearchActive] = useState(false)
  const searchBias = useMemo(() => getSearchBias(props.polygons), [props.polygons])
  const googleLocationBias = useMemo(() => getLocationBias(props.polygons), [props.polygons])

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

      map.flyTo(result.point, SEARCH_ZOOM, {
        animate: true,
        duration: 0.45,
      })
      props.onResult(result)
      setQuery(result.label)
      setOptions([])
      setIsSearchActive(false)
      setStatus('idle')
      setSessionToken(createSearchSessionToken())
      setMessage('Click the map near this result to start or continue the polygon.')
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
          <span>Find address</span>
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
  const showPointMarkers = zone.points.length < 3
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
            fillOpacity: zone.highlighted ? 0.50 : 0.35,
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
          draggable
          eventHandlers={{
            click(event) {
              event.originalEvent.stopPropagation()
              props?.onInsertPoint?.(handle.insertIndex, handle.point)
            },
            dragend(event) {
              const { lat, lng } = event.target.getLatLng()
              props?.onInsertPoint?.(handle.insertIndex, { lat, lng })
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
  const existingPoints = props.polygons.flatMap((polygon) => polygon.points)
  const initialCenter =
    props.selectedPolygon?.points[0] ?? getCenterForPoints(existingPoints) ?? DEFAULT_CENTER
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const searchResultIcon = useMemo(() => createSearchResultIcon(), [])
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
        <AddressSearchControl
          disabled={props.disabled}
          onResult={setSearchResult}
          polygons={props.polygons}
        />
        <ZoneMapClickCapture {...props} />
        {searchResult ? (
          <Marker icon={searchResultIcon} position={searchResult.point} zIndexOffset={1000}>
            <Popup>{searchResult.label}</Popup>
          </Marker>
        ) : null}
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
