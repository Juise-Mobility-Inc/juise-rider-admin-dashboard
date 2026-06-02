import { useEffect, useMemo, useState } from "react";
import { LatLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { downloadCsv, sanitizeCsvFilename, type CsvCell } from "../../lib/csv";
import { noGoPenaltyIcon, speedPenaltyIcon } from "../../lib/mapIcons";
import {
  fetchSchoolStudentRoster,
  fetchSchoolZones,
  fetchStudentRouteHistory,
  type SchoolStudentRosterEntry,
  type SchoolZone,
  type StudentRouteHistoryPenaltyEvent,
  type StudentRouteHistoryPoint,
  type StudentRouteHistorySession,
} from "../../lib/api";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const STUDENT_ROUTE_CONCURRENCY = 4;

type LoadStatus = "idle" | "loading" | "ready" | "error";
type ViolationTypeFilter = "all" | "speed_limit" | "no_go";
type SourceFilter = "all" | "tracked" | "untracked";

interface LoadState {
  status: LoadStatus;
  message: string;
  completed: number;
  total: number;
}

interface StudentRouteBundle {
  entry: SchoolStudentRosterEntry;
  routeHistory: StudentRouteHistorySession[];
  error: string;
}

interface RideSnippetContext {
  points: StudentRouteHistoryPoint[];
  distanceMeters: number;
  durationSeconds: number;
  nearestPoint: StudentRouteHistoryPoint | null;
}

interface RideViolationRecord {
  id: string;
  entry: SchoolStudentRosterEntry;
  studentUserUUID: string;
  studentName: string;
  studentSubline: string;
  session: StudentRouteHistorySession;
  event: StudentRouteHistoryPenaltyEvent;
  matchingZone: SchoolZone | null;
  snippet: RideSnippetContext;
}

interface Props {
  activeSchoolId: string;
  managedAppId: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress: (completed: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
        completed += 1;
        onProgress(completed);
      }
    }),
  );

  return results;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function normalizeUnixSeconds(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value > 9_999_999_999 ? Math.floor(value / 1000) : value;
}

function normalizeTimestampToEventUnit(
  pointTimestamp: number,
  eventTimestamp: number,
): number {
  const eventIsMs = eventTimestamp > 100_000_000_000;
  const pointIsMs = pointTimestamp > 100_000_000_000;
  if (eventIsMs && !pointIsMs) {
    return pointTimestamp * 1000;
  }
  if (!eventIsMs && pointIsMs) {
    return Math.floor(pointTimestamp / 1000);
  }
  return pointTimestamp;
}

function routeTimestampWindow(referenceTimestamp: number): number {
  return referenceTimestamp > 100_000_000_000 ? 120_000 : 120;
}

function routeDurationSeconds(startTimestamp: number, endTimestamp: number): number {
  const duration = Math.max(0, endTimestamp - startTimestamp);
  return Math.max(startTimestamp, endTimestamp) > 100_000_000_000
    ? duration / 1000
    : duration;
}

function routePointDistanceMeters(
  left: StudentRouteHistoryPoint,
  right: StudentRouteHistoryPoint,
): number {
  const earthRadiusMeters = 6_371_000;
  const latDelta = ((right.latitude - left.latitude) * Math.PI) / 180;
  const lngDelta = ((right.longitude - left.longitude) * Math.PI) / 180;
  const leftLat = (left.latitude * Math.PI) / 180;
  const rightLat = (right.latitude * Math.PI) / 180;
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLat) *
      Math.cos(rightLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildRidePenaltyContext(
  session: StudentRouteHistorySession,
  event: StudentRouteHistoryPenaltyEvent,
): RideSnippetContext {
  const points = [...(session.points ?? [])]
    .filter(
      (point) =>
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        Number.isFinite(point.timestamp),
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  if (points.length === 0) {
    return {
      points: [],
      distanceMeters: 0,
      durationSeconds: 0,
      nearestPoint: null,
    };
  }

  const nearestPointIndex = points.reduce((bestIndex, point, index) => {
    const bestPoint = points[bestIndex];
    const bestTimestamp = normalizeTimestampToEventUnit(
      bestPoint.timestamp,
      event.occurred_at,
    );
    const pointTimestamp = normalizeTimestampToEventUnit(
      point.timestamp,
      event.occurred_at,
    );
    const bestTimeDiff = Math.abs(bestTimestamp - event.occurred_at);
    const pointTimeDiff = Math.abs(pointTimestamp - event.occurred_at);
    if (pointTimeDiff !== bestTimeDiff) {
      return pointTimeDiff < bestTimeDiff ? index : bestIndex;
    }

    const bestCoordDiff =
      Math.abs(bestPoint.latitude - event.lat) +
      Math.abs(bestPoint.longitude - event.lng);
    const pointCoordDiff =
      Math.abs(point.latitude - event.lat) + Math.abs(point.longitude - event.lng);
    return pointCoordDiff < bestCoordDiff ? index : bestIndex;
  }, 0);

  const window = routeTimestampWindow(event.occurred_at);
  let contextPoints = points.filter((point) => {
    const pointTimestamp = normalizeTimestampToEventUnit(
      point.timestamp,
      event.occurred_at,
    );
    return Math.abs(pointTimestamp - event.occurred_at) <= window;
  });

  if (contextPoints.length < 4) {
    const startIndex = Math.max(0, nearestPointIndex - 6);
    const endIndex = Math.min(points.length, nearestPointIndex + 7);
    contextPoints = points.slice(startIndex, endIndex);
  }

  const distanceMeters = contextPoints.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }
    return total + routePointDistanceMeters(contextPoints[index - 1], point);
  }, 0);
  const firstPoint = contextPoints[0] ?? null;
  const lastPoint = contextPoints[contextPoints.length - 1] ?? null;

  return {
    points: contextPoints,
    distanceMeters,
    durationSeconds:
      firstPoint && lastPoint
        ? routeDurationSeconds(firstPoint.timestamp, lastPoint.timestamp)
        : 0,
    nearestPoint: points[nearestPointIndex] ?? null,
  };
}

function fullName(entry: SchoolStudentRosterEntry): string {
  const name =
    `${entry.user.first_name?.trim() ?? ""} ${entry.user.last_name?.trim() ?? ""}`.trim();
  return name || entry.user.username?.trim() || entry.user.email?.trim() || "Student";
}

function studentSubline(entry: SchoolStudentRosterEntry): string {
  return entry.membership.student_id?.trim() || entry.user.email?.trim() || "";
}

function studentUUID(entry: SchoolStudentRosterEntry): string {
  return entry.membership.user_uuid?.trim() || entry.user.k_guid;
}

function isUntrackedSession(session: StudentRouteHistorySession): boolean {
  return session.tracking_source.trim().toLowerCase() === "auto";
}

function sourceLabel(session: StudentRouteHistorySession): string {
  return isUntrackedSession(session) ? "Background / untracked" : "Tracked ride";
}

function typeLabel(zoneType: string): string {
  if (zoneType === "speed_limit") {
    return "Speed zone";
  }
  if (zoneType === "no_go") {
    return "No-go zone";
  }
  return zoneType.trim() || "Ride penalty";
}

function eventTitle(event: StudentRouteHistoryPenaltyEvent, zone?: SchoolZone | null): string {
  if (event.title?.trim()) {
    return event.title.trim();
  }
  if (zone?.title?.trim()) {
    return zone.title.trim();
  }
  return typeLabel(event.zone_type);
}

function formatDateTime(value?: number | null): string {
  const seconds = normalizeUnixSeconds(value);
  if (!seconds) {
    return "—";
  }
  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeSeconds(pointTimestamp: number, eventTimestamp: number): string {
  const pointSeconds = normalizeUnixSeconds(pointTimestamp);
  const eventSeconds = normalizeUnixSeconds(eventTimestamp);
  if (!pointSeconds || !eventSeconds) {
    return "—";
  }
  const delta = pointSeconds - eventSeconds;
  if (delta === 0) {
    return "event";
  }
  const prefix = delta > 0 ? "+" : "-";
  return `${prefix}${Math.abs(delta)}s`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0s";
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (minutes > 0 && remainingSeconds > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${remainingSeconds}s`;
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) {
    return "0 ft";
  }
  if (meters < 305) {
    return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
  }
  return `${(meters / 1609.344).toFixed(1)} mi`;
}

function formatSpeed(mps?: number | null): string {
  if (typeof mps !== "number" || !Number.isFinite(mps)) {
    return "—";
  }
  return `${(mps * 2.2369362920544).toFixed(1)} mph`;
}

function formatAccuracy(meters?: number | null): string {
  if (typeof meters !== "number" || !Number.isFinite(meters)) {
    return "—";
  }
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

function averageAccuracyMeters(points: StudentRouteHistoryPoint[]): number | null {
  const accuracies = points.flatMap((point) =>
    typeof point.accuracy === "number" && Number.isFinite(point.accuracy)
      ? [point.accuracy]
      : [],
  );
  if (accuracies.length === 0) return null;
  return accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length;
}

function estimateSpeedingSeconds(
  points: StudentRouteHistoryPoint[],
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

function formatCoordinate(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(6) : "";
}

function resolveMatchingZone(
  zones: SchoolZone[],
  session: StudentRouteHistorySession,
  event: StudentRouteHistoryPenaltyEvent,
): SchoolZone | null {
  return (
    session.school_zones?.find((zone) => zone.zone_uuid === event.zone_uuid) ??
    zones.find((zone) => zone.zone_uuid === event.zone_uuid) ??
    null
  );
}

function getEventMaxSpeedMps(
  session: StudentRouteHistorySession,
  event: StudentRouteHistoryPenaltyEvent,
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
  const context = buildRidePenaltyContext(session, event);
  const speeds = context.points.flatMap((point) =>
    typeof point.speed_mps === "number" && Number.isFinite(point.speed_mps)
      ? [point.speed_mps]
      : [],
  );
  return speeds.length > 0 ? Math.max(...speeds) : null;
}

function getPenaltyConfidence(
  session: StudentRouteHistorySession,
  event: StudentRouteHistoryPenaltyEvent,
) {
  const context = buildRidePenaltyContext(session, event);
  const avgAccuracyMeters = averageAccuracyMeters(context.points);
  const durationSeconds =
    typeof event.duration_ms === "number" && Number.isFinite(event.duration_ms)
      ? Math.max(0, event.duration_ms / 1000)
      : 0;
  const maxSpeedMps = getEventMaxSpeedMps(session, event);
  const maxOverLimitMph =
    event.zone_type === "speed_limit" &&
    typeof event.speed_limit_mph === "number" &&
    Number.isFinite(event.speed_limit_mph) &&
    maxSpeedMps != null
      ? Math.max(0, maxSpeedMps * 2.2369362920544 - event.speed_limit_mph)
      : null;
  const overLimitSeconds =
    event.zone_type === "speed_limit"
      ? estimateSpeedingSeconds(context.points, event.speed_limit_mph) ??
        durationSeconds
      : null;

  const accuracyScore = scoreAccuracy(avgAccuracyMeters);
  const rawScore =
    event.zone_type === "speed_limit"
      ? Math.round(
          accuracyScore * 0.25 +
            scoreSpeedDuration(overLimitSeconds ?? durationSeconds) * 0.4 +
            scoreSpeedOverLimit(maxOverLimitMph) * 0.35,
        )
      : Math.round(accuracyScore * 0.45 + scoreNoGoDuration(durationSeconds) * 0.55);
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    label: confidenceLabel(score),
    avgAccuracyMeters,
    durationSeconds,
    overLimitSeconds,
    maxOverLimitMph,
  };
}

function buildViolationRows(
  bundles: StudentRouteBundle[],
  zones: SchoolZone[],
): RideViolationRecord[] {
  return bundles
    .flatMap((bundle) => {
      const userUUID = studentUUID(bundle.entry);
      const name = fullName(bundle.entry);
      const subline = studentSubline(bundle.entry);
      return bundle.routeHistory.flatMap((session) =>
        session.penalty_events.map((event, index) => {
          const matchingZone = resolveMatchingZone(zones, session, event);
          return {
            id: `${userUUID}:${session.session_id}:${event.zone_uuid}:${event.occurred_at}:${index}`,
            entry: bundle.entry,
            studentUserUUID: userUUID,
            studentName: name,
            studentSubline: subline,
            session,
            event,
            matchingZone,
            snippet: buildRidePenaltyContext(session, event),
          };
        }),
      );
    })
    .sort((left, right) => right.event.occurred_at - left.event.occurred_at);
}

function eventCsvRow(record: RideViolationRecord): CsvCell[] {
  const maxSpeed = getEventMaxSpeedMps(record.session, record.event);
  const confidence = getPenaltyConfidence(record.session, record.event);
  return [
    record.studentName,
    record.studentSubline,
    record.studentUserUUID,
    record.session.session_id,
    sourceLabel(record.session),
    record.session.tracking_source,
    record.session.trip_mode,
    typeLabel(record.event.zone_type),
    eventTitle(record.event, record.matchingZone),
    record.event.reason,
    formatDateTime(record.event.occurred_at),
    record.event.points_lost,
    record.event.speed_limit_mph ?? "",
    maxSpeed == null ? "" : (maxSpeed * 2.2369362920544).toFixed(1),
    record.event.confidence_percent ?? "",
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
    record.event.evidence_point_count ?? "",
    record.event.lat,
    record.event.lng,
    record.matchingZone?.zone_uuid ?? record.event.zone_uuid,
    record.matchingZone?.title ?? "",
    record.snippet.points.length,
    record.snippet.nearestPoint?.id ?? "",
  ];
}

const violationCsvHeaders = [
  "student_name",
  "student_id_or_email",
  "user_uuid",
  "session_id",
  "source_label",
  "tracking_source",
  "trip_mode",
  "violation_type",
  "title",
  "reason",
  "occurred_at",
  "points_lost",
  "speed_limit_mph",
  "max_speed_mph",
  "confidence_percent",
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
  "snippet_point_count",
  "nearest_point_id",
] as const;

const snippetCsvHeaders = [
  ...violationCsvHeaders,
  "point_id",
  "point_timestamp",
  "relative_to_event",
  "point_latitude",
  "point_longitude",
  "point_speed_mph",
  "point_accuracy_ft",
  "point_altitude_m",
  "point_heading",
] as const;

function snippetCsvRows(record: RideViolationRecord): CsvCell[][] {
  const base = eventCsvRow(record);
  if (record.snippet.points.length === 0) {
    return [[...base, "", "", "", "", "", "", "", "", ""]];
  }
  return record.snippet.points.map((point) => [
    ...base,
    point.id,
    formatDateTime(point.timestamp),
    formatRelativeSeconds(point.timestamp, record.event.occurred_at),
    point.latitude,
    point.longitude,
    typeof point.speed_mps === "number"
      ? (point.speed_mps * 2.2369362920544).toFixed(1)
      : "",
    typeof point.accuracy === "number"
      ? Math.round(point.accuracy * 3.28084)
      : "",
    point.altitude ?? "",
    point.heading ?? "",
  ]);
}

function SnippetMap({ record }: { record: RideViolationRecord }) {
  const map = useMap();
  const routePositions = useMemo(
    () =>
      record.snippet.points.map(
        (point): [number, number] => [point.latitude, point.longitude],
      ),
    [record.snippet.points],
  );
  const polygonPositions = useMemo(
    () =>
      record.matchingZone?.polygon
        ?.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
        .map((point): [number, number] => [point.lat, point.lng]) ?? [],
    [record.matchingZone?.polygon],
  );
  const eventPosition = useMemo(
    (): [number, number] => [record.event.lat, record.event.lng],
    [record.event.lat, record.event.lng],
  );

  useEffect(() => {
    const bounds = new LatLngBounds([
      eventPosition,
      ...routePositions,
      ...polygonPositions,
    ]);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.25), { padding: [28, 28], animate: false });
    } else {
      map.setView(eventPosition, 16, { animate: false });
    }
  }, [eventPosition, map, polygonPositions, record.id, routePositions]);

  return (
    <>
      {polygonPositions.length >= 3 ? (
        <Polygon
          positions={polygonPositions}
          pathOptions={{
            color: record.event.zone_type === "speed_limit" ? "#b45309" : "#b91c1c",
            fillColor:
              record.event.zone_type === "speed_limit" ? "#f59e0b" : "#ef4444",
            fillOpacity: 0.22,
            weight: 2.5,
          }}
        />
      ) : null}
      {routePositions.length >= 2 ? (
        <Polyline
          positions={routePositions}
          pathOptions={{ color: "#143f6b", opacity: 0.9, weight: 4 }}
        />
      ) : null}
      {record.snippet.points.map((point, index) => (
        <CircleMarker
          key={`${point.id || point.timestamp}-${index}`}
          center={[point.latitude, point.longitude]}
          radius={point.id === record.snippet.nearestPoint?.id ? 5 : 3}
          pathOptions={{
            color: point.id === record.snippet.nearestPoint?.id ? "#111827" : "#2563eb",
            fillColor:
              point.id === record.snippet.nearestPoint?.id ? "#111827" : "#60a5fa",
            fillOpacity: 0.85,
            weight: 1.5,
          }}
        >
          <Tooltip>
            {formatRelativeSeconds(point.timestamp, record.event.occurred_at)} ·{" "}
            {formatSpeed(point.speed_mps)}
          </Tooltip>
        </CircleMarker>
      ))}
      <Marker
        position={eventPosition}
        icon={record.event.zone_type === "speed_limit" ? speedPenaltyIcon : noGoPenaltyIcon}
      >
        <Tooltip direction="top" opacity={1}>
          {eventTitle(record.event, record.matchingZone)}
        </Tooltip>
      </Marker>
    </>
  );
}

export function StudentRideViolationsScreen({ activeSchoolId, managedAppId }: Props) {
  const [loadState, setLoadState] = useState<LoadState>({
    status: "idle",
    message: "Ready to load student ride violations.",
    completed: 0,
    total: 0,
  });
  const [bundles, setBundles] = useState<StudentRouteBundle[]>([]);
  const [zones, setZones] = useState<SchoolZone[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [typeFilter, setTypeFilter] = useState<ViolationTypeFilter>("all");
  const [zoneFilter, setZoneFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeSchoolId || !managedAppId) {
        setLoadState({
          status: "error",
          message: "A school-scoped admin session is required.",
          completed: 0,
          total: 0,
        });
        return;
      }

      setLoadState({
        status: "loading",
        message: "Loading student roster...",
        completed: 0,
        total: 0,
      });
      setBundles([]);
      setZones([]);
      setSelectedId(null);

      try {
        const [roster, schoolZones] = await Promise.all([
          fetchSchoolStudentRoster(managedAppId, activeSchoolId),
          fetchSchoolZones(managedAppId, activeSchoolId).catch(() => [] as SchoolZone[]),
        ]);

        if (cancelled) {
          return;
        }

        setZones(schoolZones);
        setLoadState({
          status: "loading",
          message: "Loading route history for students...",
          completed: 0,
          total: roster.length,
        });

        const loadedBundles = await mapWithConcurrency(
          roster,
          STUDENT_ROUTE_CONCURRENCY,
          async (entry) => {
            try {
              const routeHistory = await fetchStudentRouteHistory(
                managedAppId,
                activeSchoolId,
                studentUUID(entry),
              );
              return { entry, routeHistory, error: "" };
            } catch (error) {
              return {
                entry,
                routeHistory: [],
                error: getErrorMessage(error),
              };
            }
          },
          (completed) => {
            if (!cancelled) {
              setLoadState({
                status: "loading",
                message: "Loading route history for students...",
                completed,
                total: roster.length,
              });
            }
          },
        );

        if (cancelled) {
          return;
        }

        setBundles(loadedBundles);
        setLoadState({
          status: "ready",
          message: `Loaded ride violations for ${roster.length.toLocaleString()} students.`,
          completed: roster.length,
          total: roster.length,
        });
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message: getErrorMessage(error),
            completed: 0,
            total: 0,
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, managedAppId]);

  const allViolations = useMemo(() => buildViolationRows(bundles, zones), [bundles, zones]);
  const zoneOptions = useMemo(
    () =>
      Array.from(
        new Map(
          allViolations.map((record) => [
            record.matchingZone?.zone_uuid ?? record.event.zone_uuid,
            record.matchingZone?.title || eventTitle(record.event, record.matchingZone),
          ]),
        ).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [allViolations],
  );

  const filteredViolations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allViolations.filter((record) => {
      if (
        sourceFilter === "tracked" &&
        isUntrackedSession(record.session)
      ) {
        return false;
      }
      if (
        sourceFilter === "untracked" &&
        !isUntrackedSession(record.session)
      ) {
        return false;
      }
      if (typeFilter !== "all") {
        if (typeFilter === "speed_limit" && record.event.zone_type !== "speed_limit") {
          return false;
        }
        if (typeFilter === "no_go" && record.event.zone_type === "speed_limit") {
          return false;
        }
      }
      if (
        zoneFilter !== "all" &&
        (record.matchingZone?.zone_uuid ?? record.event.zone_uuid) !== zoneFilter
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        record.studentName,
        record.studentSubline,
        record.entry.user.email,
        record.entry.user.username,
        eventTitle(record.event, record.matchingZone),
        record.event.reason,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [allViolations, search, sourceFilter, typeFilter, zoneFilter]);

  useEffect(() => {
    if (filteredViolations.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredViolations.some((record) => record.id === selectedId)) {
      setSelectedId(filteredViolations[0].id);
    }
  }, [filteredViolations, selectedId]);

  const selectedRecord = useMemo(
    () => filteredViolations.find((record) => record.id === selectedId) ?? null,
    [filteredViolations, selectedId],
  );
  const selectedConfidence = selectedRecord
    ? getPenaltyConfidence(selectedRecord.session, selectedRecord.event)
    : null;
  const loadProgress =
    loadState.total > 0 ? Math.round((loadState.completed / loadState.total) * 100) : 0;
  const errorCount = bundles.filter((bundle) => bundle.error).length;
  const untrackedCount = allViolations.filter((record) =>
    isUntrackedSession(record.session),
  ).length;
  const speedCount = allViolations.filter(
    (record) => record.event.zone_type === "speed_limit",
  ).length;
  const noGoCount = allViolations.length - speedCount;

  function handleDownloadFilteredCsv() {
    downloadCsv(
      sanitizeCsvFilename(`${activeSchoolId}-student-ride-violations`),
      [violationCsvHeaders, ...filteredViolations.map(eventCsvRow)],
    );
  }

  function handleDownloadSnippetCsv() {
    if (!selectedRecord) {
      return;
    }
    downloadCsv(
      sanitizeCsvFilename(
        `${activeSchoolId}-${selectedRecord.studentName}-violation-snippet`,
      ),
      [snippetCsvHeaders, ...snippetCsvRows(selectedRecord)],
    );
  }

  return (
    <div className="ride-violations-screen">
      <section className="rv-hero">
        <div>
          <p className="eyebrow">Compliance Enforcement</p>
          <h2>Ride Information</h2>
          <p>
            Review speed and no-go events across all students, including
            background/untracked sessions.
          </p>
        </div>
        <div className="rv-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={handleDownloadFilteredCsv}
            disabled={filteredViolations.length === 0}
          >
            Download filtered CSV
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleDownloadSnippetCsv}
            disabled={!selectedRecord}
          >
            Download selected snippet
          </button>
        </div>
      </section>

      <section className="rv-summary-grid">
        <div className="rv-summary-item">
          <span>Total events</span>
          <strong>{allViolations.length.toLocaleString()}</strong>
        </div>
        <div className="rv-summary-item">
          <span>Background / untracked</span>
          <strong>{untrackedCount.toLocaleString()}</strong>
        </div>
        <div className="rv-summary-item">
          <span>Speed zones</span>
          <strong>{speedCount.toLocaleString()}</strong>
        </div>
        <div className="rv-summary-item">
          <span>No-go zones</span>
          <strong>{noGoCount.toLocaleString()}</strong>
        </div>
      </section>

      <section className="rv-load-panel">
        <div>
          <strong>{loadState.message}</strong>
          {errorCount > 0 ? (
            <span>{errorCount.toLocaleString()} student route loads failed.</span>
          ) : null}
        </div>
        {loadState.status === "loading" && loadState.total > 0 ? (
          <div className="rv-progress">
            <div className="rv-progress-track">
              <span style={{ width: `${loadProgress}%` }} />
            </div>
            <em>
              {loadState.completed.toLocaleString()} /{" "}
              {loadState.total.toLocaleString()}
            </em>
          </div>
        ) : null}
      </section>

      <section className="rv-filters" aria-label="Ride violation filters">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student, zone, reason..."
        />
        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
        >
          <option value="all">All sources</option>
          <option value="untracked">Background / untracked</option>
          <option value="tracked">Tracked rides</option>
        </select>
        <select
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value as ViolationTypeFilter)
          }
        >
          <option value="all">All types</option>
          <option value="speed_limit">Speed zones</option>
          <option value="no_go">No-go zones</option>
        </select>
        <select
          value={zoneFilter}
          onChange={(event) => setZoneFilter(event.target.value)}
        >
          <option value="all">All zones</option>
          {zoneOptions.map(([zoneUUID, label]) => (
            <option key={zoneUUID} value={zoneUUID}>
              {label}
            </option>
          ))}
        </select>
      </section>

      <div className="rv-layout">
        <section className="rv-list" aria-label="Filtered ride violations">
          <div className="rv-list-head">
            <strong>{filteredViolations.length.toLocaleString()} events</strong>
            <span>Newest first</span>
          </div>
          {loadState.status === "error" ? (
            <p className="rv-empty">{loadState.message}</p>
          ) : loadState.status === "loading" && allViolations.length === 0 ? (
            <p className="rv-empty">Loading ride violations...</p>
          ) : filteredViolations.length === 0 ? (
            <p className="rv-empty">No ride violations match these filters.</p>
          ) : (
            <div className="rv-event-list">
              {filteredViolations.map((record) => {
                const active = record.id === selectedRecord?.id;
                const maxSpeed = getEventMaxSpeedMps(record.session, record.event);
                const confidence = getPenaltyConfidence(record.session, record.event);
                return (
                  <button
                    key={record.id}
                    className={`rv-event-row${active ? " rv-event-row-active" : ""}`}
                    type="button"
                    onClick={() => setSelectedId(record.id)}
                  >
                    <span className="rv-event-row-top">
                      <strong>{record.studentName}</strong>
                      <em>{formatDateTime(record.event.occurred_at)}</em>
                    </span>
                    <span className="rv-event-title">
                      {eventTitle(record.event, record.matchingZone)}
                    </span>
                    <span className="rv-event-meta">
                      <span>{typeLabel(record.event.zone_type)}</span>
                      <span>{sourceLabel(record.session)}</span>
                      <span>-{record.event.points_lost.toLocaleString()} pts</span>
                      <span>
                        Confidence {confidence.score}% ({confidence.label})
                      </span>
                    </span>
                    {record.event.zone_type === "speed_limit" ? (
                      <span className="rv-event-meta">
                        <span>Limit {record.event.speed_limit_mph ?? "—"} mph</span>
                        <span>Max {formatSpeed(maxSpeed)}</span>
                        <span>
                          Over limit{" "}
                          {formatDuration(confidence.overLimitSeconds ?? 0)}
                        </span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rv-detail" aria-label="Selected ride violation detail">
          {!selectedRecord ? (
            <p className="rv-empty">Select a ride violation to inspect its context.</p>
          ) : (
            <>
              <div className="rv-detail-head">
                <div>
                  <p className="eyebrow">{sourceLabel(selectedRecord.session)}</p>
                  <h3>{eventTitle(selectedRecord.event, selectedRecord.matchingZone)}</h3>
                  <p>
                    {selectedRecord.studentName}
                    {selectedRecord.studentSubline
                      ? ` · ${selectedRecord.studentSubline}`
                      : ""}
                  </p>
                </div>
                <a
                  className="secondary-button"
                  href={`/routes?${new URLSearchParams({
                    user: selectedRecord.studentUserUUID,
                    session: selectedRecord.session.session_id,
                    lat: String(selectedRecord.event.lat),
                    lng: String(selectedRecord.event.lng),
                  }).toString()}`}
                >
                  View full ride
                </a>
              </div>

              <div className="rv-detail-grid">
                <div>
                  <span>Occurred</span>
                  <strong>{formatDateTime(selectedRecord.event.occurred_at)}</strong>
                </div>
                <div>
                  <span>Points lost</span>
                  <strong>-{selectedRecord.event.points_lost.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Snippet</span>
                  <strong>
                    {selectedRecord.snippet.points.length.toLocaleString()} points
                  </strong>
                </div>
                <div>
                  <span>Distance / duration</span>
                  <strong>
                    {formatDistance(selectedRecord.snippet.distanceMeters)} ·{" "}
                    {formatDuration(selectedRecord.snippet.durationSeconds)}
                  </strong>
                </div>
                {selectedConfidence ? (
                  <>
                    <div>
                      <span>Derived confidence</span>
                      <strong>
                        {selectedConfidence.score}% ({selectedConfidence.label})
                      </strong>
                    </div>
                    <div>
                      <span>Confidence factors</span>
                      <strong>
                        GPS {formatAccuracy(selectedConfidence.avgAccuracyMeters)}
                        {selectedRecord.event.zone_type === "speed_limit"
                          ? ` · over limit ${formatDuration(
                              selectedConfidence.overLimitSeconds ?? 0,
                            )}`
                          : ` · in zone ${formatDuration(
                              selectedConfidence.durationSeconds,
                            )}`}
                      </strong>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="rv-map-shell">
                <MapContainer
                  center={[selectedRecord.event.lat, selectedRecord.event.lng]}
                  zoom={16}
                  className="rv-map"
                  scrollWheelZoom
                >
                  <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
                  <SnippetMap record={selectedRecord} />
                </MapContainer>
              </div>

              {selectedRecord.snippet.points.length === 0 ? (
                <div className="rv-no-snippet">
                  This event has a violation location but no GPS breadcrumbs for a
                  before/after snippet.
                </div>
              ) : (
                <div className="rv-point-section">
                  <div className="rv-point-section-head">
                    <strong>Before / after GPS points</strong>
                    <span>
                      Nearest point speed{" "}
                      {formatSpeed(selectedRecord.snippet.nearestPoint?.speed_mps)} ·{" "}
                      {formatAccuracy(selectedRecord.snippet.nearestPoint?.accuracy)}
                    </span>
                  </div>
                  <div className="rv-point-table-wrap">
                    <table className="rv-point-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Offset</th>
                          <th>Speed</th>
                          <th>Accuracy</th>
                          <th>Latitude</th>
                          <th>Longitude</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecord.snippet.points.map((point, index) => {
                          const nearest =
                            point.id === selectedRecord.snippet.nearestPoint?.id;
                          return (
                            <tr
                              key={`${point.id || point.timestamp}-${index}`}
                              className={nearest ? "rv-nearest-point-row" : ""}
                            >
                              <td>{formatDateTime(point.timestamp)}</td>
                              <td>
                                {formatRelativeSeconds(
                                  point.timestamp,
                                  selectedRecord.event.occurred_at,
                                )}
                              </td>
                              <td>{formatSpeed(point.speed_mps)}</td>
                              <td>{formatAccuracy(point.accuracy)}</td>
                              <td>{formatCoordinate(point.latitude)}</td>
                              <td>{formatCoordinate(point.longitude)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
