import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { downloadCsv, sanitizeCsvFilename, type CsvCell } from "../../lib/csv";
import { getRouteHistoryEarnedPoints } from "../../lib/routeHistoryPoints";
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
  if (mps == null) return "#1a4d99";
  const mph = mps * 2.237;
  if (mph < 5) return "#0a6b2e";
  if (mph < 10) return "#4a7a00";
  if (mph < 15) return "#b07800";
  if (mph < 20) return "#b54000";
  return "#991010";
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

function confidenceLabel(score: number): string {
  if (score >= 85) return "High";
  if (score >= 65) return "Good";
  if (score >= 45) return "Moderate";
  return "Low";
}

function scoreAccuracy(meters: number | null): number {
  if (meters == null || !Number.isFinite(meters)) return 55;
  if (meters <= 10) return 100;
  if (meters <= 25) return 85;
  if (meters <= 50) return 65;
  if (meters <= 100) return 40;
  return 20;
}

function scoreNoGoDuration(seconds: number): number {
  if (seconds >= 60) return 100;
  if (seconds >= 30) return 85;
  if (seconds >= 15) return 65;
  if (seconds >= 5) return 40;
  return 20;
}

function scoreSpeedDuration(seconds: number): number {
  if (seconds >= 45) return 100;
  if (seconds >= 20) return 80;
  if (seconds >= 10) return 55;
  if (seconds >= 5) return 35;
  return 15;
}

function scoreSpeedOverLimit(overLimitMph: number | null): number {
  if (overLimitMph == null || !Number.isFinite(overLimitMph)) return 45;
  if (overLimitMph >= 8) return 100;
  if (overLimitMph >= 5) return 80;
  if (overLimitMph >= 3) return 60;
  if (overLimitMph > 0) return 35;
  return 10;
}

function getPenaltyWindowPoints(
  session: StudentRouteHistorySession,
  event: StudentRouteHistorySession["penalty_events"][number],
): StudentRouteHistorySession["points"] {
  const occurredAt = normalizeUnixSeconds(event.occurred_at);
  if (!occurredAt) return [];

  const durationSeconds =
    typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms)
      ? Math.max(0, event.duration_ms / 1000)
      : 0;
  const startAt = occurredAt - 5;
  const endAt = occurredAt + Math.max(durationSeconds, 120) + 5;

  return session.points.filter((point) => {
    const pointAt = normalizeUnixSeconds(point.timestamp);
    return pointAt >= startAt && pointAt <= endAt;
  });
}

function estimateSpeedingSeconds(
  points: StudentRouteHistorySession["points"],
  speedLimitMph: number | null | undefined,
): number | null {
  if (
    typeof speedLimitMph !== "number" ||
    !Number.isFinite(speedLimitMph) ||
    points.length === 0
  ) {
    return null;
  }

  const speedLimitMps = speedLimitMph / 2.2369362920544;
  const sortedPoints = [...points]
    .filter((point) => normalizeUnixSeconds(point.timestamp))
    .sort(
      (left, right) =>
        normalizeUnixSeconds(left.timestamp) - normalizeUnixSeconds(right.timestamp),
    );

  let totalSeconds = 0;
  for (let index = 0; index < sortedPoints.length; index += 1) {
    const point = sortedPoints[index];
    if (
      typeof point.speed_mps !== "number" ||
      !Number.isFinite(point.speed_mps) ||
      point.speed_mps <= speedLimitMps
    ) {
      continue;
    }

    const currentAt = normalizeUnixSeconds(point.timestamp);
    const nextAt = normalizeUnixSeconds(sortedPoints[index + 1]?.timestamp);
    const previousAt = normalizeUnixSeconds(sortedPoints[index - 1]?.timestamp);
    const sampleSeconds = nextAt
      ? Math.max(1, Math.min(15, nextAt - currentAt))
      : previousAt
        ? Math.max(1, Math.min(15, currentAt - previousAt))
        : 1;
    totalSeconds += sampleSeconds;
  }

  return totalSeconds;
}

function averageAccuracyMeters(
  points: StudentRouteHistorySession["points"],
): number | null {
  const accuracies = points.flatMap((point) =>
    typeof point.accuracy === "number" && Number.isFinite(point.accuracy)
      ? [point.accuracy]
      : [],
  );
  if (accuracies.length === 0) return null;
  return accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length;
}

function getPenaltyConfidence(
  session: StudentRouteHistorySession,
  event: StudentRouteHistorySession["penalty_events"][number],
) {
  const points = getPenaltyWindowPoints(session, event);
  const avgAccuracyMeters = averageAccuracyMeters(points);
  const durationSeconds =
    typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms)
      ? Math.max(0, event.duration_ms / 1000)
      : 0;
  const maxSpeedMps = getPenaltyMaxSpeedMps(session, event);
  const maxOverLimitMph =
    event.zone_type === "speed_limit" &&
    typeof event.speed_limit_mph === "number" &&
    Number.isFinite(event.speed_limit_mph) &&
    maxSpeedMps != null
      ? Math.max(0, maxSpeedMps * 2.2369362920544 - event.speed_limit_mph)
      : null;
  const overLimitSeconds =
    event.zone_type === "speed_limit"
      ? estimateSpeedingSeconds(points, event.speed_limit_mph) ?? durationSeconds
      : null;

  const accuracyScore = scoreAccuracy(avgAccuracyMeters);
  const score =
    event.zone_type === "speed_limit"
      ? Math.round(
          accuracyScore * 0.25 +
            scoreSpeedDuration(overLimitSeconds ?? durationSeconds) * 0.4 +
            scoreSpeedOverLimit(maxOverLimitMph) * 0.35,
        )
      : Math.round(accuracyScore * 0.45 + scoreNoGoDuration(durationSeconds) * 0.55);

  return {
    score: Math.max(0, Math.min(100, score)),
    label: confidenceLabel(score),
    avgAccuracyMeters,
    durationSeconds,
    overLimitSeconds,
    maxOverLimitMph,
  };
}

function getPenaltyMaxSpeedMps(
  session: StudentRouteHistorySession,
  event: StudentRouteHistorySession["penalty_events"][number],
): number | null {
  if (
    typeof event.max_speed_mps === "number" &&
    Number.isFinite(event.max_speed_mps)
  ) {
    return event.max_speed_mps;
  }
  if (event.zone_type !== "speed_limit") {
    return null;
  }

  const occurredAt = normalizeUnixSeconds(event.occurred_at);
  if (!occurredAt) {
    return null;
  }

  const speeds = getPenaltyWindowPoints(session, event)
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
          const rightDelta = Math.abs(
            (right.speed_mps ?? 0) - expectedMaxSpeed,
          );
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

function penaltyTitle(ev: {
  title?: string | null;
  zone_type: string;
}): string {
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

type DateFilter = "all" | "today" | "yesterday" | "week";
type SourceFilter = "all" | "tracked" | "background";
type ContentFilter = "all" | "violations" | "pois";

function isTrackedRideSession(session: StudentRouteHistorySession): boolean {
  return session.tracking_source.trim().toLowerCase() !== "auto";
}

const rideSummaryCsvHeaders = [
  "student_name",
  "student_id_or_email",
  "user_uuid",
  "ride_number",
  "session_id",
  "ride_started_at",
  "ride_ended_at",
  "tracking_source",
  "trip_mode",
  "distance_miles",
  "duration_seconds",
  "top_speed_mph",
  "average_speed_mph",
  "points_earned",
  "points_lost",
  "check_in_spots",
  "violations",
  "gps_points",
] as const;

const gpsCsvHeaders = [
  ...rideSummaryCsvHeaders.slice(0, 9),
  "point_id",
  "point_timestamp",
  "latitude",
  "longitude",
  "speed_mph",
  "altitude_ft",
  "accuracy_ft",
  "heading",
] as const;

const poiCsvHeaders = [
  ...rideSummaryCsvHeaders.slice(0, 9),
  "poi_uuid",
  "title",
  "description",
  "visited_at",
  "bonus_points",
  "confidence_percent",
  "radius_ft",
  "latitude",
  "longitude",
] as const;

const violationCsvHeaders = [
  ...rideSummaryCsvHeaders.slice(0, 9),
  "violation_type",
  "title",
  "reason",
  "occurred_at",
  "points_lost",
  "speed_limit_mph",
  "max_speed_mph",
  "backend_confidence_percent",
  "derived_confidence_percent",
  "derived_confidence_label",
  "avg_gps_accuracy_ft",
  "duration_seconds",
  "over_limit_seconds",
  "max_over_limit_mph",
  "evidence_point_count",
  "latitude",
  "longitude",
  "zone_uuid",
  "zone_title",
] as const;

function csvStudentName(entry: SchoolStudentRosterEntry | null): string {
  return entry ? fullName(entry) : "Student";
}

function csvStudentSubline(entry: SchoolStudentRosterEntry | null): string {
  return entry ? subline(entry) : "";
}

function csvStudentUUID(
  entry: SchoolStudentRosterEntry | null,
  session?: StudentRouteHistorySession,
): string {
  return entry ? uuid(entry) : (session?.user_uuid ?? "");
}

function exportFilename(
  entry: SchoolStudentRosterEntry | null,
  suffix: string,
): string {
  return sanitizeCsvFilename(`${csvStudentName(entry)}-${suffix}`);
}

function ridePrefixRow(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): CsvCell[] {
  return [
    csvStudentName(entry),
    csvStudentSubline(entry),
    csvStudentUUID(entry, session),
    rideNum,
    session.session_id,
    fmtFull(getSessionStartedAt(session)),
    getSessionEndedAt(session) ? fmtFull(getSessionEndedAt(session)) : "",
    session.tracking_source,
    session.trip_mode,
  ];
}

function rideSummaryRow(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): CsvCell[] {
  return [
    ...ridePrefixRow(entry, session, rideNum),
    (session.distance_meters / 1609.344).toFixed(2),
    session.duration_seconds,
    (session.top_speed_mps * 2.2369362920544).toFixed(1),
    (session.average_speed_mps * 2.2369362920544).toFixed(1),
    getRouteHistoryEarnedPoints(session),
    session.penalty_points,
    session.visited_pois.length,
    session.penalty_events.length,
    session.points.length,
  ];
}

function gpsRowsForSession(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): CsvCell[][] {
  const prefix = ridePrefixRow(entry, session, rideNum);
  return session.points.map((point) => [
    ...prefix,
    point.id,
    fmtFull(point.timestamp),
    point.latitude,
    point.longitude,
    typeof point.speed_mps === "number"
      ? (point.speed_mps * 2.2369362920544).toFixed(2)
      : "",
    typeof point.altitude === "number"
      ? Math.round(point.altitude * 3.28084)
      : "",
    typeof point.accuracy === "number"
      ? Math.round(point.accuracy * 3.28084)
      : "",
    point.heading ?? "",
  ]);
}

function poiRowsForSession(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): CsvCell[][] {
  const prefix = ridePrefixRow(entry, session, rideNum);
  return session.visited_pois.map((poi) => [
    ...prefix,
    poi.poi_uuid,
    poi.title,
    poi.description,
    fmtFull(poi.visited_at),
    poi.bonus_points,
    poi.confidence_percent ?? "",
    typeof poi.radius_meters === "number"
      ? Math.round(poi.radius_meters * 3.28084)
      : "",
    poi.lat,
    poi.lng,
  ]);
}

function resolvePenaltyZone(
  session: StudentRouteHistorySession,
  event: StudentRouteHistorySession["penalty_events"][number],
  zones: SchoolZone[],
): SchoolZone | null {
  return (
    session.school_zones?.find((zone) => zone.zone_uuid === event.zone_uuid) ??
    zones.find((zone) => zone.zone_uuid === event.zone_uuid) ??
    null
  );
}

function violationRowsForSession(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
  zones: SchoolZone[],
): CsvCell[][] {
  const prefix = ridePrefixRow(entry, session, rideNum);
  return session.penalty_events.map((event) => {
    const maxSpeedMps = getPenaltyMaxSpeedMps(session, event);
    const confidence = getPenaltyConfidence(session, event);
    const zone = resolvePenaltyZone(session, event, zones);
    return [
      ...prefix,
      penaltyLabel(event.zone_type),
      penaltyTitle(event),
      event.reason,
      fmtFull(event.occurred_at),
      event.points_lost,
      event.speed_limit_mph ?? "",
      maxSpeedMps == null ? "" : (maxSpeedMps * 2.2369362920544).toFixed(1),
      event.confidence_percent ?? "",
      confidence.score,
      confidence.label,
      confidence.avgAccuracyMeters == null
        ? ""
        : Math.round(confidence.avgAccuracyMeters * 3.28084),
      Math.round(confidence.durationSeconds),
      confidence.overLimitSeconds == null
        ? ""
        : Math.round(confidence.overLimitSeconds),
      confidence.maxOverLimitMph == null
        ? ""
        : confidence.maxOverLimitMph.toFixed(1),
      event.evidence_point_count ?? "",
      event.lat,
      event.lng,
      event.zone_uuid,
      zone ? zoneTitle(zone) : event.title,
    ];
  });
}

function exportRideSummary(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): void {
  downloadCsv(exportFilename(entry, `ride-${rideNum}-summary`), [
    rideSummaryCsvHeaders,
    rideSummaryRow(entry, session, rideNum),
  ]);
}

function exportAllRidesSummary(
  entry: SchoolStudentRosterEntry | null,
  sessions: StudentRouteHistorySession[],
): void {
  downloadCsv(exportFilename(entry, "all-rides-summary"), [
    rideSummaryCsvHeaders,
    ...sessions.map((session, index) =>
      rideSummaryRow(entry, session, index + 1),
    ),
  ]);
}

function exportRideGPS(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): void {
  downloadCsv(exportFilename(entry, `ride-${rideNum}-gps-points`), [
    gpsCsvHeaders,
    ...gpsRowsForSession(entry, session, rideNum),
  ]);
}

function exportAllGPS(
  entry: SchoolStudentRosterEntry | null,
  sessions: StudentRouteHistorySession[],
): void {
  downloadCsv(exportFilename(entry, "all-gps-points"), [
    gpsCsvHeaders,
    ...sessions.flatMap((session, index) =>
      gpsRowsForSession(entry, session, index + 1),
    ),
  ]);
}

function exportRidePOIs(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
): void {
  downloadCsv(exportFilename(entry, `ride-${rideNum}-check-ins`), [
    poiCsvHeaders,
    ...poiRowsForSession(entry, session, rideNum),
  ]);
}

function exportAllPOIs(
  entry: SchoolStudentRosterEntry | null,
  sessions: StudentRouteHistorySession[],
): void {
  downloadCsv(exportFilename(entry, "all-check-ins"), [
    poiCsvHeaders,
    ...sessions.flatMap((session, index) =>
      poiRowsForSession(entry, session, index + 1),
    ),
  ]);
}

function exportRideViolations(
  entry: SchoolStudentRosterEntry | null,
  session: StudentRouteHistorySession,
  rideNum: number,
  zones: SchoolZone[],
): void {
  downloadCsv(exportFilename(entry, `ride-${rideNum}-violations`), [
    violationCsvHeaders,
    ...violationRowsForSession(entry, session, rideNum, zones),
  ]);
}

function exportAllViolations(
  entry: SchoolStudentRosterEntry | null,
  sessions: StudentRouteHistorySession[],
  zones: SchoolZone[],
): void {
  downloadCsv(exportFilename(entry, "all-violations"), [
    violationCsvHeaders,
    ...sessions.flatMap((session, index) =>
      violationRowsForSession(entry, session, index + 1, zones),
    ),
  ]);
}

function exportTrackedRideViolations(
  entry: SchoolStudentRosterEntry | null,
  sessions: StudentRouteHistorySession[],
  zones: SchoolZone[],
): void {
  downloadCsv(exportFilename(entry, "tracked-ride-violations"), [
    violationCsvHeaders,
    ...sessions.flatMap((session, index) =>
      isTrackedRideSession(session)
        ? violationRowsForSession(entry, session, index + 1, zones)
        : [],
    ),
  ]);
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

  const [detailTab, setDetailTab] = useState<
    "violations" | "pois" | "zones" | "map" | "downloads"
  >(() => {
    const t = searchParams.get("tab");
    return t === "pois" || t === "zones" || t === "map" || t === "downloads"
      ? t
      : "violations";
  });

  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const d = searchParams.get("dateFilter");
    return d === "today" || d === "yesterday" || d === "week" ? d : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [contentFilter, setContentFilter] = useState<ContentFilter>(() => {
    const c = searchParams.get("contentFilter");
    return c === "violations" || c === "pois" ? c : "all";
  });
  const [sessionSearch, setSessionSearch] = useState("");

  const [showRoute, setShowRoute] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showPenalties, setShowPenalties] = useState(true);
  const [showNoGoZones, setShowNoGoZones] = useState(true);
  const [showSpeedZones, setShowSpeedZones] = useState(true);
  const [routeHover, setRouteHover] = useState<RouteHover | null>(null);
  const [selectedMaxSpeedPoint, setSelectedMaxSpeedPoint] = useState<
    StudentRouteHistorySession["points"][number] | null
  >(null);

  const [, setPOIs] = useState<SchoolPOI[]>([]);


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
  const selectedEarnedPoints = selSess
    ? getRouteHistoryEarnedPoints(selSess)
    : 0;
  const selectedRideNum = selSess
    ? history.findIndex((session) => session.session_id === selSess.session_id) + 1
    : 0;
  const studentViolationCount = history.reduce(
    (total, session) => total + session.penalty_events.length,
    0,
  );
  const studentPoiCount = history.reduce(
    (total, session) => total + session.visited_pois.length,
    0,
  );
  const studentGpsPointCount = history.reduce(
    (total, session) => total + session.points.length,
    0,
  );
  const trackedRideCount = history.filter(isTrackedRideSession).length;
  const backgroundRideCount = history.length - trackedRideCount;
  const trackedViolationCount = history.reduce(
    (total, session) =>
      total +
      (isTrackedRideSession(session) ? session.penalty_events.length : 0),
    0,
  );

  const filteredHistory = useMemo(() => {
    const now = new Date();
    const todayStart =
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() /
      1000;
    const yesterdayStart = todayStart - 86400;
    const weekStart = todayStart - 6 * 86400;

    let result = history;

    if (dateFilter === "today") {
      result = result.filter((s) => getSessionStartedAt(s) >= todayStart);
    } else if (dateFilter === "yesterday") {
      result = result.filter((s) => {
        const t = getSessionStartedAt(s);
        return t >= yesterdayStart && t < todayStart;
      });
    } else if (dateFilter === "week") {
      result = result.filter((s) => getSessionStartedAt(s) >= weekStart);
    }

    if (sourceFilter === "tracked") {
      result = result.filter(isTrackedRideSession);
    } else if (sourceFilter === "background") {
      result = result.filter((s) => !isTrackedRideSession(s));
    }

    if (contentFilter === "violations") {
      result = result.filter((s) => s.penalty_events.length > 0);
    } else if (contentFilter === "pois") {
      result = result.filter((s) => s.visited_pois.length > 0);
    }

    const q = sessionSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((s) => {
        const d = new Date(getSessionStartedAt(s) * 1000).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric", year: "numeric" },
        );
        return (
          d.toLowerCase().includes(q) ||
          (s.trip_mode ?? "").toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [history, dateFilter, sourceFilter, contentFilter, sessionSearch]);

  const noMatchingRides = !!(
    selUUID &&
    !histBusy &&
    history.length > 0 &&
    filteredHistory.length === 0
  );

  const filteredViolationCount = filteredHistory.reduce(
    (t, s) => t + s.penalty_events.length,
    0,
  );
  const filteredPoiCount = filteredHistory.reduce(
    (t, s) => t + s.visited_pois.length,
    0,
  );
  const filteredGpsPointCount = filteredHistory.reduce(
    (t, s) => t + s.points.length,
    0,
  );

  const layerToggles = [
    {
      key: "route",
      label: "Route path",
      active: showRoute,
      toggle: () => setShowRoute((v) => !v),
      color: "#1a4d99",
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
      {/* ── Col 1: Student roster ── */}
      <aside className="sr-sidebar">
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

      {/* ── Col 2: Session list ── */}
      <aside className="sr-session-list">
        <div className="sr-session-list-head">
          <strong>
            {selEntry ? `${firstName(selEntry)}'s Rides` : "Rides"}
          </strong>
          <div className="sr-session-list-head-right">
            {!histBusy && history.length > 0 && (
              <span className="sr-count">
                {filteredHistory.length}
                {filteredHistory.length !== history.length
                  ? `/${history.length}`
                  : ""}
              </span>
            )}
            {histBusy && <span className="sr-muted-inline">Loading…</span>}
            {histErr && <span className="sr-err-inline">{histErr}</span>}
          </div>
        </div>

        {/* ── Session filter bar ── */}
        <div className="sr-session-filter">
          <div className="sr-filter-pills">
            {(["all", "today", "yesterday", "week"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`sr-filter-pill${dateFilter === f ? " sr-filter-pill--active" : ""}`}
                onClick={() => setDateFilter(f)}
              >
                {f === "all"
                  ? "All"
                  : f === "today"
                    ? "Today"
                    : f === "yesterday"
                      ? "Yesterday"
                      : "This week"}
              </button>
            ))}
          </div>
          <div className="sr-filter-row">
            <select
              className="sr-filter-select"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as SourceFilter)
              }
            >
              <option value="all">All rides</option>
              <option value="tracked">Tracked only</option>
              <option value="background">Background only</option>
            </select>
            <select
              className="sr-filter-select"
              value={contentFilter}
              onChange={(e) =>
                setContentFilter(e.target.value as ContentFilter)
              }
            >
              <option value="all">All content</option>
              <option value="violations">Has violations</option>
              <option value="pois">Has check-ins</option>
            </select>
          </div>
          <input
            type="search"
            className="sr-filter-search"
            placeholder="Search by date or mode…"
            value={sessionSearch}
            onChange={(e) => setSessionSearch(e.target.value)}
          />
        </div>

        {selEntry && !histBusy && filteredHistory.length > 0 && (
          <div className="sr-session-mini-stats">
            <div className="sr-session-mini-stat">
              <span>Violations</span>
              <strong
                className={filteredViolationCount > 0 ? "sr-val--red" : ""}
              >
                {filteredViolationCount}
              </strong>
            </div>
            <div className="sr-session-mini-stat">
              <span>Check-ins</span>
              <strong>{filteredPoiCount}</strong>
            </div>
            <div className="sr-session-mini-stat">
              <span>GPS pts</span>
              <strong>{filteredGpsPointCount.toLocaleString()}</strong>
            </div>
          </div>
        )}

        {!selUUID && (
          <p className="sr-context-empty sr-context-empty--padded">
            Select a student to view their rides.
          </p>
        )}
        {noRides && (
          <p className="sr-context-empty sr-context-empty--padded">
            No rides recorded yet.
          </p>
        )}
        {noMatchingRides && (
          <p className="sr-context-empty sr-context-empty--padded">
            No rides match the current filters.
          </p>
        )}

        <div className="sr-session-item-list">
          {filteredHistory.map((sess, idx) => {
            const active = sess.session_id === selId;
            const rideNum = idx + 1;
            const earnedPts = getRouteHistoryEarnedPoints(sess);
            return (
              <button
                key={sess.session_id}
                className={`sr-session-item${active ? " sr-session-item--active" : ""}`}
                onClick={() => setSelId(sess.session_id)}
              >
                <div className="sr-session-item-top">
                  <span className="sr-session-item-num">Ride #{rideNum}</span>
                  <small className="sr-session-item-date">
                    {fmtShort(getSessionStartedAt(sess))}
                  </small>
                </div>
                <div className="sr-session-item-row">
                  <span>{fmtDist(sess.distance_meters)}</span>
                  <span className="sr-chip-sep">·</span>
                  <span>{fmtDur(sess.duration_seconds)}</span>
                  <span className="sr-chip-sep">·</span>
                  <span>{(sess.top_speed_mps * 2.237).toFixed(0)} mph top</span>
                </div>
                <div className="sr-session-item-badges">
                  {earnedPts > 0 && (
                    <span className="sr-badge sr-badge--green">
                      +{earnedPts.toLocaleString()} pts
                    </span>
                  )}
                  {sess.penalty_events.length > 0 && (
                    <span className="sr-badge sr-badge--red">
                      {sess.penalty_events.length} violation
                      {sess.penalty_events.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {sess.visited_pois.length > 0 && (
                    <span className="sr-badge sr-badge--gold">
                      {sess.visited_pois.length} check-in
                      {sess.visited_pois.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {sess.points.length === 0 && (
                    <span className="sr-badge sr-badge--muted">no GPS</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Col 3: Detail panel ── */}
      <main className="sr-detail-panel">
        {!selSess ? (
          <div className="sr-detail-empty">
            <div className="sr-detail-empty-icon">
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
                <path d="M9 17H5a2 2 0 00-2 2v0M13 17h6M3 3h18M3 8h18M3 13h10" />
              </svg>
            </div>
            <strong>
              {!selUUID
                ? "Select a student"
                : histBusy
                  ? "Loading rides…"
                  : "Select a ride"}
            </strong>
            <p>
              {!selUUID
                ? "Choose a student from the roster, then pick a ride to view full data."
                : histBusy
                  ? "Fetching ride history…"
                  : "Choose a ride from the list to view stats, violations, and more."}
            </p>
          </div>
        ) : (
          <>
            {/* Session header */}
            <div className="sr-detail-head">
              <div className="sr-detail-head-left">
                <span className="sr-eyebrow">
                  {selEntry ? fullName(selEntry) : "Student"} · Ride #
                  {selectedRideNum} ·{" "}
                  {isTrackedRideSession(selSess) ? "Tracked" : "Background"}
                </span>
                <h3 className="sr-detail-title">
                  {fmtFull(getSessionStartedAt(selSess))}
                </h3>
              </div>
              <span className="sr-detail-mode-chip">
                {selSess.trip_mode || "ride"}
              </span>
            </div>

            {/* Stats grid */}
            <div className="sr-detail-stat-grid">
              <div className="sr-detail-stat">
                <span>Distance</span>
                <strong>{fmtDist(selSess.distance_meters)}</strong>
              </div>
              <div className="sr-detail-stat">
                <span>Duration</span>
                <strong>{fmtDur(selSess.duration_seconds)}</strong>
              </div>
              <div className="sr-detail-stat">
                <span>Points earned</span>
                <strong className="sr-val--green">
                  +{selectedEarnedPoints.toLocaleString()}
                </strong>
              </div>
              <div className="sr-detail-stat">
                <span>Points lost</span>
                <strong
                  className={selSess.penalty_points > 0 ? "sr-val--red" : ""}
                >
                  −{selSess.penalty_points}
                </strong>
              </div>
              <div className="sr-detail-stat">
                <span>Top speed</span>
                <strong>
                  {(selSess.top_speed_mps * 2.237).toFixed(1)} mph
                </strong>
              </div>
              <div className="sr-detail-stat">
                <span>Avg speed</span>
                <strong>
                  {(selSess.average_speed_mps * 2.237).toFixed(1)} mph
                </strong>
              </div>
              <div className="sr-detail-stat">
                <span>Check-ins</span>
                <strong>{selSess.visited_pois.length}</strong>
              </div>
              <div className="sr-detail-stat">
                <span>GPS points</span>
                <strong>{selSess.points.length.toLocaleString()}</strong>
              </div>
            </div>

            {/* Tabs */}
            <div className="sr-detail-tabs">
              {(
                [
                  "violations",
                  "pois",
                  "zones",
                  "map",
                  "downloads",
                ] as const
              ).map((tab) => (
                <button
                  key={tab}
                  className={`sr-detail-tab${detailTab === tab ? " sr-detail-tab--active" : ""}`}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                >
                  {tab === "violations"
                    ? `Violations (${selSess.penalty_events.length})`
                    : tab === "pois"
                      ? `Check-ins (${selSess.visited_pois.length})`
                      : tab === "zones"
                        ? `Zones (${dispZones.filter((z) => z.active).length})`
                        : tab === "map"
                          ? "Map"
                          : "Downloads"}
                </button>
              ))}
            </div>

            {/* ── Violations tab ── */}
            {detailTab === "violations" &&
              (selSess.penalty_events.length === 0 ? (
                <p className="sr-context-empty sr-context-empty--clean sr-context-empty--padded">
                  No violations on this ride — clean ride!
                </p>
              ) : (
                <div className="sr-event-button-list sr-event-button-list--tab">
                  {selSess.penalty_events.map((ev, index) => {
                    const maxSpeedMps = getPenaltyMaxSpeedMps(selSess, ev);
                    const confidence = getPenaltyConfidence(selSess, ev);
                    return (
                      <div
                        key={`${ev.zone_uuid}-${ev.occurred_at}-${index}`}
                        className="sr-event-button sr-event-button--penalty"
                      >
                        <span className="sr-event-button-top">
                          <strong>{penaltyTitle(ev)}</strong>
                          <em>−{ev.points_lost.toLocaleString()} pts</em>
                        </span>
                        <span className="sr-event-badge-row">
                          <span className="sr-event-type-badge">
                            {penaltyLabel(ev.zone_type)}
                          </span>
                          <span className="sr-event-button-meta">
                            {fmtShort(ev.occurred_at)}
                          </span>
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
                        <span className="sr-event-button-meta sr-muted-secondary">
                          Confidence: {confidence.score}% ({confidence.label})
                          {" · "}GPS {fmtAccuracy(confidence.avgAccuracyMeters)}
                        </span>
                        {ev.zone_type === "speed_limit" ? (
                          <span className="sr-event-button-meta sr-muted-secondary">
                            Over limit:{" "}
                            {fmtMs((confidence.overLimitSeconds ?? 0) * 1000)}
                            {confidence.maxOverLimitMph != null
                              ? ` · max +${confidence.maxOverLimitMph.toFixed(1)} mph`
                              : ""}
                          </span>
                        ) : confidence.durationSeconds > 0 ? (
                          <span className="sr-event-button-meta sr-muted-secondary">
                            Time in zone:{" "}
                            {fmtMs(confidence.durationSeconds * 1000)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}

            {/* ── Check-ins tab ── */}
            {detailTab === "pois" &&
              (selSess.visited_pois.length === 0 ? (
                <p className="sr-context-empty sr-context-empty--padded">
                  No check-in spots visited on this ride.
                </p>
              ) : (
                <div className="sr-event-button-list sr-event-button-list--tab">
                  {selSess.visited_pois.map((poi, index) => (
                    <div
                      key={`${poi.poi_uuid}-${poi.visited_at}-${index}`}
                      className="sr-event-button sr-event-button--poi"
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
                        {typeof poi.radius_meters === "number" &&
                        Number.isFinite(poi.radius_meters)
                          ? ` · Radius: ${Math.round(poi.radius_meters * 3.28084).toLocaleString()} ft`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

            {/* ── Zones tab ── */}
            {detailTab === "zones" &&
              (dispZones.filter((z) => z.active).length === 0 ? (
                <p className="sr-context-empty sr-context-empty--padded">
                  No active safety zones for this ride.
                </p>
              ) : (
                <div className="sr-zone-list sr-zone-list--tab">
                  {dispZones
                    .filter((z) => z.active)
                    .map((z) => (
                      <div
                        key={z.zone_uuid}
                        className={`sr-zone-chip sr-zone-chip--${z.zone_type}`}
                      >
                        <span className="sr-zone-chip-dot" />
                        <span className="sr-zone-chip-name">{zoneTitle(z)}</span>
                        {z.zone_type === "speed_limit" &&
                          z.speed_limit_mph != null && (
                            <span className="sr-zone-chip-limit">
                              {z.speed_limit_mph} mph
                            </span>
                          )}
                        {z.zone_type === "no_go" && (
                          <span className="sr-zone-chip-limit">no entry</span>
                        )}
                      </div>
                    ))}
                </div>
              ))}

            {/* ── Map tab ── */}
            {detailTab === "map" && (
              <div className="sr-map-tab">
                <MapContainer
                  center={DEFAULT_CENTER}
                  zoom={DEFAULT_ZOOM}
                  className="sr-map"
                  zoomControl={true}
                >
                  <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
                  <MapFitter points={routePts} />
                  {focusPin && (
                    <PenaltyFocuser lat={focusPin[0]} lng={focusPin[1]} />
                  )}

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
                          color:
                            z.zone_type === "no_go" ? "#b91c1c" : "#b45309",
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
                          weight: 5,
                          opacity: 1,
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
                      center={[
                        routeHover.point.latitude,
                        routeHover.point.longitude,
                      ]}
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
                          <strong>
                            {fmtFull(routeHover.point.timestamp)}
                          </strong>
                          <span>
                            Speed {fmtSpeed(routeHover.point.speed_mps)}
                          </span>
                          <span>
                            Distance {fmtDist(routeHover.distanceMeters)}
                          </span>
                          <span>
                            Elevation{" "}
                            {fmtElevation(routeHover.point.altitude)}
                          </span>
                          <span>
                            Accuracy {fmtAccuracy(routeHover.point.accuracy)}
                          </span>
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
                              <strong>
                                {poi.title || "Point of Interest"}
                              </strong>
                              <span>Visited {fmtShort(poi.visited_at)}</span>
                              <span>
                                +{poi.bonus_points.toLocaleString()} pts
                              </span>
                              <span>
                                Confidence{" "}
                                {fmtConfidence(poi.confidence_percent)}
                              </span>
                            </div>
                          </Tooltip>
                          <Popup>
                            <strong>
                              {poi.title || "Point of Interest"}
                            </strong>
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
                                  {Math.round(
                                    poi.radius_meters * 3.28084,
                                  ).toLocaleString()}{" "}
                                  ft
                                </>
                              )}
                            {typeof poi.confidence_percent === "number" &&
                              Number.isFinite(poi.confidence_percent) && (
                                <>
                                  <br />
                                  Confidence:{" "}
                                  {fmtConfidence(poi.confidence_percent)}
                                </>
                              )}
                            {poi.visited_at > 0 && (
                              <>
                                <br />
                                <span
                                  style={{ color: "#888", fontSize: "0.82em" }}
                                >
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
                      const confidence = getPenaltyConfidence(selSess, ev);
                      return (
                        <Marker
                          key={`pen-${i}`}
                          position={[ev.lat, ev.lng]}
                          icon={
                            ev.zone_type === "no_go"
                              ? noGoPenaltyIcon
                              : speedPenaltyIcon
                          }
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
                              <span>
                                −{ev.points_lost.toLocaleString()} pts
                              </span>
                              <span>{fmtShort(ev.occurred_at)}</span>
                              {ev.zone_type === "speed_limit" &&
                              ev.speed_limit_mph != null ? (
                                <span>Limit {ev.speed_limit_mph} mph</span>
                              ) : null}
                              {maxSpeedMps != null ? (
                                <span>
                                  Max speed caught {fmtSpeed(maxSpeedMps)}
                                </span>
                              ) : null}
                              <span>Duration {fmtMs(ev.duration_ms)}</span>
                              <span>
                                Confidence {confidence.score}% (
                                {confidence.label})
                              </span>
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
                            <>
                              <br />
                              Derived confidence: {confidence.score}% (
                              {confidence.label})
                              <br />
                              Avg GPS accuracy:{" "}
                              {fmtAccuracy(confidence.avgAccuracyMeters)}
                            </>
                            {ev.zone_type === "speed_limit" ? (
                              <>
                                <br />
                                Time over limit:{" "}
                                {fmtMs(
                                  (confidence.overLimitSeconds ?? 0) * 1000,
                                )}
                                {confidence.maxOverLimitMph != null ? (
                                  <>
                                    <br />
                                    Max over limit:{" "}
                                    {confidence.maxOverLimitMph.toFixed(1)} mph
                                  </>
                                ) : null}
                              </>
                            ) : confidence.durationSeconds > 0 ? (
                              <>
                                <br />
                                Time in zone:{" "}
                                {fmtMs(confidence.durationSeconds * 1000)}
                              </>
                            ) : null}
                            {typeof ev.confidence_percent === "number" &&
                              Number.isFinite(ev.confidence_percent) && (
                                <>
                                  <br />
                                  Backend confidence:{" "}
                                  {Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      Math.round(ev.confidence_percent),
                                    ),
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
                          <span>
                            {fmtSpeed(selectedMaxSpeedPoint.speed_mps)}
                          </span>
                          <span>
                            {fmtFull(selectedMaxSpeedPoint.timestamp)}
                          </span>
                          <span>
                            Accuracy{" "}
                            {fmtAccuracy(selectedMaxSpeedPoint.accuracy)}
                          </span>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  ) : null}
                </MapContainer>

                {/* Layer toggles */}
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

                {noGPS && (
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
                        This ride was manually logged — no GPS breadcrumbs
                        available.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Downloads tab ── */}
            {detailTab === "downloads" && (
              <div className="sr-downloads-tab">
                <div className="sr-dl-group-section">
                  <p className="sr-dl-group-title">
                    This ride — Ride #{selectedRideNum}
                  </p>
                  <div className="sr-dl-card-grid">
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={!selSess}
                      onClick={() =>
                        selSess &&
                        exportRideSummary(selEntry, selSess, selectedRideNum)
                      }
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>Ride Summary</strong>
                        <small>1 row · distance, speed, points</small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={!selSess || selSess.points.length === 0}
                      onClick={() =>
                        selSess &&
                        exportRideGPS(selEntry, selSess, selectedRideNum)
                      }
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>GPS Points</strong>
                        <small>
                          {selSess.points.length.toLocaleString()} pts ·
                          lat/lng/speed/alt
                        </small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={
                        !selSess || selSess.penalty_events.length === 0
                      }
                      onClick={() =>
                        selSess &&
                        exportRideViolations(
                          selEntry,
                          selSess,
                          selectedRideNum,
                          zones,
                        )
                      }
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>Violations</strong>
                        <small>
                          {selSess.penalty_events.length} event
                          {selSess.penalty_events.length !== 1 ? "s" : ""} ·
                          speed, confidence
                        </small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={
                        !selSess || selSess.visited_pois.length === 0
                      }
                      onClick={() =>
                        selSess &&
                        exportRidePOIs(selEntry, selSess, selectedRideNum)
                      }
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>Check-ins</strong>
                        <small>
                          {selSess.visited_pois.length} spot
                          {selSess.visited_pois.length !== 1 ? "s" : ""} · POI
                          visits
                        </small>
                      </span>
                    </button>
                  </div>
                </div>

                <div className="sr-dl-group-section">
                  <p className="sr-dl-group-title">
                    All rides — {history.length} session
                    {history.length !== 1 ? "s" : ""}
                  </p>
                  <div className="sr-dl-card-grid">
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={history.length === 0}
                      onClick={() => exportAllRidesSummary(selEntry, history)}
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>All Ride Summaries</strong>
                        <small>{history.length} rows · all sessions</small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={studentGpsPointCount === 0}
                      onClick={() => exportAllGPS(selEntry, history)}
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>All GPS Points</strong>
                        <small>
                          {studentGpsPointCount.toLocaleString()} points total
                        </small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={trackedViolationCount === 0}
                      onClick={() =>
                        exportTrackedRideViolations(selEntry, history, zones)
                      }
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>Tracked Violations</strong>
                        <small>
                          {trackedViolationCount} from {trackedRideCount}{" "}
                          tracked rides
                        </small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={studentViolationCount === 0}
                      onClick={() =>
                        exportAllViolations(selEntry, history, zones)
                      }
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>All Violations</strong>
                        <small>{studentViolationCount} total events</small>
                      </span>
                    </button>
                    <button
                      className="sr-dl-card"
                      type="button"
                      disabled={studentPoiCount === 0}
                      onClick={() => exportAllPOIs(selEntry, history)}
                    >
                      <span className="sr-dl-card-icon">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </span>
                      <span className="sr-dl-card-body">
                        <strong>All Check-ins</strong>
                        <small>{studentPoiCount} POI visits total</small>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
