import { useEffect, useMemo, useState } from "react";
import { LatLngBounds, type LatLngLiteral, type Map as LeafletMap } from "leaflet";
import {
	CircleMarker,
	MapContainer,
	Polygon,
	TileLayer,
	useMap,
} from "react-leaflet";

import type { SchoolZonePoint } from "../lib/api";

type EventTone = "poi" | "penalty";

type Props = {
	lat: number;
	lng: number;
	label: string;
	tone: EventTone;
	polygon?: SchoolZonePoint[];
};

const DEFAULT_ZOOM = 17;
const MIN_ZOOM = 14;
const MAX_ZOOM = 20;
const TILE_LAYER_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_LAYER_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function focusEventOnMap(
	map: LeafletMap,
	center: LatLngLiteral,
	polygon?: SchoolZonePoint[],
) {
	const polygonPoints = (polygon ?? []).filter(
		(point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
	);
	if (polygonPoints.length >= 3) {
		const bounds = new LatLngBounds(
			polygonPoints.map((point) => [point.lat, point.lng] as [number, number]),
		);
		bounds.extend([center.lat, center.lng]);
		map.fitBounds(bounds.pad(0.22), {
			animate: false,
			padding: [14, 14],
		});
		return;
	}

	map.setView(center, DEFAULT_ZOOM, {
		animate: false,
	});
}

function RecenterMap(props: {
	center: LatLngLiteral;
	polygon?: SchoolZonePoint[];
}) {
	const map = useMap();

	useEffect(() => {
		focusEventOnMap(map, props.center, props.polygon);
	}, [map, props.center, props.polygon]);

	return null;
}

function CaptureMapInstance({
	onReady,
}: {
	onReady: (map: LeafletMap) => void;
}) {
	const map = useMap();

	useEffect(() => {
		onReady(map);
	}, [map, onReady]);

	return null;
}

export function StudentEventMiniMap({
	lat,
	lng,
	label,
	tone,
	polygon,
}: Props) {
	const center: LatLngLiteral = useMemo(
		() => ({
			lat,
			lng,
		}),
		[lat, lng],
	);
	const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
	const googleMapsUrl = useMemo(
		() =>
			`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
				`${lat},${lng}`,
			)}`,
		[lat, lng],
	);

	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return (
			<div className="student-event-map-shell">
				<div className="student-event-map-placeholder">
					Location unavailable
				</div>
			</div>
		);
	}

	const markerColors =
		tone === "penalty"
			? {
					stroke: "#8a1f1f",
					fill: "#d36a3d",
					polygonFill: "rgba(211, 106, 61, 0.2)",
				}
			: {
					stroke: "#16664b",
					fill: "#27cc5e",
					polygonFill: "rgba(39, 204, 94, 0.18)",
				};
	const polygonPoints = (polygon ?? []).filter(
		(point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
	);

	return (
		<div className="student-event-map-shell">
			<MapContainer
				attributionControl={false}
				boxZoom={false}
				center={center}
				className="student-event-map"
				doubleClickZoom
				dragging
				keyboard={false}
				maxZoom={MAX_ZOOM}
				minZoom={MIN_ZOOM}
				scrollWheelZoom
				touchZoom
				zoom={DEFAULT_ZOOM}
				zoomControl={false}>
				<TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
				<CaptureMapInstance onReady={setMapInstance} />
				<RecenterMap center={center} polygon={polygonPoints} />
				{polygonPoints.length >= 3 ? (
					<Polygon
						pathOptions={{
							color: markerColors.stroke,
							fillColor: markerColors.polygonFill,
							fillOpacity: 0.28,
							weight: 2.5,
						}}
						positions={polygonPoints.map((point) => [point.lat, point.lng])}
					/>
				) : null}
				<CircleMarker
					center={center}
					pathOptions={{
						color: markerColors.stroke,
						fillColor: markerColors.fill,
						fillOpacity: 0.96,
						weight: 3,
					}}
					radius={9}
				/>
			</MapContainer>
			<div className="student-event-map-actions">
				<button
					className="student-event-map-action"
					type="button"
					onClick={() => mapInstance?.zoomIn()}>
					+
				</button>
				<button
					className="student-event-map-action"
					type="button"
					onClick={() => mapInstance?.zoomOut()}>
					-
				</button>
				<button
					className="student-event-map-action student-event-map-action-wide"
					type="button"
					onClick={() => {
						if (!mapInstance) {
							return;
						}
						focusEventOnMap(mapInstance, center, polygonPoints);
					}}>
					Center pin
				</button>
				<a
					className="student-event-map-action student-event-map-action-link"
					href={googleMapsUrl}
					rel="noreferrer"
					target="_blank">
					Open in Google Maps
				</a>
			</div>
			<div className="student-event-map-caption">
				<span>{label}</span>
				<span>
					{lat.toFixed(5)}, {lng.toFixed(5)}
				</span>
			</div>
		</div>
	);
}
