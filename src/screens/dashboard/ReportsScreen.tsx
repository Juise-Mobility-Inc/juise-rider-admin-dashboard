import { useMemo, useState } from "react";

import {
  fetchAdminSchoolPacks,
  fetchSchool,
  fetchSchoolPOIs,
  fetchSchoolStudentRoster,
  fetchSchoolTermReservations,
  fetchSchoolZones,
  fetchStudentParkingViolations,
  fetchStudentProfile,
  fetchStudentRouteHistory,
  type Pack,
  type PackSpotReservation,
  type RegisteredDevice,
  type SchoolPOI,
  type SchoolStudentRosterEntry,
  type SchoolTerm,
  type SchoolZone,
  type StudentParkingViolation,
  type StudentProfileBundle,
  type StudentRouteHistoryPenaltyEvent,
  type StudentRouteHistorySession,
} from "../../lib/api";
import {
  csvObjectRow,
  csvRow,
  downloadCsv,
  sanitizeCsvFilename,
  type CsvCell,
} from "../../lib/csv";

type ReportLoadStatus = "idle" | "loading" | "ready" | "error";

type ReportLoadState = {
  status: ReportLoadStatus;
  message: string;
  completed: number;
  total: number;
};

type ReportDataError = {
  student?: SchoolStudentRosterEntry;
  scope: string;
  message: string;
};

type StudentReportBundle = {
  entry: SchoolStudentRosterEntry;
  profile: StudentProfileBundle | null;
  routeHistory: StudentRouteHistorySession[];
  parkingViolations: StudentParkingViolation[];
  errors: ReportDataError[];
};

type ReportsDataset = {
  generatedAt: number;
  roster: SchoolStudentRosterEntry[];
  reservations: PackSpotReservation[];
  pois: SchoolPOI[];
  zones: SchoolZone[];
  terms: SchoolTerm[];
  packs: Pack[];
  students: StudentReportBundle[];
  errors: ReportDataError[];
};

type DateRange = {
  fromDate: string;
  toDate: string;
  fromTimestamp: number | null;
  toTimestamp: number | null;
};

type CsvRow<Column extends string> = Partial<Record<Column, CsvCell>>;

type ReportCsvFile = {
  filename: string;
  rows: ReadonlyArray<readonly CsvCell[]>;
};

type Props = {
  activeSchoolId: string;
  managedAppId: string;
  adminUserUUID: string;
};

const sharedIdentityColumns = [
  "report_generated_at",
  "report_period_start",
  "report_period_end",
  "full_name",
  "first_name",
  "last_name",
  "username",
  "email",
  "phone",
  "student_id",
  "campus_id",
  "user_uuid",
  "membership_uuid",
  "membership_status",
  "membership_active",
] as const;

const studentSummaryColumns = [
  ...sharedIdentityColumns,
  "term_count",
  "term_names",
  "device_count",
  "active_device_count",
  "device_types",
  "route_session_count",
  "total_distance_miles",
  "total_duration_minutes",
  "top_speed_mph",
  "poi_visit_count",
  "unique_poi_count",
  "ride_penalty_count",
  "speeding_penalty_count",
  "no_go_penalty_count",
  "ride_penalty_points_lost",
  "parking_violation_count",
  "open_parking_violation_count",
  "reservation_count",
  "last_route_started_at",
  "last_poi_visited_at",
  "last_ride_penalty_at",
  "last_parking_violation_at",
  "report_errors",
] as const;

const deviceColumns = [
  ...sharedIdentityColumns,
  "device_uuid",
  "device_type",
  "device_make",
  "device_model",
  "device_nickname",
  "device_serial_number",
  "device_color",
  "device_active",
  "device_created_at",
  "device_updated_at",
] as const;

const parkingViolationColumns = [
  ...sharedIdentityColumns,
  "violation_uuid",
  "violation_status",
  "violation_description",
  "violation_active",
  "violation_device_uuid",
  "reported_by_user_uuid",
  "violation_created_at",
  "violation_updated_at",
] as const;

const ridePenaltyColumns = [
  ...sharedIdentityColumns,
  "session_id",
  "trip_mode",
  "tracking_source",
  "session_started_at",
  "zone_uuid",
  "zone_title",
  "zone_type",
  "reason",
  "occurred_at",
  "latitude",
  "longitude",
  "speed_limit_mph",
  "estimated_speed_mph",
  "points_lost",
  "duration_minutes",
] as const;

const poiVisitColumns = [
  ...sharedIdentityColumns,
  "session_id",
  "trip_mode",
  "session_started_at",
  "poi_uuid",
  "poi_title",
  "poi_description",
  "poi_bonus_points",
  "visited_at",
  "latitude",
  "longitude",
] as const;

const poiPerformanceColumns = [
  "report_generated_at",
  "report_period_start",
  "report_period_end",
  "poi_uuid",
  "poi_title",
  "poi_description",
  "configured_active",
  "current_bonus_points",
  "latitude",
  "longitude",
  "visit_count",
  "unique_student_count",
  "bonus_points_awarded",
  "first_visit_at",
  "last_visit_at",
] as const;

const routeSessionColumns = [
  ...sharedIdentityColumns,
  "session_id",
  "trip_mode",
  "tracking_source",
  "started_at",
  "ended_at",
  "distance_miles",
  "duration_minutes",
  "top_speed_mph",
  "average_speed_mph",
  "bonus_points",
  "penalty_points",
  "net_points",
  "poi_visit_count",
  "ride_penalty_count",
  "route_point_count",
  "shared_to_friends",
] as const;

const reservationColumns = [
  ...sharedIdentityColumns,
  "reservation_uuid",
  "reservation_status",
  "reservation_kind",
  "term_uuid",
  "term_name",
  "start_time",
  "end_time",
  "approved_at",
  "approved_by",
  "student_confirmed_at",
  "pack_uuid",
  "pack_name",
  "spot_uuid",
  "spot_number",
  "pack_latitude",
  "pack_longitude",
] as const;

const schoolPoiColumns = [
  "report_generated_at",
  "poi_uuid",
  "school_id",
  "title",
  "description",
  "latitude",
  "longitude",
  "bonus_points",
  "active",
  "created_at",
  "updated_at",
] as const;

const schoolZoneColumns = [
  "report_generated_at",
  "zone_uuid",
  "school_id",
  "title",
  "description",
  "zone_type",
  "speed_limit_mph",
  "active",
  "point_count",
  "polygon",
  "created_at",
  "updated_at",
] as const;

const schoolPackColumns = [
  "report_generated_at",
  "pack_uuid",
  "name",
  "description",
  "active",
  "spot_count",
  "latitude",
  "longitude",
  "campus_id",
  "updated_at",
] as const;

const schoolTermColumns = [
  "report_generated_at",
  "term_uuid",
  "school_id",
  "name",
  "start_date",
  "end_date",
  "active",
  "created_at",
  "updated_at",
] as const;

const dataErrorColumns = [
  ...sharedIdentityColumns,
  "error_scope",
  "error_message",
] as const;

let reportDownloadCollector: ReportCsvFile[] | null = null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

function formatStudentName(entry: SchoolStudentRosterEntry): string {
  const fullName =
    `${entry.user.first_name?.trim() ?? ""} ${entry.user.last_name?.trim() ?? ""}`.trim();
  if (fullName) {
    return fullName;
  }
  if (entry.user.username?.trim()) {
    return entry.user.username.trim();
  }
  if (entry.user.email?.trim()) {
    return entry.user.email.trim();
  }
  return "Unnamed student";
}

function resolveStudentUserUUID(entry: SchoolStudentRosterEntry): string {
  return entry.membership.user_uuid?.trim() || entry.user.k_guid;
}

function formatUnixTimestamp(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }
  return new Date(value * 1000).toISOString();
}

function parseDateBoundary(value: string, endOfDay: boolean): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Math.floor(parsed.getTime() / 1000);
}

function buildDateRange(fromDate: string, toDate: string): DateRange {
  return {
    fromDate,
    toDate,
    fromTimestamp: parseDateBoundary(fromDate, false),
    toTimestamp: parseDateBoundary(toDate, true),
  };
}

function isTimestampInRange(
  timestamp: number | null | undefined,
  range: DateRange,
): boolean {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return false;
  }
  if (range.fromTimestamp !== null && timestamp < range.fromTimestamp) {
    return false;
  }
  if (range.toTimestamp !== null && timestamp > range.toTimestamp) {
    return false;
  }
  return true;
}

function roundCsvNumber(value: number, fractionDigits: number): number | "" {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number(value.toFixed(fractionDigits));
}

function milesFromMeters(value: number): number | "" {
  return roundCsvNumber(value / 1609.344, 2);
}

function minutesFromSeconds(value: number): number | "" {
  return roundCsvNumber(value / 60, 1);
}

function minutesFromMilliseconds(value: number): number | "" {
  return roundCsvNumber(value / 60000, 1);
}

function mphFromMetersPerSecond(value?: number | null): number | "" {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return roundCsvNumber(value * 2.2369362920544, 1);
}

function formatZoneType(zoneType: string): string {
  switch (zoneType.trim()) {
    case "no_go":
      return "No-go zone";
    case "speed_limit":
      return "Speed limit zone";
    default:
      return zoneType.trim() || "Ride penalty zone";
  }
}

function resolvePenaltyZone(
  session: StudentRouteHistorySession,
  schoolZones: SchoolZone[],
  zoneUUID: string,
): SchoolZone | null {
  const normalizedZoneUUID = zoneUUID.trim();
  if (!normalizedZoneUUID) {
    return null;
  }

  return (
    session.school_zones?.find(
      (zone) => zone.zone_uuid.trim() === normalizedZoneUUID,
    ) ??
    schoolZones.find((zone) => zone.zone_uuid.trim() === normalizedZoneUUID) ??
    null
  );
}

function estimatePenaltySpeedMph(
  session: StudentRouteHistorySession,
  event: StudentRouteHistoryPenaltyEvent,
): number | null {
  const candidates = (session.points ?? []).filter(
    (point) =>
      typeof point.speed_mps === "number" &&
      Number.isFinite(point.speed_mps) &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
  );

  if (candidates.length === 0) {
    return null;
  }

  const bestPoint = candidates.reduce((best, point) => {
    const bestTimeDiff = Math.abs(best.timestamp - event.occurred_at);
    const pointTimeDiff = Math.abs(point.timestamp - event.occurred_at);
    if (pointTimeDiff !== bestTimeDiff) {
      return pointTimeDiff < bestTimeDiff ? point : best;
    }

    const bestCoordDiff =
      Math.abs(best.latitude - event.lat) + Math.abs(best.longitude - event.lng);
    const pointCoordDiff =
      Math.abs(point.latitude - event.lat) +
      Math.abs(point.longitude - event.lng);
    return pointCoordDiff < bestCoordDiff ? point : best;
  });

  return typeof bestPoint.speed_mps === "number"
    ? bestPoint.speed_mps * 2.2369362920544
    : null;
}

function buildIdentityRow(
  entry: SchoolStudentRosterEntry,
  dataset: ReportsDataset,
  range: DateRange,
): CsvRow<(typeof sharedIdentityColumns)[number]> {
  return {
    report_generated_at: formatUnixTimestamp(dataset.generatedAt),
    report_period_start: range.fromDate,
    report_period_end: range.toDate,
    full_name: formatStudentName(entry),
    first_name: entry.user.first_name,
    last_name: entry.user.last_name,
    username: entry.user.username,
    email: entry.user.email,
    phone: entry.user.phone ?? "",
    student_id: entry.membership.student_id,
    campus_id: entry.membership.campus_id,
    user_uuid: resolveStudentUserUUID(entry),
    membership_uuid: entry.membership.membership_uuid,
    membership_status: entry.membership.status,
    membership_active: entry.membership.active,
  };
}

function getFilteredRouteSessions(
  bundle: StudentReportBundle,
  range: DateRange,
): StudentRouteHistorySession[] {
  return bundle.routeHistory.filter((session) =>
    isTimestampInRange(session.started_at, range),
  );
}

function getFilteredPenaltyEvents(
  bundle: StudentReportBundle,
  range: DateRange,
): Array<{
  session: StudentRouteHistorySession;
  event: StudentRouteHistoryPenaltyEvent;
}> {
  return bundle.routeHistory.flatMap((session) =>
    session.penalty_events
      .filter((event) => isTimestampInRange(event.occurred_at, range))
      .map((event) => ({ session, event })),
  );
}

function getFilteredPoiVisits(
  bundle: StudentReportBundle,
  range: DateRange,
): Array<{
  session: StudentRouteHistorySession;
  poi: StudentRouteHistorySession["visited_pois"][number];
}> {
  return bundle.routeHistory.flatMap((session) =>
    session.visited_pois
      .filter((poi) => isTimestampInRange(poi.visited_at, range))
      .map((poi) => ({ session, poi })),
  );
}

function getFilteredParkingViolations(
  bundle: StudentReportBundle,
  range: DateRange,
): StudentParkingViolation[] {
  return bundle.parkingViolations.filter((violation) =>
    isTimestampInRange(violation.created_at, range),
  );
}

function getFilteredReservations(
  reservations: PackSpotReservation[],
  range: DateRange,
): PackSpotReservation[] {
  return reservations.filter((reservation) =>
    isTimestampInRange(reservation.start_time, range),
  );
}

function buildFilename(
  schoolId: string,
  reportSlug: string,
  range: DateRange,
): string {
  const period =
    range.fromDate || range.toDate
      ? `${range.fromDate || "start"}-to-${range.toDate || "today"}`
      : "all-time";

  return sanitizeCsvFilename(`${schoolId}-${reportSlug}-${period}`, reportSlug);
}

function buildZipFilename(schoolId: string, range: DateRange): string {
  const csvFilename = buildFilename(schoolId, "reports", range);
  return csvFilename.replace(/\.csv$/i, ".zip");
}

function buildReportCsvFile<Column extends string>(
  filename: string,
  columns: readonly Column[],
  rows: CsvRow<Column>[],
): ReportCsvFile {
  return {
    filename,
    rows: [columns, ...rows.map((row) => csvObjectRow(columns, row))],
  };
}

function downloadReportFile(file: ReportCsvFile): void {
  downloadCsv(file.filename, file.rows);
}

function downloadReport<Column extends string>(
  filename: string,
  columns: readonly Column[],
  rows: CsvRow<Column>[],
): void {
  const file = buildReportCsvFile(filename, columns, rows);
  if (reportDownloadCollector) {
    reportDownloadCollector.push(file);
    return;
  }

  downloadReportFile(file);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function getZipDosDateTime(date = new Date()): {
  dosDate: number;
  dosTime: number;
} {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosDate:
      ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

function encodeCsvFile(file: ReportCsvFile): {
  filenameBytes: Uint8Array;
  data: Uint8Array;
  crc32: number;
} {
  const encoder = new TextEncoder();
  const normalizedFilename = file.filename.endsWith(".csv")
    ? file.filename
    : `${file.filename}.csv`;
  const csv = file.rows.map((row) => csvRow(row)).join("\n");
  const data = encoder.encode(csv);

  return {
    filenameBytes: encoder.encode(normalizedFilename),
    data,
    crc32: calculateCrc32(data),
  };
}

function createZipBlob(files: ReportCsvFile[]): Blob {
  const { dosDate, dosTime } = getZipDosDateTime();
  const encodedFiles = files.map(encodeCsvFile);
  const chunks: Uint8Array[] = [];
  const centralDirectoryChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of encodedFiles) {
    const localHeader = new Uint8Array(30 + file.filenameBytes.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, dosTime);
    writeUint16(localHeader, 12, dosDate);
    writeUint32(localHeader, 14, file.crc32);
    writeUint32(localHeader, 18, file.data.length);
    writeUint32(localHeader, 22, file.data.length);
    writeUint16(localHeader, 26, file.filenameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(file.filenameBytes, 30);

    chunks.push(localHeader, file.data);

    const centralDirectoryHeader = new Uint8Array(
      46 + file.filenameBytes.length,
    );
    writeUint32(centralDirectoryHeader, 0, 0x02014b50);
    writeUint16(centralDirectoryHeader, 4, 20);
    writeUint16(centralDirectoryHeader, 6, 20);
    writeUint16(centralDirectoryHeader, 8, 0x0800);
    writeUint16(centralDirectoryHeader, 10, 0);
    writeUint16(centralDirectoryHeader, 12, dosTime);
    writeUint16(centralDirectoryHeader, 14, dosDate);
    writeUint32(centralDirectoryHeader, 16, file.crc32);
    writeUint32(centralDirectoryHeader, 20, file.data.length);
    writeUint32(centralDirectoryHeader, 24, file.data.length);
    writeUint16(centralDirectoryHeader, 28, file.filenameBytes.length);
    writeUint16(centralDirectoryHeader, 30, 0);
    writeUint16(centralDirectoryHeader, 32, 0);
    writeUint16(centralDirectoryHeader, 34, 0);
    writeUint16(centralDirectoryHeader, 36, 0);
    writeUint32(centralDirectoryHeader, 38, 0);
    writeUint32(centralDirectoryHeader, 42, offset);
    centralDirectoryHeader.set(file.filenameBytes, 46);
    centralDirectoryChunks.push(centralDirectoryHeader);

    offset += localHeader.length + file.data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectoryChunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0,
  );
  const endOfCentralDirectory = new Uint8Array(22);
  writeUint32(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16(endOfCentralDirectory, 4, 0);
  writeUint16(endOfCentralDirectory, 6, 0);
  writeUint16(endOfCentralDirectory, 8, encodedFiles.length);
  writeUint16(endOfCentralDirectory, 10, encodedFiles.length);
  writeUint32(endOfCentralDirectory, 12, centralDirectorySize);
  writeUint32(endOfCentralDirectory, 16, centralDirectoryOffset);
  writeUint16(endOfCentralDirectory, 20, 0);

  const zipChunks = [...chunks, ...centralDirectoryChunks, endOfCentralDirectory];
  const zipBytes = new Uint8Array(
    zipChunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let writeOffset = 0;
  for (const chunk of zipChunks) {
    zipBytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return new Blob([zipBytes.buffer as ArrayBuffer], {
    type: "application/zip",
  });
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

function countOpenParkingViolations(violations: StudentParkingViolation[]): number {
  return violations.filter((violation) => {
    const status = violation.status.trim().toLowerCase();
    return (
      status === "" ||
      status === "open" ||
      status === "pending" ||
      status === "reported"
    );
  }).length;
}

function resolveReportDeviceTypes(devices: RegisteredDevice[]): string {
  return Array.from(
    new Set(
      devices.map((device) => device.device_type.trim()).filter(Boolean),
    ),
  )
    .sort()
    .join("; ");
}

function buildStudentByMembershipMap(
  roster: SchoolStudentRosterEntry[],
): Map<string, SchoolStudentRosterEntry> {
  return new Map(
    roster
      .map((entry) => [entry.membership.membership_uuid.trim(), entry] as const)
      .filter(([membershipUUID]) => membershipUUID !== ""),
  );
}

function buildPackByUUIDMap(packs: Pack[]): Map<string, Pack> {
  return new Map(
    packs
      .map((pack) => [pack.pack_uuid.trim(), pack] as const)
      .filter(([packUUID]) => packUUID !== ""),
  );
}

export function ReportsScreen({
  activeSchoolId,
  managedAppId,
  adminUserUUID,
}: Props) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dataset, setDataset] = useState<ReportsDataset | null>(null);
  const [loadState, setLoadState] = useState<ReportLoadState>({
    status: "idle",
    message: "",
    completed: 0,
    total: 0,
  });

  const dateRange = useMemo(
    () => buildDateRange(fromDate, toDate),
    [fromDate, toDate],
  );
  const dateRangeError =
    fromDate && toDate && fromDate > toDate
      ? "Start date must be before end date."
      : "";
  const downloadsDisabled = !dataset || Boolean(dateRangeError);
  const progressPercent =
    loadState.total > 0
      ? Math.round((loadState.completed / loadState.total) * 100)
      : 0;

  const reportStats = useMemo(() => {
    if (!dataset) {
      return null;
    }

    const routeSessions = dataset.students.flatMap((bundle) =>
      getFilteredRouteSessions(bundle, dateRange),
    );
    const poiVisits = dataset.students.flatMap((bundle) =>
      getFilteredPoiVisits(bundle, dateRange),
    );
    const ridePenalties = dataset.students.flatMap((bundle) =>
      getFilteredPenaltyEvents(bundle, dateRange),
    );
    const parkingViolations = dataset.students.flatMap((bundle) =>
      getFilteredParkingViolations(bundle, dateRange),
    );
    const reservationsInRange = getFilteredReservations(
      dataset.reservations,
      dateRange,
    );

    return {
      students: dataset.roster.length,
      devices: dataset.students.reduce(
        (sum, bundle) => sum + (bundle.profile?.devices.length ?? 0),
        0,
      ),
      routeSessions: routeSessions.length,
      poiVisits: poiVisits.length,
      uniquePois: new Set(poiVisits.map(({ poi }) => poi.poi_uuid)).size,
      poiPerformanceRows: new Set([
        ...dataset.pois.map((poi) => poi.poi_uuid),
        ...poiVisits.map(({ poi }) => poi.poi_uuid),
      ]).size,
      ridePenalties: ridePenalties.length,
      parkingViolations: parkingViolations.length,
      reservations: reservationsInRange.length,
      errors: dataset.errors.length,
    };
  }, [dataset, dateRange]);

  async function handleBuildDataset() {
    if (!activeSchoolId || !managedAppId || !adminUserUUID) {
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
      message: "Loading school data...",
      completed: 0,
      total: 0,
    });

    try {
      const [
        rosterResult,
        reservationsResult,
        poisResult,
        zonesResult,
        schoolResult,
        packsResult,
      ] = await Promise.allSettled([
        fetchSchoolStudentRoster(managedAppId, activeSchoolId),
        fetchSchoolTermReservations(adminUserUUID, managedAppId, activeSchoolId),
        fetchSchoolPOIs(managedAppId, activeSchoolId),
        fetchSchoolZones(managedAppId, activeSchoolId),
        fetchSchool(managedAppId, activeSchoolId),
        fetchAdminSchoolPacks(adminUserUUID, managedAppId, activeSchoolId),
      ]);

      if (rosterResult.status === "rejected") {
        throw rosterResult.reason;
      }

      const errors: ReportDataError[] = [];
      const reservations =
        reservationsResult.status === "fulfilled" ? reservationsResult.value : [];
      const pois = poisResult.status === "fulfilled" ? poisResult.value : [];
      const zones = zonesResult.status === "fulfilled" ? zonesResult.value : [];
      const terms =
        schoolResult.status === "fulfilled" ? schoolResult.value.terms : [];
      const packs = packsResult.status === "fulfilled" ? packsResult.value : [];

      if (reservationsResult.status === "rejected") {
        errors.push({
          scope: "parking_reservations",
          message: getErrorMessage(reservationsResult.reason),
        });
      }
      if (poisResult.status === "rejected") {
        errors.push({
          scope: "school_pois",
          message: getErrorMessage(poisResult.reason),
        });
      }
      if (zonesResult.status === "rejected") {
        errors.push({
          scope: "school_zones",
          message: getErrorMessage(zonesResult.reason),
        });
      }
      if (schoolResult.status === "rejected") {
        errors.push({
          scope: "school_terms",
          message: getErrorMessage(schoolResult.reason),
        });
      }
      if (packsResult.status === "rejected") {
        errors.push({
          scope: "juise_packs",
          message: getErrorMessage(packsResult.reason),
        });
      }

      setLoadState({
        status: "loading",
        message: "Loading student activity...",
        completed: 0,
        total: rosterResult.value.length,
      });

      const students = await mapWithConcurrency(
        rosterResult.value,
        4,
        async (entry) => {
          const studentUserUUID = resolveStudentUserUUID(entry);
          const [
            profileResult,
            routeHistoryResult,
            parkingViolationsResult,
          ] = await Promise.allSettled([
            fetchStudentProfile(managedAppId, studentUserUUID),
            fetchStudentRouteHistory(
              managedAppId,
              activeSchoolId,
              studentUserUUID,
            ),
            fetchStudentParkingViolations(
              managedAppId,
              activeSchoolId,
              studentUserUUID,
            ),
          ]);
          const studentErrors: ReportDataError[] = [];

          if (profileResult.status === "rejected") {
            studentErrors.push({
              student: entry,
              scope: "student_profile_devices",
              message: getErrorMessage(profileResult.reason),
            });
          }
          if (routeHistoryResult.status === "rejected") {
            studentErrors.push({
              student: entry,
              scope: "route_history",
              message: getErrorMessage(routeHistoryResult.reason),
            });
          }
          if (parkingViolationsResult.status === "rejected") {
            studentErrors.push({
              student: entry,
              scope: "parking_violations",
              message: getErrorMessage(parkingViolationsResult.reason),
            });
          }

          return {
            entry,
            profile:
              profileResult.status === "fulfilled" ? profileResult.value : null,
            routeHistory:
              routeHistoryResult.status === "fulfilled"
                ? routeHistoryResult.value
                : [],
            parkingViolations:
              parkingViolationsResult.status === "fulfilled"
                ? parkingViolationsResult.value
                : [],
            errors: studentErrors,
          } satisfies StudentReportBundle;
        },
        (completed) => {
          setLoadState({
            status: "loading",
            message: "Loading student activity...",
            completed,
            total: rosterResult.value.length,
          });
        },
      );

      const studentErrors = students.flatMap((student) => student.errors);
      setDataset({
        generatedAt: Math.floor(Date.now() / 1000),
        roster: rosterResult.value,
        reservations,
        pois,
        zones,
        terms,
        packs,
        students,
        errors: [...errors, ...studentErrors],
      });
      setLoadState({
        status: "ready",
        message: `Report data ready for ${rosterResult.value.length} students.`,
        completed: rosterResult.value.length,
        total: rosterResult.value.length,
      });
    } catch (error) {
      setDataset(null);
      setLoadState({
        status: "error",
        message: getErrorMessage(error),
        completed: 0,
        total: 0,
      });
    }
  }

  function downloadStudentSummary() {
    if (!dataset) {
      return;
    }

    const rows = dataset.students.map((bundle) => {
      const routeSessions = getFilteredRouteSessions(bundle, dateRange);
      const poiVisits = getFilteredPoiVisits(bundle, dateRange);
      const ridePenalties = getFilteredPenaltyEvents(bundle, dateRange);
      const parkingViolations = getFilteredParkingViolations(bundle, dateRange);
      const reservations = getFilteredReservations(
        dataset.reservations.filter(
          (reservation) =>
            reservation.membership_uuid ===
            bundle.entry.membership.membership_uuid,
        ),
        dateRange,
      );
      const topSpeedMps = routeSessions.reduce(
        (highest, session) => Math.max(highest, session.top_speed_mps || 0),
        0,
      );
      const lastRouteStartedAt = Math.max(
        0,
        ...routeSessions.map((session) => session.started_at),
      );
      const lastPoiVisitedAt = Math.max(
        0,
        ...poiVisits.map(({ poi }) => poi.visited_at),
      );
      const lastRidePenaltyAt = Math.max(
        0,
        ...ridePenalties.map(({ event }) => event.occurred_at),
      );
      const lastParkingViolationAt = Math.max(
        0,
        ...parkingViolations.map((violation) => violation.created_at),
      );

      return {
        ...buildIdentityRow(bundle.entry, dataset, dateRange),
        term_count: bundle.entry.membership.terms.length,
        term_names: bundle.entry.membership.terms
          .map((term) => term.name)
          .join("; "),
        device_count: bundle.profile?.devices.length ?? 0,
        active_device_count:
          bundle.profile?.devices.filter((device) => device.active).length ?? 0,
        device_types: resolveReportDeviceTypes(bundle.profile?.devices ?? []),
        route_session_count: routeSessions.length,
        total_distance_miles: milesFromMeters(
          routeSessions.reduce(
            (sum, session) => sum + session.distance_meters,
            0,
          ),
        ),
        total_duration_minutes: minutesFromSeconds(
          routeSessions.reduce(
            (sum, session) => sum + session.duration_seconds,
            0,
          ),
        ),
        top_speed_mph: mphFromMetersPerSecond(topSpeedMps),
        poi_visit_count: poiVisits.length,
        unique_poi_count: new Set(poiVisits.map(({ poi }) => poi.poi_uuid)).size,
        ride_penalty_count: ridePenalties.length,
        speeding_penalty_count: ridePenalties.filter(
          ({ event }) => event.zone_type === "speed_limit",
        ).length,
        no_go_penalty_count: ridePenalties.filter(
          ({ event }) => event.zone_type === "no_go",
        ).length,
        ride_penalty_points_lost: ridePenalties.reduce(
          (sum, { event }) => sum + event.points_lost,
          0,
        ),
        parking_violation_count: parkingViolations.length,
        open_parking_violation_count:
          countOpenParkingViolations(parkingViolations),
        reservation_count: reservations.length,
        last_route_started_at: formatUnixTimestamp(lastRouteStartedAt),
        last_poi_visited_at: formatUnixTimestamp(lastPoiVisitedAt),
        last_ride_penalty_at: formatUnixTimestamp(lastRidePenaltyAt),
        last_parking_violation_at: formatUnixTimestamp(lastParkingViolationAt),
        report_errors: bundle.errors
          .map((error) => `${error.scope}: ${error.message}`)
          .join("; "),
      } satisfies CsvRow<(typeof studentSummaryColumns)[number]>;
    });

    downloadReport(
      buildFilename(activeSchoolId, "student-action-summary", dateRange),
      studentSummaryColumns,
      rows,
    );
  }

  function downloadDeviceInventory() {
    if (!dataset) {
      return;
    }

    const rows = dataset.students.flatMap((bundle) =>
      (bundle.profile?.devices ?? []).map((device) => ({
        ...buildIdentityRow(bundle.entry, dataset, dateRange),
        device_uuid: device.registered_device_uuid,
        device_type: device.device_type,
        device_make: device.make,
        device_model: device.model,
        device_nickname: device.nickname,
        device_serial_number: device.serial_number,
        device_color: device.color,
        device_active: device.active,
        device_created_at: formatUnixTimestamp(device.created_at),
        device_updated_at: formatUnixTimestamp(device.updated_at),
      })),
    );

    downloadReport(
      buildFilename(activeSchoolId, "device-inventory", dateRange),
      deviceColumns,
      rows,
    );
  }

  function downloadParkingViolations() {
    if (!dataset) {
      return;
    }

    const rows = dataset.students.flatMap((bundle) =>
      getFilteredParkingViolations(bundle, dateRange).map((violation) => ({
        ...buildIdentityRow(bundle.entry, dataset, dateRange),
        violation_uuid: violation.violation_uuid,
        violation_status: violation.status,
        violation_description: violation.description,
        violation_active: violation.active,
        violation_device_uuid: violation.registered_device_uuid ?? "",
        reported_by_user_uuid: violation.reported_by_user_uuid,
        violation_created_at: formatUnixTimestamp(violation.created_at),
        violation_updated_at: formatUnixTimestamp(violation.updated_at),
      })),
    );

    downloadReport(
      buildFilename(activeSchoolId, "parking-violations", dateRange),
      parkingViolationColumns,
      rows,
    );
  }

  function downloadRidePenalties() {
    if (!dataset) {
      return;
    }

    const rows = dataset.students.flatMap((bundle) =>
      getFilteredPenaltyEvents(bundle, dateRange).map(({ session, event }) => {
        const matchingZone = resolvePenaltyZone(session, dataset.zones, event.zone_uuid);
        const estimatedSpeedMph =
          event.zone_type === "speed_limit"
            ? estimatePenaltySpeedMph(session, event)
            : null;

        return {
          ...buildIdentityRow(bundle.entry, dataset, dateRange),
          session_id: session.session_id,
          trip_mode: session.trip_mode,
          tracking_source: session.tracking_source,
          session_started_at: formatUnixTimestamp(session.started_at),
          zone_uuid: event.zone_uuid,
          zone_title:
            event.title || matchingZone?.title || formatZoneType(event.zone_type),
          zone_type: formatZoneType(event.zone_type),
          reason: event.reason,
          occurred_at: formatUnixTimestamp(event.occurred_at),
          latitude: event.lat,
          longitude: event.lng,
          speed_limit_mph: event.speed_limit_mph ?? "",
          estimated_speed_mph:
            estimatedSpeedMph == null
              ? ""
              : roundCsvNumber(estimatedSpeedMph, 1),
          points_lost: event.points_lost,
          duration_minutes: minutesFromMilliseconds(event.duration_ms),
        };
      }),
    );

    downloadReport(
      buildFilename(activeSchoolId, "ride-penalties", dateRange),
      ridePenaltyColumns,
      rows,
    );
  }

  function downloadPoiVisits() {
    if (!dataset) {
      return;
    }

    const rows = dataset.students.flatMap((bundle) =>
      getFilteredPoiVisits(bundle, dateRange).map(({ session, poi }) => ({
        ...buildIdentityRow(bundle.entry, dataset, dateRange),
        session_id: session.session_id,
        trip_mode: session.trip_mode,
        session_started_at: formatUnixTimestamp(session.started_at),
        poi_uuid: poi.poi_uuid,
        poi_title: poi.title,
        poi_description: poi.description,
        poi_bonus_points: poi.bonus_points,
        visited_at: formatUnixTimestamp(poi.visited_at),
        latitude: poi.lat,
        longitude: poi.lng,
      })),
    );

    downloadReport(
      buildFilename(activeSchoolId, "poi-visits", dateRange),
      poiVisitColumns,
      rows,
    );
  }

  function downloadPoiPerformance() {
    if (!dataset) {
      return;
    }

    const configuredPoiByUUID = new Map(
      dataset.pois.map((poi) => [poi.poi_uuid, poi]),
    );
    const visitStatsByPoi = new Map<
      string,
      {
        poi: StudentRouteHistorySession["visited_pois"][number];
        visitCount: number;
        uniqueStudents: Set<string>;
        bonusPointsAwarded: number;
        firstVisitAt: number;
        lastVisitAt: number;
      }
    >();

    for (const bundle of dataset.students) {
      for (const { poi } of getFilteredPoiVisits(bundle, dateRange)) {
        const current = visitStatsByPoi.get(poi.poi_uuid);
        if (!current) {
          visitStatsByPoi.set(poi.poi_uuid, {
            poi,
            visitCount: 1,
            uniqueStudents: new Set([resolveStudentUserUUID(bundle.entry)]),
            bonusPointsAwarded: poi.bonus_points,
            firstVisitAt: poi.visited_at,
            lastVisitAt: poi.visited_at,
          });
          continue;
        }

        current.visitCount += 1;
        current.uniqueStudents.add(resolveStudentUserUUID(bundle.entry));
        current.bonusPointsAwarded += poi.bonus_points;
        current.firstVisitAt = Math.min(current.firstVisitAt, poi.visited_at);
        current.lastVisitAt = Math.max(current.lastVisitAt, poi.visited_at);
      }
    }

    const allPoiUUIDs = Array.from(
      new Set([...configuredPoiByUUID.keys(), ...visitStatsByPoi.keys()]),
    ).sort((left, right) => {
      const leftTitle =
        configuredPoiByUUID.get(left)?.title ??
        visitStatsByPoi.get(left)?.poi.title ??
        left;
      const rightTitle =
        configuredPoiByUUID.get(right)?.title ??
        visitStatsByPoi.get(right)?.poi.title ??
        right;
      return leftTitle.localeCompare(rightTitle);
    });

    const rows = allPoiUUIDs.map((poiUUID) => {
      const configuredPoi = configuredPoiByUUID.get(poiUUID);
      const visitStats = visitStatsByPoi.get(poiUUID);
      const sourcePoi = configuredPoi ?? visitStats?.poi;

      return {
        report_generated_at: formatUnixTimestamp(dataset.generatedAt),
        report_period_start: dateRange.fromDate,
        report_period_end: dateRange.toDate,
        poi_uuid: poiUUID,
        poi_title: sourcePoi?.title ?? "",
        poi_description: sourcePoi?.description ?? "",
        configured_active: configuredPoi?.active ?? "",
        current_bonus_points: configuredPoi?.bonus_points ?? "",
        latitude: sourcePoi?.lat ?? "",
        longitude: sourcePoi?.lng ?? "",
        visit_count: visitStats?.visitCount ?? 0,
        unique_student_count: visitStats?.uniqueStudents.size ?? 0,
        bonus_points_awarded: visitStats?.bonusPointsAwarded ?? 0,
        first_visit_at: formatUnixTimestamp(visitStats?.firstVisitAt),
        last_visit_at: formatUnixTimestamp(visitStats?.lastVisitAt),
      } satisfies CsvRow<(typeof poiPerformanceColumns)[number]>;
    });

    downloadReport(
      buildFilename(activeSchoolId, "poi-performance", dateRange),
      poiPerformanceColumns,
      rows,
    );
  }

  function downloadRouteSessions() {
    if (!dataset) {
      return;
    }

    const rows = dataset.students.flatMap((bundle) =>
      getFilteredRouteSessions(bundle, dateRange).map((session) => ({
        ...buildIdentityRow(bundle.entry, dataset, dateRange),
        session_id: session.session_id,
        trip_mode: session.trip_mode,
        tracking_source: session.tracking_source,
        started_at: formatUnixTimestamp(session.started_at),
        ended_at: formatUnixTimestamp(session.ended_at),
        distance_miles: milesFromMeters(session.distance_meters),
        duration_minutes: minutesFromSeconds(session.duration_seconds),
        top_speed_mph: mphFromMetersPerSecond(session.top_speed_mps),
        average_speed_mph: mphFromMetersPerSecond(session.average_speed_mps),
        bonus_points: session.bonus_points,
        penalty_points: session.penalty_points,
        net_points: session.bonus_points - session.penalty_points,
        poi_visit_count: session.visited_pois.length,
        ride_penalty_count: session.penalty_events.length,
        route_point_count: session.points.length,
        shared_to_friends: session.shared_to_friends,
      })),
    );

    downloadReport(
      buildFilename(activeSchoolId, "route-sessions", dateRange),
      routeSessionColumns,
      rows,
    );
  }

  function downloadParkingReservations() {
    if (!dataset) {
      return;
    }

    const studentByMembership = buildStudentByMembershipMap(dataset.roster);
    const packByUUID = buildPackByUUIDMap(dataset.packs);
    const rows = getFilteredReservations(dataset.reservations, dateRange).map(
      (reservation) => {
        const entry = reservation.membership_uuid
          ? studentByMembership.get(reservation.membership_uuid.trim())
          : undefined;
        const pack = packByUUID.get(reservation.pack_uuid.trim());
        const fallbackEntry =
          entry ??
          ({
            user: {
              k_guid: reservation.user_uuid,
              first_name: "",
              last_name: "",
              email: "",
              username: "",
              phone: "",
              is_admin: false,
              updated: 0,
            },
            membership: {
              membership_uuid: reservation.membership_uuid ?? "",
              user_uuid: reservation.user_uuid,
              app_id: managedAppId,
              school_id: activeSchoolId,
              campus_id: "",
              student_id: "",
              status: "",
              active: true,
              created_at: 0,
              updated_at: 0,
              terms: [],
            },
          } satisfies SchoolStudentRosterEntry);

        return {
          ...buildIdentityRow(fallbackEntry, dataset, dateRange),
          reservation_uuid: reservation.reservation_uuid,
          reservation_status: reservation.status,
          reservation_kind: reservation.reservation_kind,
          term_uuid: reservation.term_uuid ?? "",
          term_name: reservation.term_name,
          start_time: formatUnixTimestamp(reservation.start_time),
          end_time: formatUnixTimestamp(reservation.end_time),
          approved_at: formatUnixTimestamp(reservation.approved_at),
          approved_by: reservation.approved_by ?? "",
          student_confirmed_at: formatUnixTimestamp(
            reservation.student_confirmed_at,
          ),
          pack_uuid: reservation.pack_uuid,
          pack_name: reservation.pack_name || pack?.name || "",
          spot_uuid: reservation.spot_uuid,
          spot_number: reservation.spot_number ?? "",
          pack_latitude: pack?.location?.lat ?? "",
          pack_longitude: pack?.location?.lng ?? "",
        };
      },
    );

    downloadReport(
      buildFilename(activeSchoolId, "parking-reservations", dateRange),
      reservationColumns,
      rows,
    );
  }

  function downloadSchoolPois() {
    if (!dataset) {
      return;
    }

    const rows = dataset.pois.map((poi) => ({
      report_generated_at: formatUnixTimestamp(dataset.generatedAt),
      poi_uuid: poi.poi_uuid,
      school_id: poi.school_id,
      title: poi.title,
      description: poi.description,
      latitude: poi.lat,
      longitude: poi.lng,
      bonus_points: poi.bonus_points,
      active: poi.active,
      created_at: formatUnixTimestamp(poi.created_at),
      updated_at: formatUnixTimestamp(poi.updated_at),
    }));

    downloadReport(
      buildFilename(activeSchoolId, "school-pois", dateRange),
      schoolPoiColumns,
      rows,
    );
  }

  function downloadSchoolZones() {
    if (!dataset) {
      return;
    }

    const rows = dataset.zones.map((zone) => ({
      report_generated_at: formatUnixTimestamp(dataset.generatedAt),
      zone_uuid: zone.zone_uuid,
      school_id: zone.school_id,
      title: zone.title,
      description: zone.description,
      zone_type: formatZoneType(zone.zone_type),
      speed_limit_mph: zone.speed_limit_mph ?? "",
      active: zone.active,
      point_count: zone.polygon.length,
      polygon: JSON.stringify(zone.polygon),
      created_at: formatUnixTimestamp(zone.created_at),
      updated_at: formatUnixTimestamp(zone.updated_at),
    }));

    downloadReport(
      buildFilename(activeSchoolId, "school-zones", dateRange),
      schoolZoneColumns,
      rows,
    );
  }

  function downloadSchoolPacks() {
    if (!dataset) {
      return;
    }

    const rows = dataset.packs.map((pack) => ({
      report_generated_at: formatUnixTimestamp(dataset.generatedAt),
      pack_uuid: pack.pack_uuid,
      name: pack.name,
      description: pack.description,
      active: pack.active,
      spot_count: pack.spot_count,
      latitude: pack.location?.lat ?? "",
      longitude: pack.location?.lng ?? "",
      campus_id: pack.school_owner?.campus_id ?? "",
      updated_at: formatUnixTimestamp(pack.updated),
    }));

    downloadReport(
      buildFilename(activeSchoolId, "juise-packs", dateRange),
      schoolPackColumns,
      rows,
    );
  }

  function downloadSchoolTerms() {
    if (!dataset) {
      return;
    }

    const rows = dataset.terms.map((term) => ({
      report_generated_at: formatUnixTimestamp(dataset.generatedAt),
      term_uuid: term.term_uuid,
      school_id: term.school_id,
      name: term.name,
      start_date: term.start_date,
      end_date: term.end_date,
      active: term.active,
      created_at: formatUnixTimestamp(term.created_at),
      updated_at: formatUnixTimestamp(term.updated_at),
    }));

    downloadReport(
      buildFilename(activeSchoolId, "school-terms", dateRange),
      schoolTermColumns,
      rows,
    );
  }

  function downloadDataErrors() {
    if (!dataset) {
      return;
    }

    const rows = dataset.errors.map((error) => ({
      ...(error.student
        ? buildIdentityRow(error.student, dataset, dateRange)
        : {
            report_generated_at: formatUnixTimestamp(dataset.generatedAt),
            report_period_start: dateRange.fromDate,
            report_period_end: dateRange.toDate,
          }),
      error_scope: error.scope,
      error_message: error.message,
    }));

    downloadReport(
      buildFilename(activeSchoolId, "report-data-errors", dateRange),
      dataErrorColumns,
      rows,
    );
  }

  const reportCards = [
    {
      title: "Student action summary",
      detail:
        "One row per student with parking violations, ride penalties, POI activity, devices, reservations, and last event dates.",
      count: reportStats?.students ?? 0,
      actionLabel: "Download Summary",
      onDownload: downloadStudentSummary,
    },
    {
      title: "Parking violations",
      detail:
        "One row per reported parking violation with status, description, device link, reporter, and timestamps.",
      count: reportStats?.parkingViolations ?? 0,
      actionLabel: "Download Violations",
      onDownload: downloadParkingViolations,
    },
    {
      title: "Ride penalties",
      detail:
        "Speed-limit and no-go events with student identity, zone, reason, location, points lost, and estimated speed.",
      count: reportStats?.ridePenalties ?? 0,
      actionLabel: "Download Penalties",
      onDownload: downloadRidePenalties,
    },
    {
      title: "POI visits",
      detail:
        "Every student POI visit with visit time, session, coordinates, and bonus points.",
      count: reportStats?.poiVisits ?? 0,
      actionLabel: "Download Visits",
      onDownload: downloadPoiVisits,
    },
    {
      title: "POI performance",
      detail:
        "One row per POI with visit count, unique students, awarded bonus points, and first or last visit.",
      count: reportStats?.poiPerformanceRows ?? 0,
      actionLabel: "Download POI Summary",
      onDownload: downloadPoiPerformance,
    },
    {
      title: "Device inventory",
      detail:
        "Current registered ebikes, bikes, scooters, escooters, skateboards, and other devices by student.",
      count: reportStats?.devices ?? 0,
      actionLabel: "Download Devices",
      onDownload: downloadDeviceInventory,
    },
    {
      title: "Route sessions",
      detail:
        "Trip sessions with distance, duration, top speed, average speed, points, POIs, and penalty counts.",
      count: reportStats?.routeSessions ?? 0,
      actionLabel: "Download Sessions",
      onDownload: downloadRouteSessions,
    },
    {
      title: "Parking reservations",
      detail:
        "Term reservation history with status, student, term, pack, spot, approval, and confirmation timestamps.",
      count: reportStats?.reservations ?? 0,
      actionLabel: "Download Reservations",
      onDownload: downloadParkingReservations,
    },
    {
      title: "School POI setup",
      detail:
        "Configured POI locations and bonus values for map review and governance records.",
      count: dataset?.pois.length ?? 0,
      actionLabel: "Download POIs",
      onDownload: downloadSchoolPois,
    },
    {
      title: "School zone setup",
      detail:
        "Configured no-go and speed-limit zones, speed limits, polygon counts, and polygon coordinates.",
      count: dataset?.zones.length ?? 0,
      actionLabel: "Download Zones",
      onDownload: downloadSchoolZones,
    },
    {
      title: "Juise Pack setup",
      detail:
        "Current pack inventory with spots, activity status, campus, and location coordinates.",
      count: dataset?.packs.length ?? 0,
      actionLabel: "Download Packs",
      onDownload: downloadSchoolPacks,
    },
    {
      title: "School terms",
      detail:
        "Configured academic or parking terms with start and end dates for report period context.",
      count: dataset?.terms.length ?? 0,
      actionLabel: "Download Terms",
      onDownload: downloadSchoolTerms,
    },
    {
      title: "Data load errors",
      detail:
        "Rows for any student or school data that could not be loaded during report generation.",
      count: reportStats?.errors ?? 0,
      actionLabel: "Download Errors",
      onDownload: downloadDataErrors,
    },
  ];

  function handleDownloadAllReports() {
    if (downloadsDisabled) {
      return;
    }

    const files: ReportCsvFile[] = [];
    reportDownloadCollector = files;
    try {
      reportCards.forEach((report) => report.onDownload());
    } finally {
      reportDownloadCollector = null;
    }

    if (files.length === 0) {
      return;
    }

    downloadBlob(buildZipFilename(activeSchoolId, dateRange), createZipBlob(files));
  }

  return (
    <section className="panel reports-section">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Downloadable school data</h2>
        </div>
        <div className="reports-header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={handleDownloadAllReports}
            disabled={downloadsDisabled}
          >
            Download ZIP
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleBuildDataset()}
            disabled={loadState.status === "loading" || !activeSchoolId}
          >
            {loadState.status === "loading" ? "Building..." : "Build Report Data"}
          </button>
        </div>
      </div>

      <div className="reports-filter-bar">
        <label className="field">
          <span>Start date</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span>End date</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        <div className="reports-filter-note">
          <strong>{fromDate || toDate ? "Filtered period" : "All time"}</strong>
          <span>
            Activity reports use event timestamps. Setup and device inventory
            reports use the current school records.
          </span>
        </div>
      </div>

      {dateRangeError ? <p className="error-text">{dateRangeError}</p> : null}
      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {loadState.status !== "idle" ? (
        <div
          className={`reports-status reports-status-${loadState.status}`}
          aria-live="polite"
        >
          <div className="reports-status-copy">
            <strong>{loadState.message}</strong>
            {loadState.total > 0 ? (
              <span>
                {loadState.completed} of {loadState.total} students processed
              </span>
            ) : null}
          </div>
          {loadState.status === "loading" && loadState.total > 0 ? (
            <div className="reports-progress-track">
              <div
                className="reports-progress-bar"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {reportStats ? (
        <div className="reports-kpi-grid">
          <div className="reports-kpi">
            <span>Students</span>
            <strong>{reportStats.students.toLocaleString()}</strong>
          </div>
          <div className="reports-kpi">
            <span>Ride penalties</span>
            <strong>{reportStats.ridePenalties.toLocaleString()}</strong>
          </div>
          <div className="reports-kpi">
            <span>Parking violations</span>
            <strong>{reportStats.parkingViolations.toLocaleString()}</strong>
          </div>
          <div className="reports-kpi">
            <span>POI visits</span>
            <strong>{reportStats.poiVisits.toLocaleString()}</strong>
          </div>
        </div>
      ) : null}

      <div className="reports-grid">
        {reportCards.map((report) => (
          <article className="reports-card" key={report.title}>
            <div className="reports-card-top">
              <div>
                <h3>{report.title}</h3>
                <p>{report.detail}</p>
              </div>
              <span className="reports-card-count">
                {report.count.toLocaleString()}
              </span>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={report.onDownload}
              disabled={downloadsDisabled}
            >
              {report.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
