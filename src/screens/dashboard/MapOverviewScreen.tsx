import {
	useState,
	useMemo,
	useEffect,
	Fragment,
	useCallback,
	useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
	MapContainer,
	TileLayer,
	Polygon,
	Circle,
	Marker,
	Popup,
	Tooltip,
	useMap,
} from "react-leaflet";
import {
	beaconLocationIcon,
	unvisitedPoiIcon,
	juisePackIcon,
	staleBeaconLocationIcon,
} from "../../lib/mapIcons";
import {
	fetchSchoolBeaconLocations,
	fetchSchoolZones,
	fetchSchoolPOIs,
	fetchAdminSchoolPacks,
	type SchoolZone,
	type SchoolPOI,
	type Pack,
	type SchoolRegisteredDeviceBeaconLocation,
} from "../../lib/api";

function MapInvalidator() {
	const map = useMap();
	useEffect(() => {
		map.invalidateSize();
		const t = setTimeout(() => map.invalidateSize(), 200);
		return () => clearTimeout(t);
	}, [map]);
	return null;
}

function MapViewAnchor({
	center,
	zoom,
	anchorKey,
}: {
	center: [number, number];
	zoom: number;
	anchorKey: string;
}) {
	const map = useMap();
	const lastAnchorKeyRef = useRef("");
	useEffect(() => {
		if (lastAnchorKeyRef.current === anchorKey) {
			return;
		}
		lastAnchorKeyRef.current = anchorKey;
		map.setView(center, zoom, { animate: false });
	}, [map, center, zoom, anchorKey]);
	return null;
}

interface Props {
	activeSchoolId: string;
	managedAppId: string;
	adminUserUUID: string;
}

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const US_CENTER: [number, number] = [39.8283, -98.5795];
const BEACON_REFRESH_MS = 15_000;
const MAP_MAX_ZOOM = 22;
const TILE_MAX_NATIVE_ZOOM = 19;

function isValidCoordinate(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function formatBeaconTime(value?: number | null) {
	if (!value) {
		return "Never";
	}
	return new Date(value * 1000).toLocaleString();
}

function formatBeaconRadius(value?: number | null) {
	return isValidCoordinate(value)
		? `${Math.round(value)} m radius`
		: "Radius unknown";
}

function formatBeaconRssi(value?: number | null) {
	return typeof value === "number" && Number.isFinite(value)
		? `${value} dBm`
		: "RSSI unknown";
}

export function MapOverviewScreen({
	activeSchoolId,
	managedAppId,
	adminUserUUID,
}: Props) {
	const navigate = useNavigate();
	const [zones, setZones] = useState<SchoolZone[]>([]);
	const [pois, setPois] = useState<SchoolPOI[]>([]);
	const [packs, setPacks] = useState<Pack[]>([]);
	const [beaconLocations, setBeaconLocations] = useState<
		SchoolRegisteredDeviceBeaconLocation[]
	>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [beaconLoading, setBeaconLoading] = useState(false);
	const [beaconError, setBeaconError] = useState("");
	const [beaconLastRefreshAt, setBeaconLastRefreshAt] = useState<number | null>(
		null,
	);

	const [showNoGoZones, setShowNoGoZones] = useState(true);
	const [showSpeedZones, setShowSpeedZones] = useState(true);
	const [showPOIs, setShowPOIs] = useState(true);
	const [showPacks, setShowPacks] = useState(true);
	const [showBeacons, setShowBeacons] = useState(true);

	useEffect(() => {
		if (!activeSchoolId || !managedAppId) return;
		let dead = false;
		setLoading(true);
		setError("");
		Promise.all([
			fetchSchoolZones(managedAppId, activeSchoolId),
			fetchSchoolPOIs(managedAppId, activeSchoolId),
			fetchAdminSchoolPacks(adminUserUUID, managedAppId, activeSchoolId),
		])
			.then(([z, p, pk]) => {
				if (dead) return;
				setZones(z);
				setPois(p);
				setPacks(pk);
			})
			.catch((e) => {
				if (!dead)
					setError(e instanceof Error ? e.message : "Failed to load map data");
			})
			.finally(() => {
				if (!dead) setLoading(false);
			});
		return () => {
			dead = true;
		};
	}, [activeSchoolId, managedAppId, adminUserUUID]);

	const refreshBeaconLocations = useCallback(async () => {
		if (!activeSchoolId || !managedAppId) {
			setBeaconLocations([]);
			setBeaconError("");
			setBeaconLastRefreshAt(null);
			return;
		}
		setBeaconLoading(true);
		setBeaconError("");
		try {
			const locations = await fetchSchoolBeaconLocations(
				managedAppId,
				activeSchoolId,
				{
					maxAgeSeconds: 3600,
					staleAfterSeconds: 300,
					limit: 10,
				},
			);
			setBeaconLocations(locations);
			setBeaconLastRefreshAt(Date.now());
		} catch (nextError) {
			setBeaconError(
				nextError instanceof Error
					? nextError.message
					: "Failed to load beacon locations",
			);
		} finally {
			setBeaconLoading(false);
		}
	}, [activeSchoolId, managedAppId]);

	useEffect(() => {
		void refreshBeaconLocations();
		if (!activeSchoolId || !managedAppId) {
			return;
		}
		const refreshTimer = window.setInterval(() => {
			void refreshBeaconLocations();
		}, BEACON_REFRESH_MS);
		return () => window.clearInterval(refreshTimer);
	}, [activeSchoolId, managedAppId, refreshBeaconLocations]);

	const noGoZones = useMemo(
		() =>
			zones.filter(
				(z) => z.zone_type === "no_go" && z.polygon.length >= 3 && z.active,
			),
		[zones],
	);
	const speedZones = useMemo(
		() =>
			zones.filter(
				(z) =>
					z.zone_type === "speed_limit" && z.polygon.length >= 3 && z.active,
			),
		[zones],
	);
	const validPOIs = useMemo(
		() => pois.filter((p) => p.active && p.lat != null && p.lng != null),
		[pois],
	);
	const packsWithLocation = useMemo(
		() =>
			packs.filter((p) => p.location?.lat != null && p.location?.lng != null),
		[packs],
	);
	const beaconLocationsWithLocation = useMemo(
		() =>
			beaconLocations.filter(
				(location) =>
					isValidCoordinate(location.latitude) &&
					isValidCoordinate(location.longitude),
			),
		[beaconLocations],
	);

	const mapView = useMemo((): {
		center: [number, number];
		zoom: number;
		anchorKey: string;
	} => {
		if (noGoZones[0]?.polygon[0]) {
			const point = noGoZones[0].polygon[0];
			return {
				center: [point.lat, point.lng],
				zoom: 14,
				anchorKey: `nogo:${noGoZones[0].zone_uuid}`,
			};
		}
		if (speedZones[0]?.polygon[0]) {
			const point = speedZones[0].polygon[0];
			return {
				center: [point.lat, point.lng],
				zoom: 14,
				anchorKey: `speed:${speedZones[0].zone_uuid}`,
			};
		}
		if (validPOIs[0]) {
			return {
				center: [validPOIs[0].lat, validPOIs[0].lng],
				zoom: 14,
				anchorKey: `poi:${validPOIs[0].poi_uuid}`,
			};
		}
		if (packsWithLocation[0]?.location) {
			return {
				center: [
					packsWithLocation[0].location!.lat,
					packsWithLocation[0].location!.lng,
				],
				zoom: 14,
				anchorKey: `pack:${packsWithLocation[0].pack_uuid}`,
			};
		}
		if (beaconLocationsWithLocation[0]) {
			const location = beaconLocationsWithLocation[0];
			return {
				center: [location.latitude!, location.longitude!],
				zoom: 16,
				anchorKey: `beacon:${location.registered_device_uuid}`,
			};
		}
		return { center: US_CENTER, zoom: 4, anchorKey: "us" };
	}, [
		noGoZones,
		speedZones,
		validPOIs,
		packsWithLocation,
		beaconLocationsWithLocation,
	]);

	const totalZones = noGoZones.length + speedZones.length;
	const mappedItemCount =
		totalZones +
		validPOIs.length +
		packsWithLocation.length +
		beaconLocationsWithLocation.length;

	const layers = [
		{
			key: "nogo",
			label: "No-go zones",
			count: noGoZones.length,
			active: showNoGoZones,
			toggle: () => setShowNoGoZones((v) => !v),
			color: "#e53e3e",
		},
		{
			key: "speed",
			label: "Speed limit zones",
			count: speedZones.length,
			active: showSpeedZones,
			toggle: () => setShowSpeedZones((v) => !v),
			color: "#f59e0b",
		},
		{
			key: "pois",
			label: "Check-in spots",
			count: validPOIs.length,
			active: showPOIs,
			toggle: () => setShowPOIs((v) => !v),
			color: "#27cc5e",
		},
		{
			key: "packs",
			label: "Juise Packs",
			count: packsWithLocation.length,
			active: showPacks,
			toggle: () => setShowPacks((v) => !v),
			color: "#3b82f6",
		},
		{
			key: "beacons",
			label: "Beacons",
			count: beaconLocationsWithLocation.length,
			active: showBeacons,
			toggle: () => setShowBeacons((v) => !v),
			color: "#ec4899",
		},
	];

	return (
		<div className="mo-shell">
			<div className="mo-header">
				<div className="mo-header-left">
					<h2 className="mo-title">Map Overview</h2>
					<div className="mo-stat-chips">
						<span className="mo-stat-chip mo-stat-chip--zones">
							{totalZones} zone{totalZones !== 1 ? "s" : ""}
						</span>
						<span className="mo-stat-chip mo-stat-chip--pois">
							{validPOIs.length} spot{validPOIs.length !== 1 ? "s" : ""}
						</span>
						<span className="mo-stat-chip mo-stat-chip--packs">
							{packsWithLocation.length} pack
							{packsWithLocation.length !== 1 ? "s" : ""}
						</span>
						<span className="mo-stat-chip mo-stat-chip--beacons">
							{beaconLocationsWithLocation.length} beacon
							{beaconLocationsWithLocation.length !== 1 ? "s" : ""}
						</span>
					</div>
					{loading && <span className="mo-loading-tag">Loading…</span>}
					{error && <span className="mo-error-tag">{error}</span>}
					{beaconLoading && (
						<span className="mo-loading-tag">Refreshing beacons…</span>
					)}
					{beaconError && <span className="mo-error-tag">{beaconError}</span>}
					{beaconLastRefreshAt ? (
						<span className="mo-school-tag">
							Beacons updated{" "}
							{new Date(beaconLastRefreshAt).toLocaleTimeString()}
						</span>
					) : null}
				</div>
				<div className="mo-layer-bar">
					<button
						className="mo-layer-btn"
						type="button"
						onClick={() => void refreshBeaconLocations()}
						disabled={beaconLoading}>
						Refresh beacons
					</button>
					{layers.map((l) => (
						<button
							key={l.key}
							className={`mo-layer-btn${l.active ? " mo-layer-btn--on" : ""}`}
							onClick={l.toggle}>
							<span className="mo-layer-dot" style={{ background: l.color }} />
							{l.label}
							<span className="mo-layer-count">{l.count}</span>
						</button>
					))}
				</div>
			</div>

			<div className="mo-map-wrap">
				<MapContainer
					key={activeSchoolId || "map-overview"}
					center={mapView.center}
					zoom={mapView.zoom}
					maxZoom={MAP_MAX_ZOOM}
					className="mo-map"
					scrollWheelZoom>
					<TileLayer
						attribution={TILE_ATTR}
						url={TILE_URL}
						maxZoom={MAP_MAX_ZOOM}
						maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
					/>
					<MapInvalidator />
					<MapViewAnchor
						center={mapView.center}
						zoom={mapView.zoom}
						anchorKey={mapView.anchorKey}
					/>

					{showNoGoZones &&
						noGoZones.map((z) => (
							<Polygon
								key={z.zone_uuid}
								positions={z.polygon.map((p): [number, number] => [
									p.lat,
									p.lng,
								])}
								pathOptions={{
									color: "#b91c1c",
									fillColor: "#ef4444",
									fillOpacity: 0.35,
									weight: 3.5,
								}}>
								<Tooltip sticky direction="top">
									<strong>{z.title || "No-go zone"}</strong>
									<br />⛔ Students must not enter
								</Tooltip>
								<Popup minWidth={200} maxWidth={260}>
									<div className="mo-popup">
										<span className="mo-popup-badge mo-popup-badge--nogo">
											⛔ No-go zone
										</span>
										<div className="mo-popup-title">
											{z.title || "No-go zone"}
										</div>
										{z.description ? (
											<div className="mo-popup-desc">{z.description}</div>
										) : null}
										<div className="mo-popup-meta">
											Students must not enter this area
										</div>
										<button
											className="mo-popup-nav-btn mo-popup-nav-btn--nogo"
											onClick={() => navigate("/zones")}>
											Open Penalty Zones →
										</button>
									</div>
								</Popup>
							</Polygon>
						))}

					{showSpeedZones &&
						speedZones.map((z) => (
							<Polygon
								key={z.zone_uuid}
								positions={z.polygon.map((p): [number, number] => [
									p.lat,
									p.lng,
								])}
								pathOptions={{
									color: "#b45309",
									fillColor: "#f59e0b",
									fillOpacity: 0.25,
									weight: 3,
								}}>
								<Tooltip sticky direction="top">
									<strong>{z.title || "Speed limit zone"}</strong>
									{z.speed_limit_mph != null ? (
										<> — {z.speed_limit_mph} mph</>
									) : null}
								</Tooltip>
								<Popup minWidth={200} maxWidth={260}>
									<div className="mo-popup">
										<span className="mo-popup-badge mo-popup-badge--speed">
											🚦 Speed limit zone
										</span>
										<div className="mo-popup-title">
											{z.title || "Speed limit zone"}
										</div>
										{z.description ? (
											<div className="mo-popup-desc">{z.description}</div>
										) : null}
										{z.speed_limit_mph != null ? (
											<div className="mo-popup-meta mo-popup-meta--speed">
												{z.speed_limit_mph} mph limit
											</div>
										) : null}
										<button
											className="mo-popup-nav-btn mo-popup-nav-btn--speed"
											onClick={() => navigate("/zones")}>
											Open Penalty Zones →
										</button>
									</div>
								</Popup>
							</Polygon>
						))}

					{showPOIs &&
						validPOIs.map((poi) => (
							<Fragment key={poi.poi_uuid}>
								<Circle
									center={[poi.lat, poi.lng]}
									radius={poi.radius_meters}
									pathOptions={{
										color: "#15803d",
										fillColor: "#27cc5e",
										fillOpacity: 0.15,
										weight: 2,
									}}
								/>
								<Marker position={[poi.lat, poi.lng]} icon={unvisitedPoiIcon}>
									<Tooltip sticky direction="top">
										<strong>{poi.title || "Check-in spot"}</strong>
										{poi.bonus_points > 0 ? (
											<>
												<br />⭐ {poi.bonus_points} bonus pts
											</>
										) : null}
									</Tooltip>
									<Popup minWidth={200} maxWidth={260}>
										<div className="mo-popup">
											<span className="mo-popup-badge mo-popup-badge--poi">
												⭐ Check-in spot
											</span>
											<div className="mo-popup-title">
												{poi.title || "Check-in spot"}
											</div>
											{poi.description ? (
												<div className="mo-popup-desc">{poi.description}</div>
											) : null}
											{poi.bonus_points > 0 ? (
												<div className="mo-popup-meta">
													{poi.bonus_points} bonus points on check-in
												</div>
											) : null}
											<div className="mo-popup-meta">
												Radius: {Math.round(poi.radius_meters * 3.281)} ft
											</div>
											<button
												className="mo-popup-nav-btn mo-popup-nav-btn--poi"
												onClick={() => navigate("/pois")}>
												Open POI Setup →
											</button>
										</div>
									</Popup>
								</Marker>
							</Fragment>
						))}

					{showPacks &&
						packsWithLocation.map((pack) => (
							<Marker
								key={pack.pack_uuid}
								position={[pack.location!.lat, pack.location!.lng]}
								icon={juisePackIcon}>
								<Tooltip sticky direction="top">
									<strong>{pack.name || "Juise Pack"}</strong>
									<br />
									🅿 {pack.spot_count} spot{pack.spot_count !== 1 ? "s" : ""}
								</Tooltip>
								<Popup minWidth={200} maxWidth={260}>
									<div className="mo-popup">
										<span className="mo-popup-badge mo-popup-badge--pack">
											🅿 Juise Pack
										</span>
										<div className="mo-popup-title">
											{pack.name || "Juise Pack"}
										</div>
										{pack.description ? (
											<div className="mo-popup-desc">{pack.description}</div>
										) : null}
										<div className="mo-popup-meta">
											{pack.spot_count} parking spot
											{pack.spot_count !== 1 ? "s" : ""}
										</div>
										<div
											className={`mo-popup-meta ${pack.active ? "mo-popup-meta--active" : "mo-popup-meta--inactive"}`}>
											{pack.active ? "✅ Active" : "⏸ Inactive"}
										</div>
										<button
											className="mo-popup-nav-btn mo-popup-nav-btn--pack"
											onClick={() => navigate("/packs")}>
											Open Juise Packs →
										</button>
									</div>
								</Popup>
							</Marker>
						))}

					{showBeacons &&
						beaconLocationsWithLocation.map((location) => {
							const deviceLabel =
								location.device_label ||
								location.device.nickname ||
								[location.device.make, location.device.model]
									.filter(Boolean)
									.join(" ")
									.trim() ||
								location.device.device_type ||
								"Registered device";
							const ownerLabel =
								location.owner_display_name || location.owner_user_uuid;
							return (
								<Marker
									key={`${location.registered_device_uuid}:${location.beacon_mac_normalized}`}
									position={[location.latitude!, location.longitude!]}
									icon={
										location.stale
											? staleBeaconLocationIcon
											: beaconLocationIcon
									}
									zIndexOffset={600}>
									<Tooltip sticky direction="top">
										<strong>{deviceLabel}</strong>
										<br />
										{location.stale
											? "Stale beacon location"
											: "Live beacon location"}
									</Tooltip>
									<Popup minWidth={220} maxWidth={290}>
										<div className="mo-popup">
											<span
												className={`mo-popup-badge ${
													location.stale
														? "mo-popup-badge--beacon-stale"
														: "mo-popup-badge--beacon"
												}`}>
												{location.stale ? "Beacon stale" : "Beacon live"}
											</span>
											<div className="mo-popup-title">{deviceLabel}</div>
											<div className="mo-popup-desc">{ownerLabel}</div>
											<div className="mo-popup-meta">{location.beacon_mac}</div>
											<div className="mo-popup-meta">
												Observed: {formatBeaconTime(location.observed_at)}
											</div>
											<div className="mo-popup-meta">
												{formatBeaconRadius(location.radius_meters)}
											</div>
											<div className="mo-popup-meta">
												{formatBeaconRssi(location.rssi)} ·{" "}
												{location.sighting_count} sighting
												{location.sighting_count !== 1 ? "s" : ""}
											</div>
											{location.estimate_method ? (
												<div className="mo-popup-meta">
													Method: {location.estimate_method.replace(/_/g, " ")}
												</div>
											) : null}
											<button
												className="mo-popup-nav-btn mo-popup-nav-btn--beacon"
												onClick={() => {
													navigate(
														`/campus-devices?device=${encodeURIComponent(
															location.registered_device_uuid,
														)}`,
													);
												}}>
												View Device →
											</button>
										</div>
									</Popup>
								</Marker>
							);
						})}
				</MapContainer>

				{!loading && !beaconLoading && mappedItemCount === 0 && (
					<div className="mo-empty-overlay">
						<div className="mo-empty-card">
							<span className="mo-empty-icon">🗺</span>
							<strong>Nothing mapped yet</strong>
							<span>
								Add zones, check-in spots, Juise Pack locations, or registered
								beacon sightings to see them here.
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
