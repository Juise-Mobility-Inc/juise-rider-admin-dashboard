import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LatLng, LatLngBounds } from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  visitedPoiIcon,
  noGoPenaltyIcon,
  speedPenaltyIcon,
} from "../../lib/mapIcons";
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

function normalizeUnixSeconds(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value > 9_999_999_999 ? Math.floor(value / 1000) : value;
}

function fmtShort(ts: number): string {
  const seconds = normalizeUnixSeconds(ts);
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtFull(ts: number): string {
  const seconds = normalizeUnixSeconds(ts);
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString([], {
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

function fmtSpeed(mps: number | null | undefined): string {
  if (typeof mps !== "number" || !Number.isFinite(mps)) return "—";
  return `${(mps * 2.237).toFixed(1)} mph`;
}

function fmtElevation(meters: number | null | undefined): string {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return "—";
  return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
}

function fmtAccuracy(meters: number | null | undefined): string {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return "—";
  return `±${Math.round(meters * 3.28084).toLocaleString()} ft`;
}

function getPenaltyMaxSpeedMps(
  session: StudentRouteHistorySession,
  event: StudentRouteHistorySession["penalty_events"][number],
): number | null {
  if (typeof event.max_speed_mps === "number" && Number.isFinite(event.max_speed_mps)) {
    return event.max_speed_mps;
  }
  if (event.zone_type !== "speed_limit") {
    return null;
  }

  const occurredAt = normalizeUnixSeconds(event.occurred_at);
  if (!occurredAt) {
    return null;
  }

  const durationSeconds =
    typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms)
      ? Math.max(0, event.duration_ms / 1000)
      : 0;
  const startAt = occurredAt - 5;
  const endAt = occurredAt + Math.max(durationSeconds, 120) + 5;

  const speeds = session.points
    .filter((point) => {
      const pointAt = normalizeUnixSeconds(point.timestamp);
      return pointAt >= startAt && pointAt <= endAt;
    })
    .flatMap((point) =>
      typeof point.speed_mps === "number" && Number.isFinite(point.speed_mps)
        ? [point.speed_mps]
        : [],
    );

  if (speeds.length === 0) {
    return null;
  }
  return Math.max(...speeds);
}

function getPenaltyMaxSpeedPoint(
  session: StudentRouteHistorySession,
  event: StudentRouteHistorySession["penalty_events"][number],
): StudentRouteHistorySession["points"][number] | null {
  if (event.zone_type !== "speed_limit") {
    return null;
  }

  const occurredAt = normalizeUnixSeconds(event.occurred_at);
  if (!occurredAt) {
    return null;
  }

  const durationSeconds =
    typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms)
      ? Math.max(0, event.duration_ms / 1000)
      : 0;
  const startAt = occurredAt - 5;
  const endAt = occurredAt + Math.max(durationSeconds, 120) + 5;
  const expectedMaxSpeed = getPenaltyMaxSpeedMps(session, event);

  return (
    session.points
      .filter((point) => {
        const pointAt = normalizeUnixSeconds(point.timestamp);
        return (
          pointAt >= startAt &&
          pointAt <= endAt &&
          typeof point.speed_mps === "number" &&
          Number.isFinite(point.speed_mps)
        );
      })
      .sort((left, right) => {
        if (expectedMaxSpeed != null) {
          const leftDelta = Math.abs((left.speed_mps ?? 0) - expectedMaxSpeed);
          const rightDelta = Math.abs((right.speed_mps ?? 0) - expectedMaxSpeed);
          if (leftDelta !== rightDelta) {
            return leftDelta - rightDelta;
          }
        }
        return (right.speed_mps ?? 0) - (left.speed_mps ?? 0);
      })[0] ?? null
  );
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

function penaltyLabel(zoneType: string): string {
  if (zoneType === "no_go") return "Restricted area";
  if (zoneType === "speed_limit") return "Speed limit";
  return zoneType;
}

function penaltyTitle(ev: { title?: string | null; zone_type: string }): string {
  if (ev.title?.trim()) return ev.title.trim();
  if (ev.zone_type === "no_go") return "Entered Restricted Area";
  if (ev.zone_type === "speed_limit") return "Speeding";
  return "Penalty";
}

function zoneTitle(z: { title?: string | null; zone_type: string }): string {
  if (z.title?.trim()) return z.title.trim();
  if (z.zone_type === "no_go") return "No-go area";
  if (z.zone_type === "speed_limit") return "Speed limit area";
  return "Zone";
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function downloadCSV(filename: string, rows: string[][]): void {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportAllRidesSummary(
  entry: SchoolStudentRosterEntry | null,
  sessions: StudentRouteHistorySession[],
): void {
  const studentName = entry ? safeFilename(fullName(entry)) : "student";
  const headers = [
    "Ride #",
    "Date",
    "Distance (mi)",
    "Duration",
    "Points Earned",
    "Points Lost",
    "Check-in Spots",
    "Violations",
    "GPS Points",
  ];
  const rows = sessions.map((sess, idx) => [
    String(idx + 1),
    fmtFull(getSessionStartedAt(sess)),
    (sess.distance_meters / 1609.344).toFixed(2),
    fmtDur(sess.duration_seconds),
    String(sess.bonus_points),
    String(sess.penalty_points),
    String(sess.visited_pois.length),
    String(sess.penalty_events.length),
    String(sess.points.length),
  ]);
  downloadCSV(`${studentName}_all_rides.csv`, [headers, ...rows]);
}

function exportRideGPS(
  entry: SchoolStudentRosterEntry | null,
  sess: StudentRouteHistorySession,
  rideNum: number,
): void {
  const studentName = entry ? safeFilename(fullName(entry)) : "student";
  const headers = [
    "Timestamp",
    "Latitude",
    "Longitude",
    "Speed (mph)",
    "Altitude (ft)",
    "Accuracy (ft)",
  ];
  const rows = sess.points.map((pt) => [
    fmtFull(pt.timestamp),
    String(pt.latitude),
    String(pt.longitude),
    pt.speed_mps != null ? (pt.speed_mps * 2.237).toFixed(2) : "",
    pt.altitude != null ? Math.round(pt.altitude * 3.28084).toString() : "",
    pt.accuracy != null ? Math.round(pt.accuracy * 3.28084).toString() : "",
  ]);
  downloadCSV(`${studentName}_ride_${rideNum}.csv`, [headers, ...rows]);
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
type RouteHover = {
  index: number;
  point: StudentRouteHistorySession["points"][number];
  distanceMeters: number;
};

function buildRouteDistances(
  points: StudentRouteHistorySession["points"],
): number[] {
  if (!points.length) return [];
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    distances.push(
      distances[i - 1] +
        new LatLng(previous.latitude, previous.longitude).distanceTo(
          new LatLng(current.latitude, current.longitude),
        ),
    );
  }
  return distances;
}

function findNearestRouteHover(
  session: StudentRouteHistorySession,
  distances: number[],
  latlng: LatLng,
): RouteHover | null {
  if (!session.points.length) return null;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  session.points.forEach((point, index) => {
    const distance = latlng.distanceTo(
      new LatLng(point.latitude, point.longitude),
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return {
    index: bestIndex,
    point: session.points[bestIndex],
    distanceMeters: distances[bestIndex] ?? 0,
  };
}

function getSessionStartedAt(session: StudentRouteHistorySession): number {
  const firstPointTimestamp = session.points.find((point) =>
    normalizeUnixSeconds(point.timestamp),
  )?.timestamp;
  return (
    normalizeUnixSeconds(firstPointTimestamp) ||
    normalizeUnixSeconds(session.started_at)
  );
}

function getSessionEndedAt(session: StudentRouteHistorySession): number {
  const lastPointTimestamp = [...session.points]
    .reverse()
    .find((point) => normalizeUnixSeconds(point.timestamp))?.timestamp;
  return (
    normalizeUnixSeconds(lastPointTimestamp) ||
    normalizeUnixSeconds(session.ended_at)
  );
}

function sortRouteSessions(
  sessions: StudentRouteHistorySession[],
): StudentRouteHistorySession[] {
  return [...sessions].sort(
    (left, right) => getSessionStartedAt(right) - getSessionStartedAt(left),
  );
}

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

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showPenalties, setShowPenalties] = useState(true);
  const [showNoGoZones, setShowNoGoZones] = useState(true);
  const [showSpeedZones, setShowSpeedZones] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);
  const [routeHover, setRouteHover] = useState<RouteHover | null>(null);
  const [selectedMaxSpeedPoint, setSelectedMaxSpeedPoint] = useState<
    StudentRouteHistorySession["points"][number] | null
  >(null);

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
        const sortedSessions = sortRouteSessions(sessions);
        setHistory(sortedSessions);
        const target = targetSessionId
          ? sortedSessions.find((s) => s.session_id === targetSessionId)
          : null;
        if (target) {
          setSelId(target.session_id);
          if (pinLat != null && pinLng != null) setFocusPin([pinLat, pinLng]);
        } else if (sortedSessions.length > 0) {
          setSelId(sortedSessions[0].session_id);
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

  const routeDistances = useMemo(
    () => buildRouteDistances(selSess?.points ?? []),
    [selSess],
  );

  const dispZones = useMemo((): SchoolZone[] => {
    if (!selSess) return [];
    return selSess.school_zones?.length ? selSess.school_zones : zones;
  }, [selSess, zones]);

  useEffect(() => {
    setRouteHover(null);
    setSelectedMaxSpeedPoint(null);
  }, [selId, showRoute]);

  const hasGPS = !!(selSess && selSess.points.length > 0);
  const noStudent = !selUUID;
  const noRides = !!(selUUID && !histBusy && history.length === 0 && !histErr);
  const noGPS = !!(selSess && selSess.points.length === 0);

  const layerToggles = [
    {
      key: "route",
      label: "Route path",
      active: showRoute,
      toggle: () => setShowRoute((v) => !v),
      color: "#3b6fb5",
    },
    {
      key: "pois",
      label: "Check-in spots",
      active: showPOIs,
      toggle: () => setShowPOIs((v) => !v),
      color: "#f6ae2d",
    },
    {
      key: "penalties",
      label: "Violations",
      active: showPenalties,
      toggle: () => setShowPenalties((v) => !v),
      color: "#e53e3e",
    },
    {
      key: "nogo",
      label: "No-go zones",
      active: showNoGoZones,
      toggle: () => setShowNoGoZones((v) => !v),
      color: "#e53e3e",
    },
    {
      key: "speed",
      label: "Speed limit zones",
      active: showSpeedZones,
      toggle: () => setShowSpeedZones((v) => !v),
      color: "#f6ae2d",
    },
  ];

  const focusRouteEvent = (
    lat: number,
    lng: number,
    layer: "poi" | "penalty",
    event?: StudentRouteHistorySession["penalty_events"][number],
  ) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setFocusPin([lat, lng]);
    if (layer === "poi") {
      setShowPOIs(true);
      setSelectedMaxSpeedPoint(null);
    }
    if (layer === "penalty") {
      setShowPenalties(true);
      setSelectedMaxSpeedPoint(
        selSess && event ? getPenaltyMaxSpeedPoint(selSess, event) : null,
      );
    }
  };

  return (
    <div className="sr-layout">
      {/* ══ Top row: sidebar + map ══ */}
      <div className="sr-main-row">
        {/* ── Student sidebar ── */}
        <aside className={`sr-sidebar${sidebarOpen ? "" : " sr-sidebar--collapsed"}`}>
          {/* Toggle button — always visible */}
          <button
            className="sr-sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide student list" : "Show student list"}
          >
            {sidebarOpen ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 12L6 8l4-4"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4l4 4-4 4"/>
              </svg>
            )}
            {!sidebarOpen && roster.length > 0 && (
              <span className="sr-sidebar-toggle-count">{roster.length}</span>
            )}
          </button>

          {/* Collapsible body */}
          <div className="sr-sidebar-body">
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

            {dispZones
              .filter((z) => {
                if (!z.active || z.polygon.length < 3) return false;
                if (z.zone_type === "no_go") return showNoGoZones;
                if (z.zone_type === "speed_limit") return showSpeedZones;
                return false;
              })
              .map((z) => (
                  <Polygon
                    key={z.zone_uuid}
                    positions={z.polygon.map((p): [number, number] => [
                      p.lat,
                      p.lng,
                    ])}
                    pathOptions={{
                      color: z.zone_type === "no_go" ? "#b91c1c" : "#b45309",
                      fillColor:
                        z.zone_type === "no_go" ? "#ef4444" : "#f59e0b",
                      fillOpacity: z.zone_type === "no_go" ? 0.35 : 0.25,
                      weight: z.zone_type === "no_go" ? 3.5 : 3,
                    }}
                  >
                    <Tooltip
                      sticky
                      direction="top"
                      opacity={1}
                      className="sr-map-hover-tooltip"
                    >
                      <div className="sr-map-hover-card">
                        <strong>{zoneTitle(z)}</strong>
                        <span>
                          {z.zone_type === "no_go"
                            ? "⛔ Students must not enter this area"
                            : z.speed_limit_mph != null
                              ? `Speed limit: ${z.speed_limit_mph} mph`
                              : "Speed limit zone"}
                        </span>
                      </div>
                    </Tooltip>
                    <Popup>
                      <strong>{zoneTitle(z)}</strong>
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
                            Speed limit: {z.speed_limit_mph} mph
                          </>
                        )}
                      {z.zone_type === "no_go" && (
                        <>
                          <br />
                          Students must not enter this area.
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
                  eventHandlers={{
                    mousemove: (event) => {
                      if (!selSess) return;
                      setRouteHover(
                        findNearestRouteHover(
                          selSess,
                          routeDistances,
                          event.latlng,
                        ),
                      );
                    },
                    mouseout: () => setRouteHover(null),
                  }}
                />
              ))}

            {showRoute && routeHover ? (
              <CircleMarker
                center={[routeHover.point.latitude, routeHover.point.longitude]}
                radius={7}
                interactive={false}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: speedColor(routeHover.point.speed_mps),
                  fillOpacity: 1,
                  weight: 2.5,
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -10]}
                  opacity={1}
                  className="sr-map-hover-tooltip"
                >
                  <div className="sr-map-hover-card sr-map-hover-card--wide">
                    <strong>{fmtFull(routeHover.point.timestamp)}</strong>
                    <span>Speed {fmtSpeed(routeHover.point.speed_mps)}</span>
                    <span>Distance {fmtDist(routeHover.distanceMeters)}</span>
                    <span>Elevation {fmtElevation(routeHover.point.altitude)}</span>
                    <span>Accuracy {fmtAccuracy(routeHover.point.accuracy)}</span>
                  </div>
                </Tooltip>
              </CircleMarker>
            ) : null}

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
                    {fmtFull(getSessionStartedAt(selSess))}
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
                    {getSessionEndedAt(selSess)
                      ? fmtFull(getSessionEndedAt(selSess))
                      : "—"}
                  </Popup>
                </CircleMarker>
              </>
            )}

            {showPOIs &&
              selSess?.visited_pois.map((poi, i) => (
                <Fragment key={`poi-${i}`}>
                  {typeof poi.radius_meters === "number" &&
                  Number.isFinite(poi.radius_meters) &&
                  poi.radius_meters > 0 ? (
                    <Circle
                      center={[poi.lat, poi.lng]}
                      radius={poi.radius_meters}
                      pathOptions={{
                        color: "#f6ae2d",
                        fillColor: "#f6ae2d",
                        fillOpacity: 0.12,
                        weight: 1,
                      }}
                    />
                  ) : null}
                  <Marker
                    position={[poi.lat, poi.lng]}
                    icon={visitedPoiIcon}
                  >
                    <Tooltip
                      sticky
                      direction="top"
                      opacity={1}
                      className="sr-map-hover-tooltip"
                    >
                      <div className="sr-map-hover-card">
                        <strong>{poi.title || "Point of Interest"}</strong>
                        <span>Visited {fmtShort(poi.visited_at)}</span>
                        <span>+{poi.bonus_points.toLocaleString()} pts</span>
                        <span>Confidence {fmtConfidence(poi.confidence_percent)}</span>
                      </div>
                    </Tooltip>
                    <Popup>
                      <strong>{poi.title || "Point of Interest"}</strong>
                      <br />+{poi.bonus_points} pts
                      {poi.description && (
                        <>
                          <br />
                          {poi.description}
                        </>
                      )}
                      {typeof poi.radius_meters === "number" &&
                        Number.isFinite(poi.radius_meters) && (
                          <>
                            <br />
                            Entry radius:{" "}
                            {Math.round(poi.radius_meters * 3.28084).toLocaleString()} ft
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
                  </Marker>
                </Fragment>
              ))}

            {showPenalties &&
              selSess?.penalty_events.map((ev, i) => {
                const maxSpeedMps = getPenaltyMaxSpeedMps(selSess, ev);
                return (
                  <Marker
                    key={`pen-${i}`}
                    position={[ev.lat, ev.lng]}
                    icon={ev.zone_type === "no_go" ? noGoPenaltyIcon : speedPenaltyIcon}
                    eventHandlers={{
                      click: () =>
                        focusRouteEvent(ev.lat, ev.lng, "penalty", ev),
                    }}
                  >
                    <Tooltip
                      sticky
                      direction="top"
                      opacity={1}
                      className="sr-map-hover-tooltip"
                    >
                      <div className="sr-map-hover-card">
                        <strong>
                          {ev.title ||
                            (ev.zone_type === "no_go"
                              ? "No-go zone"
                              : "Speed limit zone")}
                        </strong>
                        <span>−{ev.points_lost.toLocaleString()} pts</span>
                        <span>{fmtShort(ev.occurred_at)}</span>
                        {ev.zone_type === "speed_limit" &&
                        ev.speed_limit_mph != null ? (
                          <span>Limit {ev.speed_limit_mph} mph</span>
                        ) : null}
                        {maxSpeedMps != null ? (
                          <span>Max speed caught {fmtSpeed(maxSpeedMps)}</span>
                        ) : null}
                        <span>Duration {fmtMs(ev.duration_ms)}</span>
                      </div>
                    </Tooltip>
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
                      {maxSpeedMps != null ? (
                        <>
                          <br />
                          Max speed caught: {fmtSpeed(maxSpeedMps)}
                        </>
                      ) : null}
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
                  </Marker>
                );
              })}

            {showPenalties && selectedMaxSpeedPoint ? (
              <CircleMarker
                center={[
                  selectedMaxSpeedPoint.latitude,
                  selectedMaxSpeedPoint.longitude,
                ]}
                radius={8}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: "#111827",
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -10]}
                  opacity={1}
                  className="sr-map-hover-tooltip"
                >
                  <div className="sr-map-hover-card">
                    <strong>Max speed sample</strong>
                    <span>{fmtSpeed(selectedMaxSpeedPoint.speed_mps)}</span>
                    <span>{fmtFull(selectedMaxSpeedPoint.timestamp)}</span>
                    <span>
                      Accuracy {fmtAccuracy(selectedMaxSpeedPoint.accuracy)}
                    </span>
                  </div>
                </Tooltip>
              </CircleMarker>
            ) : null}
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
                  {fmtShort(getSessionStartedAt(selSess))}
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
                      label: "Points earned",
                      value: `+${selSess.bonus_points}`,
                      cls: "sr-val--green",
                    },
                    ...(selSess.penalty_points > 0
                      ? [
                          {
                            label: "Points lost",
                            value: `−${selSess.penalty_points}`,
                            cls: "sr-val--red",
                          },
                        ]
                      : []),
                    {
                      label: "Spots visited",
                      value: String(selSess.visited_pois.length),
                    },
                    {
                      label: "Top speed",
                      value: `${(selSess.top_speed_mps * 2.237).toFixed(1)} mph`,
                    },
                    {
                      label: "GPS data points",
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
            <span className="sr-eyebrow">Ride Summary</span>
            <div className="sr-context-head-actions">
              {selSess && (
                <span className="sr-count">{fmtShort(selSess.started_at)}</span>
              )}
              {selSess && (
                <button
                  className="sr-dl-btn sr-dl-btn--icon"
                  type="button"
                  title="Download this ride's GPS data as CSV"
                  onClick={() => {
                    const rideNum = history.findIndex(
                      (s) => s.session_id === selSess.session_id,
                    ) + 1;
                    exportRideGPS(selEntry, selSess, rideNum);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v9M4 8l4 4 4-4"/><rect x="2" y="13" width="12" height="1.5" rx="0.75" fill="currentColor" stroke="none"/>
                  </svg>
                  Export ride
                </button>
              )}
            </div>
          </div>

          {!selSess ? (
            <p className="sr-context-empty">
              Select a ride below to see check-in spots, violations, and active safety zones.
            </p>
          ) : (
            <>
              {/* At-a-glance points strip */}
              <div className="sr-summary-strip">
                <div className="sr-summary-item sr-summary-item--green">
                  <span className="sr-summary-val">+{selSess.bonus_points}</span>
                  <span className="sr-summary-label">pts earned</span>
                </div>
                <div className="sr-summary-divider" />
                <div className={`sr-summary-item${selSess.penalty_points > 0 ? " sr-summary-item--red" : ""}`}>
                  <span className="sr-summary-val">−{selSess.penalty_points}</span>
                  <span className="sr-summary-label">pts lost</span>
                </div>
                <div className="sr-summary-divider" />
                <div className="sr-summary-item">
                  <span className="sr-summary-val">{fmtDist(selSess.distance_meters)}</span>
                  <span className="sr-summary-label">distance</span>
                </div>
              </div>

              {/* Check-in spots (POIs) */}
              <section className="sr-context-section">
                <div className="sr-context-section-head">
                  <strong>
                    <span className="sr-section-icon sr-section-icon--poi">★</span>
                    Check-in Spots
                  </strong>
                  <span>{selSess.visited_pois.length}</span>
                </div>
                {selSess.visited_pois.length === 0 ? (
                  <p className="sr-context-empty">No check-in spots visited on this ride.</p>
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
                          <em>+{poi.bonus_points.toLocaleString()} pts</em>
                        </span>
                        <span className="sr-event-button-meta">
                          Visited {fmtShort(poi.visited_at)}
                        </span>
                        <span className="sr-event-button-meta sr-muted-secondary">
                          Confidence: {fmtConfidence(poi.confidence_percent)}
                        </span>
                        <span className="sr-jump-label">↗ Jump to map</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Violations (penalties) */}
              <section className="sr-context-section">
                <div className="sr-context-section-head">
                  <strong>
                    <span className="sr-section-icon sr-section-icon--penalty">⚠</span>
                    Violations
                  </strong>
                  <span>{selSess.penalty_events.length}</span>
                </div>
                {selSess.penalty_events.length === 0 ? (
                  <p className="sr-context-empty sr-context-empty--clean">
                    No violations — clean ride!
                  </p>
                ) : (
                  <div className="sr-event-button-list">
                    {selSess.penalty_events.map((ev, index) => {
                      const maxSpeedMps = getPenaltyMaxSpeedMps(selSess, ev);
                      return (
                        <button
                          key={`${ev.zone_uuid}-${ev.occurred_at}-${index}`}
                          className="sr-event-button sr-event-button--penalty"
                          type="button"
                          onClick={() =>
                            focusRouteEvent(ev.lat, ev.lng, "penalty", ev)
                          }
                        >
                          <span className="sr-event-button-top">
                            <strong>{penaltyTitle(ev)}</strong>
                            <em>−{ev.points_lost.toLocaleString()} pts</em>
                          </span>
                          <span className="sr-event-badge-row">
                            <span className="sr-event-type-badge">{penaltyLabel(ev.zone_type)}</span>
                            <span className="sr-event-button-meta">{fmtShort(ev.occurred_at)}</span>
                          </span>
                          {ev.duration_ms > 0 && (
                            <span className="sr-event-button-meta">
                              Duration: {fmtMs(ev.duration_ms)}
                            </span>
                          )}
                          {maxSpeedMps != null && (
                            <span className="sr-event-button-meta">
                              Max speed: {fmtSpeed(maxSpeedMps)}
                              {ev.speed_limit_mph != null
                                ? ` (limit: ${ev.speed_limit_mph} mph)`
                                : ""}
                            </span>
                          )}
                          <span className="sr-jump-label">↗ Jump to map</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Active safety zones on this session */}
              {dispZones.filter((z) => z.active).length > 0 && (
                <section className="sr-context-section">
                  <div className="sr-context-section-head">
                    <strong>
                      <span className="sr-section-icon sr-section-icon--zone">◉</span>
                      Safety Zones
                    </strong>
                    <span>{dispZones.filter((z) => z.active).length}</span>
                  </div>
                  <div className="sr-zone-list">
                    {dispZones
                      .filter((z) => z.active)
                      .map((z) => (
                        <div
                          key={z.zone_uuid}
                          className={`sr-zone-chip sr-zone-chip--${z.zone_type}`}
                        >
                          <span className="sr-zone-chip-dot" />
                          <span className="sr-zone-chip-name">{zoneTitle(z)}</span>
                          {z.zone_type === "speed_limit" && z.speed_limit_mph != null && (
                            <span className="sr-zone-chip-limit">{z.speed_limit_mph} mph</span>
                          )}
                          {z.zone_type === "no_go" && (
                            <span className="sr-zone-chip-limit">no entry</span>
                          )}
                        </div>
                      ))}
                  </div>
                </section>
              )}
            </>
          )}
        </aside>
      </div>

      {/* ══ Bottom ride scroller ══ */}
      {selUUID && (
        <div className="sr-ride-bar">
          <div className="sr-ride-bar-head">
            <div className="sr-ride-bar-head-left">
              <span className="sr-eyebrow">
                {selEntry ? `${firstName(selEntry)}'s Ride History` : "Ride History"}
              </span>
              {!histBusy && history.length > 0 && (
                <span className="sr-count">{history.length} rides</span>
              )}
              {histErr && <span className="sr-err-inline">{histErr}</span>}
              {histBusy && <span className="sr-muted-inline">Loading…</span>}
            </div>
            <div className="sr-ride-bar-head-right">
              {history.length > 3 && (
                <span className="sr-ride-hint">Scroll to see all ›</span>
              )}
              {history.length > 0 && (
                <button
                  className="sr-dl-btn"
                  type="button"
                  title="Download all rides as CSV"
                  onClick={() => exportAllRidesSummary(selEntry, history)}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v9M4 8l4 4 4-4"/><rect x="2" y="13" width="12" height="1.5" rx="0.75" fill="currentColor" stroke="none"/>
                  </svg>
                  Download all rides
                </button>
              )}
            </div>
          </div>

          {noRides && !histBusy && (
            <p className="sr-ride-bar-empty">
              No rides recorded for this student yet.
            </p>
          )}

          {history.length > 0 && (
            <div className="sr-ride-scroll" ref={rideScrollRef}>
              {history.map((sess, idx) => {
                const active = sess.session_id === selId;
                const rideNum = idx + 1;
                return (
                  <div
                    key={sess.session_id}
                    className={`sr-ride-chip${active ? " sr-ride-chip--active" : ""}`}
                    onClick={() => {
                      if (!didDrag.current) setSelId(sess.session_id);
                    }}
                    data-active={active ? "true" : "false"}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelId(sess.session_id);
                    }}
                  >
                    <div className="sr-chip-top-row">
                      <span className="sr-chip-num">Ride #{rideNum}</span>
                      {sess.points.length > 0 && (
                        <button
                          className="sr-chip-dl-btn"
                          type="button"
                          title={`Download Ride #${rideNum} GPS data`}
                          onClick={(e) => {
                            e.stopPropagation();
                            exportRideGPS(selEntry, sess, rideNum);
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 2v9M4 8l4 4 4-4"/><rect x="2" y="13" width="12" height="1.5" rx="0.75" fill="currentColor" stroke="none"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <span className="sr-chip-date">
                      {fmtShort(getSessionStartedAt(sess))}
                    </span>
                    <span className="sr-chip-row">
                      <span className="sr-chip-dist">
                        {fmtDist(sess.distance_meters)}
                      </span>
                      <span className="sr-chip-sep">·</span>
                      <span className="sr-chip-dur">
                        {fmtDur(sess.duration_seconds)}
                      </span>
                    </span>
                    <span className="sr-chip-badges">
                      {sess.bonus_points > 0 && (
                        <span className="sr-badge sr-badge--green">
                          +{sess.bonus_points} pts
                        </span>
                      )}
                      {sess.penalty_events.length > 0 && (
                        <span className="sr-badge sr-badge--red">
                          {sess.penalty_events.length} violation{sess.penalty_events.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {sess.visited_pois.length > 0 && (
                        <span className="sr-badge sr-badge--gold">
                          {sess.visited_pois.length} spot{sess.visited_pois.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {sess.points.length === 0 && (
                        <span className="sr-badge sr-badge--muted">no GPS</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
