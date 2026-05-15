import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LatLng, LatLngBounds } from "leaflet";
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

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;

function speedColor(mps: number | null | undefined): string {
  if (mps == null) return "#3b6fb5";
  const mph = mps * 2.237;
  if (mph < 5) return "#27cc5e";
  if (mph < 10) return "#a8d63c";
  if (mph < 15) return "#f6ae2d";
  if (mph < 20) return "#ff6b35";
  return "#e53e3e";
}

function fullName(e: SchoolStudentRosterEntry): string {
  const n =
    `${e.user.first_name?.trim() ?? ""} ${e.user.last_name?.trim() ?? ""}`.trim();
  return n || e.user.username?.trim() || e.user.email?.trim() || "Student";
}

function firstName(e: SchoolStudentRosterEntry): string {
  return e.user.first_name?.trim() || fullName(e).split(" ")[0];
}

function subline(e: SchoolStudentRosterEntry): string {
  return e.membership.student_id?.trim() || e.user.email?.trim() || "";
}

function uuid(e: SchoolStudentRosterEntry): string {
  return e.membership.user_uuid?.trim() || e.user.k_guid;
}

function initials(e: SchoolStudentRosterEntry): string {
  const f = e.user.first_name?.trim();
  const l = e.user.last_name?.trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  const parts = fullName(e).split(" ").filter(Boolean);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : (parts[0]?.[0] ?? "?").toUpperCase();
}

function fmtDist(m: number): string {
  const mi = m / 1609.344;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtShort(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtFull(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtConfidence(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function fmtMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0 && seconds > 0) return `${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function evidenceCountLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Evidence —";
  return `${Math.max(0, Math.round(value)).toLocaleString()} evidence samples`;
}

function MapFitter({ points }: { points: [number, number][] }) {
  const map = useMap();
  const prev = useRef("");
  useEffect(() => {
    if (!points.length) return;
    const k = `${points[0][0].toFixed(5)},${points[0][1].toFixed(5)},${points.length}`;
    if (k === prev.current) return;
    prev.current = k;
    const b = new LatLngBounds(points);
    if (b.isValid()) map.fitBounds(b, { padding: [48, 48] });
  }, [map, points]);
  return null;
}

function PenaltyFocuser({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const lastFocusKey = useRef("");
  useEffect(() => {
    const focusKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (lastFocusKey.current === focusKey) return;
    lastFocusKey.current = focusKey;
    map.flyTo(new LatLng(lat, lng), 17, { animate: true, duration: 1 });
  }, [map, lat, lng]);
  return null;
}

interface Props {
  activeSchoolId: string;
  managedAppId: string;
}
type Seg = { color: string; positions: [number, number][] };

export function StudentRoutesScreen({ activeSchoolId, managedAppId }: Props) {
  const [searchParams] = useSearchParams();

  // Deep-link params — read once, stored in refs so effects don't loop
  const dlUser = useRef(searchParams.get("user"));
  const dlSession = useRef(searchParams.get("session"));
  const dlLat = useRef(searchParams.get("lat"));
  const dlLng = useRef(searchParams.get("lng"));
  const dlConsumed = useRef(false);

  const [roster, setRoster] = useState<SchoolStudentRosterEntry[]>([]);
  const [zones, setZones] = useState<SchoolZone[]>([]);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterErr, setRosterErr] = useState("");
  const [search, setSearch] = useState("");

  const [selUUID, setSelUUID] = useState<string | null>(null);
  const [history, setHistory] = useState<StudentRouteHistorySession[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histErr, setHistErr] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  // lat/lng to fly to once the right session is loaded
  const [focusPin, setFocusPin] = useState<[number, number] | null>(null);

  const [showRoute, setShowRoute] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showPenalties, setShowPenalties] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);

  const [, setPOIs] = useState<SchoolPOI[]>([]);

  // Ride strip: ref + drag state
  const rideScrollRef = useRef<HTMLDivElement>(null);
  const didDrag = useRef(false);

  // Attach native drag-scroll + wheel-to-scroll once the strip is in the DOM.
  // Native listeners are needed because:
  //  - wheel needs { passive: false } so preventDefault() actually works
  //  - mousedown on child <button>s bubbles up but setPointerCapture on the
  //    React-synthetic layer gets blocked; document-level listeners avoid this
  useEffect(() => {
    const el = rideScrollRef.current;
    if (!el) return;

    let active = false;
    let startX = 0;
    let scrollL = 0;

    const onMD = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) return;
      active = true;
      didDrag.current = false;
      startX = e.clientX;
      scrollL = el.scrollLeft;
      el.style.cursor = "grabbing";
    };
    const onMM = (e: MouseEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) didDrag.current = true;
      el.scrollLeft = scrollL - dx * 2;
    };
    const onMU = () => {
      active = false;
      el.style.cursor = "";
    };
    const onWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node) && e.target !== el) return;
      e.preventDefault();
      // vertical wheel scrolls horizontally; horizontal trackpad gesture passes through
      el.scrollLeft +=
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    };

    document.addEventListener("mousedown", onMD);
    document.addEventListener("mousemove", onMM);
    document.addEventListener("mouseup", onMU);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("mousedown", onMD);
      document.removeEventListener("mousemove", onMM);
      document.removeEventListener("mouseup", onMU);
      el.removeEventListener("wheel", onWheel);
    };
    // re-run whenever the ride list appears (history.length 0→N renders the div)
  }, [history.length]);

  useEffect(() => {
    let dead = false;
    setRosterBusy(true);
    setRosterErr("");
    Promise.all([
      fetchSchoolStudentRoster(managedAppId, activeSchoolId),
      fetchSchoolPOIs(managedAppId, activeSchoolId),
      fetchSchoolZones(managedAppId, activeSchoolId),
    ])
      .then(([r, p, z]) => {
        if (dead) return;
        setRoster(r);
        setPOIs(p);
        setZones(z);
      })
      .catch((e) => {
        if (!dead)
          setRosterErr(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!dead) setRosterBusy(false);
      });
    return () => {
      dead = true;
    };
  }, [managedAppId, activeSchoolId]);

  const selectStudent = useCallback(
    async (
      entry: SchoolStudentRosterEntry,
      targetSessionId?: string | null,
      pinLat?: number | null,
      pinLng?: number | null,
    ) => {
      const u = uuid(entry);
      if (u === selUUID && !targetSessionId) return;
      setSelUUID(u);
      setHistory([]);
      setSelId(null);
      setFocusPin(null);
      setHistBusy(true);
      setHistErr("");
      try {
        const sessions = await fetchStudentRouteHistory(
          managedAppId,
          activeSchoolId,
          u,
        );
        setHistory(sessions);
        const target = targetSessionId
          ? sessions.find((s) => s.session_id === targetSessionId)
          : null;
        if (target) {
          setSelId(target.session_id);
          if (pinLat != null && pinLng != null) setFocusPin([pinLat, pinLng]);
        } else if (sessions.length > 0) {
          setSelId(sessions[0].session_id);
        }
      } catch (e) {
        setHistErr(e instanceof Error ? e.message : "Failed to load routes");
      } finally {
        setHistBusy(false);
      }
    },
    [managedAppId, activeSchoolId, selUUID],
  );

  // Deep-link: once roster loads, auto-select the student from URL params
  useEffect(() => {
    if (
      dlConsumed.current ||
      !dlUser.current ||
      rosterBusy ||
      roster.length === 0
    )
      return;
    const entry = roster.find((e) => uuid(e) === dlUser.current);
    if (!entry) return;
    dlConsumed.current = true;
    const lat = dlLat.current ? parseFloat(dlLat.current) : null;
    const lng = dlLng.current ? parseFloat(dlLng.current) : null;
    selectStudent(entry, dlSession.current, lat, lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, rosterBusy]);

  // scroll the selected ride chip into view whenever it changes
  useEffect(() => {
    if (!selId || !rideScrollRef.current) return;
    const chip = rideScrollRef.current.querySelector<HTMLElement>(
      "[data-active='true']",
    );
    if (!chip) return;
    // Scroll only the strip container horizontally — never the page
    const container = rideScrollRef.current;
    const targetLeft =
      chip.offsetLeft - container.offsetWidth / 2 + chip.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [selId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (e) =>
        fullName(e).toLowerCase().includes(q) ||
        subline(e).toLowerCase().includes(q),
    );
  }, [roster, search]);

  const selEntry = useMemo(
    () => roster.find((e) => uuid(e) === selUUID) ?? null,
    [roster, selUUID],
  );
  const selSess = useMemo(
    () => history.find((s) => s.session_id === selId) ?? null,
    [history, selId],
  );

  const segments = useMemo((): Seg[] => {
    if (!selSess || !showRoute) return [];
    const pts = selSess.points;
    if (pts.length < 2) return [];
    const out: Seg[] = [];
    let col = speedColor(pts[0].speed_mps);
    let pos: [number, number][] = [[pts[0].latitude, pts[0].longitude]];
    for (let i = 1; i < pts.length; i++) {
      const c = speedColor(pts[i].speed_mps);
      pos.push([pts[i].latitude, pts[i].longitude]);
      if (c !== col || i === pts.length - 1) {
        out.push({ color: col, positions: [...pos] });
        col = c;
        pos = [[pts[i].latitude, pts[i].longitude]];
      }
    }
    return out;
  }, [selSess, showRoute]);

  const routePts = useMemo((): [number, number][] => {
    if (!selSess) return [];
    return selSess.points.map((p): [number, number] => [
      p.latitude,
      p.longitude,
    ]);
  }, [selSess]);

  const dispZones = useMemo((): SchoolZone[] => {
    if (!selSess) return [];
    return selSess.school_zones?.length ? selSess.school_zones : zones;
  }, [selSess, zones]);

  const hasGPS = !!(selSess && selSess.points.length > 0);
  const noStudent = !selUUID;
  const noRides = !!(selUUID && !histBusy && history.length === 0 && !histErr);
  const noGPS = !!(selSess && selSess.points.length === 0);

  const layerToggles = [
    {
      key: "route",
      label: "Route",
      active: showRoute,
      toggle: () => setShowRoute((v) => !v),
      color: "#3b6fb5",
    },
    {
      key: "pois",
      label: "POIs",
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

  const focusRouteEvent = (
    lat: number,
    lng: number,
    layer: "poi" | "penalty",
  ) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setFocusPin([lat, lng]);
    if (layer === "poi") setShowPOIs(true);
    if (layer === "penalty") setShowPenalties(true);
  };

  return (
    <div className="sr-layout">
      {/* ══ Top row: sidebar + map ══ */}
      <div className="sr-main-row">
        {/* ── Student sidebar ── */}
        <aside className="sr-sidebar">
          <div className="sr-sidebar-head">
            <span className="sr-eyebrow">Students</span>
            {!rosterBusy && roster.length > 0 && (
              <span className="sr-count">{roster.length}</span>
            )}
          </div>
          <div className="sr-search-wrap">
            <input
              className="sr-search"
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {rosterErr && <p className="sr-sidebar-err">{rosterErr}</p>}

          <div className="sr-student-list">
            {rosterBusy && (
              <div className="sr-skel-list">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="sr-skel-row" />
                ))}
              </div>
            )}
            {!rosterBusy && filtered.length === 0 && !rosterErr && (
              <p className="sr-empty-hint">
                {search ? "No match." : "No students."}
              </p>
            )}
            {!rosterBusy &&
              filtered.map((entry) => {
                const id = uuid(entry);
                const active = id === selUUID;
                return (
                  <button
                    key={id}
                    className={`sr-student-row${active ? " sr-student-row--active" : ""}`}
                    onClick={() => selectStudent(entry)}
                  >
                    <div className="sr-avatar">
                      <span className="sr-avatar-initials">
                        {initials(entry)}
                      </span>
                      {active && <span className="sr-avatar-dot" />}
                    </div>
                    <div className="sr-student-text">
                      <span className="sr-student-name">{fullName(entry)}</span>
                      {subline(entry) && (
                        <span className="sr-student-sub">{subline(entry)}</span>
                      )}
                    </div>
                    {active && histBusy && <span className="sr-spinner" />}
                    {active && !histBusy && history.length > 0 && (
                      <span className="sr-ride-count">{history.length}</span>
                    )}
                  </button>
                );
              })}
          </div>
        </aside>

        {/* ── Map panel ── */}
        <div className="sr-map-panel">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="sr-map"
            zoomControl={true}
          >
            <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
            <MapFitter points={routePts} />
            {focusPin && <PenaltyFocuser lat={focusPin[0]} lng={focusPin[1]} />}

            {showZones &&
              dispZones
                .filter((z) => z.active && z.polygon.length >= 3)
                .map((z) => (
                  <Polygon
                    key={z.zone_uuid}
                    positions={z.polygon.map((p): [number, number] => [
                      p.lat,
                      p.lng,
                    ])}
                    pathOptions={{
                      color: z.zone_type === "no_go" ? "#e53e3e" : "#f6ae2d",
                      fillColor:
                        z.zone_type === "no_go" ? "#e53e3e" : "#f6ae2d",
                      fillOpacity: 0.12,
                      weight: 2,
                      dashArray:
                        z.zone_type === "speed_limit" ? "6 4" : undefined,
                    }}
                  >
                    <Popup>
                      <strong>
                        {z.title ||
                          (z.zone_type === "no_go"
                            ? "No-go zone"
                            : "Speed limit zone")}
                      </strong>
                      {z.description && (
                        <>
                          <br />
                          {z.description}
                        </>
                      )}
                      {z.zone_type === "speed_limit" &&
                        z.speed_limit_mph != null && (
                          <>
                            <br />
                            Limit: {z.speed_limit_mph} mph
                          </>
                        )}
                    </Popup>
                  </Polygon>
                ))}

            {showRoute &&
              segments.map((seg, i) => (
                <Polyline
                  key={i}
                  positions={seg.positions}
                  pathOptions={{
                    color: seg.color,
                    weight: 4,
                    opacity: 0.9,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              ))}

            {showRoute && selSess && selSess.points.length > 0 && (
              <>
                <CircleMarker
                  center={[
                    selSess.points[0].latitude,
                    selSess.points[0].longitude,
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
                    {fmtFull(selSess.started_at)}
                  </Popup>
                </CircleMarker>
                <CircleMarker
                  center={[
                    selSess.points[selSess.points.length - 1].latitude,
                    selSess.points[selSess.points.length - 1].longitude,
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
                    {selSess.ended_at ? fmtFull(selSess.ended_at) : "—"}
                  </Popup>
                </CircleMarker>
              </>
            )}

            {showPOIs &&
              selSess?.visited_pois.map((poi, i) => (
                <CircleMarker
                  key={`poi-${i}`}
                  center={[poi.lat, poi.lng]}
                  radius={10}
                  pathOptions={{
                    color: "#c87a00",
                    fillColor: "#f6ae2d",
                    fillOpacity: 0.95,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>{poi.title || "Point of Interest"}</strong>
                    <br />+{poi.bonus_points} pts
                    {poi.description && (
                      <>
                        <br />
                        {poi.description}
                      </>
                    )}
                    {typeof poi.confidence_percent === "number" &&
                      Number.isFinite(poi.confidence_percent) && (
                        <>
                          <br />
                          Confidence: {fmtConfidence(poi.confidence_percent)}
                        </>
                      )}
                    {poi.visited_at > 0 && (
                      <>
                        <br />
                        <span style={{ color: "#888", fontSize: "0.82em" }}>
                          {fmtShort(poi.visited_at)}
                        </span>
                      </>
                    )}
                  </Popup>
                </CircleMarker>
              ))}

            {showPenalties &&
              selSess?.penalty_events.map((ev, i) => (
                <CircleMarker
                  key={`pen-${i}`}
                  center={[ev.lat, ev.lng]}
                  radius={10}
                  pathOptions={{
                    color: "#9b1c1c",
                    fillColor: "#e53e3e",
                    fillOpacity: 0.95,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>
                      {ev.title ||
                        (ev.zone_type === "no_go"
                          ? "No-go zone"
                          : "Speed limit zone")}
                    </strong>
                    <br />−{ev.points_lost} pts
                    {ev.reason && (
                      <>
                        <br />
                        {ev.reason}
                      </>
                    )}
                    {ev.zone_type === "speed_limit" &&
                      ev.speed_limit_mph != null && (
                        <>
                          <br />
                          Limit: {ev.speed_limit_mph} mph
                        </>
                      )}
                    {ev.duration_ms > 0 && (
                      <>
                        <br />
                        Duration: {Math.round(ev.duration_ms / 1000)}s
                      </>
                    )}
                    {typeof ev.confidence_percent === "number" &&
                      Number.isFinite(ev.confidence_percent) && (
                        <>
                          <br />
                          Confidence:{" "}
                          {Math.max(
                            0,
                            Math.min(100, Math.round(ev.confidence_percent)),
                          )}
                          %
                        </>
                      )}
                  </Popup>
                </CircleMarker>
              ))}
          </MapContainer>

          {/* Floating layer toggles */}
          {hasGPS && (
            <div className="sr-overlay-filters">
              <span className="sr-overlay-label">Layers</span>
              {layerToggles.map((f) => (
                <button
                  key={f.key}
                  className={`sr-filter-btn${f.active ? " sr-filter-btn--on" : ""}`}
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
                  {[
                    { l: "< 5 mph", c: "#27cc5e" },
                    { l: "5–10", c: "#a8d63c" },
                    { l: "10–15", c: "#f6ae2d" },
                    { l: "15–20", c: "#ff6b35" },
                    { l: "20+", c: "#e53e3e" },
                  ].map((s) => (
                    <span key={s.l} className="sr-swatch">
                      <span
                        className="sr-swatch-dot"
                        style={{ background: s.c }}
                      />
                      {s.l}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Floating session stats */}
          {selSess && (
            <div
              className={`sr-overlay-stats${statsOpen ? " sr-overlay-stats--open" : ""}`}
            >
              <button
                className="sr-stats-hd"
                onClick={() => setStatsOpen((v) => !v)}
              >
                <span className="sr-stats-hd-title">
                  {fmtShort(selSess.started_at)}
                </span>
                <span className="sr-stats-hd-icon">
                  {statsOpen ? "▾" : "▴"}
                </span>
              </button>
              {statsOpen && (
                <div className="sr-stats-grid">
                  {[
                    {
                      label: "Distance",
                      value: fmtDist(selSess.distance_meters),
                    },
                    {
                      label: "Duration",
                      value: fmtDur(selSess.duration_seconds),
                    },
                    {
                      label: "Points",
                      value: `+${selSess.bonus_points}`,
                      cls: "sr-val--green",
                    },
                    ...(selSess.penalty_points > 0
                      ? [
                          {
                            label: "Penalties",
                            value: `−${selSess.penalty_points}`,
                            cls: "sr-val--red",
                          },
                        ]
                      : []),
                    {
                      label: "POI visits",
                      value: String(selSess.visited_pois.length),
                    },
                    {
                      label: "Top speed",
                      value: `${(selSess.top_speed_mps * 2.237).toFixed(1)} mph`,
                    },
                    {
                      label: "GPS samples",
                      value: selSess.points.length.toLocaleString(),
                    },
                  ].map((s) => (
                    <div key={s.label} className="sr-stat">
                      <span className="sr-stat-label">{s.label}</span>
                      <strong
                        className={`sr-stat-val${s.cls ? ` ${s.cls}` : ""}`}
                      >
                        {s.value}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty / loading overlays */}
          {noStudent && (
            <div className="sr-map-overlay">
              <div className="sr-map-msg">
                <div className="sr-map-msg-icon">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="11" r="3" />
                    <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
                <p className="sr-map-msg-title">Select a student</p>
                <p className="sr-map-msg-desc">
                  Choose a student from the left sidebar to view their ride
                  history on the map.
                </p>
              </div>
            </div>
          )}
          {selUUID && histBusy && (
            <div className="sr-map-overlay">
              <div className="sr-map-msg">
                <p className="sr-map-msg-title">Loading rides…</p>
              </div>
            </div>
          )}
          {noRides && (
            <div className="sr-map-overlay">
              <div className="sr-map-msg">
                <div className="sr-map-msg-icon">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <p className="sr-map-msg-title">No rides recorded</p>
                <p className="sr-map-msg-desc">
                  This student has no route history yet.
                </p>
              </div>
            </div>
          )}
          {noGPS && !noRides && (
            <div className="sr-map-overlay">
              <div className="sr-map-msg">
                <div className="sr-map-msg-icon">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  </svg>
                </div>
                <p className="sr-map-msg-title">No GPS data</p>
                <p className="sr-map-msg-desc">
                  This ride was manually logged — no GPS breadcrumbs available.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="sr-context-panel">
          <div className="sr-context-head">
            <span className="sr-eyebrow">Route Details</span>
            {selSess && (
              <span className="sr-count">{fmtShort(selSess.started_at)}</span>
            )}
          </div>
          {!selSess ? (
            <p className="sr-context-empty">
              Select a ride to see POI and penalty events.
            </p>
          ) : (
            <>
              <section className="sr-context-section">
                <div className="sr-context-section-head">
                  <strong>POIs</strong>
                  <span>{selSess.visited_pois.length.toLocaleString()}</span>
                </div>
                {selSess.visited_pois.length === 0 ? (
                  <p className="sr-context-empty">No POI hits on this ride.</p>
                ) : (
                  <div className="sr-event-button-list">
                    {selSess.visited_pois.map((poi, index) => (
                      <button
                        key={`${poi.poi_uuid}-${poi.visited_at}-${index}`}
                        className="sr-event-button sr-event-button--poi"
                        type="button"
                        onClick={() => focusRouteEvent(poi.lat, poi.lng, "poi")}
                      >
                        <span className="sr-event-button-top">
                          <strong>{poi.title || "Point of Interest"}</strong>
                          <em>+{poi.bonus_points.toLocaleString()}</em>
                        </span>
                        <span className="sr-event-button-meta">
                          Confidence {fmtConfidence(poi.confidence_percent)} ·{" "}
                          {fmtShort(poi.visited_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="sr-context-section">
                <div className="sr-context-section-head">
                  <strong>Penalties</strong>
                  <span>{selSess.penalty_events.length.toLocaleString()}</span>
                </div>
                {selSess.penalty_events.length === 0 ? (
                  <p className="sr-context-empty">
                    No penalty events on this ride.
                  </p>
                ) : (
                  <div className="sr-event-button-list">
                    {selSess.penalty_events.map((ev, index) => (
                      <button
                        key={`${ev.zone_uuid}-${ev.occurred_at}-${index}`}
                        className="sr-event-button sr-event-button--penalty"
                        type="button"
                        onClick={() =>
                          focusRouteEvent(ev.lat, ev.lng, "penalty")
                        }
                      >
                        <span className="sr-event-button-top">
                          <strong>
                            {ev.title ||
                              (ev.zone_type === "no_go"
                                ? "No-go zone"
                                : "Speed limit zone")}
                          </strong>
                          <em>−{ev.points_lost.toLocaleString()}</em>
                        </span>
                        <span className="sr-event-button-meta">
                          Confidence {fmtConfidence(ev.confidence_percent)} ·
                          Time spent {fmtMs(ev.duration_ms)}
                        </span>
                        <span className="sr-event-button-meta">
                          {evidenceCountLabel(ev.evidence_point_count)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </aside>
      </div>

      {/* ══ Bottom ride scroller ══ */}
      {selUUID && (
        <div className="sr-ride-bar">
          <div className="sr-ride-bar-head">
            <span className="sr-eyebrow">
              {selEntry ? `${firstName(selEntry)}'s rides` : "Rides"}
            </span>
            {!histBusy && history.length > 0 && (
              <span className="sr-count">{history.length}</span>
            )}
            {histErr && <span className="sr-err-inline">{histErr}</span>}
            {histBusy && <span className="sr-muted-inline">Loading…</span>}
          </div>

          {noRides && !histBusy && (
            <p className="sr-ride-bar-empty">
              No rides recorded for this student yet.
            </p>
          )}

          {history.length > 0 && (
            <div className="sr-ride-scroll" ref={rideScrollRef}>
              {history.map((sess) => {
                const active = sess.session_id === selId;
                return (
                  <button
                    key={sess.session_id}
                    data-active={active ? "true" : "false"}
                    className={`sr-ride-chip${active ? " sr-ride-chip--active" : ""}`}
                    onClick={() => {
                      if (!didDrag.current) setSelId(sess.session_id);
                    }}
                  >
                    <span className="sr-chip-date">
                      {fmtShort(sess.started_at)}
                    </span>
                    <span className="sr-chip-dist">
                      {fmtDist(sess.distance_meters)}
                    </span>
                    <span className="sr-chip-dur">
                      {fmtDur(sess.duration_seconds)}
                    </span>
                    <span className="sr-chip-badges">
                      {sess.bonus_points > 0 && (
                        <span className="sr-badge sr-badge--green">
                          +{sess.bonus_points}
                        </span>
                      )}
                      {sess.penalty_events.length > 0 && (
                        <span className="sr-badge sr-badge--red">
                          {sess.penalty_events.length}⚠
                        </span>
                      )}
                      {sess.visited_pois.length > 0 && (
                        <span className="sr-badge sr-badge--gold">
                          {sess.visited_pois.length}★
                        </span>
                      )}
                      {sess.points.length === 0 && (
                        <span className="sr-badge sr-badge--muted">no GPS</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
