import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LatLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import {
  fetchSchoolPOIs,
  fetchSchoolStudentRoster,
  fetchSchoolZones,
  fetchStudentRouteHistory,
  type SchoolPOI,
  type SchoolStudentRosterEntry,
  type SchoolZone,
  type StudentRouteHistorySession,
} from "../../lib/api";

const TILE_LAYER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_LAYER_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;

function getSpeedColor(speedMps: number | null | undefined): string {
  if (speedMps == null) return "#3b6fb5";
  const mph = speedMps * 2.237;
  if (mph < 5) return "#27cc5e";
  if (mph < 10) return "#a8d63c";
  if (mph < 15) return "#f6ae2d";
  if (mph < 20) return "#ff6b35";
  return "#e53e3e";
}

function formatStudentName(entry: SchoolStudentRosterEntry): string {
  const fullName =
    `${entry.user.first_name?.trim() ?? ""} ${entry.user.last_name?.trim() ?? ""}`.trim();
  return (
    fullName ||
    entry.user.username?.trim() ||
    entry.user.email?.trim() ||
    "Student"
  );
}

function formatStudentFirstName(entry: SchoolStudentRosterEntry): string {
  return entry.user.first_name?.trim() || formatStudentName(entry).split(" ")[0] || "Student";
}

function formatStudentDetail(entry: SchoolStudentRosterEntry): string {
  return (
    entry.membership.student_id?.trim() ||
    entry.user.email?.trim() ||
    entry.user.username?.trim() ||
    ""
  );
}

function resolveUserUUID(entry: SchoolStudentRosterEntry): string {
  return entry.membership.user_uuid?.trim() || entry.user.k_guid;
}

function getInitials(entry: SchoolStudentRosterEntry): string {
  const first = entry.user.first_name?.trim();
  const last = entry.user.last_name?.trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  const name = formatStudentName(entry);
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.charAt(0).toUpperCase() || "?";
}

function getPhotoUrl(entry: SchoolStudentRosterEntry): string | null {
  // UserMediaAsset objects need signed URLs fetched separately — not available
  // from the roster payload directly. Return null to show the initials avatar.
  // The infrastructure (showPhoto / onError) is in place for when a URL is available.
  void entry; // suppress lint
  return null;
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function formatRideLabel(timestamp: number): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp * 1000);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRideFull(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MapFitter({ points }: { points: [number, number][] }) {
  const map = useMap();
  const prevKey = useRef<string>("");

  useEffect(() => {
    if (points.length === 0) return;
    const key = `${points[0][0].toFixed(5)},${points[0][1].toFixed(5)},${points.length}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    const bounds = new LatLngBounds(points);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48] });
    }
  }, [map, points]);

  return null;
}

interface Props {
  activeSchoolId: string;
  managedAppId: string;
}

type RouteSegment = { color: string; positions: [number, number][] };

export function StudentRoutesScreen({ activeSchoolId, managedAppId }: Props) {
  const [roster, setRoster] = useState<SchoolStudentRosterEntry[]>([]);
  const [schoolZones, setSchoolZones] = useState<SchoolZone[]>([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [search, setSearch] = useState("");

  const [selectedUUID, setSelectedUUID] = useState<string | null>(null);
  const [routeHistory, setRouteHistory] = useState<StudentRouteHistorySession[]>([]);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const [showRoute, setShowRoute] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showPenalties, setShowPenalties] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);

  const [, setSchoolPOIs] = useState<SchoolPOI[]>([]);

  // track broken photo URLs so we can fall back to initials
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setRosterBusy(true);
    setRosterError("");
    Promise.all([
      fetchSchoolStudentRoster(managedAppId, activeSchoolId),
      fetchSchoolPOIs(managedAppId, activeSchoolId),
      fetchSchoolZones(managedAppId, activeSchoolId),
    ])
      .then(([rosterData, poisData, zonesData]) => {
        if (cancelled) return;
        setRoster(rosterData);
        setSchoolPOIs(poisData);
        setSchoolZones(zonesData);
      })
      .catch((err) => {
        if (!cancelled)
          setRosterError(err instanceof Error ? err.message : "Failed to load students");
      })
      .finally(() => { if (!cancelled) setRosterBusy(false); });
    return () => { cancelled = true; };
  }, [managedAppId, activeSchoolId]);

  const handleSelectStudent = useCallback(
    async (entry: SchoolStudentRosterEntry) => {
      const uuid = resolveUserUUID(entry);
      if (uuid === selectedUUID) return;
      setSelectedUUID(uuid);
      setRouteHistory([]);
      setSelectedSessionId(null);
      setRouteBusy(true);
      setRouteError("");
      try {
        const sessions = await fetchStudentRouteHistory(managedAppId, activeSchoolId, uuid);
        setRouteHistory(sessions);
        if (sessions.length > 0) setSelectedSessionId(sessions[0].session_id);
      } catch (err) {
        setRouteError(err instanceof Error ? err.message : "Failed to load routes");
      } finally {
        setRouteBusy(false);
      }
    },
    [managedAppId, activeSchoolId, selectedUUID],
  );

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((e) => {
      const name = formatStudentName(e).toLowerCase();
      const detail = formatStudentDetail(e).toLowerCase();
      return name.includes(q) || detail.includes(q);
    });
  }, [roster, search]);

  const selectedEntry = useMemo(
    () => roster.find((e) => resolveUserUUID(e) === selectedUUID) ?? null,
    [roster, selectedUUID],
  );

  const selectedSession = useMemo(
    () => routeHistory.find((s) => s.session_id === selectedSessionId) ?? null,
    [routeHistory, selectedSessionId],
  );

  const routeSegments = useMemo((): RouteSegment[] => {
    if (!selectedSession || !showRoute) return [];
    const pts = selectedSession.points;
    if (pts.length < 2) return [];
    const segments: RouteSegment[] = [];
    let currentColor = getSpeedColor(pts[0].speed_mps);
    let currentPositions: [number, number][] = [[pts[0].latitude, pts[0].longitude]];
    for (let i = 1; i < pts.length; i++) {
      const color = getSpeedColor(pts[i].speed_mps);
      currentPositions.push([pts[i].latitude, pts[i].longitude]);
      if (color !== currentColor || i === pts.length - 1) {
        segments.push({ color: currentColor, positions: [...currentPositions] });
        currentColor = color;
        currentPositions = [[pts[i].latitude, pts[i].longitude]];
      }
    }
    return segments;
  }, [selectedSession, showRoute]);

  const allRoutePoints = useMemo((): [number, number][] => {
    if (!selectedSession) return [];
    return selectedSession.points.map((p): [number, number] => [p.latitude, p.longitude]);
  }, [selectedSession]);

  const displayZones = useMemo((): SchoolZone[] => {
    if (!selectedSession) return [];
    if (selectedSession.school_zones && selectedSession.school_zones.length > 0)
      return selectedSession.school_zones;
    return schoolZones;
  }, [selectedSession, schoolZones]);

  const hasGPS = !!(selectedSession && selectedSession.points.length > 0);
  const noStudent = !selectedUUID;
  const noRides = !!(selectedUUID && !routeBusy && routeHistory.length === 0 && !routeError);
  const noGPS = !!(selectedSession && selectedSession.points.length === 0);

  const filters = [
    { key: "route", label: "Route", active: showRoute, toggle: () => setShowRoute((v) => !v), color: "#3b6fb5" },
    { key: "pois", label: "POIs", active: showPOIs, toggle: () => setShowPOIs((v) => !v), color: "#f6ae2d" },
    { key: "penalties", label: "Penalties", active: showPenalties, toggle: () => setShowPenalties((v) => !v), color: "#e53e3e" },
    { key: "zones", label: "Zones", active: showZones, toggle: () => setShowZones((v) => !v), color: "#8b3dff" },
  ];

  return (
    <div className="sr-layout">

      {/* ── Student picker ── */}
      <div className="sr-picker-section">
        <div className="sr-picker-header">
          <div className="sr-picker-title-row">
            <h3 className="sr-section-label">Students</h3>
            {!rosterBusy && roster.length > 0 && (
              <span className="sr-count-badge">{roster.length}</span>
            )}
          </div>
          <input
            className="sr-search"
            type="search"
            placeholder="Search students…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {rosterError && <p className="sr-error-msg">{rosterError}</p>}

        <div className="sr-picker-scroll">
          {rosterBusy && (
            <div className="sr-picker-loading">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="sr-student-card sr-student-card--skeleton" />
              ))}
            </div>
          )}

          {!rosterBusy && filteredRoster.length === 0 && !rosterError && (
            <p className="sr-picker-empty">
              {search ? "No students match that search." : "No students enrolled."}
            </p>
          )}

          {!rosterBusy && filteredRoster.map((entry) => {
            const uuid = resolveUserUUID(entry);
            const active = uuid === selectedUUID;
            const photoUrl = getPhotoUrl(entry);
            const showPhoto = photoUrl && !brokenPhotos.has(uuid);

            return (
              <button
                key={uuid}
                className={`sr-student-card${active ? " sr-student-card--active" : ""}`}
                onClick={() => handleSelectStudent(entry)}
                title={formatStudentName(entry)}
              >
                <div className="sr-student-photo-wrap">
                  {showPhoto ? (
                    <img
                      className="sr-student-photo"
                      src={photoUrl!}
                      alt={formatStudentName(entry)}
                      onError={() =>
                        setBrokenPhotos((prev) => new Set([...prev, uuid]))
                      }
                    />
                  ) : (
                    <span className="sr-student-initials">{getInitials(entry)}</span>
                  )}
                  {active && (
                    <span className="sr-student-active-dot" aria-hidden="true" />
                  )}
                </div>
                <span className="sr-student-first-name">
                  {formatStudentFirstName(entry)}
                </span>
                {routeBusy && active && (
                  <span className="sr-student-loading-dot" />
                )}
                {!routeBusy && active && routeHistory.length > 0 && (
                  <span className="sr-student-ride-badge">{routeHistory.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Ride selector strip (shown when a student is selected) ── */}
      {selectedUUID && (
        <div className="sr-ride-section">
          <div className="sr-ride-section-header">
            <span className="sr-section-label">
              {selectedEntry ? `${formatStudentFirstName(selectedEntry)}'s Rides` : "Rides"}
            </span>
            {routeError && <span className="sr-error-inline">{routeError}</span>}
            {routeBusy && <span className="sr-muted-inline">Loading…</span>}
            {!routeBusy && !routeError && routeHistory.length > 0 && (
              <span className="sr-count-badge">{routeHistory.length}</span>
            )}
          </div>

          {noRides && !routeBusy && (
            <p className="sr-ride-empty">No rides recorded for this student yet.</p>
          )}

          {routeHistory.length > 0 && (
            <div className="sr-ride-scroll">
              {routeHistory.map((session) => {
                const active = session.session_id === selectedSessionId;
                const hasPenalties = session.penalty_events.length > 0;
                const hasPOIs = session.visited_pois.length > 0;
                const noGPSThisRide = session.points.length === 0;

                return (
                  <button
                    key={session.session_id}
                    className={`sr-ride-chip${active ? " sr-ride-chip--active" : ""}`}
                    onClick={() => setSelectedSessionId(session.session_id)}
                  >
                    <span className="sr-ride-chip-date">{formatRideLabel(session.started_at)}</span>
                    <span className="sr-ride-chip-stats">
                      <span className="sr-ride-chip-dist">{formatDistance(session.distance_meters)}</span>
                      <span className="sr-ride-chip-dur">{formatDuration(session.duration_seconds)}</span>
                    </span>
                    <span className="sr-ride-chip-badges">
                      {session.bonus_points > 0 && (
                        <span className="sr-tiny-badge sr-tiny-badge--green">+{session.bonus_points}</span>
                      )}
                      {hasPenalties && (
                        <span className="sr-tiny-badge sr-tiny-badge--red">{session.penalty_events.length}⚠</span>
                      )}
                      {hasPOIs && (
                        <span className="sr-tiny-badge sr-tiny-badge--gold">{session.visited_pois.length}★</span>
                      )}
                      {noGPSThisRide && (
                        <span className="sr-tiny-badge sr-tiny-badge--muted">no GPS</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Map ── */}
      <div className="sr-map-section">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          className="sr-map"
          zoomControl={true}
        >
          <TileLayer attribution={TILE_LAYER_ATTRIBUTION} url={TILE_LAYER_URL} />
          <MapFitter points={allRoutePoints} />

          {showZones &&
            displayZones
              .filter((z) => z.active && z.polygon.length >= 3)
              .map((zone) => (
                <Polygon
                  key={zone.zone_uuid}
                  positions={zone.polygon.map((p): [number, number] => [p.lat, p.lng])}
                  pathOptions={{
                    color: zone.zone_type === "no_go" ? "#e53e3e" : "#f6ae2d",
                    fillColor: zone.zone_type === "no_go" ? "#e53e3e" : "#f6ae2d",
                    fillOpacity: 0.12,
                    weight: 2,
                    dashArray: zone.zone_type === "speed_limit" ? "6 4" : undefined,
                  }}
                >
                  <Popup>
                    <strong>
                      {zone.title || (zone.zone_type === "no_go" ? "No-go zone" : "Speed limit zone")}
                    </strong>
                    {zone.description && <><br />{zone.description}</>}
                    {zone.zone_type === "speed_limit" && zone.speed_limit_mph != null && (
                      <><br />Limit: {zone.speed_limit_mph} mph</>
                    )}
                  </Popup>
                </Polygon>
              ))}

          {showRoute &&
            routeSegments.map((seg, i) => (
              <Polyline
                key={i}
                positions={seg.positions}
                pathOptions={{ color: seg.color, weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
              />
            ))}

          {showRoute && selectedSession && selectedSession.points.length > 0 && (
            <>
              <CircleMarker
                center={[selectedSession.points[0].latitude, selectedSession.points[0].longitude]}
                radius={9}
                pathOptions={{ color: "#fff", fillColor: "#27cc5e", fillOpacity: 1, weight: 2.5 }}
              >
                <Popup><strong>Ride started</strong><br />{formatRideFull(selectedSession.started_at)}</Popup>
              </CircleMarker>
              <CircleMarker
                center={[
                  selectedSession.points[selectedSession.points.length - 1].latitude,
                  selectedSession.points[selectedSession.points.length - 1].longitude,
                ]}
                radius={9}
                pathOptions={{ color: "#fff", fillColor: "#112d4e", fillOpacity: 1, weight: 2.5 }}
              >
                <Popup>
                  <strong>Ride ended</strong><br />
                  {selectedSession.ended_at ? formatRideFull(selectedSession.ended_at) : "—"}
                </Popup>
              </CircleMarker>
            </>
          )}

          {showPOIs &&
            selectedSession?.visited_pois.map((poi, i) => (
              <CircleMarker
                key={`poi-${i}`}
                center={[poi.lat, poi.lng]}
                radius={10}
                pathOptions={{ color: "#c87a00", fillColor: "#f6ae2d", fillOpacity: 0.95, weight: 2 }}
              >
                <Popup>
                  <strong>{poi.title || "Point of Interest"}</strong><br />
                  +{poi.bonus_points} pts
                  {poi.description && <><br />{poi.description}</>}
                  {poi.visited_at > 0 && (
                    <><br /><span style={{ color: "#888", fontSize: "0.82em" }}>{formatRideLabel(poi.visited_at)}</span></>
                  )}
                </Popup>
              </CircleMarker>
            ))}

          {showPenalties &&
            selectedSession?.penalty_events.map((event, i) => (
              <CircleMarker
                key={`penalty-${i}`}
                center={[event.lat, event.lng]}
                radius={10}
                pathOptions={{ color: "#9b1c1c", fillColor: "#e53e3e", fillOpacity: 0.95, weight: 2 }}
              >
                <Popup>
                  <strong>{event.title || (event.zone_type === "no_go" ? "No-go zone" : "Speed limit zone")}</strong><br />
                  −{event.points_lost} pts
                  {event.reason && <><br />{event.reason}</>}
                  {event.zone_type === "speed_limit" && event.speed_limit_mph != null && (
                    <><br />Limit: {event.speed_limit_mph} mph</>
                  )}
                  {event.duration_ms > 0 && (
                    <><br />Duration: {Math.round(event.duration_ms / 1000)}s</>
                  )}
                </Popup>
              </CircleMarker>
            ))}
        </MapContainer>

        {/* Floating layer toggles — top-left on map */}
        {hasGPS && (
          <div className="sr-overlay-filters">
            <span className="sr-overlay-label">Layers</span>
            {filters.map((f) => (
              <button
                key={f.key}
                className={`sr-filter-btn${f.active ? " sr-filter-btn--active" : ""}`}
                onClick={f.toggle}
                title={f.active ? `Hide ${f.label}` : `Show ${f.label}`}
              >
                <span className="sr-filter-dot" style={{ background: f.color }} />
                {f.label}
              </button>
            ))}
            {showRoute && (
              <div className="sr-speed-legend">
                {[
                  { label: "< 5 mph", color: "#27cc5e" },
                  { label: "5–10", color: "#a8d63c" },
                  { label: "10–15", color: "#f6ae2d" },
                  { label: "15–20", color: "#ff6b35" },
                  { label: "20+", color: "#e53e3e" },
                ].map((s) => (
                  <span key={s.label} className="sr-speed-swatch">
                    <span className="sr-speed-dot" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floating session stats — bottom-left on map */}
        {selectedSession && (
          <div className={`sr-overlay-stats${statsOpen ? " sr-overlay-stats--open" : ""}`}>
            <button
              className="sr-stats-toggle"
              onClick={() => setStatsOpen((v) => !v)}
              title={statsOpen ? "Collapse stats" : "Expand stats"}
            >
              <span className="sr-stats-toggle-title">
                {formatRideLabel(selectedSession.started_at)}
              </span>
              <span className="sr-stats-toggle-icon">{statsOpen ? "▾" : "▴"}</span>
            </button>
            {statsOpen && (
              <div className="sr-stats-grid">
                <div className="sr-stat">
                  <span className="sr-stat-label">Distance</span>
                  <strong className="sr-stat-value">{formatDistance(selectedSession.distance_meters)}</strong>
                </div>
                <div className="sr-stat">
                  <span className="sr-stat-label">Duration</span>
                  <strong className="sr-stat-value">{formatDuration(selectedSession.duration_seconds)}</strong>
                </div>
                <div className="sr-stat">
                  <span className="sr-stat-label">Points</span>
                  <strong className="sr-stat-value sr-stat-value--green">+{selectedSession.bonus_points}</strong>
                </div>
                {selectedSession.penalty_points > 0 && (
                  <div className="sr-stat">
                    <span className="sr-stat-label">Penalties</span>
                    <strong className="sr-stat-value sr-stat-value--red">−{selectedSession.penalty_points}</strong>
                  </div>
                )}
                <div className="sr-stat">
                  <span className="sr-stat-label">POI visits</span>
                  <strong className="sr-stat-value">{selectedSession.visited_pois.length}</strong>
                </div>
                <div className="sr-stat">
                  <span className="sr-stat-label">Top speed</span>
                  <strong className="sr-stat-value">{(selectedSession.top_speed_mps * 2.237).toFixed(1)} mph</strong>
                </div>
                <div className="sr-stat">
                  <span className="sr-stat-label">GPS points</span>
                  <strong className="sr-stat-value">{selectedSession.points.length.toLocaleString()}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Map empty states */}
        {noStudent && (
          <div className="sr-map-overlay">
            <div className="sr-map-empty">
              <div className="sr-map-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="11" r="3" />
                  <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <p className="sr-map-empty-title">Select a student above</p>
              <p className="sr-map-empty-desc">Their ride routes, POI visits, and penalty events will appear here.</p>
            </div>
          </div>
        )}
        {selectedUUID && routeBusy && (
          <div className="sr-map-overlay">
            <div className="sr-map-empty">
              <p className="sr-map-empty-title">Loading rides…</p>
            </div>
          </div>
        )}
        {noRides && (
          <div className="sr-map-overlay">
            <div className="sr-map-empty">
              <div className="sr-map-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="sr-map-empty-title">No rides recorded</p>
              <p className="sr-map-empty-desc">This student has no route history yet.</p>
            </div>
          </div>
        )}
        {noGPS && !noRides && (
          <div className="sr-map-overlay">
            <div className="sr-map-empty">
              <div className="sr-map-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
              </div>
              <p className="sr-map-empty-title">No GPS data</p>
              <p className="sr-map-empty-desc">This ride was manually logged and has no GPS breadcrumbs.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
