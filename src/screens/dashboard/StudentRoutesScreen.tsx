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
    "Unnamed student"
  );
}

function formatStudentDetail(entry: SchoolStudentRosterEntry): string {
  return (
    entry.membership.student_id?.trim() ||
    entry.user.email?.trim() ||
    entry.user.username?.trim() ||
    "Student"
  );
}

function resolveUserUUID(entry: SchoolStudentRosterEntry): string {
  return entry.membership.user_uuid?.trim() || entry.user.k_guid;
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSessionLabel(timestamp: number): string {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSessionFull(timestamp: number): string {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Child component: auto-fits map bounds to route points
function MapFitter({
  points,
}: {
  points: Array<[number, number]>;
}) {
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
  const [schoolPOIs, setSchoolPOIs] = useState<SchoolPOI[]>([]);
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
          setRosterError(
            err instanceof Error ? err.message : "Failed to load students",
          );
      })
      .finally(() => {
        if (!cancelled) setRosterBusy(false);
      });
    return () => {
      cancelled = true;
    };
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
        const sessions = await fetchStudentRouteHistory(
          managedAppId,
          activeSchoolId,
          uuid,
        );
        setRouteHistory(sessions);
        if (sessions.length > 0) {
          setSelectedSessionId(sessions[0].session_id);
        }
      } catch (err) {
        setRouteError(
          err instanceof Error ? err.message : "Failed to load routes",
        );
      } finally {
        setRouteBusy(false);
      }
    },
    [managedAppId, activeSchoolId, selectedUUID],
  );

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((entry) => {
      const name = formatStudentName(entry).toLowerCase();
      const detail = formatStudentDetail(entry).toLowerCase();
      return name.includes(q) || detail.includes(q);
    });
  }, [roster, search]);

  const selectedEntry = useMemo(
    () => roster.find((e) => resolveUserUUID(e) === selectedUUID) ?? null,
    [roster, selectedUUID],
  );

  const selectedSession = useMemo(
    () =>
      routeHistory.find((s) => s.session_id === selectedSessionId) ?? null,
    [routeHistory, selectedSessionId],
  );

  const routeSegments = useMemo((): RouteSegment[] => {
    if (!selectedSession || !showRoute) return [];
    const pts = selectedSession.points;
    if (pts.length < 2) return [];

    const segments: RouteSegment[] = [];
    let currentColor = getSpeedColor(pts[0].speed_mps);
    let currentPositions: [number, number][] = [
      [pts[0].latitude, pts[0].longitude],
    ];

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
    return selectedSession.points.map(
      (p): [number, number] => [p.latitude, p.longitude],
    );
  }, [selectedSession]);

  const displayZones = useMemo((): SchoolZone[] => {
    if (!selectedSession) return [];
    if (
      selectedSession.school_zones &&
      selectedSession.school_zones.length > 0
    ) {
      return selectedSession.school_zones;
    }
    return schoolZones;
  }, [selectedSession, schoolZones]);

  const hasGPS = selectedSession && selectedSession.points.length > 0;
  const noStudent = !selectedUUID;
  const noRides =
    selectedUUID && !routeBusy && routeHistory.length === 0 && !routeError;
  const noGPS =
    selectedSession && selectedSession.points.length === 0;

  // Filter definitions
  const filters = [
    {
      key: "route",
      label: "Route",
      active: showRoute,
      toggle: () => setShowRoute((v) => !v),
      color: "#3b6fb5",
    },
    {
      key: "pois",
      label: "POI Visits",
      active: showPOIs,
      toggle: () => setShowPOIs((v) => !v),
      color: "#f6ae2d",
    },
    {
      key: "penalties",
      label: "Penalties",
      active: showPenalties,
      toggle: () => setShowPenalties((v) => !v),
      color: "#e53e3e",
    },
    {
      key: "zones",
      label: "Zones",
      active: showZones,
      toggle: () => setShowZones((v) => !v),
      color: "#8b3dff",
    },
  ];

  // Suppress unused variable warning — schoolPOIs loaded for future use
  void schoolPOIs;

  return (
    <div className="sr-layout">
      {/* ── Left sidebar ── */}
      <aside className="sr-sidebar">
        <div className="sr-sidebar-header">
          <p className="sr-sidebar-title">Student Routes</p>
          <input
            className="sr-search"
            type="search"
            placeholder="Search students…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {rosterBusy && (
          <div className="sr-loading-state">Loading students…</div>
        )}
        {rosterError && (
          <div className="sr-error-state">{rosterError}</div>
        )}

        <div className="sr-student-list">
          {filteredRoster.map((entry) => {
            const uuid = resolveUserUUID(entry);
            const active = uuid === selectedUUID;
            return (
              <button
                key={uuid}
                className={`sr-student-item${active ? " sr-student-item--active" : ""}`}
                onClick={() => handleSelectStudent(entry)}
              >
                <div className="sr-student-avatar">
                  {formatStudentName(entry).charAt(0).toUpperCase()}
                </div>
                <div className="sr-student-info">
                  <span className="sr-student-name">
                    {formatStudentName(entry)}
                  </span>
                  <span className="sr-student-detail">
                    {formatStudentDetail(entry)}
                  </span>
                </div>
              </button>
            );
          })}
          {!rosterBusy && filteredRoster.length === 0 && !rosterError && (
            <div className="sr-empty-list">No students found.</div>
          )}
        </div>

        {/* Session list — shown only when a student is selected */}
        {selectedUUID && (
          <div className="sr-session-panel">
            <div className="sr-session-panel-header">
              {selectedEntry && (
                <span className="sr-session-panel-student">
                  {formatStudentName(selectedEntry)}
                </span>
              )}
              <span className="sr-session-panel-count">
                {routeBusy
                  ? "Loading…"
                  : `${routeHistory.length} ride${routeHistory.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {routeError && (
              <div className="sr-error-state">{routeError}</div>
            )}

            <div className="sr-session-list">
              {routeHistory.map((session) => {
                const active = session.session_id === selectedSessionId;
                return (
                  <button
                    key={session.session_id}
                    className={`sr-session-item${active ? " sr-session-item--active" : ""}`}
                    onClick={() => setSelectedSessionId(session.session_id)}
                  >
                    <div className="sr-session-item-top">
                      <span className="sr-session-date">
                        {formatSessionLabel(session.started_at)}
                      </span>
                      <span className="sr-session-dist">
                        {formatDistance(session.distance_meters)}
                      </span>
                    </div>
                    <div className="sr-session-item-chips">
                      {session.bonus_points > 0 && (
                        <span className="sr-chip sr-chip--green">
                          +{session.bonus_points} pts
                        </span>
                      )}
                      {session.penalty_events.length > 0 && (
                        <span className="sr-chip sr-chip--red">
                          {session.penalty_events.length} penalty
                        </span>
                      )}
                      {session.visited_pois.length > 0 && (
                        <span className="sr-chip sr-chip--gold">
                          {session.visited_pois.length} POI
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {!routeBusy && routeHistory.length === 0 && !routeError && (
                <div className="sr-empty-list">No rides recorded.</div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ── Right panel ── */}
      <div className="sr-content">
        {/* Filter toggles — only when a session with GPS is selected */}
        {hasGPS && (
          <div className="sr-filters">
            <span className="sr-filters-label">Layers:</span>
            {filters.map((f) => (
              <button
                key={f.key}
                className={`sr-filter-btn${f.active ? " sr-filter-btn--active" : ""}`}
                onClick={f.toggle}
              >
                <span
                  className="sr-filter-dot"
                  style={{ background: f.color }}
                />
                {f.label}
              </button>
            ))}

            {showRoute && (
              <div className="sr-speed-legend">
                <span className="sr-speed-legend-label">Speed:</span>
                {[
                  { label: "< 5 mph", color: "#27cc5e" },
                  { label: "5–10", color: "#a8d63c" },
                  { label: "10–15", color: "#f6ae2d" },
                  { label: "15–20", color: "#ff6b35" },
                  { label: "20+", color: "#e53e3e" },
                ].map((s) => (
                  <span key={s.label} className="sr-speed-swatch">
                    <span
                      className="sr-speed-dot"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Session stats bar */}
        {selectedSession && (
          <div className="sr-session-stats">
            <div className="sr-stat">
              <span className="sr-stat-label">Date</span>
              <strong className="sr-stat-value">
                {formatSessionFull(selectedSession.started_at)}
              </strong>
            </div>
            <div className="sr-stat-divider" />
            <div className="sr-stat">
              <span className="sr-stat-label">Distance</span>
              <strong className="sr-stat-value">
                {formatDistance(selectedSession.distance_meters)}
              </strong>
            </div>
            <div className="sr-stat-divider" />
            <div className="sr-stat">
              <span className="sr-stat-label">Duration</span>
              <strong className="sr-stat-value">
                {formatDuration(selectedSession.duration_seconds)}
              </strong>
            </div>
            <div className="sr-stat-divider" />
            <div className="sr-stat">
              <span className="sr-stat-label">Points earned</span>
              <strong className="sr-stat-value sr-stat-value--green">
                +{selectedSession.bonus_points}
              </strong>
            </div>
            {selectedSession.penalty_points > 0 && (
              <>
                <div className="sr-stat-divider" />
                <div className="sr-stat">
                  <span className="sr-stat-label">Penalty pts</span>
                  <strong className="sr-stat-value sr-stat-value--red">
                    −{selectedSession.penalty_points}
                  </strong>
                </div>
              </>
            )}
            <div className="sr-stat-divider" />
            <div className="sr-stat">
              <span className="sr-stat-label">POI visits</span>
              <strong className="sr-stat-value">
                {selectedSession.visited_pois.length}
              </strong>
            </div>
            <div className="sr-stat-divider" />
            <div className="sr-stat">
              <span className="sr-stat-label">Top speed</span>
              <strong className="sr-stat-value">
                {(selectedSession.top_speed_mps * 2.237).toFixed(1)} mph
              </strong>
            </div>
            <div className="sr-stat-divider" />
            <div className="sr-stat">
              <span className="sr-stat-label">GPS points</span>
              <strong className="sr-stat-value">
                {selectedSession.points.length.toLocaleString()}
              </strong>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="sr-map-wrap">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="sr-map"
            zoomControl
          >
            <TileLayer
              attribution={TILE_LAYER_ATTRIBUTION}
              url={TILE_LAYER_URL}
            />
            <MapFitter points={allRoutePoints} />

            {/* Zone polygons */}
            {showZones &&
              displayZones
                .filter((z) => z.active && z.polygon.length >= 3)
                .map((zone) => (
                  <Polygon
                    key={zone.zone_uuid}
                    positions={zone.polygon.map(
                      (p): [number, number] => [p.lat, p.lng],
                    )}
                    pathOptions={{
                      color:
                        zone.zone_type === "no_go" ? "#e53e3e" : "#f6ae2d",
                      fillColor:
                        zone.zone_type === "no_go" ? "#e53e3e" : "#f6ae2d",
                      fillOpacity: 0.12,
                      weight: 2,
                      dashArray:
                        zone.zone_type === "speed_limit" ? "6 4" : undefined,
                    }}
                  >
                    <Popup>
                      <strong>
                        {zone.title ||
                          (zone.zone_type === "no_go"
                            ? "No-go zone"
                            : "Speed limit zone")}
                      </strong>
                      {zone.description && (
                        <>
                          <br />
                          {zone.description}
                        </>
                      )}
                      {zone.zone_type === "speed_limit" &&
                        zone.speed_limit_mph != null && (
                          <>
                            <br />
                            Limit: {zone.speed_limit_mph} mph
                          </>
                        )}
                    </Popup>
                  </Polygon>
                ))}

            {/* Speed-colored route polyline */}
            {showRoute &&
              routeSegments.map((seg, i) => (
                <Polyline
                  key={i}
                  positions={seg.positions}
                  pathOptions={{
                    color: seg.color,
                    weight: 4,
                    opacity: 0.88,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              ))}

            {/* Start marker */}
            {showRoute &&
              selectedSession &&
              selectedSession.points.length > 0 && (
                <>
                  <CircleMarker
                    center={[
                      selectedSession.points[0].latitude,
                      selectedSession.points[0].longitude,
                    ]}
                    radius={9}
                    pathOptions={{
                      color: "#fff",
                      fillColor: "#27cc5e",
                      fillOpacity: 1,
                      weight: 2.5,
                    }}
                  >
                    <Popup>
                      <strong>Ride started</strong>
                      <br />
                      {formatSessionFull(selectedSession.started_at)}
                    </Popup>
                  </CircleMarker>
                  <CircleMarker
                    center={[
                      selectedSession.points[
                        selectedSession.points.length - 1
                      ].latitude,
                      selectedSession.points[
                        selectedSession.points.length - 1
                      ].longitude,
                    ]}
                    radius={9}
                    pathOptions={{
                      color: "#fff",
                      fillColor: "#112d4e",
                      fillOpacity: 1,
                      weight: 2.5,
                    }}
                  >
                    <Popup>
                      <strong>Ride ended</strong>
                      <br />
                      {selectedSession.ended_at
                        ? formatSessionFull(selectedSession.ended_at)
                        : "—"}
                    </Popup>
                  </CircleMarker>
                </>
              )}

            {/* POI visit markers */}
            {showPOIs &&
              selectedSession?.visited_pois.map((poi, i) => (
                <CircleMarker
                  key={`poi-${i}`}
                  center={[poi.lat, poi.lng]}
                  radius={10}
                  pathOptions={{
                    color: "#c87a00",
                    fillColor: "#f6ae2d",
                    fillOpacity: 0.92,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>{poi.title || "Point of Interest"}</strong>
                    <br />
                    +{poi.bonus_points} pts
                    {poi.description && (
                      <>
                        <br />
                        {poi.description}
                      </>
                    )}
                    {poi.visited_at > 0 && (
                      <>
                        <br />
                        <span style={{ color: "#888", fontSize: "0.82em" }}>
                          {formatSessionLabel(poi.visited_at)}
                        </span>
                      </>
                    )}
                  </Popup>
                </CircleMarker>
              ))}

            {/* Penalty event markers */}
            {showPenalties &&
              selectedSession?.penalty_events.map((event, i) => (
                <CircleMarker
                  key={`penalty-${i}`}
                  center={[event.lat, event.lng]}
                  radius={10}
                  pathOptions={{
                    color: "#9b1c1c",
                    fillColor: "#e53e3e",
                    fillOpacity: 0.92,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>
                      {event.title ||
                        (event.zone_type === "no_go"
                          ? "No-go zone"
                          : "Speed limit zone")}
                    </strong>
                    <br />
                    −{event.points_lost} pts
                    {event.reason && (
                      <>
                        <br />
                        {event.reason}
                      </>
                    )}
                    {event.zone_type === "speed_limit" &&
                      event.speed_limit_mph != null && (
                        <>
                          <br />
                          Limit: {event.speed_limit_mph} mph
                        </>
                      )}
                    {event.duration_ms > 0 && (
                      <>
                        <br />
                        Duration: {Math.round(event.duration_ms / 1000)}s
                      </>
                    )}
                  </Popup>
                </CircleMarker>
              ))}
          </MapContainer>

          {/* Overlays for empty / loading states */}
          {noStudent && (
            <div className="sr-map-overlay">
              <div className="sr-map-empty">
                <div className="sr-map-empty-icon-wrap">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="11" r="3" />
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
                <div className="sr-map-empty-title">Select a student</div>
                <div className="sr-map-empty-desc">
                  Pick a student from the left to visualize their ride routes,
                  POI visits, and penalty events on the map.
                </div>
              </div>
            </div>
          )}
          {selectedUUID && routeBusy && (
            <div className="sr-map-overlay">
              <div className="sr-map-empty">
                <div className="sr-map-empty-title">Loading rides…</div>
              </div>
            </div>
          )}
          {noRides && (
            <div className="sr-map-overlay">
              <div className="sr-map-empty">
                <div className="sr-map-empty-icon-wrap">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                </div>
                <div className="sr-map-empty-title">No rides recorded</div>
                <div className="sr-map-empty-desc">
                  This student has no route history yet.
                </div>
              </div>
            </div>
          )}
          {noGPS && !noRides && (
            <div className="sr-map-overlay">
              <div className="sr-map-empty">
                <div className="sr-map-empty-icon-wrap">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a7 7 0 100 14A7 7 0 0012 2z" />
                    <line x1="2" y1="12" x2="4" y2="12" />
                    <line x1="20" y1="12" x2="22" y2="12" />
                    <line x1="12" y1="2" x2="12" y2="4" />
                    <line x1="12" y1="20" x2="12" y2="22" />
                    <line x1="3" y1="3" x2="21" y2="21" />
                  </svg>
                </div>
                <div className="sr-map-empty-title">No GPS data</div>
                <div className="sr-map-empty-desc">
                  This ride was manually logged and has no GPS breadcrumbs to
                  display.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
