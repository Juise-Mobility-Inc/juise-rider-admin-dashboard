import { useState, useMemo, useEffect, Fragment } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Circle,
  CircleMarker,
  Popup,
  Tooltip,
} from "react-leaflet";
import {
  fetchSchoolZones,
  fetchSchoolPOIs,
  fetchAdminSchoolPacks,
  type SchoolZone,
  type SchoolPOI,
  type Pack,
} from "../../lib/api";

interface Props {
  activeSchoolId: string;
  managedAppId: string;
  adminUserUUID: string;
}

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const US_CENTER: [number, number] = [39.8283, -98.5795];

export function MapOverviewScreen({
  activeSchoolId,
  managedAppId,
  adminUserUUID,
}: Props) {
  const [zones, setZones] = useState<SchoolZone[]>([]);
  const [pois, setPois] = useState<SchoolPOI[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showNoGoZones, setShowNoGoZones] = useState(true);
  const [showSpeedZones, setShowSpeedZones] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showPacks, setShowPacks] = useState(true);

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

  const noGoZones = useMemo(
    () =>
      zones.filter((z) => z.zone_type === "no_go" && z.polygon.length >= 3 && z.active),
    [zones],
  );
  const speedZones = useMemo(
    () =>
      zones.filter(
        (z) => z.zone_type === "speed_limit" && z.polygon.length >= 3 && z.active,
      ),
    [zones],
  );
  const validPOIs = useMemo(
    () =>
      pois.filter(
        (p) => p.active && p.lat != null && p.lng != null,
      ),
    [pois],
  );
  const packsWithLocation = useMemo(
    () => packs.filter((p) => p.location?.lat != null && p.location?.lng != null),
    [packs],
  );

  const mapCenter = useMemo((): [number, number] => {
    if (noGoZones[0]?.polygon[0])
      return [noGoZones[0].polygon[0].lat, noGoZones[0].polygon[0].lng];
    if (speedZones[0]?.polygon[0])
      return [speedZones[0].polygon[0].lat, speedZones[0].polygon[0].lng];
    if (validPOIs[0]) return [validPOIs[0].lat, validPOIs[0].lng];
    if (packsWithLocation[0]?.location)
      return [packsWithLocation[0].location!.lat, packsWithLocation[0].location!.lng];
    return US_CENTER;
  }, [noGoZones, speedZones, validPOIs, packsWithLocation]);

  const totalZones = noGoZones.length + speedZones.length;

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
              {packsWithLocation.length} pack{packsWithLocation.length !== 1 ? "s" : ""}
            </span>
          </div>
          {loading && <span className="mo-loading-tag">Loading…</span>}
          {error && <span className="mo-error-tag">{error}</span>}
        </div>
        <div className="mo-layer-bar">
          {layers.map((l) => (
            <button
              key={l.key}
              className={`mo-layer-btn${l.active ? " mo-layer-btn--on" : ""}`}
              onClick={l.toggle}
            >
              <span className="mo-layer-dot" style={{ background: l.color }} />
              {l.label}
              <span className="mo-layer-count">{l.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mo-map-wrap">
        <MapContainer
          key={`${activeSchoolId}-${mapCenter[0]}-${mapCenter[1]}`}
          center={mapCenter}
          zoom={mapCenter === US_CENTER ? 4 : 14}
          className="mo-map"
          scrollWheelZoom
        >
          <TileLayer attribution={TILE_ATTR} url={TILE_URL} />

          {showNoGoZones &&
            noGoZones.map((z) => (
              <Polygon
                key={z.zone_uuid}
                positions={z.polygon.map(
                  (p): [number, number] => [p.lat, p.lng],
                )}
                pathOptions={{
                  color: "#b91c1c",
                  fillColor: "#ef4444",
                  fillOpacity: 0.35,
                  weight: 3.5,
                }}
              >
                <Tooltip sticky direction="top">
                  <strong>{z.title || "No-go zone"}</strong>
                  <br />
                  ⛔ Students must not enter
                </Tooltip>
                <Popup>
                  <strong>{z.title || "No-go zone"}</strong>
                  {z.description ? <div>{z.description}</div> : null}
                  <div style={{ color: "#b91c1c" }}>⛔ No-go zone</div>
                </Popup>
              </Polygon>
            ))}

          {showSpeedZones &&
            speedZones.map((z) => (
              <Polygon
                key={z.zone_uuid}
                positions={z.polygon.map(
                  (p): [number, number] => [p.lat, p.lng],
                )}
                pathOptions={{
                  color: "#b45309",
                  fillColor: "#f59e0b",
                  fillOpacity: 0.25,
                  weight: 3,
                }}
              >
                <Tooltip sticky direction="top">
                  <strong>{z.title || "Speed limit zone"}</strong>
                  {z.speed_limit_mph != null ? (
                    <> — {z.speed_limit_mph} mph</>
                  ) : null}
                </Tooltip>
                <Popup>
                  <strong>{z.title || "Speed limit zone"}</strong>
                  {z.description ? <div>{z.description}</div> : null}
                  {z.speed_limit_mph != null ? (
                    <div style={{ color: "#b45309" }}>
                      🚦 {z.speed_limit_mph} mph limit
                    </div>
                  ) : (
                    <div>Speed limit zone</div>
                  )}
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
                <CircleMarker
                  center={[poi.lat, poi.lng]}
                  radius={8}
                  pathOptions={{
                    color: "#15803d",
                    fillColor: "#27cc5e",
                    fillOpacity: 0.95,
                    weight: 2,
                  }}
                >
                  <Tooltip sticky direction="top">
                    <strong>{poi.title || "Check-in spot"}</strong>
                    {poi.bonus_points > 0 ? (
                      <>
                        <br />⭐ {poi.bonus_points} bonus pts
                      </>
                    ) : null}
                  </Tooltip>
                  <Popup>
                    <strong>{poi.title || "Check-in spot"}</strong>
                    {poi.description ? <div>{poi.description}</div> : null}
                    {poi.bonus_points > 0 ? (
                      <div>⭐ {poi.bonus_points} bonus points</div>
                    ) : null}
                    <div>Radius: {Math.round(poi.radius_meters * 3.281)} ft</div>
                  </Popup>
                </CircleMarker>
              </Fragment>
            ))}

          {showPacks &&
            packsWithLocation.map((pack) => (
              <CircleMarker
                key={pack.pack_uuid}
                center={[pack.location!.lat, pack.location!.lng]}
                radius={11}
                pathOptions={{
                  color: "#1d4ed8",
                  fillColor: "#3b82f6",
                  fillOpacity: 0.9,
                  weight: 2.5,
                }}
              >
                <Tooltip sticky direction="top">
                  <strong>{pack.name || "Juise Pack"}</strong>
                  <br />
                  🅿 {pack.spot_count} spot{pack.spot_count !== 1 ? "s" : ""}
                </Tooltip>
                <Popup>
                  <strong>{pack.name || "Juise Pack"}</strong>
                  {pack.description ? <div>{pack.description}</div> : null}
                  <div>
                    🅿 {pack.spot_count} spot{pack.spot_count !== 1 ? "s" : ""}
                  </div>
                  <div>{pack.active ? "✅ Active" : "⏸ Inactive"}</div>
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>

        {!loading &&
          totalZones === 0 &&
          validPOIs.length === 0 &&
          packsWithLocation.length === 0 && (
            <div className="mo-empty-overlay">
              <div className="mo-empty-card">
                <span className="mo-empty-icon">🗺</span>
                <strong>Nothing mapped yet</strong>
                <span>
                  Add zones, check-in spots, or Juise Pack locations to see
                  them here.
                </span>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
