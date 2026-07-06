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
        fetchSchoolTermReservations,
        type SchoolZone,
        type SchoolPOI,
        type Pack,
        type SchoolRegisteredDeviceBeaconLocation,
        type PackSpotReservation,
} from "../../lib/api";

function getPackPhotoUrl(pack: Pick<Pack, "photo"> | null | undefined): string {
        return pack?.photo?.path_do_spaces?.trim() ?? "";
}

function isReservationCurrentlyActive(
        reservation: PackSpotReservation,
        nowSeconds: number,
): boolean {
        if (!reservation.active) return false;
        if (reservation.status.toLowerCase() !== "approved") return false;
        if (reservation.start_time && reservation.start_time > nowSeconds) return false;
        if (reservation.end_time && reservation.end_time < nowSeconds) return false;
        return true;
}

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

function timeAgo(unix: number): string {
        const ms = unix < 1e11 ? unix * 1000 : unix;
        const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return `${Math.floor(diffHr / 24)}d ago`;
}

function formatBeaconRadius(value?: number | null) {
        if (!isValidCoordinate(value)) {
                return "Accuracy unknown";
        }
        const feet = value * 3.28084;
        if (feet < 5280) {
                return `Accuracy: +/- ${Math.round(feet).toLocaleString()} ft`;
        }
        const miles = feet / 5280;
        return `Accuracy: +/- ${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString()} mi`;
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
        const [reservations, setReservations] = useState<PackSpotReservation[]>([]);
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

        const [selectedPoi, setSelectedPoi] = useState<SchoolPOI | null>(null);
        const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
        const [selectedZone, setSelectedZone] = useState<SchoolZone | null>(null);

        useEffect(() => {
                if (!activeSchoolId || !managedAppId) return;
                let dead = false;
                setLoading(true);
                setError("");
                Promise.all([
                        fetchSchoolZones(managedAppId, activeSchoolId),
                        fetchSchoolPOIs(managedAppId, activeSchoolId),
                        fetchAdminSchoolPacks(adminUserUUID, managedAppId, activeSchoolId),
                        fetchSchoolTermReservations(adminUserUUID, managedAppId, activeSchoolId),
                ])
                        .then(([z, p, pk, res]) => {
                                if (dead) return;
                                setZones(z);
                                setPois(p);
                                setPacks(pk);
                                setReservations(res);
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
        const selectedZonePointsLost = useMemo(() => {
                if (!selectedZone) return null;
                const rules = selectedZone.punishment_policy?.rules ?? [];
                if (rules.length === 0) return null;
                return rules.reduce(
                        (max, rule) => (rule.points_lost > max ? rule.points_lost : max),
                        rules[0].points_lost,
                );
        }, [selectedZone]);
        const selectedPackSpotStatuses = useMemo(() => {
                if (!selectedPack) return [];
                const nowSeconds = Math.floor(Date.now() / 1000);
                return selectedPack.spots
                        .slice()
                        .sort((a, b) => a.spot_number - b.spot_number)
                        .map((spot) => {
                                const isReserved = reservations.some(
                                        (r) =>
                                                r.spot_uuid === spot.spot_uuid &&
                                                isReservationCurrentlyActive(r, nowSeconds),
                                );
                                return {
                                        spot_uuid: spot.spot_uuid,
                                        spot_number: spot.spot_number,
                                        active: spot.active,
                                        reserved: isReserved,
                                };
                        });
        }, [selectedPack, reservations]);
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
                                                                }}
                                                                eventHandlers={{
                                                                        click: () => setSelectedZone(z),
                                                                }}>
                                                                <Tooltip sticky direction="top">
                                                                        <strong>{z.title || "No-go zone"}</strong>
                                                                        <br />⛔ Students must not enter
                                                                </Tooltip>
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
                                                                }}
                                                                eventHandlers={{
                                                                        click: () => setSelectedZone(z),
                                                                }}>
                                                                <Tooltip sticky direction="top">
                                                                        <strong>{z.title || "Speed limit zone"}</strong>
                                                                        {z.speed_limit_mph != null ? (
                                                                                <> — {z.speed_limit_mph} mph</>
                                                                        ) : null}
                                                                </Tooltip>
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
                                                                                                onClick={() => setSelectedPoi(poi)}>
                                                                                                View Details →
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
                                                                                        onClick={() => setSelectedPack(pack)}>
                                                                                        View Details →
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
                                                                                {location.observed_at != null && (
                                                                                        <> · {timeAgo(location.observed_at)}</>
                                                                                )}
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
                                                                                                {location.observed_at != null && (
                                                                                                        <span className="mo-popup-age"> · {timeAgo(location.observed_at)}</span>
                                                                                                )}
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

                        {selectedPoi && (
                                <div
                                        className="mo-detail-modal-backdrop"
                                        onClick={() => setSelectedPoi(null)}>
                                        <div
                                                className="mo-detail-modal-sheet"
                                                onClick={(e) => e.stopPropagation()}>
                                                <div className="mo-detail-modal-header">
                                                        <div className="mo-detail-modal-header-copy">
                                                                <span className="mo-popup-badge mo-popup-badge--poi">
                                                                        ⭐ Check-in spot
                                                                </span>
                                                                <h3>{selectedPoi.title || "Check-in spot"}</h3>
                                                        </div>
                                                        <button
                                                                type="button"
                                                                className="secondary-button mo-detail-modal-close"
                                                                onClick={() => setSelectedPoi(null)}>
                                                                Close
                                                        </button>
                                                </div>

                                                {selectedPoi.description && (
                                                        <p className="mo-detail-modal-desc">{selectedPoi.description}</p>
                                                )}

                                                <div className="mo-detail-modal-grid">
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Status</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedPoi.active ? "✅ Active" : "⏸ Inactive"}
                                                                </span>
                                                        </div>
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Bonus points</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedPoi.bonus_points > 0
                                                                                ? `⭐ ${selectedPoi.bonus_points}`
                                                                                : "None"}
                                                                </span>
                                                        </div>
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Radius</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {Math.round(selectedPoi.radius_meters * 3.281)} ft
                                                                </span>
                                                        </div>
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Coordinates</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedPoi.lat.toFixed(5)}, {selectedPoi.lng.toFixed(5)}
                                                                </span>
                                                        </div>
                                                </div>

                                                <button
                                                        type="button"
                                                        className="mo-detail-modal-manage-link"
                                                        onClick={() => {
                                                                setSelectedPoi(null);
                                                                navigate("/pois");
                                                        }}>
                                                        Manage in POI Setup →
                                                </button>
                                        </div>
                                </div>
                        )}

                        {selectedPack && (
                                <div
                                        className="mo-detail-modal-backdrop"
                                        onClick={() => setSelectedPack(null)}>
                                        <div
                                                className="mo-detail-modal-sheet"
                                                onClick={(e) => e.stopPropagation()}>
                                                <div className="mo-detail-modal-header">
                                                        <div className="mo-detail-modal-header-copy">
                                                                <span className="mo-popup-badge mo-popup-badge--pack">
                                                                        🅿 Juise Pack
                                                                </span>
                                                                <h3>{selectedPack.name || "Juise Pack"}</h3>
                                                        </div>
                                                        <button
                                                                type="button"
                                                                className="secondary-button mo-detail-modal-close"
                                                                onClick={() => setSelectedPack(null)}>
                                                                Close
                                                        </button>
                                                </div>

                                                {getPackPhotoUrl(selectedPack) ? (
                                                        <img
                                                                className="mo-detail-modal-pack-photo"
                                                                src={getPackPhotoUrl(selectedPack)}
                                                                alt={selectedPack.name || "Juise Pack"}
                                                        />
                                                ) : null}

                                                {selectedPack.description && (
                                                        <p className="mo-detail-modal-desc">{selectedPack.description}</p>
                                                )}

                                                <div className="mo-detail-modal-grid">
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Status</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedPack.active ? "✅ Active" : "⏸ Inactive"}
                                                                </span>
                                                        </div>
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Spots</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedPack.spot_count} spot
                                                                        {selectedPack.spot_count !== 1 ? "s" : ""}
                                                                </span>
                                                        </div>
                                                        {selectedPack.school_owner?.campus_id && (
                                                                <div className="mo-detail-modal-cell">
                                                                        <span className="mo-detail-modal-label">Campus</span>
                                                                        <span className="mo-detail-modal-value">
                                                                                {selectedPack.school_owner.campus_id}
                                                                        </span>
                                                                </div>
                                                        )}
                                                </div>

                                                {selectedPackSpotStatuses.length > 0 && (
                                                        <div className="mo-detail-modal-spots">
                                                                <span className="mo-detail-modal-label">Spot status</span>
                                                                <div className="mo-detail-modal-spot-chips">
                                                                        {selectedPackSpotStatuses.map((spot) => (
                                                                                <span
                                                                                        key={spot.spot_uuid}
                                                                                        className={`mo-detail-modal-spot-chip${
                                                                                                !spot.active
                                                                                                        ? " mo-detail-modal-spot-chip--inactive"
                                                                                                        : spot.reserved
                                                                                                                ? " mo-detail-modal-spot-chip--reserved"
                                                                                                                : " mo-detail-modal-spot-chip--open"
                                                                                        }`}>
                                                                                        #{spot.spot_number} ·{" "}
                                                                                        {!spot.active
                                                                                                ? "Inactive"
                                                                                                : spot.reserved
                                                                                                        ? "Reserved"
                                                                                                        : "Open"}
                                                                                </span>
                                                                        ))}
                                                                </div>
                                                        </div>
                                                )}

                                                <button
                                                        type="button"
                                                        className="mo-detail-modal-manage-link"
                                                        onClick={() => {
                                                                setSelectedPack(null);
                                                                navigate("/packs");
                                                        }}>
                                                        Manage in Juise Packs →
                                                </button>
                                        </div>
                                </div>
                        )}

                        {selectedZone && (
                                <div
                                        className="mo-detail-modal-backdrop"
                                        onClick={() => setSelectedZone(null)}>
                                        <div
                                                className="mo-detail-modal-sheet"
                                                onClick={(e) => e.stopPropagation()}>
                                                <div className="mo-detail-modal-header">
                                                        <div className="mo-detail-modal-header-copy">
                                                                <span
                                                                        className={`mo-popup-badge ${
                                                                                selectedZone.zone_type === "no_go"
                                                                                        ? "mo-popup-badge--nogo"
                                                                                        : "mo-popup-badge--speed"
                                                                        }`}>
                                                                        {selectedZone.zone_type === "no_go"
                                                                                ? "⛔ No-go zone"
                                                                                : "🚦 Speed limit zone"}
                                                                </span>
                                                                <h3>
                                                                        {selectedZone.title ||
                                                                                (selectedZone.zone_type === "no_go"
                                                                                        ? "No-go zone"
                                                                                        : "Speed limit zone")}
                                                                </h3>
                                                        </div>
                                                        <button
                                                                type="button"
                                                                className="secondary-button mo-detail-modal-close"
                                                                onClick={() => setSelectedZone(null)}>
                                                                Close
                                                        </button>
                                                </div>

                                                {selectedZone.description && (
                                                        <p className="mo-detail-modal-desc">{selectedZone.description}</p>
                                                )}

                                                <div className="mo-detail-modal-grid">
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Status</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedZone.active ? "✅ Active" : "⏸ Inactive"}
                                                                </span>
                                                        </div>
                                                        {selectedZone.zone_type === "speed_limit" &&
                                                        selectedZone.speed_limit_mph != null ? (
                                                                <div className="mo-detail-modal-cell">
                                                                        <span className="mo-detail-modal-label">Speed limit</span>
                                                                        <span className="mo-detail-modal-value">
                                                                                {selectedZone.speed_limit_mph} mph
                                                                        </span>
                                                                </div>
                                                        ) : null}
                                                        <div className="mo-detail-modal-cell">
                                                                <span className="mo-detail-modal-label">Points lost</span>
                                                                <span className="mo-detail-modal-value">
                                                                        {selectedZonePointsLost != null
                                                                                ? `-${selectedZonePointsLost} pts`
                                                                                : "Not set"}
                                                                </span>
                                                        </div>
                                                </div>

                                                <button
                                                        type="button"
                                                        className="mo-detail-modal-manage-link"
                                                        onClick={() => {
                                                                setSelectedZone(null);
                                                                navigate("/zones");
                                                        }}>
                                                        Open Penalty Zones →
                                                </button>
                                        </div>
                                </div>
                        )}
                </div>
        );
}
