import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import "./App.css";
import {
  approveReservation,
  beginMFAEnrollment,
  confirmMFAEnrollment,
  createSchoolChallenge,
  createSchoolPack,
  createSchoolAdminAccount,
  deleteSchoolChallenge,
  downloadAdminPackQrCode,
  downloadAdminPackSpotQrCode,
  DashboardLoginLockedError,
  emitDashboardAudit,
  denyReservation,
  fetchAdminSchoolPacks,
  fetchMySchoolMemberships,
  joinSchool,
  leaveSchool,
  fetchNebulaUser,
  fetchPendingReservations,
  fetchSchoolParkingViolations,
  fetchSchoolParkingIncidentReports,
  fetchSchoolRegisteredDevices,
  fetchSchool,
  fetchSchoolJoinCode,
  fetchSchoolChallengeParticipants,
  fetchSchoolChallenges,
  fetchSchoolPOIs,
  fetchSchools,
  fetchSchoolZones,
  fetchStudentProfile,
  fetchUserMediaAssets,
  generateAdminPackQrCode,
  generateAdminPackSpotQrCode,
  getSessionRefreshExpiryMs,
  loginWithIdentifier,
  verifyMFA,
  refreshDashboardSession,
  saveSchool,
  saveSchoolPOIs,
  saveSchoolZones,
  saveSchoolTerms,
  setApiSession,
  setSessionObserver,
  signSchoolMedia,
  type AdminSession,
  type MFAChallenge,
  type MFAEnrollment,
  type Pack,
  type PackSpot,
  type PackSpotReservation,
  type School,
  type AdminSchoolMembership,
  type SchoolColorScheme,
  type SchoolChallenge,
  type SchoolChallengeCheckpointWriteInput,
  type SchoolChallengeType,
  type SchoolChallengeParticipantProgress,
  type SchoolChallengeWriteInput,
  type SchoolPOI,
  type SchoolZone,
  type SchoolZonePunishmentPolicy,
  type SchoolTerm,
  type RegisteredDevice,
  type StudentProfileBundle,
  type StudentParkingIncidentReport,
  updateSchoolChallenge,
  uploadSchoolChallengeImage,
  uploadSchoolLogoImage,
  type UserMediaAsset,
  type UserSchoolMembership,
  updateSchoolPack,
} from "./lib/api";
import {
  buildDashboardThemeColors,
  defaultSchoolColorScheme,
  hexToRgba,
  juiseColors,
  mixHexColors,
  normalizeSchoolColorScheme,
  resolveHexColor,
} from "./lib/colors";
import {
  type PackMapMarker,
  type PackMapPoint,
} from "./components/PackLocationPicker";
import { type SchoolZoneMapPolygon } from "./components/SchoolZoneMapEditor";
import {
  clearDashboardSession,
  readDashboardContext,
  readDashboardSession,
  writeDashboardContext,
  writeDashboardSession,
  type DashboardContext,
} from "./lib/storage";
import { CampusDevicesScreen } from "./screens/dashboard/CampusDevicesScreen";
import { AuditLogScreen } from "./screens/dashboard/AuditLogScreen";
import { ChallengesScreen } from "./screens/dashboard/ChallengesScreen";
import { DashboardScreen } from "./screens/dashboard/DashboardScreen";
import { BetaInvitesScreen } from "./screens/dashboard/BetaInvitesScreen";
import { StudentLeaderboardScreen } from "./screens/dashboard/StudentLeaderboardScreen";
import { NotificationsScreen } from "./screens/dashboard/NotificationsScreen";
import { PacksScreen } from "./screens/dashboard/PacksScreen";
import { ParkingReportsScreen } from "./screens/dashboard/ParkingReportsScreen";
import { PenaltyReportsScreen } from "./screens/dashboard/PenaltyReportsScreen";
import { PoisScreen } from "./screens/dashboard/PoisScreen";
import { RegistrationFeesScreen } from "./screens/dashboard/RegistrationFeesScreen";
import { ReportsScreen } from "./screens/dashboard/ReportsScreen";
import { StudentRideViolationsScreen } from "./screens/dashboard/StudentRideViolationsScreen";
import { ReservationsScreen } from "./screens/dashboard/ReservationsScreen";
import { SchoolProfileScreen } from "./screens/dashboard/SchoolProfileScreen";
import { StudentVehicleDetailModal } from "./screens/dashboard/StudentVehicleDetailModal";
import { StudentsScreen } from "./screens/dashboard/StudentsScreen";
import { VehicleRegistrationsScreen } from "./screens/dashboard/VehicleRegistrationsScreen";
import { ViolationFeesScreen } from "./screens/dashboard/ViolationFeesScreen";
import { ZonesScreen } from "./screens/dashboard/ZonesScreen";
import { MapOverviewScreen } from "./screens/dashboard/MapOverviewScreen";
import { SightingsMapScreen } from "./screens/dashboard/SightingsMapScreen";
import {
  loadSelectedStudentDetail,
  loadStudentRoster,
  resetSelectedStudentState as resetStudentsSelectionState,
  resetStudentsState,
  selectStudentsState,
  setStudentsScope,
} from "./features/students/studentsSlice";
import { useAppDispatch, useAppSelector } from "./store/hooks";

type Section =
  | "dashboard"
  | "auditLog"
  | "school"
  | "terms"
  | "pois"
  | "zones"
  | "challenges"
  | "challengeGames"
  | "students"
  | "studentLeaderboard"
  | "betaInvites"
  | "notifications"
  | "vehicleRegistrations"
  | "campusDevices"
  | "registrationFees"
  | "penaltyReports"
  | "parkingReports"
  | "studentRideViolations"
  | "violationFees"
  | "reports"
  | "packs"
  | "reservations"
  | "mapOverview"
  | "sightingsMap";
type PackTab = "create" | "existing";
type BannerTone = "success" | "error" | "info";
type AuthMode = "login" | "signup";
const maxSessionExpiryCheckDelayMs = 2_147_483_647;

const dashboardSections: Array<{
  section: Section;
  label: string;
  path: string;
}> = [
  { section: "dashboard", label: "Dashboard", path: "/dashboard" },
  { section: "auditLog", label: "Audit Log", path: "/audit-log" },
  { section: "school", label: "School Profile", path: "/school" },
  { section: "terms", label: "School Terms", path: "/terms" },
  { section: "pois", label: "School POIs", path: "/pois" },
  { section: "zones", label: "School Zones", path: "/zones" },
  { section: "challenges", label: "Ride Challenges", path: "/challenges" },
  {
    section: "challengeGames",
    label: "Challenge Games",
    path: "/challenge-games",
  },
  { section: "students", label: "Students", path: "/students" },
  {
    section: "studentLeaderboard",
    label: "Student Leaderboard",
    path: "/student-leaderboard",
  },
  {
    section: "betaInvites",
    label: "Beta Invites",
    path: "/beta-invites",
  },
  { section: "notifications", label: "Notifications", path: "/notifications" },
  {
    section: "vehicleRegistrations",
    label: "Vehicle Registrations",
    path: "/vehicle-registrations",
  },
  {
    section: "campusDevices",
    label: "Campus Devices",
    path: "/campus-devices",
  },
  {
    section: "registrationFees",
    label: "Registration Fees Setup",
    path: "/registration-fees",
  },
  {
    section: "penaltyReports",
    label: "Penalty Reports",
    path: "/penalty-reports",
  },
  {
    section: "parkingReports",
    label: "Parking Reports",
    path: "/parking-reports",
  },
  {
    section: "studentRideViolations",
    label: "Ride Information",
    path: "/student-ride-violations",
  },
  {
    section: "violationFees",
    label: "Violation Fees",
    path: "/violation-fees",
  },
  { section: "reports", label: "Reports", path: "/reports" },
  { section: "packs", label: "Juise Packs", path: "/packs" },
  { section: "mapOverview", label: "Map Overview", path: "/map-overview" },
  { section: "sightingsMap", label: "Sightings Map", path: "/sightings-map" },
  {
    section: "reservations",
    label: "Pending Reservations",
    path: "/reservations",
  },
];

const sectionPathByName: Record<Section, string> = Object.fromEntries(
  dashboardSections.map(({ section, path }) => [section, path]),
) as Record<Section, string>;

function countOpenParkingIncidentReports(
  reports: StudentParkingIncidentReport[],
): number {
  return reports.filter(
    (report) =>
      report.active !== false &&
      (report.status ?? "submitted").trim().toLowerCase() === "submitted",
  ).length;
}

interface BannerState {
  tone: BannerTone;
  message: string;
}

interface HeaderDashboardCounts {
  studentCount: number | null;
  pendingReservationCount: number | null;
}

interface SchoolDraft {
  school_id: string;
  name: string;
  title: string;
  logo_url: string;
  default_campus_id: string;
  color_scheme: SchoolColorScheme;
  metadata: string;
  active: boolean;
}

interface TermDraft {
  id: string;
  term_uuid: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface POIDraft {
  id: string;
  poi_uuid: string;
  title: string;
  description: string;
  lat: string;
  lng: string;
  radius_feet: string;
  bonus_points: string;
}

interface ZoneDraft {
  id: string;
  zone_uuid: string;
  title: string;
  description: string;
  zone_type: "no_go" | "speed_limit";
  speed_limit_mph: string;
  polygon: PackMapPoint[];
  punishment_policy: SchoolZonePunishmentPolicy;
}

interface SignupFormState {
  school_id: string;
  join_code: string;
  first: string;
  last: string;
  username: string;
  email: string;
  phone: string;
  password: string;
}

interface PackDraft {
  name: string;
  description: string;
  number_of_spots: string;
  campus_id: string;
  lat: string;
  lng: string;
}

interface PackEditDraft {
  name: string;
  description: string;
  lat: string;
  lng: string;
}

interface ChallengeCheckpointDraft {
  checkpoint_uuid: string;
  title: string;
  description: string;
  clue: string;
  image_url: string;
  latitude: string;
  longitude: string;
  radius_meters: string;
  prize_points: string;
  sort_order: string;
  active: boolean;
}

interface ChallengeDraft {
  challenge_uuid: string;
  challenge_type: SchoolChallengeType;
  audience_type: "user" | "campaign_group";
  title: string;
  description: string;
  image_url: string;
  metric_type: "distance_miles" | "points";
  target_value: string;
  min_accuracy_meters: string;
  required_dwell_seconds: string;
  grand_prize_points: string;
  checkpoints: ChallengeCheckpointDraft[];
  start_time: string;
  end_time: string;
  active: boolean;
  repeat_enabled: boolean;
  repeat_interval_value: string;
  repeat_interval_unit: "days" | "weeks";
  repeat_count: string;
}

type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;
type StudentDevicePhotoMap = Record<string, string>;
const newChallengeSelectionId = "__new_challenge__";

const authAppId =
  import.meta.env.VITE_AUTH_APP_ID ?? "juise_rider_admin_dashboard";
const loginLockStorageKey = "juise-dashboard-login-lock";

interface StoredLoginLock {
  identifier: string;
  blockedUntil: string;
}

function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function readStoredLoginLock(): StoredLoginLock | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(loginLockStorageKey) ?? "null",
    ) as StoredLoginLock | null;
    if (
      parsed?.identifier &&
      Number.isFinite(Date.parse(parsed.blockedUntil)) &&
      Date.parse(parsed.blockedUntil) > Date.now()
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed local state.
  }
  localStorage.removeItem(loginLockStorageKey);
  return null;
}

function formatLoginLockCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
const defaultManagedAppId =
  import.meta.env.VITE_DEFAULT_MANAGED_APP_ID ?? "juise-customer-app";
const schoolColorHexPattern = /^#(?:[0-9a-fA-F]{6})$/;
const schoolColorFields: Array<{
  key: keyof SchoolColorScheme;
  label: string;
  fallback: string;
}> = [
  {
    key: "primary",
    label: "Primary",
    fallback: defaultSchoolColorScheme.primary,
  },
  {
    key: "secondary",
    label: "Secondary",
    fallback: defaultSchoolColorScheme.secondary,
  },
  { key: "accent", label: "Accent", fallback: defaultSchoolColorScheme.accent },
  {
    key: "background",
    label: "Background",
    fallback: defaultSchoolColorScheme.background,
  },
  { key: "text", label: "Text", fallback: defaultSchoolColorScheme.text },
];
type CssVariableStyle = CSSProperties & Record<string, string>;

function makeDraftId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function prettyJson(
  value: Record<string, unknown> | Record<string, string> | undefined,
): string {
  if (!value || Object.keys(value).length === 0) {
    return "{}";
  }

  return JSON.stringify(value, null, 2);
}

function getColorPickerValue(
  value: string | undefined,
  fallback: keyof typeof defaultSchoolColorScheme,
): string {
  return resolveHexColor(value, defaultSchoolColorScheme[fallback]);
}

function isSignedMediaObjectKey(value: string | undefined): boolean {
  return (value?.trim() ?? "").startsWith("accounts/");
}

function createEmptySchoolDraft(): SchoolDraft {
  return {
    school_id: "",
    name: "",
    title: "",
    logo_url: "",
    default_campus_id: "",
    color_scheme: normalizeSchoolColorScheme(),
    metadata: "{}",
    active: true,
  };
}

function schoolToDraft(school: School): SchoolDraft {
  return {
    school_id: school.school_id,
    name: school.name,
    title: school.title,
    logo_url: school.logo_url,
    default_campus_id: school.default_campus_id,
    color_scheme: normalizeSchoolColorScheme(school.color_scheme),
    metadata: prettyJson(school.metadata),
    active: school.active,
  };
}

function termToDraft(term: SchoolTerm): TermDraft {
  return {
    id: term.term_uuid || makeDraftId(),
    term_uuid: term.term_uuid,
    name: term.name,
    start_date: term.start_date,
    end_date: term.end_date,
  };
}

function createEmptyTermDraft(): TermDraft {
  return {
    id: makeDraftId(),
    term_uuid: "",
    name: "",
    start_date: "",
    end_date: "",
  };
}

function poiToDraft(poi: SchoolPOI): POIDraft {
  return {
    id: poi.poi_uuid || makeDraftId(),
    poi_uuid: poi.poi_uuid,
    title: poi.title,
    description: poi.description,
    lat: formatCoordinateValue(poi.lat),
    lng: formatCoordinateValue(poi.lng),
    radius_feet: String(Math.round((poi.radius_meters ?? 75) * 3.28084)),
    bonus_points: String(poi.bonus_points),
  };
}

function createEmptyPOIDraft(): POIDraft {
  return {
    id: makeDraftId(),
    poi_uuid: "",
    title: "",
    description: "",
    lat: "",
    lng: "",
    radius_feet: "250",
    bonus_points: "0",
  };
}

function createDefaultZonePunishmentPolicy(): SchoolZonePunishmentPolicy {
  return {
    rules: [
      {
        min_count: 1,
        max_count: 1,
        points_lost: 0,
        notify_student: true,
        dashboard_review_required: false,
        punishment_action: "warning",
      },
      {
        min_count: 2,
        max_count: 2,
        points_lost: 5,
        notify_student: true,
        dashboard_review_required: false,
        punishment_action: "points",
      },
      {
        min_count: 3,
        max_count: null,
        points_lost: 5,
        notify_student: true,
        dashboard_review_required: true,
        punishment_action: "admin_review",
      },
    ],
  };
}

function zoneToDraft(zone: SchoolZone): ZoneDraft {
  return {
    id: zone.zone_uuid || makeDraftId(),
    zone_uuid: zone.zone_uuid,
    title: zone.title,
    description: zone.description,
    zone_type: zone.zone_type,
    speed_limit_mph:
      typeof zone.speed_limit_mph === "number"
        ? String(zone.speed_limit_mph)
        : "",
    polygon: Array.isArray(zone.polygon)
      ? zone.polygon
          .filter(
            (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
          )
          .map((point) => ({
            lat: point.lat,
            lng: point.lng,
          }))
      : [],
    punishment_policy:
      zone.punishment_policy ?? createDefaultZonePunishmentPolicy(),
  };
}

function createEmptyZoneDraft(
  zoneType: ZoneDraft["zone_type"] = "no_go",
): ZoneDraft {
  return {
    id: makeDraftId(),
    zone_uuid: "",
    title: "",
    description: "",
    zone_type: zoneType,
    speed_limit_mph: zoneType === "speed_limit" ? "15" : "",
    polygon: [],
    punishment_policy: createDefaultZonePunishmentPolicy(),
  };
}

function createEmptyPackDraft(defaultCampusId = ""): PackDraft {
  return {
    name: "",
    description: "",
    number_of_spots: "8",
    campus_id: defaultCampusId,
    lat: "",
    lng: "",
  };
}

function packToEditDraft(pack: Pack): PackEditDraft {
  return {
    name: pack.name ?? "",
    description: pack.description ?? "",
    lat: pack.location ? formatCoordinateValue(pack.location.lat) : "",
    lng: pack.location ? formatCoordinateValue(pack.location.lng) : "",
  };
}

function formatDateTimeLocalValue(value?: number): string {
  if (!value || value <= 0) {
    return "";
  }

  const date = new Date(value * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeChallengeType(
  challengeType?: SchoolChallenge["challenge_type"],
): SchoolChallengeType {
  return challengeType === "scavenger_hunt" ? "scavenger_hunt" : "route_metric";
}

function isScavengerHuntChallengeRecord(
  challenge: Pick<SchoolChallenge, "challenge_type">,
): boolean {
  return normalizeChallengeType(challenge.challenge_type) === "scavenger_hunt";
}

function isChallengeManagementSection(section: Section): boolean {
  return section === "challenges" || section === "challengeGames";
}
function getScavengerHuntMinAccuracy(
  challenge: Pick<SchoolChallenge, "game_config">,
): string {
  const value = challenge.game_config?.min_accuracy_meters;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "50";
}

function getScavengerHuntRequiredDwellSeconds(
  challenge: Pick<SchoolChallenge, "game_config">,
): string {
  const value = challenge.game_config?.required_dwell_seconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "30";
}

function getScavengerHuntGrandPrizePoints(
  challenge: Pick<SchoolChallenge, "game_config">,
): string {
  const value = challenge.game_config?.grand_prize_points;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(value)
    : "0";
}

function checkpointToDraft(
  checkpoint: NonNullable<SchoolChallenge["checkpoints"]>[number],
  index: number,
): ChallengeCheckpointDraft {
  return {
    checkpoint_uuid: checkpoint.checkpoint_uuid,
    title: checkpoint.title,
    description: checkpoint.description,
    clue: checkpoint.clue,
    image_url: checkpoint.image_url,
    latitude: String(checkpoint.latitude),
    longitude: String(checkpoint.longitude),
    radius_meters: String(checkpoint.radius_meters),
    prize_points: String(checkpoint.prize_points),
    sort_order: String(checkpoint.sort_order || index + 1),
    active: checkpoint.active,
  };
}

function createEmptyChallengeCheckpointDraft(
  sortOrder = 1,
): ChallengeCheckpointDraft {
  return {
    checkpoint_uuid: "",
    title: "",
    description: "",
    clue: "",
    image_url: "",
    latitude: "",
    longitude: "",
    radius_meters: "50",
    prize_points: "0",
    sort_order: String(sortOrder),
    active: true,
  };
}

function checkpointDraftToWriteInput(
  checkpoint: ChallengeCheckpointDraft,
  index: number,
): SchoolChallengeCheckpointWriteInput {
  const title = checkpoint.title.trim();
  if (!title) {
    throw new Error(`Stop ${index + 1} needs a title.`);
  }

  const latitude = Number(checkpoint.latitude.trim());
  const longitude = Number(checkpoint.longitude.trim());
  const radiusMeters = Number(checkpoint.radius_meters.trim());
  const prizePoints = Number.parseInt(
    checkpoint.prize_points.trim() || "0",
    10,
  );
  const sortOrder = Number.parseInt(
    checkpoint.sort_order.trim() || String(index + 1),
    10,
  );

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`Stop ${index + 1} needs a valid latitude.`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`Stop ${index + 1} needs a valid longitude.`);
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new Error(`Stop ${index + 1} needs a radius greater than 0 meters.`);
  }
  if (!Number.isFinite(prizePoints) || prizePoints < 0) {
    throw new Error(`Stop ${index + 1} prize points must be 0 or more.`);
  }
  if (!Number.isFinite(sortOrder) || sortOrder <= 0) {
    throw new Error(`Stop ${index + 1} order must be greater than 0.`);
  }

  return {
    checkpoint_uuid: checkpoint.checkpoint_uuid || undefined,
    title,
    description: checkpoint.description.trim(),
    clue: checkpoint.clue.trim(),
    image_url: checkpoint.image_url.trim(),
    latitude,
    longitude,
    radius_meters: radiusMeters,
    prize_points: prizePoints,
    sort_order: sortOrder,
    active: checkpoint.active,
  };
}

function createEmptyChallengeDraft(): ChallengeDraft {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  end.setHours(23, 59, 0, 0);

  return {
    challenge_uuid: "",
    challenge_type: "route_metric",
    audience_type: "user",
    title: "",
    description: "",
    image_url: "",
    metric_type: "distance_miles",
    target_value: "10",
    min_accuracy_meters: "50",
    required_dwell_seconds: "30",
    grand_prize_points: "0",
    checkpoints: [],
    start_time: formatDateTimeLocalValue(Math.floor(start.getTime() / 1000)),
    end_time: formatDateTimeLocalValue(Math.floor(end.getTime() / 1000)),
    active: true,
    repeat_enabled: false,
    repeat_interval_value: "",
    repeat_interval_unit: "weeks",
    repeat_count: "",
  };
}

function createEmptyScavengerHuntDraft(): ChallengeDraft {
  return {
    ...createEmptyChallengeDraft(),
    challenge_type: "scavenger_hunt",
    audience_type: "user",
    metric_type: "points",
    target_value: "1",
    min_accuracy_meters: "50",
    required_dwell_seconds: "30",
    grand_prize_points: "0",
    repeat_enabled: false,
    checkpoints: [createEmptyChallengeCheckpointDraft(1)],
  };
}

function challengeToDraft(challenge: SchoolChallenge): ChallengeDraft {
  const challengeType = normalizeChallengeType(challenge.challenge_type);
  const checkpoints = (challenge.checkpoints ?? [])
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(checkpointToDraft);

  return {
    challenge_uuid: challenge.challenge_uuid,
    challenge_type: challengeType,
    audience_type:
      challengeType === "scavenger_hunt" ? "user" : challenge.audience_type,
    title: challenge.title,
    description: challenge.description,
    image_url: challenge.image_url,
    metric_type:
      challengeType === "scavenger_hunt" ? "points" : challenge.metric_type,
    target_value:
      challengeType === "scavenger_hunt"
        ? String(
            checkpoints.filter((checkpoint) => checkpoint.active).length ||
              challenge.target_value,
          )
        : String(challenge.target_value),
    min_accuracy_meters: getScavengerHuntMinAccuracy(challenge),
    required_dwell_seconds: getScavengerHuntRequiredDwellSeconds(challenge),
    grand_prize_points: getScavengerHuntGrandPrizePoints(challenge),
    checkpoints,
    start_time: formatDateTimeLocalValue(challenge.start_time),
    end_time: formatDateTimeLocalValue(challenge.end_time),
    active: challenge.active,
    repeat_enabled: false,
    repeat_interval_value: "",
    repeat_interval_unit: "weeks",
    repeat_count: "",
  };
}

function challengeToResubmitDraft(challenge: SchoolChallenge): ChallengeDraft {
  const now = Math.floor(Date.now() / 1000);
  const durationSeconds = Math.max(
    60 * 60,
    challenge.end_time - challenge.start_time,
  );

  return {
    ...challengeToDraft(challenge),
    challenge_uuid: "",
    checkpoints: (challenge.checkpoints ?? [])
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((checkpoint, index) => ({
        ...checkpointToDraft(checkpoint, index),
        checkpoint_uuid: "",
      })),
    start_time: formatDateTimeLocalValue(now),
    end_time: formatDateTimeLocalValue(now + durationSeconds),
    active: true,
  };
}

function getCreatedChallenges(
  response:
    | SchoolChallenge
    | { challenge: SchoolChallenge; repeated_challenges?: SchoolChallenge[] },
): SchoolChallenge[] {
  if ("challenge" in response) {
    return [response.challenge, ...(response.repeated_challenges ?? [])];
  }

  return [response];
}

function formatCoordinateValue(value: number): string {
  return value.toFixed(6);
}

function getPackPhotoUrl(pack: Pick<Pack, "photo"> | null | undefined): string {
  return pack?.photo?.path_do_spaces?.trim() ?? "";
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Unable to preview the selected image."));
    };
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to preview the selected image."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function parseCoordinateInput(value: string, label: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return parsed;
}

function parsePOIRadiusFeet(value: string, label: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }
  if (parsed < 25 || parsed > 16400) {
    throw new Error(`${label} must be between 25 ft and 16,400 ft.`);
  }
  return parsed;
}

function feetToMeters(feet: number) {
  return feet / 3.28084;
}

function parseDateTimeLocalInput(value: string, label: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  const parsed = new Date(trimmed).getTime();
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid date and time.`);
  }

  return Math.floor(parsed / 1000);
}

function parseObjectJson(
  source: string,
  label: string,
): Record<string, unknown> {
  const trimmed = source.trim();
  if (trimmed === "") {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function sanitizeSchoolColorScheme(
  colorScheme: SchoolColorScheme,
): SchoolColorScheme {
  const nextColorScheme: SchoolColorScheme = {};

  for (const field of schoolColorFields) {
    const rawValue = colorScheme[field.key]?.trim() ?? "";
    if (!rawValue) {
      continue;
    }
    if (!schoolColorHexPattern.test(rawValue)) {
      throw new Error(`${field.label} color must use #RRGGBB hex format.`);
    }
    nextColorScheme[field.key] = rawValue.toLowerCase();
  }

  return nextColorScheme;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

// Matches global-auth-service's two "this mfa_token can never succeed again"
// error strings (expired/malformed JWT, and the per-challenge 5-attempt
// cap) - distinct from a plain wrong-code rejection, which is retryable
// against the same challenge.
const deadMfaChallengePattern =
  /MFA challenge (is invalid or expired|has expired or has too many attempts)/i;

function isDeadMfaChallengeError(error: unknown): boolean {
  return error instanceof Error && deadMfaChallengePattern.test(error.message);
}

async function copyTextToClipboard(value: string): Promise<void> {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error("Nothing to copy.");
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedValue);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable in this browser.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = normalizedValue;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const didCopy = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!didCopy) {
    throw new Error("Clipboard copy failed.");
  }
}

function triggerFileDownload(file: Blob, filename: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resolveMediaObjectKey(
  asset?: Pick<UserMediaAsset, "object_key">,
): string {
  return asset?.object_key?.trim() ?? "";
}

function resolveStudentPhotoObjectKey(
  membership: UserSchoolMembership,
  photoKeysByMembership: StudentRosterPhotoKeyMap,
  slot: StudentIdPhotoSlot,
): string {
  if (slot === "front") {
    return (
      resolveMediaObjectKey(membership.front_photo) ||
      resolveMediaObjectKey(membership.photo) ||
      photoKeysByMembership[membership.membership_uuid]?.front?.trim() ||
      ""
    );
  }

  return (
    resolveMediaObjectKey(membership.back_photo) ||
    photoKeysByMembership[membership.membership_uuid]?.back?.trim() ||
    ""
  );
}

function resolveRegisteredDevicePhotoObjectKey(
  assets: UserMediaAsset[],
): string {
  const slotPriority: Record<string, number> = {
    photo: 0,
    overview: 1,
    logo: 2,
  };

  return (
    [...assets]
      .filter((asset) => asset.object_key?.trim())
      .sort((left, right) => {
        const leftRank = slotPriority[left.slot?.trim() ?? ""] ?? 99;
        const rightRank = slotPriority[right.slot?.trim() ?? ""] ?? 99;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        if (left.updated_at !== right.updated_at) {
          return right.updated_at - left.updated_at;
        }
        return right.created_at - left.created_at;
      })[0]
      ?.object_key?.trim() ?? ""
  );
}

async function resolveStudentDevicePhotoUrls(
  managedAppId: string,
  schoolId: string,
  userUUID: string,
  devices: RegisteredDevice[],
): Promise<StudentDevicePhotoMap> {
  if (!schoolId || !userUUID || devices.length === 0) {
    return {};
  }

  const devicePhotoEntries = (
    await Promise.allSettled(
      devices.map(async (device) => {
        const assets = await fetchUserMediaAssets(
          managedAppId,
          device.user_uuid || userUUID,
          "registered_device",
          device.registered_device_uuid,
        );
        const objectKey = resolveRegisteredDevicePhotoObjectKey(assets);
        if (!objectKey) {
          return null;
        }

        return {
          registeredDeviceUUID: device.registered_device_uuid,
          objectKey,
        };
      }),
    )
  ).flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );

  if (devicePhotoEntries.length === 0) {
    return {};
  }

  const signedUrls = await signSchoolMedia(
    schoolId,
    devicePhotoEntries.map((entry) => entry.objectKey),
  ).catch(() => ({}) as Record<string, string>);

  return Object.fromEntries(
    devicePhotoEntries.flatMap((entry) => {
      const signedUrl = signedUrls[entry.objectKey] ?? "";
      return signedUrl ? [[entry.registeredDeviceUUID, signedUrl]] : [];
    }),
  );
}

function formatUnixTimestamp(value?: number): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value * 1000));
}

function formatDateOnly(value: string): string {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatDateTimeForDisplay(value?: number): string {
  if (!value) {
    return "Not set";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value * 1000));
  } catch {
    return formatUnixTimestamp(value);
  }
}

function formatChallengeMetricValue(
  metricType: ChallengeDraft["metric_type"],
  value: number,
): string {
  if (!Number.isFinite(value)) {
    return metricType === "points" ? "0 pts" : "0 mi";
  }

  if (metricType === "points") {
    const rounded = Math.round(value);
    return `${rounded} pt${rounded === 1 ? "" : "s"}`;
  }

  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} mi`;
}

function resolveChallengeStatus(challenge: SchoolChallenge): string {
  const now = Math.floor(Date.now() / 1000);
  if (now < challenge.start_time) {
    return "Upcoming";
  }
  if (now > challenge.end_time) {
    return "Ended";
  }
  return "Live";
}

function sortChallengesForDisplay(
  challenges: SchoolChallenge[],
): SchoolChallenge[] {
  return [...challenges].sort((left, right) => {
    const leftStatus = resolveChallengeStatus(left);
    const rightStatus = resolveChallengeStatus(right);
    const statusRank = (status: string) =>
      status === "Live" ? 0 : status === "Upcoming" ? 1 : 2;

    if (statusRank(leftStatus) !== statusRank(rightStatus)) {
      return statusRank(leftStatus) - statusRank(rightStatus);
    }

    if (leftStatus === "Upcoming" && left.start_time !== right.start_time) {
      return left.start_time - right.start_time;
    }
    if (leftStatus === "Ended" && left.end_time !== right.end_time) {
      return right.end_time - left.end_time;
    }
    if (left.start_time !== right.start_time) {
      return left.start_time - right.start_time;
    }
    return left.title.localeCompare(right.title);
  });
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function UuidCopyField(props: {
  label: string;
  value?: string;
  onCopy: (label: string, value: string) => void | Promise<void>;
}) {
  const normalizedValue = props.value?.trim() ?? "";

  return (
    <div className="uuid-copy-card">
      <span className="uuid-copy-label">{props.label}</span>
      {normalizedValue ? (
        <div className="uuid-copy-row">
          <code className="uuid-copy-value" title={normalizedValue}>
            {normalizedValue}
          </code>
          <button
            className="secondary-button uuid-copy-button"
            type="button"
            aria-label={`Copy ${props.label}`}
            onClick={() => void props.onCopy(props.label, normalizedValue)}
          >
            Copy
          </button>
        </div>
      ) : (
        <strong className="uuid-copy-empty">Not set</strong>
      )}
    </div>
  );
}

function buildSchoolMonogram(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return "JS";
  }

  const parts = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return normalized.slice(0, 2).toUpperCase();
}

function SchoolLogoPreview(props: {
  logoUrl?: string;
  label: string;
  size?: "header" | "field" | "tiny";
  onPreview?: (imageUrl: string, alt: string, label?: string) => void;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const normalizedUrl = props.logoUrl?.trim() ?? "";
  const showImage = normalizedUrl !== "" && !hasImageError;
  const monogram = buildSchoolMonogram(props.label);
  const alt = `${props.label} logo`;

  return (
    <div className={`school-logo school-logo-${props.size ?? "field"}`}>
      {showImage ? (
        <div
          className="image-preview-trigger"
          role={props.onPreview ? "button" : undefined}
          tabIndex={props.onPreview ? 0 : undefined}
          onClick={() => props.onPreview?.(normalizedUrl, alt, props.label)}
          onKeyDown={(event) => {
            if (!props.onPreview) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              props.onPreview(normalizedUrl, alt, props.label);
            }
          }}
        >
          <img
            className="school-logo-image"
            src={normalizedUrl}
            alt={alt}
            onError={() => setHasImageError(true)}
          />
        </div>
      ) : (
        <div className="school-logo-fallback" aria-hidden="true">
          {monogram}
        </div>
      )}
    </div>
  );
}

function EntityImagePreview(props: {
  imageUrl?: string;
  label: string;
  altSuffix?: string;
  fallbackLabel?: string;
  onPreview?: (imageUrl: string, alt: string, label?: string) => void;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const normalizedUrl = props.imageUrl?.trim() ?? "";
  const showImage = normalizedUrl !== "" && failedImageUrl !== normalizedUrl;
  const alt = `${props.label} ${props.altSuffix ?? "image"}`;

  return (
    <div className="challenge-image-preview">
      {showImage ? (
        <div
          className="image-preview-trigger"
          role={props.onPreview ? "button" : undefined}
          tabIndex={props.onPreview ? 0 : undefined}
          onClick={() => props.onPreview?.(normalizedUrl, alt, props.label)}
          onKeyDown={(event) => {
            if (!props.onPreview) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              props.onPreview(normalizedUrl, alt, props.label);
            }
          }}
        >
          <img
            className="challenge-image-preview-image"
            src={normalizedUrl}
            alt={alt}
            onError={() => setFailedImageUrl(normalizedUrl)}
          />
        </div>
      ) : (
        <div className="challenge-image-preview-fallback" aria-hidden="true">
          {props.fallbackLabel ?? "Image preview"}
        </div>
      )}
    </div>
  );
}

function formatAdminIdentity(session: AdminSession): string {
  const firstName = session.user?.first_name?.trim() ?? "";
  const lastName = session.user?.last_name?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return fullName;
  }
  return session.claims.user_uuid || "Admin";
}

function formatNebulaUserName(profile: {
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
}): string {
  const fullName =
    `${profile.first_name?.trim() ?? ""} ${profile.last_name?.trim() ?? ""}`.trim();
  if (fullName) {
    return fullName;
  }
  if (profile.username?.trim()) {
    return profile.username.trim();
  }
  if (profile.email?.trim()) {
    return profile.email.trim();
  }
  return "Unnamed student";
}

function sortPacksForDisplay(packs: Pack[]): Pack[] {
  return [...packs].sort((left, right) => {
    const leftName = left.name.trim().toLowerCase();
    const rightName = right.name.trim().toLowerCase();
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName);
    }
    return left.pack_uuid.localeCompare(right.pack_uuid);
  });
}

function sortPOIsForDisplay(pois: SchoolPOI[]): SchoolPOI[] {
  return [...pois].sort((left, right) => {
    const leftTitle = left.title.trim().toLowerCase();
    const rightTitle = right.title.trim().toLowerCase();
    if (leftTitle !== rightTitle) {
      return leftTitle.localeCompare(rightTitle);
    }
    return left.poi_uuid.localeCompare(right.poi_uuid);
  });
}

function sortZonesForDisplay(zones: SchoolZone[]): SchoolZone[] {
  return [...zones].sort((left, right) => {
    if (left.zone_type !== right.zone_type) {
      return left.zone_type.localeCompare(right.zone_type);
    }

    const leftTitle = left.title.trim().toLowerCase();
    const rightTitle = right.title.trim().toLowerCase();
    if (leftTitle !== rightTitle) {
      return leftTitle.localeCompare(rightTitle);
    }
    return left.zone_uuid.localeCompare(right.zone_uuid);
  });
}

function normalizeDashboardPath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return pathname || "/";
  }

  return pathname.replace(/\/+$/, "");
}

function resolveSectionFromPathname(pathname: string): Section | null {
  const normalizedPath = normalizeDashboardPath(pathname);
  const matchingSection = dashboardSections.find(
    ({ path }) => path === normalizedPath,
  );
  return matchingSection?.section ?? null;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openNavGroups, setOpenNavGroups] = useState({
    campusSetup: true,
    juisePacks: true,
    campusInfo: true,
    parkingEnforcement: true,
    vehicleRegistrations: true,
    penaltyReports: true,
    vehicles: true,
  });
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("sidebarOpen") !== "false",
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("sidebarWidth");
    return saved ? Math.max(180, Math.min(480, Number(saved))) : 260;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [initialSession] = useState<AdminSession | null>(() =>
    readDashboardSession(),
  );
  const [session, setSession] = useState<AdminSession | null>(null);
  // A background refresh (from an earlier failed request) can still be
  // in flight when the user explicitly logs out or their session expires.
  // If it resolves afterward, the session observer would otherwise revive
  // the session right after it was cleared. This guard makes any deliberate
  // "the session is ending" action ignore observer-driven revivals until
  // the next deliberate login/signup/MFA success explicitly clears it.
  const sessionEndedGuardRef = useRef(false);
  const [authInitializing, setAuthInitializing] = useState(
    () => initialSession !== null,
  );
  const [schoolMemberships, setSchoolMemberships] = useState<
    AdminSchoolMembership[]
  >([]);
  const [schoolMembershipsLoading, setSchoolMembershipsLoading] =
    useState(false);
  const [schoolMembershipsError, setSchoolMembershipsError] = useState<
    string | null
  >(null);
  const [membershipsResolved, setMembershipsResolved] = useState(false);
  const [membershipsReloadKey, setMembershipsReloadKey] = useState(0);
  // Mirrors the membership-lookup lifecycle synchronously so async handlers
  // (handleJoinSchool / confirmLeaveSchool) can check it *after* their await
  // rather than reading a stale closure snapshot. `loadedOk` is true only
  // after a lookup has *succeeded* at least once (not merely settled).
  const membershipsLookupRef = useRef<{ inFlight: boolean; loadedOk: boolean }>({
    inFlight: false,
    loadedOk: false,
  });
  // school_ids joined during this session. A membership lookup that raced the
  // join (or ran before the write replicated) can come back without them; we
  // keep those rows and don't treat the selection as "revoked".
  const sessionJoinedSchoolIdsRef = useRef<Set<string>>(new Set());
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<string>(() => {
    try {
      return localStorage.getItem("selectedSchoolId") ?? "";
    } catch {
      return "";
    }
  });
  const setSelectedSchoolId = (schoolId: string) => {
    setSelectedSchoolIdState(schoolId);
    setViewJoinCode(null);
    try {
      if (schoolId) {
        localStorage.setItem("selectedSchoolId", schoolId);
      } else {
        localStorage.removeItem("selectedSchoolId");
      }
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  };
  const [pickerSchools, setPickerSchools] = useState<School[]>([]);
  const [joinSchoolMode, setJoinSchoolMode] = useState<"existing" | "new">(
    "existing",
  );
  const [joinSchoolId, setJoinSchoolId] = useState("");
  const [joinSchoolCode, setJoinSchoolCode] = useState("");
  const [joinNewSchoolName, setJoinNewSchoolName] = useState("");
  const [joinSchoolBusy, setJoinSchoolBusy] = useState(false);
  const [joinSchoolError, setJoinSchoolError] = useState("");
  const [viewJoinCode, setViewJoinCode] = useState<string | null>(null);
  const [viewJoinCodeBusy, setViewJoinCodeBusy] = useState(false);
  const [leavingMembershipUuid, setLeavingMembershipUuid] = useState<
    string | null
  >(null);
  const [pendingLeaveMembership, setPendingLeaveMembership] =
    useState<AdminSchoolMembership | null>(null);
  const [context] = useState<DashboardContext>(() =>
    readDashboardContext(defaultManagedAppId),
  );
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [initialLoginLock] = useState<StoredLoginLock | null>(() =>
    readStoredLoginLock(),
  );
  const [identifier, setIdentifier] = useState(
    () => initialLoginLock?.identifier ?? "",
  );
  const [loginLock, setLoginLock] = useState<StoredLoginLock | null>(
    initialLoginLock,
  );
  const [loginClockMs, setLoginClockMs] = useState(() => Date.now());
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<MFAChallenge | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState<MFAEnrollment | null>(
    null,
  );
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaCopied, setMfaCopied] = useState<"" | "secret" | "codes" | "uri">(
    "",
  );

  const copyMfaText = async (
    text: string,
    kind: "secret" | "codes" | "uri",
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setMfaCopied(kind);
      window.setTimeout(() => {
        setMfaCopied((current) => (current === kind ? "" : current));
      }, 2000);
    } catch {
      setMfaCopied("");
    }
  };

  const downloadRecoveryCodes = (codes: string[]) => {
    const content = [
      "Juise Rider Admin Dashboard — MFA recovery codes",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Each code can be used once if you lose access to Google Authenticator.",
      "",
      ...codes,
      "",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "juise-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const [signupForm, setSignupForm] = useState<SignupFormState>({
    school_id: "",
    join_code: "",
    first: "",
    last: "",
    username: "",
    email: "",
    phone: "",
    password: "",
  });

  useEffect(() => {
    if (!loginLock) return;
    const updateClock = () => {
      const now = Date.now();
      setLoginClockMs(now);
      if (Date.parse(loginLock.blockedUntil) <= now) {
        setLoginLock(null);
        localStorage.removeItem(loginLockStorageKey);
      }
    };
    const timer = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(timer);
  }, [loginLock]);

  const loginLockSeconds = loginLock
    ? Math.max(
        0,
        Math.ceil((Date.parse(loginLock.blockedUntil) - loginClockMs) / 1_000),
      )
    : 0;
  const loginIsLocked = loginLockSeconds > 0;

  const [schoolBusy, setSchoolBusy] = useState(false);
  const [schoolLogoUploadBusy, setSchoolLogoUploadBusy] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState<SchoolDraft>(() =>
    createEmptySchoolDraft(),
  );
  const [resolvedSchoolLogoUrl, setResolvedSchoolLogoUrl] = useState("");
  const [termDrafts, setTermDrafts] = useState<TermDraft[]>([]);
  const [poiDrafts, setPoiDrafts] = useState<POIDraft[]>([]);
  const [poiBusy, setPoiBusy] = useState(false);
  const [activePoiDraftId, setActivePoiDraftId] = useState("");
  const [poiEditRequestId, setPoiEditRequestId] = useState("");
  const [zoneDrafts, setZoneDrafts] = useState<ZoneDraft[]>([]);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [activeZoneDraftId, setActiveZoneDraftId] = useState("");
  const [zoneEditRequestId, setZoneEditRequestId] = useState("");
  // Stable references: ZonesScreen/PoisScreen's edit-request effects depend
  // on these, and a fresh arrow function every render would make those
  // effects re-run (and re-apply a stale/already-handled edit request) on
  // every unrelated App.tsx render, not just when the request id itself
  // changes.
  const handleZoneEditRequestHandled = useCallback(
    () => setZoneEditRequestId(""),
    [],
  );
  const handlePoiEditRequestHandled = useCallback(
    () => setPoiEditRequestId(""),
    [],
  );
  const [schoolChallenges, setSchoolChallenges] = useState<SchoolChallenge[]>(
    [],
  );
  const [challengeDraft, setChallengeDraft] = useState<ChallengeDraft>(() =>
    createEmptyChallengeDraft(),
  );
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeListBusy, setChallengeListBusy] = useState(false);
  const [challengeImageUploadBusy, setChallengeImageUploadBusy] =
    useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  // Tracks which challenge's data is currently loaded into challengeDraft, so
  // the selection→draft sync effect runs once per selection instead of on
  // every render.
  const syncedChallengeDraftIdRef = useRef<string | null>(null);
  const [challengeParticipants, setChallengeParticipants] = useState<
    SchoolChallengeParticipantProgress[]
  >([]);
  // Set only when editing a challenge that belongs to a repeat series -
  // gates the "just this one / all N" confirm modal before the save
  // actually goes out. null the rest of the time.
  const [seriesEditPrompt, setSeriesEditPrompt] = useState<{
    payload: SchoolChallengeWriteInput;
    seriesCount: number;
  } | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    imageUrl: string;
    alt: string;
    label?: string;
  } | null>(null);
  const [challengeParticipantsBusy, setChallengeParticipantsBusy] =
    useState(false);
  const [packDraft, setPackDraft] = useState<PackDraft>(() =>
    createEmptyPackDraft(),
  );
  const [packPhotoFile, setPackPhotoFile] = useState<File | null>(null);
  const [packPhotoPreviewUrl, setPackPhotoPreviewUrl] = useState("");
  const [packBusy, setPackBusy] = useState(false);
  const [schoolPacks, setSchoolPacks] = useState<Pack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [activePackTab, setActivePackTab] = useState<PackTab>("existing");
  const [editingPackId, setEditingPackId] = useState("");
  const [packEditDraft, setPackEditDraft] = useState<PackEditDraft | null>(
    null,
  );
  const [packEditPhotoFile, setPackEditPhotoFile] = useState<File | null>(null);
  const [packEditPhotoPreviewUrl, setPackEditPhotoPreviewUrl] = useState("");
  const [packEditBusy, setPackEditBusy] = useState(false);
  const [qrActionTarget, setQrActionTarget] = useState("");

  const [reservations, setReservations] = useState<PackSpotReservation[]>([]);
  const [pendingVehicleCount, setPendingVehicleCount] = useState<number | null>(
    null,
  );
  const [openEnforcementCount, setOpenEnforcementCount] = useState<
    number | null
  >(null);
  const [openParkingReportCount, setOpenParkingReportCount] = useState<
    number | null
  >(null);
  const [, setDashboardHeaderCounts] = useState<HeaderDashboardCounts>({
    studentCount: null,
    pendingReservationCount: null,
  });
  const [reservationsBusy, setReservationsBusy] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [reservationStudentProfile, setReservationStudentProfile] =
    useState<StudentProfileBundle | null>(null);
  const [
    reservationStudentDevicePhotoUrls,
    setReservationStudentDevicePhotoUrls,
  ] = useState<StudentDevicePhotoMap>({});
  const [selectedStudentDeviceUUID, setSelectedStudentDeviceUUID] = useState<
    string | null
  >(null);
  const [reservationStudentBusy, setReservationStudentBusy] = useState(false);
  const [reservationStudentError, setReservationStudentError] = useState("");
  const [studentRosterSearch, setStudentRosterSearch] = useState("");

  const activeMemberships = useMemo(
    () => schoolMemberships.filter((membership) => membership.active),
    [schoolMemberships],
  );

  // Only scope requests to a school once it's confirmed as a current, active
  // membership for this account. A stale localStorage value, or a revoked /
  // inactive membership, would otherwise make every per-school fetch (zones,
  // POIs, violations, roster, ...) 403 — repeatedly, because the effects
  // re-run. While memberships are still loading we also hold at "".
  const activeSchoolId = useMemo(() => {
    if (!session || !selectedSchoolId || schoolMembershipsLoading) {
      return "";
    }
    const target = selectedSchoolId.trim().toLowerCase();
    const isActiveMember = activeMemberships.some(
      (membership) => membership.school_id.trim().toLowerCase() === target,
    );
    return isActiveMember ? selectedSchoolId : "";
  }, [session, selectedSchoolId, schoolMembershipsLoading, activeMemberships]);

  useEffect(() => {
    if (!session) {
      setSchoolMemberships([]);
      setSchoolMembershipsError(null);
      setMembershipsResolved(false);
      membershipsLookupRef.current = { inFlight: false, loadedOk: false };
      return;
    }
    let cancelled = false;
    membershipsLookupRef.current.inFlight = true;
    setSchoolMembershipsLoading(true);
    setSchoolMembershipsError(null);
    fetchMySchoolMemberships(session.authAppId)
      .then((serverMemberships) => {
        if (cancelled) {
          return;
        }
        membershipsLookupRef.current.loadedOk = true;
        // Server list is authoritative, except for a school we joined this
        // session: a lookup that started before the join (or a lagging read)
        // can return that row missing OR still inactive, so drop the server's
        // copy and use our optimistic active membership.
        const joinedActiveLocal = schoolMemberships.filter(
          (m) => m.active && sessionJoinedSchoolIdsRef.current.has(m.school_id),
        );
        const joinedActiveIds = new Set(
          joinedActiveLocal.map((m) => m.school_id.trim().toLowerCase()),
        );
        const memberships = [
          ...serverMemberships.filter(
            (m) => !joinedActiveIds.has(m.school_id.trim().toLowerCase()),
          ),
          ...joinedActiveLocal,
        ];
        setSchoolMemberships(memberships);
        setSchoolMembershipsError(null);
        const normalizedSelected = selectedSchoolId.trim().toLowerCase();
        if (
          normalizedSelected &&
          !memberships.some(
            (m) =>
              m.active &&
              m.school_id.trim().toLowerCase() === normalizedSelected,
          )
        ) {
          // Previously-selected school is no longer an active membership
          // (revoked, inactive, or leftover from a different account) —
          // clear it so the picker shows instead of silently scoping to a
          // school every request will 403 on.
          setSelectedSchoolId("");
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        // Transient lookup failure — keep whatever memberships and persisted
        // selection we already had, and surface a retry. Clearing here would
        // strand the user in an access-less picker with no way back.
        setSchoolMembershipsError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          // inFlight clears on both paths; loadedOk was set only on success
          // above. membershipsResolved (state) means "settled" and drives
          // the picker/error gate, so it's set on both paths.
          membershipsLookupRef.current.inFlight = false;
          setSchoolMembershipsLoading(false);
          setMembershipsResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.claims.user_uuid, membershipsReloadKey]);

  useEffect(() => {
    // Public endpoint — fetched once on mount so both the pre-login
    // signup school picker and the post-login school switcher can show
    // names/logos instead of raw school_id values.
    let cancelled = false;
    fetchSchools(context.managedAppId)
      .then((schools) => {
        if (!cancelled) setPickerSchools(schools);
      })
      .catch(() => {
        if (!cancelled) setPickerSchools([]);
      });
    return () => {
      cancelled = true;
    };
  }, [context.managedAppId]);

  async function handleJoinSchool(event?: React.FormEvent) {
    event?.preventDefault();
    if (!session) return;
    const schoolId = joinSchoolId.trim();
    if (!schoolId) {
      setJoinSchoolError("School ID is required");
      return;
    }
    if (joinSchoolMode === "new" && !joinNewSchoolName.trim()) {
      setJoinSchoolError("School name is required");
      return;
    }
    setJoinSchoolBusy(true);
    setJoinSchoolError("");
    try {
      if (joinSchoolMode === "new") {
        await saveSchool(context.managedAppId, schoolId, {
          name: joinNewSchoolName.trim(),
          title: joinNewSchoolName.trim(),
          logo_url: "",
          default_campus_id: "",
          color_scheme: {},
          metadata: {},
        });
      }
      const { membership, session: refreshedSession } = await joinSchool(
        session.authAppId,
        schoolId,
        joinSchoolMode === "existing" ? joinSchoolCode.trim() : undefined,
      );
      // The join response carries freshly-reissued tokens reflecting this
      // new membership's school_admin claim — apply them now so the
      // dashboard we're about to render doesn't 401/403 on a stale token.
      setSession(refreshedSession);
      // Refetch the membership list unless a lookup has already succeeded and
      // none is in flight — i.e. we have an authoritative list to merge the
      // backend-returned `membership` into. If the initial lookup failed or
      // is still running, refetch so the admin's other memberships load too
      // (not just the one they joined). Read the ref, not closure state: the
      // lookup may have settled while joinSchool() was awaiting.
      const { inFlight, loadedOk } = membershipsLookupRef.current;
      const shouldRefetchMemberships = !loadedOk || inFlight;
      if (shouldRefetchMemberships) {
        // Enter the loading state synchronously, before the optimistic
        // selection is exposed below. Otherwise activeSchoolId resolves for
        // one render on the optimistic membership and every school-scoped
        // effect fires, then fires again after the refetch. The picker gate
        // already ignores this loading window (5af8816), so no flicker.
        membershipsLookupRef.current.inFlight = true;
        setSchoolMembershipsLoading(true);
      }
      setSchoolMemberships((current) => [
        ...current.filter((m) => m.school_id !== membership.school_id),
        membership,
      ]);
      setPickerSchools((current) =>
        current.some((s) => s.school_id === schoolId)
          ? current
          : [
              ...current,
              {
                school_id: schoolId,
                app_id: context.managedAppId,
                name: joinNewSchoolName.trim() || schoolId,
                title: joinNewSchoolName.trim() || schoolId,
                logo_url: "",
                default_campus_id: "",
                color_scheme: {},
                terms: [],
                active: true,
                created_at: 0,
                updated_at: 0,
              },
            ],
      );
      setJoinSchoolId("");
      setJoinSchoolCode("");
      setJoinNewSchoolName("");
      sessionJoinedSchoolIdsRef.current.add(membership.school_id);
      setSelectedSchoolId(membership.school_id);
      if (shouldRefetchMemberships) {
        // Cancel the in-flight lookup (its .then bails on the effect's
        // cancelled flag) and refetch an authoritative list that includes
        // the new membership.
        setMembershipsReloadKey((key) => key + 1);
      }
      // The URL may still be pointing at whatever section a previous
      // session (or a previous account, after signing out) left it on —
      // land somewhere that's guaranteed to make sense for a school this
      // admin has just entered, rather than a section that assumes
      // existing data.
      navigate(sectionPathByName.dashboard, { replace: true });
    } catch (error) {
      setJoinSchoolError(getErrorMessage(error));
    } finally {
      setJoinSchoolBusy(false);
    }
  }

  function promptLeaveSchool(
    membership: AdminSchoolMembership,
    event: React.MouseEvent,
  ) {
    event.stopPropagation();
    if (leavingMembershipUuid) return;
    setPendingLeaveMembership(membership);
  }

  function cancelLeaveSchool() {
    setPendingLeaveMembership(null);
  }

  async function confirmLeaveSchool() {
    const membership = pendingLeaveMembership;
    if (!session || !membership) return;
    setPendingLeaveMembership(null);
    setLeavingMembershipUuid(membership.membership_uuid);
    try {
      const { session: refreshedSession } = await leaveSchool(
        session.authAppId,
        membership.membership_uuid,
      );
      setSession(refreshedSession);
      sessionJoinedSchoolIdsRef.current.delete(membership.school_id);
      setSchoolMemberships((current) =>
        current.filter((m) => m.membership_uuid !== membership.membership_uuid),
      );
      if (selectedSchoolId === membership.school_id) {
        setSelectedSchoolId("");
      }
      if (membershipsLookupRef.current.inFlight) {
        // A lookup started before this leave would return the pre-leave list
        // and re-add the school. Cancel + refetch authoritatively.
        setMembershipsReloadKey((key) => key + 1);
      }
    } catch (error) {
      setBanner({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setLeavingMembershipUuid(null);
    }
  }

  function schoolDisplayName(schoolId: string): string {
    const match = pickerSchools.find((s) => s.school_id === schoolId);
    return match?.title || match?.name || schoolId || "School";
  }

  async function handleShowJoinCode() {
    if (!activeSchoolId || viewJoinCodeBusy) return;
    if (viewJoinCode !== null) {
      setViewJoinCode(null);
      return;
    }
    setViewJoinCodeBusy(true);
    try {
      const code = await fetchSchoolJoinCode(
        context.managedAppId,
        activeSchoolId,
      );
      setViewJoinCode(code);
    } catch (error) {
      setBanner({ tone: "error", message: getErrorMessage(error) });
    } finally {
      setViewJoinCodeBusy(false);
    }
  }

  function findPickerSchool(schoolId: string): School | undefined {
    return pickerSchools.find((s) => s.school_id === schoolId);
  }

  // Lowercase, letters and underscores only. Internal whitespace becomes
  // an underscore; leading/trailing whitespace is dropped outright. Run
  // on every keystroke without collapsing a just-typed trailing space —
  // sanitizeSchoolIdOnBlur additionally trims stray leading/trailing
  // underscores once the field loses focus, so "ou state " typed live
  // becomes "ou_state" rather than losing the space before more text
  // follows it.
  function sanitizeSchoolIdInput(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z_]/g, "");
  }

  function sanitizeSchoolIdOnBlur(value: string): string {
    return sanitizeSchoolIdInput(value).replace(/^_+|_+$/g, "");
  }

  function SchoolOptionCard({
    school,
    selected,
    onClick,
  }: {
    school: School;
    selected?: boolean;
    onClick: () => void;
  }) {
    const label = school.title || school.name || school.school_id || "?";
    return (
      <button
        type="button"
        className={
          selected
            ? "school-option-card school-option-card-selected"
            : "school-option-card"
        }
        onClick={onClick}
      >
        {school.logo_url ? (
          <img src={school.logo_url} alt="" className="school-option-logo" />
        ) : (
          <span className="school-option-logo school-option-logo-placeholder">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="school-option-name">{label}</span>
      </button>
    );
  }

  const currentSection =
    resolveSectionFromPathname(location.pathname) ?? "dashboard";
  const isChallengeGamesSection = currentSection === "challengeGames";
  const deferredStudentRosterSearch = useDeferredValue(studentRosterSearch);
  const complianceEnforcementCount = useMemo(() => {
    const enforcementCount = openEnforcementCount ?? 0;
    const parkingReportCount = openParkingReportCount ?? 0;
    const total = enforcementCount + parkingReportCount;
    return total > 0 ? total : null;
  }, [openEnforcementCount, openParkingReportCount]);
  const studentsDispatch = useAppDispatch();
  const {
    schoolStudentMediaUrls,
    schoolStudentPhotoKeys,
    schoolStudentProfilePhotoUrls,
    schoolStudentReservations,
    schoolStudentRoster,
    schoolStudentRosterBusy,
    schoolStudentRosterError,
    schoolStudentRosterReady,
    selectedStudentMembershipId,
    studentBusy,
    studentDeviceMediaByDevice,
    studentDevicePhotoUrls,
    studentDeviceSignedMediaUrls,
    studentError,
    studentProfile,
    studentPublicProfile,
    studentPublicProfileError,
    studentReservationPacks,
    studentRouteHistory,
    studentRouteHistoryError,
    studentSchoolZones,
    studentViolationError,
    studentViolationMediaByViolation,
    studentViolationSignedMediaUrls,
    studentViolations,
  } = useAppSelector(selectStudentsState);

  const selectedPackLocation = useMemo<PackMapPoint | null>(() => {
    const lat = packDraft.lat.trim();
    const lng = packDraft.lng.trim();
    if (!lat || !lng) {
      return null;
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return null;
    }

    return {
      lat: parsedLat,
      lng: parsedLng,
    };
  }, [packDraft.lat, packDraft.lng]);

  const selectedPoiDraft = useMemo(
    () => poiDrafts.find((poi) => poi.id === activePoiDraftId) ?? null,
    [activePoiDraftId, poiDrafts],
  );

  const selectedZoneDraft = useMemo(
    () => zoneDrafts.find((zone) => zone.id === activeZoneDraftId) ?? null,
    [activeZoneDraftId, zoneDrafts],
  );

  const visibleSchoolChallenges = useMemo(
    () =>
      schoolChallenges.filter((challenge) =>
        isChallengeGamesSection
          ? isScavengerHuntChallengeRecord(challenge)
          : !isScavengerHuntChallengeRecord(challenge),
      ),
    [isChallengeGamesSection, schoolChallenges],
  );
  const selectedChallenge = useMemo(
    () =>
      visibleSchoolChallenges.find(
        (challenge) => challenge.challenge_uuid === selectedChallengeId,
      ) ?? null,
    [selectedChallengeId, visibleSchoolChallenges],
  );
  const currentAndUpcomingChallenges = useMemo(
    () =>
      visibleSchoolChallenges.filter(
        (challenge) => resolveChallengeStatus(challenge) !== "Ended",
      ),
    [visibleSchoolChallenges],
  );
  const pastChallenges = useMemo(
    () =>
      visibleSchoolChallenges.filter(
        (challenge) => resolveChallengeStatus(challenge) === "Ended",
      ),
    [visibleSchoolChallenges],
  );

  const selectedPoiLocation = useMemo<PackMapPoint | null>(() => {
    const lat = selectedPoiDraft?.lat.trim() ?? "";
    const lng = selectedPoiDraft?.lng.trim() ?? "";
    if (!lat || !lng) {
      return null;
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return null;
    }

    return {
      lat: parsedLat,
      lng: parsedLng,
    };
  }, [selectedPoiDraft]);

  const poiMapMarkers = useMemo<PackMapMarker[]>(
    () =>
      poiDrafts.flatMap((poi) => {
        const lat = Number(poi.lat.trim());
        const lng = Number(poi.lng.trim());
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return [];
        }

        const bonusPoints = Number.parseInt(poi.bonus_points.trim(), 10);
        const radiusFeet = Number(poi.radius_feet.trim());
        const descriptionParts = [
          poi.description.trim(),
          Number.isFinite(bonusPoints) ? `${bonusPoints} bonus points` : "",
          Number.isFinite(radiusFeet)
            ? `${Math.round(radiusFeet).toLocaleString()} ft entry radius`
            : "",
        ].filter(Boolean);

        return [
          {
            id: poi.poi_uuid || poi.id,
            label: poi.title.trim() || "Untitled POI",
            description: descriptionParts.join(" · ") || undefined,
            lat,
            lng,
            radiusMeters: Number.isFinite(radiusFeet)
              ? feetToMeters(radiusFeet)
              : undefined,
          },
        ];
      }),
    [poiDrafts],
  );

  const totalPOIBonusPoints = useMemo(
    () =>
      poiDrafts.reduce((sum, poi) => {
        const bonusPoints = Number.parseInt(poi.bonus_points.trim(), 10);
        return sum + (Number.isFinite(bonusPoints) ? bonusPoints : 0);
      }, 0),
    [poiDrafts],
  );

  const zoneMapPolygons = useMemo<SchoolZoneMapPolygon[]>(
    () =>
      zoneDrafts.map((zone) => ({
        id: zone.zone_uuid || zone.id,
        label: zone.title.trim() || "Untitled zone",
        description: zone.description.trim(),
        zoneType: zone.zone_type,
        speedLimitMph: (() => {
          const parsed = Number(zone.speed_limit_mph.trim());
          return Number.isFinite(parsed) ? parsed : null;
        })(),
        points: zone.polygon,
        highlighted: zone.id === activeZoneDraftId,
      })),
    [activeZoneDraftId, zoneDrafts],
  );

  const mappedZoneCount = useMemo(
    () => zoneDrafts.filter((zone) => zone.polygon.length >= 3).length,
    [zoneDrafts],
  );

  const selectedReservation = useMemo(
    () =>
      reservations.find(
        (reservation) => reservation.reservation_uuid === selectedReservationId,
      ) ?? null,
    [reservations, selectedReservationId],
  );

  const existingPackMapMarkers = useMemo<PackMapMarker[]>(
    () =>
      schoolPacks.flatMap((pack) => {
        const lat = pack.location?.lat;
        const lng = pack.location?.lng;
        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return [];
        }

        return [
          {
            id: pack.pack_uuid,
            label: pack.name.trim() || "Juise Pack",
            description: pack.description.trim() || undefined,
            spotCount: pack.spot_count,
            lat,
            lng,
          },
        ];
      }),
    [schoolPacks],
  );

  const packsWithoutLocationsCount =
    schoolPacks.length - existingPackMapMarkers.length;

  const relevantMemberships = useMemo(() => {
    if (!reservationStudentProfile) {
      return [];
    }

    return reservationStudentProfile.memberships.filter(
      (membership) => membership.school_id === activeSchoolId,
    );
  }, [activeSchoolId, reservationStudentProfile]);

  const sortedSchoolStudentRoster = useMemo(
    () =>
      [...schoolStudentRoster].sort((left, right) => {
        const leftName = formatNebulaUserName(left.user).toLowerCase();
        const rightName = formatNebulaUserName(right.user).toLowerCase();
        if (leftName !== rightName) {
          return leftName.localeCompare(rightName);
        }
        return left.membership.student_id.localeCompare(
          right.membership.student_id,
        );
      }),
    [schoolStudentRoster],
  );

  const filteredStudentRoster = useMemo(() => {
    const q = deferredStudentRosterSearch.trim().toLowerCase();
    if (!q) return sortedSchoolStudentRoster;
    return sortedSchoolStudentRoster.filter((entry) => {
      const name = formatNebulaUserName(entry.user).toLowerCase();
      const id = entry.membership.student_id.toLowerCase();
      const email = (entry.user.email ?? "").toLowerCase();
      return name.includes(q) || id.includes(q) || email.includes(q);
    });
  }, [deferredStudentRosterSearch, sortedSchoolStudentRoster]);

  const selectedStudentEntry = useMemo(
    () =>
      selectedStudentMembershipId
        ? (sortedSchoolStudentRoster.find(
            (e) => e.membership.membership_uuid === selectedStudentMembershipId,
          ) ?? null)
        : null,
    [sortedSchoolStudentRoster, selectedStudentMembershipId],
  );

  const selectedStudentDevice = useMemo(
    () =>
      selectedStudentDeviceUUID && studentProfile
        ? (studentProfile.devices.find(
            (device) =>
              device.registered_device_uuid === selectedStudentDeviceUUID,
          ) ?? null)
        : null,
    [selectedStudentDeviceUUID, studentProfile],
  );

  const selectedStudentDeviceMediaAssets = useMemo(
    () =>
      selectedStudentDevice
        ? (studentDeviceMediaByDevice[
            selectedStudentDevice.registered_device_uuid
          ] ?? [])
        : [],
    [selectedStudentDevice, studentDeviceMediaByDevice],
  );

  const selectedStudentFullName = useMemo(() => {
    if (studentProfile?.user) {
      return formatNebulaUserName(studentProfile.user);
    }
    if (selectedStudentEntry?.user) {
      return formatNebulaUserName(selectedStudentEntry.user);
    }
    return "Student";
  }, [selectedStudentEntry, studentProfile]);

  const schoolReservationsByMembership = useMemo(() => {
    const reservationsByMembership = new Map<string, PackSpotReservation[]>();
    for (const reservation of schoolStudentReservations) {
      const membershipUUID = reservation.membership_uuid?.trim() ?? "";
      if (!membershipUUID) {
        continue;
      }

      const currentReservations =
        reservationsByMembership.get(membershipUUID) ?? [];
      currentReservations.push(reservation);
      reservationsByMembership.set(membershipUUID, currentReservations);
    }

    for (const reservationsForMembership of reservationsByMembership.values()) {
      reservationsForMembership.sort((left, right) => {
        if (left.start_time !== right.start_time) {
          return right.start_time - left.start_time;
        }
        return right.updated - left.updated;
      });
    }

    return reservationsByMembership;
  }, [schoolStudentReservations]);

  const challengeParticipantSummary = useMemo(
    () => ({
      joined: challengeParticipants.length,
      active: challengeParticipants.filter((participant) => participant.active)
        .length,
      completed: challengeParticipants.filter(
        (participant) => participant.completed,
      ).length,
    }),
    [challengeParticipants],
  );

  const dashboardThemeColors = useMemo(
    () => buildDashboardThemeColors(schoolDraft.color_scheme),
    [schoolDraft.color_scheme],
  );

  const resolvedSchoolColors = useMemo(
    () => ({
      primary: dashboardThemeColors.primary,
      secondary: dashboardThemeColors.secondary,
      accent: dashboardThemeColors.accent,
      background: dashboardThemeColors.background,
      text: dashboardThemeColors.text,
    }),
    [dashboardThemeColors],
  );

  useEffect(() => {
    const rawLogoValue = schoolDraft.logo_url.trim();
    if (!rawLogoValue) {
      setResolvedSchoolLogoUrl("");
      return;
    }

    if (!isSignedMediaObjectKey(rawLogoValue)) {
      setResolvedSchoolLogoUrl(rawLogoValue);
      return;
    }

    if (!activeSchoolId) {
      setResolvedSchoolLogoUrl("");
      return;
    }

    let cancelled = false;

    async function loadSignedSchoolLogo() {
      const signedUrls = await signSchoolMedia(activeSchoolId, [rawLogoValue]);
      if (!cancelled) {
        setResolvedSchoolLogoUrl(signedUrls[rawLogoValue] ?? "");
      }
    }

    void loadSignedSchoolLogo().catch(() => {
      if (!cancelled) {
        setResolvedSchoolLogoUrl("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, schoolDraft.logo_url]);

  const appThemeStyle = useMemo<CssVariableStyle>(() => {
    const primary = dashboardThemeColors.primary;
    const secondary = dashboardThemeColors.secondary;
    const accent = dashboardThemeColors.accent;
    const background = dashboardThemeColors.background;
    const text = dashboardThemeColors.text;
    const mutedText = dashboardThemeColors.fadedText;
    const surface = dashboardThemeColors.surface;
    const surfaceElevated = dashboardThemeColors.surfaceElevated;
    const surfaceAccent = dashboardThemeColors.surfaceAccent;
    const borderMuted = dashboardThemeColors.borderMuted;
    const borderAccent = dashboardThemeColors.borderAccent;
    const selectedSurface = dashboardThemeColors.selectedSurface;

    return {
      "--bg": background,
      "--bg-accent": mixHexColors(background, accent, 0.06),
      "--app-glow-primary": hexToRgba(primary, 0.16),
      "--app-glow-accent": hexToRgba(accent, 0.14),
      "--panel-bg": hexToRgba(surface, 0.96),
      "--panel-bg-elevated": hexToRgba(surfaceElevated, 0.98),
      "--panel-bg-accent": hexToRgba(surfaceAccent, 0.98),
      "--selected-surface": hexToRgba(selectedSurface, 0.98),
      "--panel-border": hexToRgba(borderMuted, 0.96),
      "--panel-border-accent": hexToRgba(borderAccent, 0.96),
      "--panel-shadow": `0 28px 54px ${hexToRgba(
        mixHexColors(background, juiseColors.darkGrey, 0.34),
        0.18,
      )}, 0 10px 24px ${hexToRgba(background, 0.12)}`,
      "--text": text,
      "--text-strong": text,
      "--muted": mutedText,
      "--muted-strong": mixHexColors(mutedText, text, 0.34),
      "--input-border": hexToRgba(borderMuted, 0.96),
      "--field-bg": hexToRgba(surface, 0.98),
      "--field-focus-ring": hexToRgba(primary, 0.18),
      "--button-primary-bg": primary,
      "--button-primary-text": dashboardThemeColors.onPrimary,
      "--button-secondary-bg": hexToRgba(surfaceElevated, 0.98),
      "--button-secondary-border": hexToRgba(borderMuted, 0.96),
      "--button-secondary-text": text,
      "--button-danger-bg": hexToRgba("#b33a3a", 0.12),
      "--button-danger-border": hexToRgba("#b33a3a", 0.24),
      "--button-danger-text": "#8a1f1f",
      "--stat-card-bg": `linear-gradient(180deg, ${hexToRgba(
        surfaceElevated,
        0.98,
      )}, ${hexToRgba(surface, 0.98)})`,
      "--stat-card-border": hexToRgba(borderAccent, 0.96),
      "--brand-primary": primary,
      "--brand-secondary": secondary,
      "--brand-accent": accent,
      "--brand-on-accent": dashboardThemeColors.onAccent,
      "--brand-background": background,
      "--brand-text": text,
      "--brand-surface": `linear-gradient(155deg, ${surfaceAccent}, ${surfaceElevated})`,
    };
  }, [dashboardThemeColors]);

  const sidebarThemeStyle = useMemo<CssVariableStyle>(() => {
    const primary = dashboardThemeColors.primary;
    const secondary = dashboardThemeColors.secondary;
    const accent = dashboardThemeColors.accent;
    const background = dashboardThemeColors.background;
    const text = dashboardThemeColors.text;
    const surface = dashboardThemeColors.surface;
    const surfaceElevated = dashboardThemeColors.surfaceElevated;
    const surfaceAccent = dashboardThemeColors.surfaceAccent;
    const borderMuted = dashboardThemeColors.borderMuted;
    const borderAccent = dashboardThemeColors.borderAccent;
    const selectedSurface = dashboardThemeColors.selectedSurface;

    return {
      "--sidebar-bg-start": background,
      "--sidebar-bg-end": mixHexColors(background, text, 0.04),
      "--sidebar-glow-primary": hexToRgba(primary, 0.14),
      "--sidebar-glow-accent": hexToRgba(accent, 0.12),
      "--sidebar-text": text,
      "--sidebar-muted": hexToRgba(dashboardThemeColors.fadedText, 0.94),
      "--sidebar-soft-text": hexToRgba(dashboardThemeColors.disabledText, 0.92),
      "--sidebar-border": hexToRgba(borderMuted, 0.96),
      "--sidebar-accent-border": hexToRgba(borderAccent, 0.96),
      "--sidebar-surface": hexToRgba(surface, 0.98),
      "--sidebar-surface-strong": hexToRgba(surfaceElevated, 0.98),
      "--sidebar-item-bg": hexToRgba(surfaceElevated, 0.98),
      "--sidebar-item-hover-bg": hexToRgba(selectedSurface, 0.98),
      "--sidebar-item-active-bg": selectedSurface,
      "--sidebar-item-active-text": text,
      "--sidebar-form-bg": hexToRgba(surface, 0.98),
      "--sidebar-form-border": hexToRgba(borderMuted, 0.96),
      "--sidebar-chip-bg": hexToRgba(surfaceAccent, 0.98),
      "--sidebar-chip-text": text,
      "--sidebar-primary": primary,
      "--sidebar-secondary": secondary,
      "--sidebar-accent": accent,
    };
  }, [dashboardThemeColors]);

  async function handleCopyUuid(label: string, value: string) {
    try {
      await copyTextToClipboard(value);
      setBanner({
        tone: "success",
        message: `Copied ${label}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    }
  }

  function upsertSchoolPack(nextPack: Pack) {
    setSchoolPacks((current) =>
      sortPacksForDisplay([
        nextPack,
        ...current.filter((pack) => pack.pack_uuid !== nextPack.pack_uuid),
      ]),
    );
  }

  function upsertSchoolPackSpot(updatedSpot: PackSpot) {
    setSchoolPacks((current) =>
      sortPacksForDisplay(
        current.map((pack) =>
          pack.pack_uuid !== updatedSpot.pack_uuid
            ? pack
            : {
                ...pack,
                spots: pack.spots.map((spot) =>
                  spot.spot_uuid === updatedSpot.spot_uuid ? updatedSpot : spot,
                ),
              },
        ),
      ),
    );
  }

  async function handleDownloadPackQrCode(targetPack: Pack) {
    if (
      !session?.claims.user_uuid ||
      !targetPack.pack_uuid ||
      !targetPack.qr_code
    ) {
      setBanner({
        tone: "error",
        message: "Pack QR code is not available yet.",
      });
      return;
    }

    try {
      const qrCode = await downloadAdminPackQrCode(
        session.claims.user_uuid,
        context.managedAppId,
        targetPack.pack_uuid,
      );
      triggerFileDownload(qrCode, `pack-${targetPack.pack_uuid}-qr.png`);
      void emitDashboardAudit({
        action: "dashboard.export.download",
        resource_type: "pack_qr",
        resource_id: targetPack.pack_uuid,
        metadata: { format: "png" },
      }).catch(() => undefined);
    } catch (error) {
      setBanner({ tone: "error", message: getErrorMessage(error) });
    }
  }

  async function handleDownloadPackSpotQrCode(spot: PackSpot) {
    if (!session?.claims.user_uuid || !spot.spot_uuid || !spot.qr_code) {
      setBanner({
        tone: "error",
        message: "Pack spot QR code is not available yet.",
      });
      return;
    }

    try {
      const qrCode = await downloadAdminPackSpotQrCode(
        session.claims.user_uuid,
        context.managedAppId,
        spot.spot_uuid,
      );
      triggerFileDownload(qrCode, `pack-spot-${spot.spot_uuid}-qr.png`);
      void emitDashboardAudit({
        action: "dashboard.export.download",
        resource_type: "pack_spot_qr",
        resource_id: spot.spot_uuid,
        metadata: { format: "png" },
      }).catch(() => undefined);
    } catch (error) {
      setBanner({ tone: "error", message: getErrorMessage(error) });
    }
  }

  async function handleGeneratePackQrCode(targetPack: Pack) {
    if (!session?.claims.user_uuid || !targetPack.pack_uuid) {
      setBanner({
        tone: "error",
        message: "Pack QR code cannot be generated right now.",
      });
      return;
    }

    setQrActionTarget(`pack:${targetPack.pack_uuid}`);
    try {
      const updatedPack = await generateAdminPackQrCode(
        session.claims.user_uuid,
        context.managedAppId,
        targetPack.pack_uuid,
      );
      upsertSchoolPack(updatedPack);
      setBanner({
        tone: "success",
        message: "Pack QR code is ready.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setQrActionTarget("");
    }
  }

  async function handleGeneratePackSpotQrCode(spot: PackSpot) {
    if (!session?.claims.user_uuid || !spot.spot_uuid) {
      setBanner({
        tone: "error",
        message: "Pack spot QR code cannot be generated right now.",
      });
      return;
    }

    setQrActionTarget(`spot:${spot.spot_uuid}`);
    try {
      const updatedSpot = await generateAdminPackSpotQrCode(
        session.claims.user_uuid,
        context.managedAppId,
        spot.spot_uuid,
      );
      upsertSchoolPackSpot(updatedSpot);
      setBanner({
        tone: "success",
        message: `Spot ${updatedSpot.spot_number} QR code is ready.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setQrActionTarget("");
    }
  }

  useEffect(() => {
    if (resolveSectionFromPathname(location.pathname)) {
      return;
    }

    navigate(sectionPathByName.dashboard, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    setPackDraft(createEmptyPackDraft(schoolDraft.default_campus_id ?? ""));
    setPackPhotoFile(null);
    setPackPhotoPreviewUrl("");
  }, [schoolDraft.default_campus_id]);

  useEffect(() => {
    setSchoolPacks([]);
    setEditingPackId("");
    setPackEditDraft(null);
    setPackEditPhotoFile(null);
    setPackEditPhotoPreviewUrl("");
  }, [activeSchoolId]);

  useEffect(() => {
    setPoiDrafts([]);
  }, [activeSchoolId]);

  useEffect(() => {
    setZoneDrafts([]);
  }, [activeSchoolId]);

  useEffect(() => {
    setSchoolChallenges([]);
    setChallengeParticipants([]);
    setChallengeDraft(createEmptyChallengeDraft());
    setSelectedChallengeId("");
  }, [activeSchoolId]);

  useEffect(() => {
    if (poiDrafts.length === 0) {
      setActivePoiDraftId("");
      return;
    }

    setActivePoiDraftId((current) => {
      if (!current) {
        return current;
      }
      return poiDrafts.some((poi) => poi.id === current)
        ? current
        : poiDrafts[0].id;
    });
  }, [poiDrafts]);

  useEffect(() => {
    if (zoneDrafts.length === 0) {
      setActiveZoneDraftId("");
      return;
    }

    setActiveZoneDraftId((current) => {
      if (!current) {
        return current;
      }
      return zoneDrafts.some((zone) => zone.id === current)
        ? current
        : zoneDrafts[0].id;
    });
  }, [zoneDrafts]);

  useEffect(() => {
    setApiSession(session);
    if (authInitializing) {
      return;
    }
    if (session) {
      writeDashboardSession(session);
    } else {
      clearDashboardSession();
    }
  }, [authInitializing, session]);

  useEffect(() => {
    if (!initialSession) {
      setAuthInitializing(false);
      return;
    }

    let cancelled = false;

    async function refreshStoredSession() {
      setApiSession(initialSession);
      try {
        const nextSession = await refreshDashboardSession();
        if (cancelled) {
          return;
        }

        sessionEndedGuardRef.current = false;
        setSession(nextSession);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSession(null);
        setAuthError("");
        setPassword("");
        setBanner({
          tone: "info",
          message:
            getErrorMessage(error) ||
            "Your session has expired. Please sign in again.",
        });
      } finally {
        if (!cancelled) {
          setAuthInitializing(false);
        }
      }
    }

    void refreshStoredSession();

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  useEffect(() => {
    if (!session?.claims.user_uuid || session.user) {
      return;
    }

    const sessionUserUUID = session.claims.user_uuid;
    let cancelled = false;

    async function hydrateAdminUser() {
      try {
        const user = await fetchNebulaUser(sessionUserUUID);
        if (cancelled) {
          return;
        }

        setSession((current) =>
          current && current.claims.user_uuid === sessionUserUUID
            ? {
                ...current,
                user,
              }
            : current,
        );
      } catch {
        // Keep the UUID fallback if the profile lookup is unavailable.
      }
    }

    void hydrateAdminUser();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.claims.user_uuid]);

  useEffect(() => {
    writeDashboardContext(context);
  }, [context]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const activeSession = session;
    let cancelled = false;
    let timeoutId: number | undefined;

    function expireSession() {
      if (cancelled) {
        return;
      }

      sessionEndedGuardRef.current = true;
      setSession(null);
      setAuthError("");
      setPassword("");
      setBanner({
        tone: "info",
        message: "Your session has expired. Please sign in again.",
      });
    }

    function scheduleExpiryCheck() {
      const delayMs = getSessionRefreshExpiryMs(activeSession) - Date.now();
      if (delayMs <= 0) {
        expireSession();
        return;
      }

      timeoutId = window.setTimeout(
        () => {
          if (getSessionRefreshExpiryMs(activeSession) <= Date.now()) {
            expireSession();
          } else {
            scheduleExpiryCheck();
          }
        },
        Math.min(delayMs, maxSessionExpiryCheckDelayMs),
      );
    }

    scheduleExpiryCheck();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [session]);

  useEffect(() => {
    setSessionObserver((nextSession) => {
      if (sessionEndedGuardRef.current && nextSession) {
        return;
      }
      setSession(nextSession);
    });

    return () => {
      setSessionObserver(null);
    };
  }, []);

  useEffect(() => {
    if (!session || !activeSchoolId) {
      studentsDispatch(resetStudentsState());
      return;
    }

    studentsDispatch(
      setStudentsScope({
        scopeKey: `${context.managedAppId}:${activeSchoolId}:${session.claims.user_uuid}`,
        managedAppId: context.managedAppId,
        schoolId: activeSchoolId,
        adminUserUUID: session.claims.user_uuid,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    session?.claims.user_uuid,
    studentsDispatch,
  ]);

  useEffect(() => {
    setDashboardHeaderCounts({
      studentCount: null,
      pendingReservationCount: null,
    });
    setPendingVehicleCount(null);
    setOpenEnforcementCount(null);
    setOpenParkingReportCount(null);
  }, [activeSchoolId, context.managedAppId]);

  useEffect(() => {
    if (!session || !activeSchoolId) {
      setPendingVehicleCount(null);
      return;
    }
    let cancelled = false;
    fetchSchoolRegisteredDevices(
      context.managedAppId,
      activeSchoolId,
      "pending",
    )
      .then((results) => {
        if (!cancelled) setPendingVehicleCount(results.length);
      })
      .catch(() => {
        if (!cancelled) setPendingVehicleCount(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.claims.user_uuid, activeSchoolId, context.managedAppId]);

  useEffect(() => {
    if (!session || !activeSchoolId) {
      setOpenEnforcementCount(null);
      return;
    }
    const openTokens = [
      "reported",
      "awaiting_payment",
      "appealed",
      "under_review",
    ];
    let cancelled = false;
    fetchSchoolParkingViolations(context.managedAppId, activeSchoolId)
      .then((violations) => {
        if (!cancelled) {
          const count = violations.filter((v) =>
            openTokens.includes((v.status ?? "reported").trim().toLowerCase()),
          ).length;
          setOpenEnforcementCount(count);
        }
      })
      .catch(() => {
        if (!cancelled) setOpenEnforcementCount(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.claims.user_uuid, activeSchoolId, context.managedAppId]);

  useEffect(() => {
    if (!session || !activeSchoolId) {
      setOpenParkingReportCount(null);
      return;
    }
    let cancelled = false;
    fetchSchoolParkingIncidentReports(context.managedAppId, activeSchoolId, {
      status: "submitted",
      limit: 100,
    })
      .then((reports) => {
        if (!cancelled) {
          setOpenParkingReportCount(countOpenParkingIncidentReports(reports));
        }
      })
      .catch(() => {
        if (!cancelled) setOpenParkingReportCount(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.claims.user_uuid, activeSchoolId, context.managedAppId]);

  useEffect(() => {
    if (!schoolStudentRosterReady) {
      return;
    }

    setDashboardHeaderCounts((current) => ({
      ...current,
      studentCount: schoolStudentRoster.length,
    }));
  }, [schoolStudentRoster.length, schoolStudentRosterReady]);

  useEffect(() => {
    if (!session) {
      setReservations([]);
      setDashboardHeaderCounts({
        studentCount: null,
        pendingReservationCount: null,
      });
      setSelectedReservationId("");
      setReservationStudentProfile(null);
      setReservationStudentDevicePhotoUrls({});
      setReservationStudentBusy(false);
      setReservationStudentError("");
      setSelectedStudentDeviceUUID(null);
      setSchoolPacks([]);
      setPoiDrafts([]);
      setActivePoiDraftId("");
      setSchoolChallenges([]);
      setChallengeParticipants([]);
      setImagePreview(null);
      setChallengeDraft(createEmptyChallengeDraft());
      setSelectedChallengeId("");
      setSchoolDraft(createEmptySchoolDraft());
      setTermDrafts([]);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.claims.user_uuid]);

  useEffect(() => {
    if (!session || !activeSchoolId) {
      return;
    }

    void studentsDispatch(
      loadStudentRoster({
        scopeKey: `${context.managedAppId}:${activeSchoolId}:${session.claims.user_uuid}`,
        managedAppId: context.managedAppId,
        schoolId: activeSchoolId,
        adminUserUUID: session.claims.user_uuid,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    session?.claims.user_uuid,
    studentsDispatch,
  ]);

  useEffect(() => {
    if (!imagePreview && !selectedStudentDeviceUUID) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (imagePreview) {
          setImagePreview(null);
          return;
        }
        setSelectedStudentDeviceUUID(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [imagePreview, selectedStudentDeviceUUID]);

  useEffect(() => {
    if (!selectedStudentMembershipId) {
      setSelectedStudentDeviceUUID(null);
    }
  }, [selectedStudentMembershipId]);

  useEffect(() => {
    if (currentSection !== "students") {
      setSelectedStudentDeviceUUID(null);
    }
  }, [currentSection]);

  useEffect(() => {
    if (
      selectedStudentDeviceUUID &&
      !studentProfile?.devices.some(
        (device) => device.registered_device_uuid === selectedStudentDeviceUUID,
      )
    ) {
      setSelectedStudentDeviceUUID(null);
    }
  }, [selectedStudentDeviceUUID, studentProfile]);

  function handleOpenImagePreview(
    imageUrl: string,
    alt: string,
    label?: string,
  ) {
    const normalizedImageUrl = imageUrl.trim();
    if (!normalizedImageUrl) {
      return;
    }

    setImagePreview({
      imageUrl: normalizedImageUrl,
      alt: alt.trim() || label?.trim() || "Dashboard image",
      label: label?.trim() || undefined,
    });
  }

  function resetSelectedStudentState() {
    setSelectedStudentDeviceUUID(null);
    studentsDispatch(resetStudentsSelectionState());
  }

  function handleOpenStudentDevice(deviceUUID: string) {
    if (!deviceUUID.trim()) {
      return;
    }
    setSelectedStudentDeviceUUID(deviceUUID);
  }

  useEffect(() => {
    if (!isChallengeManagementSection(currentSection)) {
      syncedChallengeDraftIdRef.current = null;
      return;
    }

    // Every branch below is written to be idempotent: it only calls a setter
    // when the value actually needs to change. Firing setChallengeDraft with a
    // fresh object (or setChallengeParticipants with a fresh []) on every
    // render is what made the table flicker and refetch in a loop.
    const clearParticipants = () =>
      setChallengeParticipants((current) => (current.length ? [] : current));

    if (selectedChallengeId === newChallengeSelectionId) {
      const wantType = isChallengeGamesSection
        ? "scavenger_hunt"
        : "route_metric";
      if (challengeDraft.challenge_type !== wantType) {
        setChallengeDraft(
          isChallengeGamesSection
            ? createEmptyScavengerHuntDraft()
            : createEmptyChallengeDraft(),
        );
      }
      clearParticipants();
      syncedChallengeDraftIdRef.current = newChallengeSelectionId;
      return;
    }

    if (!selectedChallenge) {
      // An empty id is the intentional "show the table" state (set by delete,
      // by saving an edit, and by the back button) — leave it alone. A
      // non-empty id that no longer resolves (its challenge was deleted or
      // filtered out from under the selection) also returns to the table
      // rather than snapping to an unrelated challenge.
      if (selectedChallengeId) {
        setSelectedChallengeId("");
      }
      if (challengeDraft.challenge_uuid) {
        setChallengeDraft(createEmptyChallengeDraft());
      }
      clearParticipants();
      syncedChallengeDraftIdRef.current = null;
      return;
    }

    // Load the selected challenge into the draft once per selection change, not
    // on every render — otherwise challengeToDraft's fresh object retriggers
    // this effect and clobbers in-progress edits.
    if (syncedChallengeDraftIdRef.current !== selectedChallenge.challenge_uuid) {
      setChallengeDraft(challengeToDraft(selectedChallenge));
      syncedChallengeDraftIdRef.current = selectedChallenge.challenge_uuid;
    }
  }, [
    currentSection,
    challengeDraft.challenge_type,
    challengeDraft.challenge_uuid,
    isChallengeGamesSection,
    selectedChallenge,
    selectedChallengeId,
  ]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (!activeSchoolId) {
      setSchoolDraft(createEmptySchoolDraft());
      setTermDrafts([]);
      setPoiDrafts([]);
      setActivePoiDraftId("");
      return;
    }

    setSchoolDraft((current) =>
      current.school_id === activeSchoolId
        ? current
        : {
            ...createEmptySchoolDraft(),
            school_id: activeSchoolId,
          },
    );

    let cancelled = false;

    async function loadSchoolDetails() {
      setSchoolBusy(true);
      try {
        const school = await fetchSchool(context.managedAppId, activeSchoolId);
        if (cancelled) {
          return;
        }

        setSchoolDraft(schoolToDraft(school));
        setTermDrafts(school.terms.map(termToDraft));
      } catch (error) {
        if (!cancelled) {
          const message = getErrorMessage(error);
          if (message.toLowerCase().includes("locate school")) {
            setSchoolDraft({
              ...createEmptySchoolDraft(),
              school_id: activeSchoolId,
            });
            setTermDrafts([]);
          } else {
            setBanner({
              tone: "error",
              message,
            });
          }
        }
      } finally {
        if (!cancelled) {
          setSchoolBusy(false);
        }
      }
    }

    void loadSchoolDetails();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchoolId, context.managedAppId, session?.claims.user_uuid]);

  useEffect(() => {
    if (!session || !activeSchoolId) {
      return;
    }

    const adminUserUUID = session.claims.user_uuid;
    let cancelled = false;

    async function loadReservations() {
      setReservationsBusy(true);
      try {
        const nextReservations = await fetchPendingReservations(
          adminUserUUID,
          context.managedAppId,
          activeSchoolId,
        );
        if (cancelled) {
          return;
        }

        setReservations(nextReservations);
        setDashboardHeaderCounts((current) => ({
          ...current,
          pendingReservationCount: nextReservations.length,
        }));
        setSelectedReservationId((current) => {
          const hasCurrentSelection = nextReservations.some(
            (reservation) => reservation.reservation_uuid === current,
          );
          return hasCurrentSelection ? current : "";
        });
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) {
          setReservationsBusy(false);
        }
      }
    }

    void loadReservations();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchoolId, context.managedAppId, session?.claims.user_uuid]);

  useEffect(() => {
    if (!session || currentSection !== "pois" || !activeSchoolId) {
      return;
    }

    let cancelled = false;

    async function loadSchoolPOIs() {
      setPoiBusy(true);
      try {
        const pois = await fetchSchoolPOIs(
          context.managedAppId,
          activeSchoolId,
        );
        if (cancelled) {
          return;
        }

        setPoiDrafts(sortPOIsForDisplay(pois).map(poiToDraft));
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) {
          setPoiBusy(false);
        }
      }
    }

    void loadSchoolPOIs();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    session?.claims.user_uuid,
  ]);

  useEffect(() => {
    if (!session || currentSection !== "zones" || !activeSchoolId) {
      return;
    }

    let cancelled = false;

    async function loadSchoolZones() {
      setZoneBusy(true);
      try {
        const zones = await fetchSchoolZones(
          context.managedAppId,
          activeSchoolId,
        );
        if (cancelled) {
          return;
        }

        setZoneDrafts(sortZonesForDisplay(zones).map(zoneToDraft));
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) {
          setZoneBusy(false);
        }
      }
    }

    void loadSchoolZones();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    session?.claims.user_uuid,
  ]);

  useEffect(() => {
    if (
      !session ||
      !isChallengeManagementSection(currentSection) ||
      !activeSchoolId
    ) {
      return;
    }

    let cancelled = false;

    async function loadSchoolChallenges() {
      setChallengeListBusy(true);
      try {
        const challenges = await fetchSchoolChallenges(
          context.managedAppId,
          activeSchoolId,
        );
        if (cancelled) {
          return;
        }

        setSchoolChallenges(sortChallengesForDisplay(challenges));
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) {
          setChallengeListBusy(false);
        }
      }
    }

    void loadSchoolChallenges();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    session?.claims.user_uuid,
  ]);

  useEffect(() => {
    if (
      !session ||
      !isChallengeManagementSection(currentSection) ||
      !activeSchoolId ||
      !selectedChallenge ||
      selectedChallengeId === newChallengeSelectionId
    ) {
      setChallengeParticipants((current) => (current.length ? [] : current));
      return;
    }

    let cancelled = false;
    const selectedChallengeUUID = selectedChallenge.challenge_uuid;

    async function loadChallengeParticipants() {
      setChallengeParticipantsBusy(true);
      try {
        const participants = await fetchSchoolChallengeParticipants(
          context.managedAppId,
          activeSchoolId,
          selectedChallengeUUID,
        );
        if (cancelled) {
          return;
        }

        setChallengeParticipants(participants);
      } catch (error) {
        if (!cancelled) {
          setChallengeParticipants([]);
          setBanner({
            tone: "error",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) {
          setChallengeParticipantsBusy(false);
        }
      }
    }

    void loadChallengeParticipants();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    selectedChallenge,
    selectedChallengeId,
    session?.claims.user_uuid,
  ]);

  useEffect(() => {
    if (!session || !selectedReservation) {
      setReservationStudentProfile(null);
      setReservationStudentDevicePhotoUrls({});
      setReservationStudentError("");
      return;
    }

    const studentUserUUID = selectedReservation.user_uuid;
    let cancelled = false;

    async function loadStudentProfile() {
      setReservationStudentBusy(true);
      setReservationStudentError("");
      try {
        const nextProfile = await fetchStudentProfile(
          context.managedAppId,
          studentUserUUID,
        );
        if (cancelled) {
          return;
        }

        setReservationStudentProfile(nextProfile);
        const nextDevicePhotoUrls = await resolveStudentDevicePhotoUrls(
          context.managedAppId,
          activeSchoolId,
          studentUserUUID,
          nextProfile.devices,
        );
        if (cancelled) {
          return;
        }
        setReservationStudentDevicePhotoUrls(nextDevicePhotoUrls);
      } catch (error) {
        if (!cancelled) {
          setReservationStudentProfile(null);
          setReservationStudentDevicePhotoUrls({});
          setReservationStudentError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setReservationStudentBusy(false);
        }
      }
    }

    void loadStudentProfile();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    selectedReservation,
    session?.claims.user_uuid,
  ]);

  useEffect(() => {
    if (!session || currentSection !== "packs" || !activeSchoolId) {
      return;
    }
    const adminUser = session.claims.user_uuid;

    let cancelled = false;

    async function loadSchoolPacks() {
      setPacksLoading(true);
      try {
        const packs = await fetchAdminSchoolPacks(
          adminUser,
          context.managedAppId,
          activeSchoolId,
        );
        if (cancelled) {
          return;
        }

        setSchoolPacks(sortPacksForDisplay(packs));
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled) {
          setPacksLoading(false);
        }
      }
    }

    void loadSchoolPacks();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    session?.claims.user_uuid,
  ]);

  async function refreshActiveSchool() {
    if (!session || !activeSchoolId) {
      return;
    }

    setSchoolBusy(true);
    try {
      const school = await fetchSchool(context.managedAppId, activeSchoolId);
      setSchoolDraft(schoolToDraft(school));
      setTermDrafts(school.terms.map(termToDraft));
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.toLowerCase().includes("locate school")) {
        setSchoolDraft({
          ...createEmptySchoolDraft(),
          school_id: activeSchoolId,
        });
        setTermDrafts([]);
      } else {
        setBanner({
          tone: "error",
          message,
        });
      }
    } finally {
      setSchoolBusy(false);
    }
  }

  async function refreshSchoolPOIs() {
    if (!session || !activeSchoolId) {
      return;
    }

    setPoiBusy(true);
    try {
      const pois = await fetchSchoolPOIs(context.managedAppId, activeSchoolId);
      setPoiDrafts(sortPOIsForDisplay(pois).map(poiToDraft));
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setPoiBusy(false);
    }
  }

  async function refreshSchoolZones() {
    if (!session || !activeSchoolId) {
      return;
    }

    setZoneBusy(true);
    try {
      const zones = await fetchSchoolZones(
        context.managedAppId,
        activeSchoolId,
      );
      setZoneDrafts(sortZonesForDisplay(zones).map(zoneToDraft));
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setZoneBusy(false);
    }
  }

  async function refreshSchoolChallenges() {
    if (!session || !activeSchoolId) {
      return;
    }

    setChallengeListBusy(true);
    try {
      const challenges = await fetchSchoolChallenges(
        context.managedAppId,
        activeSchoolId,
      );
      setSchoolChallenges(sortChallengesForDisplay(challenges));
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setChallengeListBusy(false);
    }
  }

  async function refreshChallengeParticipants(challengeUUID?: string) {
    if (!session || !activeSchoolId) {
      return;
    }

    const targetChallengeUUID =
      challengeUUID || selectedChallenge?.challenge_uuid;
    if (!targetChallengeUUID) {
      setChallengeParticipants([]);
      return;
    }

    setChallengeParticipantsBusy(true);
    try {
      const participants = await fetchSchoolChallengeParticipants(
        context.managedAppId,
        activeSchoolId,
        targetChallengeUUID,
      );
      setChallengeParticipants(participants);
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setChallengeParticipantsBusy(false);
    }
  }

  async function refreshSchoolPacks() {
    if (!session || !activeSchoolId) {
      return;
    }
    const adminUser = session.claims.user_uuid;

    setPacksLoading(true);
    try {
      const packs = await fetchAdminSchoolPacks(
        adminUser,
        context.managedAppId,
        activeSchoolId,
      );
      setSchoolPacks(sortPacksForDisplay(packs));
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setPacksLoading(false);
    }
  }

  async function refreshReservations() {
    if (!session || !activeSchoolId) {
      return;
    }

    setReservationsBusy(true);
    try {
      const nextReservations = await fetchPendingReservations(
        session.claims.user_uuid,
        context.managedAppId,
        activeSchoolId,
      );
      setReservations(nextReservations);
      setDashboardHeaderCounts((current) => ({
        ...current,
        pendingReservationCount: nextReservations.length,
      }));
      setSelectedReservationId((current) => {
        const hasCurrent = nextReservations.some(
          (reservation) => reservation.reservation_uuid === current,
        );
        return hasCurrent ? current : "";
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setReservationsBusy(false);
    }
  }

  async function refreshStudentRoster() {
    if (!session || !activeSchoolId) {
      return;
    }

    await studentsDispatch(
      loadStudentRoster({
        scopeKey: `${context.managedAppId}:${activeSchoolId}:${session.claims.user_uuid}`,
        managedAppId: context.managedAppId,
        schoolId: activeSchoolId,
        adminUserUUID: session.claims.user_uuid,
        force: true,
      }),
    );
  }

  async function handleSelectStudentInRoster(membershipId: string) {
    if (!session || !activeSchoolId) {
      return;
    }

    setSelectedStudentDeviceUUID(null);

    await studentsDispatch(
      loadSelectedStudentDetail({
        scopeKey: `${context.managedAppId}:${activeSchoolId}:${session.claims.user_uuid}`,
        managedAppId: context.managedAppId,
        schoolId: activeSchoolId,
        adminUserUUID: session.claims.user_uuid,
        membershipId,
      }),
    );
  }

  function handleOpenStudentFromDashboard(membershipId: string) {
    const normalizedMembershipId = membershipId.trim();
    if (!normalizedMembershipId) {
      return;
    }

    navigate(sectionPathByName.students);
    void handleSelectStudentInRoster(normalizedMembershipId);
  }

  async function handleOpenStudentDeviceFromDashboard(
    membershipId: string,
    deviceUUID: string,
  ) {
    const normalizedMembershipId = membershipId.trim();
    const normalizedDeviceUUID = deviceUUID.trim();
    if (!normalizedMembershipId) {
      return;
    }

    navigate(sectionPathByName.students);
    await handleSelectStudentInRoster(normalizedMembershipId);
    if (normalizedDeviceUUID) {
      handleOpenStudentDevice(normalizedDeviceUUID);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      const result = await loginWithIdentifier(
        identifier.trim(),
        password,
        authAppId,
      );
      setPassword("");
      if ("mfa_required" in result) {
        await prepareMFAChallenge(result);
      } else {
        setLoginLock(null);
        localStorage.removeItem(loginLockStorageKey);
        sessionEndedGuardRef.current = false;
        setSession(result);
        setAuthMode("login");
      }
    } catch (error) {
      if (error instanceof DashboardLoginLockedError) {
        const nextLock = {
          identifier: normalizeLoginIdentifier(identifier),
          blockedUntil: error.blockedUntil,
        };
        setLoginLock(nextLock);
        setLoginClockMs(Date.now());
        localStorage.setItem(loginLockStorageKey, JSON.stringify(nextLock));
      }
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function prepareMFAChallenge(challenge: MFAChallenge) {
    setMfaChallenge(challenge);
    setMfaCode("");
    setMfaEnrollment(null);
    setMfaQrCode("");
    if (challenge.enrollment_required) {
      const enrollment = await beginMFAEnrollment(
        authAppId,
        challenge.mfa_token,
      );
      setMfaEnrollment(enrollment);
      setMfaQrCode(
        await QRCode.toDataURL(enrollment.otpauth_uri, {
          // Rendered on a desktop monitor and scanned by a phone camera:
          // a wider quiet zone and higher error correction let the phone
          // lock on faster despite glare / off-angle capture.
          width: 232,
          margin: 3,
          errorCorrectionLevel: "Q",
        }),
      );
    }
  }

  async function handleMFA(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaChallenge) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const nextSession = mfaChallenge.enrollment_required
        ? await confirmMFAEnrollment(authAppId, mfaChallenge.mfa_token, mfaCode)
        : await verifyMFA(authAppId, mfaChallenge.mfa_token, mfaCode);
      sessionEndedGuardRef.current = false;
      setSession(nextSession);
      setMfaChallenge(null);
      setMfaEnrollment(null);
      setMfaQrCode("");
      setMfaCode("");
      setAuthMode("login");
      setLoginLock(null);
      localStorage.removeItem(loginLockStorageKey);
    } catch (error) {
      if (error instanceof DashboardLoginLockedError) {
        const nextLock = {
          identifier: normalizeLoginIdentifier(identifier),
          blockedUntil: error.blockedUntil,
        };
        setLoginLock(nextLock);
        setLoginClockMs(Date.now());
        localStorage.setItem(loginLockStorageKey, JSON.stringify(nextLock));
        setAuthError(getErrorMessage(error));
      } else if (isDeadMfaChallengeError(error)) {
        // The mfa_token itself is dead (its 5-minute TTL passed, or its
        // per-challenge attempt cap was hit) - every retry against it is
        // guaranteed to fail with this same error regardless of code
        // correctness. There's no way to silently mint a fresh one without
        // the password (cleared after login/signup), so send the user back
        // to sign in again instead of leaving them stuck resubmitting a dead
        // token. Force authMode to "login" - a challenge reached from
        // handleCreateSchoolAdmin leaves authMode as "signup", and
        // resubmitting the signup form here (with its password already
        // cleared) would either fail outright or attempt to recreate the
        // same account instead of showing the promised sign-in form.
        if (!identifier.trim() && signupForm.email.trim()) {
          setIdentifier(signupForm.email.trim());
        }
        setMfaChallenge(null);
        setMfaEnrollment(null);
        setMfaQrCode("");
        setMfaCode("");
        setAuthMode("login");
        setAuthError(
          "Your verification session expired. Please sign in again to continue.",
        );
      } else {
        setAuthError(getErrorMessage(error));
      }
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLoginIdentifierChange(value: string) {
    setIdentifier(value);
    if (loginLock && normalizeLoginIdentifier(value) !== loginLock.identifier) {
      setLoginLock(null);
      localStorage.removeItem(loginLockStorageKey);
      setAuthError("");
    }
  }

  function cancelMFA() {
    setMfaChallenge(null);
    setMfaEnrollment(null);
    setMfaQrCode("");
    setMfaCode("");
    setMfaCopied("");
    setAuthError("");
  }

  async function handleCreateSchoolAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      // School selection happens after MFA enrollment now, via the
      // self-service join-school flow on the post-login picker (which
      // already auto-selects the school on success) — school_id is
      // deliberately omitted here.
      const challenge = await createSchoolAdminAccount(authAppId, {
        ...signupForm,
      });
      setSignupForm((current) => ({
        ...current,
        password: "",
        join_code: "",
      }));
      await prepareMFAChallenge(challenge);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    sessionEndedGuardRef.current = true;
    void emitDashboardAudit({
      action: "dashboard.auth.logout",
      resource_type: "session",
    }).catch(() => undefined);
    setSession(null);
    setSelectedSchoolId("");
    setSchoolMemberships([]);
    setAuthError("");
    setPassword("");
    setSignupForm((current) => ({
      ...current,
      password: "",
    }));
    setBanner({
      tone: "info",
      message: "Signed out.",
    });
  }

  function handleSchoolColorChange(
    field: keyof SchoolColorScheme,
    value: string,
  ) {
    setSchoolDraft((current) => ({
      ...current,
      color_scheme: {
        ...current.color_scheme,
        [field]: value,
      },
    }));
  }

  async function handleSchoolLogoFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before uploading a logo.",
      });
      return;
    }

    setSchoolLogoUploadBusy(true);
    try {
      const upload = await uploadSchoolLogoImage(
        context.managedAppId,
        activeSchoolId,
        file,
      );

      setSchoolDraft((current) => ({
        ...current,
        logo_url: upload.logo_url,
      }));
      setBanner({
        tone: "success",
        message: "Uploaded school logo.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setSchoolLogoUploadBusy(false);
    }
  }

  async function handleSaveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const schoolId = schoolDraft.school_id.trim();
    if (!schoolId) {
      setBanner({
        tone: "error",
        message: "school_id is required before saving.",
      });
      return;
    }

    setSchoolBusy(true);
    try {
      const savedSchool = await saveSchool(context.managedAppId, schoolId, {
        name: schoolDraft.name.trim(),
        title: schoolDraft.title.trim(),
        logo_url: schoolDraft.logo_url.trim(),
        default_campus_id: schoolDraft.default_campus_id.trim(),
        color_scheme: sanitizeSchoolColorScheme(schoolDraft.color_scheme),
        metadata: parseObjectJson(schoolDraft.metadata, "Metadata"),
        active: schoolDraft.active,
      });

      setSchoolDraft(schoolToDraft(savedSchool));
      setTermDrafts(savedSchool.terms.map(termToDraft));
      setBanner({
        tone: "success",
        message: `Saved school ${savedSchool.school_id}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setSchoolBusy(false);
    }
  }

  async function handleSaveTerms() {
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before managing terms.",
      });
      return;
    }

    setSchoolBusy(true);
    try {
      const savedTerms = await saveSchoolTerms(
        context.managedAppId,
        activeSchoolId,
        termDrafts.map((term) => ({
          term_uuid: term.term_uuid.trim() || undefined,
          name: term.name.trim(),
          start_date: term.start_date,
          end_date: term.end_date,
        })),
      );

      setTermDrafts(savedTerms.map(termToDraft));
      setBanner({
        tone: "success",
        message: `Updated ${savedTerms.length} school terms.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setSchoolBusy(false);
    }
  }

  function handlePackLocationSelect(point: PackMapPoint) {
    setPackDraft((current) => ({
      ...current,
      lat: formatCoordinateValue(point.lat),
      lng: formatCoordinateValue(point.lng),
    }));
  }

  function resetPackCreateForm(
    defaultCampusId = schoolDraft.default_campus_id,
  ) {
    setPackDraft(createEmptyPackDraft(defaultCampusId ?? ""));
    setPackPhotoFile(null);
    setPackPhotoPreviewUrl("");
  }

  async function handlePackPhotoFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const previewUrl = await readFileAsDataUrl(file);
      setPackPhotoFile(file);
      setPackPhotoPreviewUrl(previewUrl);
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    }
  }

  function handleStartEditingPack(pack: Pack) {
    setEditingPackId(pack.pack_uuid);
    setPackEditDraft(packToEditDraft(pack));
    setPackEditPhotoFile(null);
    setPackEditPhotoPreviewUrl("");
  }

  function handleCancelPackEdit() {
    setEditingPackId("");
    setPackEditDraft(null);
    setPackEditPhotoFile(null);
    setPackEditPhotoPreviewUrl("");
  }

  async function handlePackEditPhotoFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const previewUrl = await readFileAsDataUrl(file);
      setPackEditPhotoFile(file);
      setPackEditPhotoPreviewUrl(previewUrl);
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    }
  }

  async function handleSavePackEdit(
    event: FormEvent<HTMLFormElement>,
    pack: Pack,
  ) {
    event.preventDefault();

    if (!session || !packEditDraft) {
      return;
    }

    const trimmedLat = packEditDraft.lat.trim();
    const trimmedLng = packEditDraft.lng.trim();
    let location: PackMapPoint | undefined;

    try {
      if ((trimmedLat && !trimmedLng) || (!trimmedLat && trimmedLng)) {
        throw new Error(
          "Provide both latitude and longitude to update the pack pin.",
        );
      }

      if (trimmedLat && trimmedLng) {
        location = {
          lat: parseCoordinateInput(trimmedLat, "Latitude"),
          lng: parseCoordinateInput(trimmedLng, "Longitude"),
        };
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return;
    }

    setPackEditBusy(true);
    try {
      const updatedPack = await updateSchoolPack(
        session.claims.user_uuid,
        context.managedAppId,
        pack.pack_uuid,
        {
          name: packEditDraft.name.trim(),
          description: packEditDraft.description.trim(),
          location,
        },
        packEditPhotoFile,
      );

      upsertSchoolPack(updatedPack);
      handleCancelPackEdit();
      setBanner({
        tone: "success",
        message: `Updated Juise Pack ${updatedPack.name || updatedPack.pack_uuid}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setPackEditBusy(false);
    }
  }

  function handlePoiLocationSelect(point: PackMapPoint) {
    if (!activePoiDraftId) {
      return;
    }

    setPoiDrafts((current) =>
      current.map((poi) =>
        poi.id === activePoiDraftId
          ? {
              ...poi,
              lat: formatCoordinateValue(point.lat),
              lng: formatCoordinateValue(point.lng),
            }
          : poi,
      ),
    );
  }

  function handleZonePointAdd(point: PackMapPoint) {
    if (!activeZoneDraftId) {
      return;
    }

    setZoneDrafts((current) =>
      current.map((zone) =>
        zone.id === activeZoneDraftId
          ? {
              ...zone,
              polygon: [...zone.polygon, point],
            }
          : zone,
      ),
    );
  }

  function handleZonePointMove(pointIndex: number, point: PackMapPoint) {
    if (!activeZoneDraftId) {
      return;
    }

    setZoneDrafts((current) =>
      current.map((zone) =>
        zone.id === activeZoneDraftId
          ? {
              ...zone,
              polygon: zone.polygon.map((existingPoint, index) =>
                index === pointIndex ? point : existingPoint,
              ),
            }
          : zone,
      ),
    );
  }

  function handleZonePointInsert(pointIndex: number, point: PackMapPoint) {
    if (!activeZoneDraftId) {
      return;
    }

    setZoneDrafts((current) =>
      current.map((zone) =>
        zone.id === activeZoneDraftId
          ? {
              ...zone,
              polygon: [
                ...zone.polygon.slice(0, pointIndex),
                point,
                ...zone.polygon.slice(pointIndex),
              ],
            }
          : zone,
      ),
    );
  }

  async function handleSavePOIs(nextPoiDrafts = poiDrafts): Promise<boolean> {
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before managing POIs.",
      });
      return false;
    }

    setPoiBusy(true);
    try {
      const savedPOIs = await saveSchoolPOIs(
        context.managedAppId,
        activeSchoolId,
        nextPoiDrafts.map((poi, index) => {
          const title = poi.title.trim();
          if (!title) {
            throw new Error(`POI ${index + 1} title is required.`);
          }

          const lat = parseCoordinateInput(
            poi.lat,
            `POI ${index + 1} latitude`,
          );
          const lng = parseCoordinateInput(
            poi.lng,
            `POI ${index + 1} longitude`,
          );
          const bonusPoints = Number.parseInt(poi.bonus_points.trim(), 10);
          if (!Number.isFinite(bonusPoints) || bonusPoints < 0) {
            throw new Error(
              `POI ${index + 1} bonus points must be a whole number greater than or equal to 0.`,
            );
          }
          const radiusFeet = parsePOIRadiusFeet(
            poi.radius_feet,
            `POI ${index + 1} entry radius`,
          );

          return {
            poi_uuid: poi.poi_uuid.trim() || undefined,
            title,
            description: poi.description.trim(),
            lat,
            lng,
            radius_meters: feetToMeters(radiusFeet),
            bonus_points: bonusPoints,
          };
        }),
      );

      setPoiDrafts(sortPOIsForDisplay(savedPOIs).map(poiToDraft));
      setBanner({
        tone: "success",
        message: `Updated ${savedPOIs.length} school point${savedPOIs.length === 1 ? "" : "s"} of interest.`,
      });
      return true;
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return false;
    } finally {
      setPoiBusy(false);
    }
  }

  async function handleSaveZones(
    nextZoneDrafts = zoneDrafts,
  ): Promise<boolean> {
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before managing zones.",
      });
      return false;
    }

    setZoneBusy(true);
    try {
      const savedZones = await saveSchoolZones(
        context.managedAppId,
        activeSchoolId,
        nextZoneDrafts.map((zone, index) => {
          const title = zone.title.trim();
          if (!title) {
            throw new Error(`Zone ${index + 1} title is required.`);
          }
          if (zone.polygon.length < 3) {
            throw new Error(
              `Zone ${index + 1} needs at least 3 polygon points.`,
            );
          }

          const speedLimitMPH = zone.speed_limit_mph.trim();
          if (zone.zone_type === "speed_limit") {
            const parsedSpeedLimit = Number(speedLimitMPH);
            if (!Number.isFinite(parsedSpeedLimit) || parsedSpeedLimit <= 0) {
              throw new Error(
                `Zone ${index + 1} speed limit must be greater than 0 mph.`,
              );
            }

            return {
              zone_uuid: zone.zone_uuid.trim() || undefined,
              title,
              description: zone.description.trim(),
              zone_type: zone.zone_type,
              speed_limit_mph: parsedSpeedLimit,
              punishment_policy: zone.punishment_policy,
              polygon: zone.polygon.map((point) => ({
                lat: point.lat,
                lng: point.lng,
              })),
            };
          }

          return {
            zone_uuid: zone.zone_uuid.trim() || undefined,
            title,
            description: zone.description.trim(),
            zone_type: zone.zone_type,
            speed_limit_mph: null,
            punishment_policy: zone.punishment_policy,
            polygon: zone.polygon.map((point) => ({
              lat: point.lat,
              lng: point.lng,
            })),
          };
        }),
      );

      setZoneDrafts(sortZonesForDisplay(savedZones).map(zoneToDraft));
      setBanner({
        tone: "success",
        message: `Updated ${savedZones.length} school zone${savedZones.length === 1 ? "" : "s"}.`,
      });
      return true;
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return false;
    } finally {
      setZoneBusy(false);
    }
  }

  async function handleChallengeImageFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message:
          "Save the school profile first before uploading challenge media.",
      });
      return;
    }

    setChallengeImageUploadBusy(true);
    try {
      const upload = await uploadSchoolChallengeImage(
        context.managedAppId,
        activeSchoolId,
        file,
      );

      setChallengeDraft((current) => ({
        ...current,
        image_url: upload.public_url,
      }));
      setBanner({
        tone: "success",
        message: "Uploaded challenge image.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setChallengeImageUploadBusy(false);
    }
  }

  async function handleSaveChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before managing challenges.",
      });
      return;
    }

    let targetValue = 0;
    let startTime = 0;
    let endTime = 0;
    let repeatCount = 1;
    let repeatIntervalValue = 1;
    let checkpointInputs: SchoolChallengeCheckpointWriteInput[] = [];
    let minAccuracyMeters = 50;
    let requiredDwellSeconds = 30;
    let grandPrizePoints = 0;
    const isScavengerHunt = challengeDraft.challenge_type === "scavenger_hunt";

    try {
      if (isScavengerHunt) {
        checkpointInputs = challengeDraft.checkpoints.map(
          checkpointDraftToWriteInput,
        );
        const activeCheckpointCount = checkpointInputs.filter(
          (checkpoint) => checkpoint.active !== false,
        ).length;
        if (activeCheckpointCount <= 0) {
          throw new Error("Scavenger hunts need at least one active stop.");
        }
        targetValue = activeCheckpointCount;
        minAccuracyMeters = Number(
          challengeDraft.min_accuracy_meters.trim() || "50",
        );
        if (!Number.isFinite(minAccuracyMeters) || minAccuracyMeters <= 0) {
          throw new Error("Minimum GPS accuracy must be greater than 0.");
        }
        requiredDwellSeconds = Number(
          challengeDraft.required_dwell_seconds.trim() || "30",
        );
        if (
          !Number.isFinite(requiredDwellSeconds) ||
          requiredDwellSeconds <= 0
        ) {
          throw new Error(
            "Required visit time must be greater than 0 seconds.",
          );
        }
        grandPrizePoints = Number(
          challengeDraft.grand_prize_points.trim() || "0",
        );
        if (!Number.isFinite(grandPrizePoints) || grandPrizePoints < 0) {
          throw new Error("Grand prize points must be 0 or greater.");
        }
      } else {
        targetValue = Number(challengeDraft.target_value.trim());
        if (!Number.isFinite(targetValue) || targetValue <= 0) {
          throw new Error("Challenge target must be greater than 0.");
        }
      }

      startTime = parseDateTimeLocalInput(
        challengeDraft.start_time,
        "Challenge start",
      );
      endTime = parseDateTimeLocalInput(
        challengeDraft.end_time,
        "Challenge end",
      );
      if (endTime <= startTime) {
        throw new Error("Challenge end must be after the start time.");
      }
      if (
        !isScavengerHunt &&
        challengeDraft.repeat_enabled &&
        !challengeDraft.challenge_uuid
      ) {
        repeatCount = Number.parseInt(challengeDraft.repeat_count.trim(), 10);
        repeatIntervalValue = Number.parseInt(
          challengeDraft.repeat_interval_value.trim(),
          10,
        );
        if (
          !Number.isFinite(repeatCount) ||
          repeatCount < 2 ||
          repeatCount > 52
        ) {
          throw new Error("Repeat submissions must be between 2 and 52.");
        }
        if (
          repeatCount > 1 &&
          (!Number.isFinite(repeatIntervalValue) || repeatIntervalValue <= 0)
        ) {
          throw new Error("Repeat interval must be greater than 0.");
        }
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return;
    }

    const payload: SchoolChallengeWriteInput = {
      challenge_type: challengeDraft.challenge_type,
      audience_type: isScavengerHunt ? "user" : challengeDraft.audience_type,
      title: challengeDraft.title.trim(),
      description: challengeDraft.description.trim(),
      image_url: challengeDraft.image_url.trim(),
      metric_type: isScavengerHunt ? "points" : challengeDraft.metric_type,
      target_value: targetValue,
      game_config: isScavengerHunt
        ? {
            sequential_unlock: true,
            min_accuracy_meters: minAccuracyMeters,
            required_dwell_seconds: requiredDwellSeconds,
            grand_prize_points: grandPrizePoints,
            dwell_sample_interval_seconds: 5,
          }
        : {},
      checkpoints: isScavengerHunt ? checkpointInputs : [],
      start_time: startTime,
      end_time: endTime,
      active: challengeDraft.active,
      ...(!challengeDraft.challenge_uuid &&
      !isScavengerHunt &&
      challengeDraft.repeat_enabled &&
      repeatCount > 1
        ? {
            repeat: {
              interval_value: repeatIntervalValue,
              interval_unit: challengeDraft.repeat_interval_unit,
              count: repeatCount,
            },
          }
        : {}),
    };

    // Editing a challenge that belongs to a repeat series: ask which scope
    // the edit applies to (Google Calendar-style) before actually saving.
    // Only offered when the occurrence being edited is itself active -
    // apply_to_series only touches active siblings server-side, so
    // "All N" from an inactive occurrence would silently leave the one
    // actually being edited untouched while updating everything else.
    if (
      challengeDraft.challenge_uuid &&
      selectedChallenge?.active &&
      selectedChallenge?.series_uuid
    ) {
      const seriesCount = schoolChallenges.filter(
        (existing) =>
          existing.active &&
          existing.series_uuid &&
          existing.series_uuid === selectedChallenge.series_uuid,
      ).length;
      if (seriesCount > 1) {
        setSeriesEditPrompt({ payload, seriesCount });
        return;
      }
    }

    await performSaveChallenge(payload, false);
  }

  async function performSaveChallenge(
    payload: SchoolChallengeWriteInput,
    applyToSeries: boolean,
  ) {
    if (!activeSchoolId) {
      return;
    }

    const isEditingExisting = Boolean(challengeDraft.challenge_uuid);
    const isScavengerHunt = payload.challenge_type === "scavenger_hunt";

    setChallengeBusy(true);
    try {
      let savedChallenges: SchoolChallenge[];
      let updatedSeriesCount = 0;

      if (isEditingExisting) {
        const result = await updateSchoolChallenge(
          context.managedAppId,
          activeSchoolId,
          challengeDraft.challenge_uuid,
          { ...payload, apply_to_series: applyToSeries },
        );
        if (result.seriesChallenges && result.seriesChallenges.length > 1) {
          savedChallenges = result.seriesChallenges;
          updatedSeriesCount = result.seriesChallenges.length;
        } else {
          savedChallenges = [result.challenge];
        }
      } else {
        savedChallenges = getCreatedChallenges(
          await createSchoolChallenge(
            context.managedAppId,
            activeSchoolId,
            payload,
          ),
        );
      }

      const savedChallenge = savedChallenges[0];

      setSchoolChallenges((current) =>
        sortChallengesForDisplay([
          ...savedChallenges,
          ...current.filter(
            (challenge) =>
              !savedChallenges.some(
                (saved) => saved.challenge_uuid === challenge.challenge_uuid,
              ),
          ),
        ]),
      );
      if (isEditingExisting) {
        // Editing an existing challenge returns to the table, the same way
        // deleting one does.
        setSelectedChallengeId("");
        setChallengeDraft(createEmptyChallengeDraft());
        setChallengeParticipants([]);
      } else {
        setSelectedChallengeId(savedChallenge.challenge_uuid);
        setChallengeDraft(challengeToDraft(savedChallenge));
        await refreshChallengeParticipants(savedChallenge.challenge_uuid);
      }
      const savedKind = isScavengerHunt ? "game" : "challenge";
      setBanner({
        tone: "success",
        message:
          updatedSeriesCount > 1
            ? `Updated ${updatedSeriesCount} challenges in this series.`
            : savedChallenges.length > 1
              ? `Created ${savedChallenges.length} repeated challenges from ${savedChallenge.title}.`
              : `${isEditingExisting ? "Updated" : "Created"} ${savedKind} ${savedChallenge.title}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setChallengeBusy(false);
    }
  }

  function handleConfirmSeriesEdit(applyToSeries: boolean) {
    if (!seriesEditPrompt) {
      return;
    }
    const { payload } = seriesEditPrompt;
    setSeriesEditPrompt(null);
    void performSaveChallenge(payload, applyToSeries);
  }

  function handleCopyChallengeForResubmit(challenge: SchoolChallenge) {
    setSelectedChallengeId(newChallengeSelectionId);
    setChallengeDraft(challengeToResubmitDraft(challenge));
    setChallengeParticipants([]);
    setBanner({
      tone: "info",
      message: `Copied ${challenge.title}. Adjust the schedule, then create it again.`,
    });
  }

  async function handleDeleteSelectedChallenge() {
    if (!selectedChallenge || !activeSchoolId) {
      return;
    }

    const shouldContinue = window.confirm(
      `Delete ${
        isScavengerHuntChallengeRecord(selectedChallenge) ? "game" : "challenge"
      } "${selectedChallenge.title}"? Riders will no longer be able to join it.`,
    );
    if (!shouldContinue) {
      return;
    }

    setChallengeBusy(true);
    try {
      await deleteSchoolChallenge(
        context.managedAppId,
        activeSchoolId,
        selectedChallenge.challenge_uuid,
      );
      setSchoolChallenges((current) =>
        current.filter(
          (challenge) =>
            challenge.challenge_uuid !== selectedChallenge.challenge_uuid,
        ),
      );
      setChallengeParticipants([]);
      setSelectedChallengeId("");
      setChallengeDraft(createEmptyChallengeDraft());
      setBanner({
        tone: "success",
        message: `Deleted ${
          isScavengerHuntChallengeRecord(selectedChallenge)
            ? "game"
            : "challenge"
        } ${selectedChallenge.title}.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setChallengeBusy(false);
    }
  }

  async function createPackFromDraft(
    draft: PackDraft,
    photoFile: File | null = null,
  ): Promise<boolean> {
    if (!session) {
      return false;
    }
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "This admin login is not scoped to a school.",
      });
      return false;
    }

    let parsedLat = 0;
    let parsedLng = 0;
    let parsedSpotCount = 0;

    try {
      parsedLat = parseCoordinateInput(draft.lat, "Latitude");
      parsedLng = parseCoordinateInput(draft.lng, "Longitude");
      parsedSpotCount = Number.parseInt(draft.number_of_spots.trim(), 10);
      if (!Number.isFinite(parsedSpotCount) || parsedSpotCount < 1) {
        throw new Error("Number of spots must be greater than 0.");
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return false;
    }

    setPackBusy(true);
    try {
      const campusId =
        draft.campus_id.trim() ||
        schoolDraft.default_campus_id.trim() ||
        undefined;
      const created = await createSchoolPack(
        session.claims.user_uuid,
        {
          name: draft.name.trim() || undefined,
          description: draft.description.trim() || undefined,
          number_of_spots: parsedSpotCount,
          location: {
            lat: parsedLat,
            lng: parsedLng,
          },
          school_owner: {
            app_id: context.managedAppId,
            school_id: activeSchoolId,
            campus_id: campusId,
          },
        },
        photoFile,
      );

      setSchoolPacks((current) =>
        sortPacksForDisplay([
          created,
          ...current.filter((pack) => pack.pack_uuid !== created.pack_uuid),
        ]),
      );
      resetPackCreateForm(campusId ?? "");
      setBanner({
        tone: "success",
        message: `Created Juise Pack ${created.name || created.pack_uuid} for school ${activeSchoolId}.`,
      });
      return true;
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return false;
    } finally {
      setPackBusy(false);
    }
  }

  async function handleCreatePack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createPackFromDraft(packDraft, packPhotoFile);
  }

  async function handleApproveSelected() {
    if (!session || !selectedReservation) {
      return;
    }

    setReservationsBusy(true);
    try {
      await approveReservation(
        session.claims.user_uuid,
        context.managedAppId,
        selectedReservation.reservation_uuid,
      );
      setBanner({
        tone: "success",
        message: `Approved ${selectedReservation.reservation_uuid}.`,
      });
      await refreshReservations();
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setReservationsBusy(false);
    }
  }

  async function handleDenySelected() {
    if (!session || !selectedReservation) {
      return;
    }

    const shouldContinue = window.confirm(
      `Deny reservation ${selectedReservation.reservation_uuid}? This removes it from the pending queue.`,
    );
    if (!shouldContinue) {
      return;
    }

    setReservationsBusy(true);
    try {
      await denyReservation(
        session.claims.user_uuid,
        context.managedAppId,
        selectedReservation.reservation_uuid,
      );
      setBanner({
        tone: "success",
        message: `Denied ${selectedReservation.reservation_uuid}.`,
      });
      await refreshReservations();
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setReservationsBusy(false);
    }
  }

  if (authInitializing) {
    return (
      <div className="login-shell">
        <div className="login-center-card">
          <img
            src="/Juise_Icon_Bolt.png"
            className="login-brand-icon"
            alt="Juise"
          />
          <p className="login-brand-title">Juise Rider Admin Dashboard</p>
          <p className="login-initializing-text">Restoring session…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <div className="login-shell">
          <div
            className={
              mfaChallenge?.enrollment_required && mfaEnrollment
                ? "login-center-card login-center-card--mfa-enroll"
                : "login-center-card"
            }
          >
            <img
              src="/Juise_Icon_Bolt.png"
              className="login-brand-icon"
              alt="Juise"
            />
            <p className="login-brand-title">Juise Rider Admin Dashboard</p>

            {mfaChallenge ? (
              <form className="login-form mfa-form" onSubmit={handleMFA}>
                {/* Present-but-hidden username so the browser / password
                    manager keeps the sign-in it just saw associated with
                    this step: it can finish offering to save the password,
                    and for returning users it can attach or surface the
                    verification code against the right login. */}
                <input
                  className="mfa-username-hint"
                  type="text"
                  name="username"
                  autoComplete="username"
                  tabIndex={-1}
                  aria-hidden="true"
                  readOnly
                  value={identifier.trim() || signupForm.email.trim()}
                />
                <div className="login-form-header">
                  <p className="eyebrow">Two-step verification</p>
                  <h2>
                    {mfaChallenge.enrollment_required
                      ? "Set up two-step verification"
                      : "Enter your security code"}
                  </h2>
                  <p className="mfa-help">
                    {mfaChallenge.enrollment_required
                      ? "Add this account to an authenticator app or to your iPhone, then enter the 6-digit code it shows."
                      : "Enter the 6-digit code from your authenticator app or one of your recovery codes."}
                  </p>
                </div>
                {mfaChallenge.enrollment_required && !mfaEnrollment ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={authBusy}
                    onClick={() => void prepareMFAChallenge(mfaChallenge)}
                  >
                    Retry authenticator setup
                  </button>
                ) : null}
                {mfaChallenge.enrollment_required && mfaEnrollment ? (
                  <>
                    <div className="mfa-enroll-layout">
                      <div className="mfa-enroll-qr">
                        {mfaQrCode ? (
                          <img
                            className="mfa-qr-code"
                            src={mfaQrCode}
                            alt="Two-step verification setup QR code"
                          />
                        ) : (
                          <div
                            className="mfa-qr-code mfa-qr-code--pending"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="mfa-methods">
                        <div className="mfa-method">
                          <p className="mfa-method-title">
                            Use an authenticator app
                          </p>
                          <ol>
                            <li>
                              Install <strong>Google Authenticator</strong>,
                              Microsoft Authenticator, Authy, or 1Password.
                            </li>
                            <li>
                              Tap <strong>+</strong> &rarr; &ldquo;Scan a QR
                              code&rdquo; and point it at the code.
                            </li>
                          </ol>
                        </div>
                        <div className="mfa-method">
                          <p className="mfa-method-title">
                            Or scan with your iPhone
                          </p>
                          <ol>
                            <li>
                              Open the <strong>Camera</strong> app and point it
                              at the code.
                            </li>
                            <li>
                              Tap the pop-up &mdash; choose your saved Juise
                              login, or tap <strong>+</strong> to add one with
                              your username and password.
                            </li>
                          </ol>
                        </div>
                      </div>
                      <div className="mfa-secret">
                        <span>Can&rsquo;t scan? Add the key manually</span>
                        <code>{mfaEnrollment.secret}</code>
                        <div className="mfa-panel-actions">
                          <button
                            type="button"
                            className="mfa-chip-button"
                            onClick={() =>
                              void copyMfaText(mfaEnrollment.secret, "secret")
                            }
                          >
                            {mfaCopied === "secret" ? "Copied!" : "Copy key"}
                          </button>
                          <button
                            type="button"
                            className="mfa-chip-button"
                            onClick={() =>
                              void copyMfaText(mfaEnrollment.otpauth_uri, "uri")
                            }
                          >
                            {mfaCopied === "uri" ? "Copied!" : "Copy setup link"}
                          </button>
                        </div>
                        <p className="mfa-panel-hint">
                          Use this if your app asks for a key instead of
                          scanning. On iPhone: Passwords app &rarr;{" "}
                          <strong>+</strong> &rarr; New Password &rarr; Set Up
                          Verification Code &rarr; Enter Setup Key.
                        </p>
                      </div>
                    </div>
                    <p className="mfa-enroll-hint">
                      Enter the 6-digit code from your app below. Save your
                      recovery codes first &mdash; open the section beneath it.
                    </p>
                    <details className="mfa-recovery-codes">
                      <summary>
                        Recovery codes ({mfaEnrollment.recovery_codes.length})
                        &mdash; save these before you finish
                      </summary>
                      <p>
                        They will not be shown again. Each code can be used once
                        if you lose access to your authenticator app.
                      </p>
                      <ul className="mfa-recovery-code-list">
                        {mfaEnrollment.recovery_codes.map((code) => (
                          <li key={code}>
                            <code>{code}</code>
                          </li>
                        ))}
                      </ul>
                      <div className="mfa-recovery-actions">
                        <button
                          type="button"
                          className="mfa-chip-button"
                          onClick={() =>
                            void copyMfaText(
                              mfaEnrollment.recovery_codes.join("\n"),
                              "codes",
                            )
                          }
                        >
                          {mfaCopied === "codes" ? "Copied!" : "Copy all codes"}
                        </button>
                        <button
                          type="button"
                          className="mfa-chip-button"
                          onClick={() =>
                            downloadRecoveryCodes(mfaEnrollment.recovery_codes)
                          }
                        >
                          Download .txt
                        </button>
                      </div>
                    </details>
                  </>
                ) : null}
                {!mfaChallenge.enrollment_required || mfaEnrollment ? (
                  <label className="field">
                    <span>Authenticator or recovery code</span>
                    <input
                      autoComplete="one-time-code"
                      inputMode={
                        mfaChallenge.enrollment_required ? "numeric" : "text"
                      }
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      maxLength={
                        mfaChallenge.enrollment_required ? 6 : undefined
                      }
                      value={mfaCode}
                      onChange={(event) => {
                        // Authenticator apps and paste often include a
                        // space ("123 456"); during enrollment the code is
                        // always 6 digits, so strip anything else.
                        const value = mfaChallenge.enrollment_required
                          ? event.target.value.replace(/\D/g, "").slice(0, 6)
                          : event.target.value.replace(/\s/g, "");
                        setMfaCode(value);
                        if (/^\d{6}$/.test(value) && !authBusy) {
                          const form = event.target.form;
                          window.setTimeout(() => form?.requestSubmit(), 0);
                        }
                      }}
                      placeholder={
                        mfaChallenge.enrollment_required
                          ? "123456"
                          : "123456 or recovery code"
                      }
                      minLength={6}
                      required
                      autoFocus
                    />
                  </label>
                ) : null}
                {loginIsLocked ? (
                  <div className="login-lock-notice" role="alert">
                    <div>
                      <strong>Sign-in temporarily unavailable</strong>
                      <span>Please wait before trying again.</span>
                    </div>
                    <time aria-label={`${loginLockSeconds} seconds remaining`}>
                      {formatLoginLockCountdown(loginLockSeconds)}
                    </time>
                  </div>
                ) : null}
                {authError && !loginIsLocked ? (
                  <p className="error-text">{authError}</p>
                ) : null}
                {!mfaChallenge.enrollment_required || mfaEnrollment ? (
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={
                      authBusy || loginIsLocked || mfaCode.trim().length < 6
                    }
                  >
                    {authBusy
                      ? "Verifying…"
                      : mfaChallenge.enrollment_required
                        ? "Enable MFA and Continue"
                        : "Verify and Sign In"}
                  </button>
                ) : null}
                <button
                  className="text-button"
                  type="button"
                  onClick={cancelMFA}
                  disabled={authBusy}
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <>
                <div className="auth-switcher">
                  <button
                    className={
                      authMode === "signup"
                        ? "nav-button nav-button-active"
                        : "nav-button"
                    }
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError("");
                    }}
                  >
                    Create Account
                  </button>
                  <button
                    className={
                      authMode === "login"
                        ? "nav-button nav-button-active"
                        : "nav-button"
                    }
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                    }}
                  >
                    Sign In
                  </button>
                </div>

                {authMode === "signup" ? (
                  <form
                    className="login-form"
                    onSubmit={handleCreateSchoolAdmin}
                  >
                    <div className="login-form-header">
                      <p className="eyebrow">School Admin Signup</p>
                      <h2>Create your dashboard account</h2>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        <span>First name</span>
                        <input
                          name="given-name"
                          autoComplete="given-name"
                          value={signupForm.first}
                          onChange={(event) =>
                            setSignupForm((current) => ({
                              ...current,
                              first: event.target.value,
                            }))
                          }
                          placeholder="Avery"
                        />
                      </label>
                      <label className="field">
                        <span>Last name</span>
                        <input
                          name="family-name"
                          autoComplete="family-name"
                          value={signupForm.last}
                          onChange={(event) =>
                            setSignupForm((current) => ({
                              ...current,
                              last: event.target.value,
                            }))
                          }
                          placeholder="Morgan"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Username</span>
                      <input
                        id="signup-username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={signupForm.username}
                        onChange={(event) =>
                          setSignupForm((current) => ({
                            ...current,
                            username: event.target.value,
                          }))
                        }
                        placeholder="ou.parking"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        id="signup-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={signupForm.email}
                        onChange={(event) =>
                          setSignupForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        placeholder="parking@school.edu"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Phone (optional)</span>
                      <input
                        name="tel"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        value={signupForm.phone}
                        onChange={(event) =>
                          setSignupForm((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        placeholder="+12485551212"
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        id="signup-password"
                        name="new-password"
                        type="password"
                        autoComplete="new-password"
                        value={signupForm.password}
                        onChange={(event) =>
                          setSignupForm((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        placeholder="••••••••"
                        required
                      />
                    </label>
                    {authError ? (
                      <p className="error-text">{authError}</p>
                    ) : null}
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={authBusy}
                    >
                      Continue
                    </button>
                  </form>
                ) : (
                  <form className="login-form" onSubmit={handleLogin}>
                    <div className="login-form-header">
                      <p className="eyebrow">Admin Login</p>
                      <h2>Welcome back</h2>
                    </div>
                    {loginIsLocked ? (
                      <div className="login-lock-notice" role="alert">
                        <div>
                          <strong>Sign-in temporarily unavailable</strong>
                          <span>Please wait before trying again.</span>
                        </div>
                        <time
                          aria-label={`${loginLockSeconds} seconds remaining`}
                        >
                          {formatLoginLockCountdown(loginLockSeconds)}
                        </time>
                      </div>
                    ) : null}
                    <label className="field">
                      <span>Username, email, or phone</span>
                      <input
                        id="admin-identifier"
                        name="username"
                        type="text"
                        autoComplete="username"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={identifier}
                        onChange={(event) =>
                          handleLoginIdentifierChange(event.target.value)
                        }
                        placeholder="admin@example.com"
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        id="admin-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </label>
                    {authError && !loginIsLocked ? (
                      <p className="error-text">{authError}</p>
                    ) : null}
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={authBusy || loginIsLocked}
                    >
                      {authBusy
                        ? "Signing in…"
                        : loginIsLocked
                          ? `Try again in ${formatLoginLockCountdown(loginLockSeconds)}`
                          : "Enter Dashboard"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  // Show the picker when there's no selection, or when a persisted selection
  // could not be confirmed as an active membership once the lookup settled
  // (revoked, or the lookup failed). Otherwise the retry / error UI below is
  // unreachable and the user lands in an unscoped dashboard. The
  // `!schoolMembershipsLoading` guard keeps a re-lookup (e.g. after a join,
  // or a "Try again") from briefly dropping the picker while it runs.
  if (
    !selectedSchoolId ||
    (membershipsResolved && !schoolMembershipsLoading && !activeSchoolId)
  ) {
    return (
      <div className="login-shell">
        <div className="login-center-card school-selection-card">
          <img
            src="/Juise_Icon_Bolt.png"
            className="login-brand-icon"
            alt="Juise"
          />
          <p className="login-brand-title">Juise Rider Admin Dashboard</p>
          <div className="login-form-header school-selection-header">
            <p className="eyebrow">School setup</p>
            <h2>Choose your school</h2>
            <p className="mfa-help">
              Select which school you want to manage this session.
            </p>
          </div>

          <div className="school-selection-layout">
            <section className="school-selection-panel">
              <div className="school-selection-panel-header">
                <div>
                  <p className="eyebrow">Your schools</p>
                  <h3>Choose a school to manage</h3>
                </div>
                <span className="school-selection-count">
                  {activeMemberships.length}
                </span>
              </div>
              {schoolMembershipsLoading ? (
                <p className="login-initializing-text">Loading your schools…</p>
              ) : schoolMembershipsError && activeMemberships.length === 0 ? (
                <div className="school-selection-load-error">
                  <p className="mfa-help">
                    We couldn&rsquo;t load your schools. {schoolMembershipsError}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setMembershipsReloadKey((key) => key + 1)}
                  >
                    Try again
                  </button>
                </div>
              ) : activeMemberships.length > 0 ? (
                <div className="school-option-list" role="list">
                  {activeMemberships.map((membership) => {
                    const school = findPickerSchool(membership.school_id);
                    return (
                      <div
                        key={membership.membership_uuid}
                        className="school-option-row"
                      >
                        {school ? (
                          <SchoolOptionCard
                            school={school}
                            onClick={() =>
                              setSelectedSchoolId(membership.school_id)
                            }
                          />
                        ) : (
                          <button
                            type="button"
                            className="school-option-card"
                            onClick={() =>
                              setSelectedSchoolId(membership.school_id)
                            }
                          >
                            <span className="school-option-logo school-option-logo-placeholder">
                              {(membership.school_id || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                            <span className="school-option-name">
                              {membership.school_id || "Unknown school"}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="school-option-leave-button"
                          onClick={(event) =>
                            promptLeaveSchool(membership, event)
                          }
                          disabled={
                            leavingMembershipUuid === membership.membership_uuid
                          }
                          title={`Leave ${schoolDisplayName(membership.school_id)}`}
                          aria-label={`Leave ${schoolDisplayName(membership.school_id)}`}
                        >
                          {leavingMembershipUuid === membership.membership_uuid
                            ? "…"
                            : "🗑"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mfa-help">
                  You don't have access to any schools yet. Join one from the
                  panel beside this one.
                </p>
              )}
            </section>

            <section className="school-selection-panel school-selection-join-panel">
              <div className="school-selection-panel-header">
                <div>
                  <p className="eyebrow">Join another school</p>
                  <h3>Find or create a school</h3>
                </div>
              </div>

              <div
                className="signup-school-choice"
                role="tablist"
                aria-label="Join school option"
              >
                <button
                  className={
                    joinSchoolMode === "existing"
                      ? "signup-school-choice-button signup-school-choice-button-active"
                      : "signup-school-choice-button"
                  }
                  type="button"
                  role="tab"
                  aria-selected={joinSchoolMode === "existing"}
                  onClick={() => {
                    setJoinSchoolMode("existing");
                    setJoinSchoolError("");
                    setJoinSchoolId("");
                  }}
                  disabled={joinSchoolBusy}
                >
                  Join existing school
                </button>
                <button
                  className={
                    joinSchoolMode === "new"
                      ? "signup-school-choice-button signup-school-choice-button-active"
                      : "signup-school-choice-button"
                  }
                  type="button"
                  role="tab"
                  aria-selected={joinSchoolMode === "new"}
                  onClick={() => {
                    setJoinSchoolMode("new");
                    setJoinSchoolError("");
                    setJoinSchoolId("");
                  }}
                  disabled={joinSchoolBusy}
                >
                  Create a new school
                </button>
              </div>

              {joinSchoolError ? (
                <div className="school-selection-alert" role="alert">
                  <span
                    className="school-selection-alert-icon"
                    aria-hidden="true"
                  >
                    !
                  </span>
                  <div>
                    <strong>We couldn’t complete that request</strong>
                    <p>{joinSchoolError}</p>
                  </div>
                </div>
              ) : null}

              {joinSchoolMode === "existing" ? (
                <>
                  <div className="school-option-list" role="list">
                    {pickerSchools
                      .filter(
                        (school) =>
                          // Exclude only schools you're actively in — a school
                          // with an inactive membership should still appear
                          // here so it can be rejoined without the manual-ID
                          // path.
                          !activeMemberships.some(
                            (m) => m.school_id === school.school_id,
                          ),
                      )
                      .map((school) => (
                        <SchoolOptionCard
                          key={school.school_id}
                          school={school}
                          selected={joinSchoolId === school.school_id}
                          onClick={() => {
                            setJoinSchoolError("");
                            setJoinSchoolId(school.school_id);
                          }}
                        />
                      ))}
                  </div>

                  <details
                    className="signup-manual-school-entry"
                    open={
                      !!joinSchoolId &&
                      !pickerSchools.some((s) => s.school_id === joinSchoolId)
                    }
                  >
                    <summary>Can't find your school? Enter its ID</summary>
                    <label className="field">
                      <input
                        value={joinSchoolId}
                        onChange={(event) =>
                          setJoinSchoolId(
                            sanitizeSchoolIdInput(event.target.value),
                          )
                        }
                        onBlur={(event) =>
                          setJoinSchoolId(
                            sanitizeSchoolIdOnBlur(event.target.value),
                          )
                        }
                        placeholder="School ID"
                        disabled={joinSchoolBusy}
                      />
                    </label>
                  </details>

                  {joinSchoolId ? (
                    <form className="login-form" onSubmit={handleJoinSchool}>
                      <label className="field">
                        <span>Join code</span>
                        <input
                          value={joinSchoolCode}
                          onChange={(event) =>
                            setJoinSchoolCode(event.target.value)
                          }
                          placeholder="Ask an existing admin of this school"
                          disabled={joinSchoolBusy}
                        />
                      </label>
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={joinSchoolBusy}
                      >
                        {joinSchoolBusy
                          ? "Joining…"
                          : `Join ${schoolDisplayName(joinSchoolId)}`}
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <form className="login-form" onSubmit={handleJoinSchool}>
                  <label className="field">
                    <span>School ID</span>
                    <input
                      value={joinSchoolId}
                      onChange={(event) =>
                        setJoinSchoolId(
                          sanitizeSchoolIdInput(event.target.value),
                        )
                      }
                      onBlur={(event) =>
                        setJoinSchoolId(
                          sanitizeSchoolIdOnBlur(event.target.value),
                        )
                      }
                      placeholder="ou"
                      disabled={joinSchoolBusy}
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span>School name</span>
                    <input
                      value={joinNewSchoolName}
                      onChange={(event) =>
                        setJoinNewSchoolName(event.target.value)
                      }
                      placeholder="Oakland University"
                      disabled={joinSchoolBusy}
                    />
                  </label>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={joinSchoolBusy}
                  >
                    {joinSchoolBusy ? "Creating…" : "Create School and Join"}
                  </button>
                </form>
              )}
            </section>
          </div>

          <button className="text-button" type="button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
        {pendingLeaveMembership ? (
          <div
            className="management-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Leave school"
            onClick={cancelLeaveSchool}
          >
            <div
              className="management-modal-sheet leave-school-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="management-modal-header">
                <div>
                  <p className="eyebrow">Leave school</p>
                  <h3>
                    Leave {schoolDisplayName(pendingLeaveMembership.school_id)}?
                  </h3>
                </div>
              </div>
              <p className="mfa-help">
                You'll lose access to this school's dashboard until you rejoin.
                Rejoining later won't require the join code again.
              </p>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={cancelLeaveSchool}
                >
                  Cancel
                </button>
                <button
                  className="primary-button leave-school-confirm-button"
                  type="button"
                  onClick={confirmLeaveSchool}
                >
                  Leave school
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const schoolProfileContent = (
    <SchoolProfileScreen
      activeSchoolId={activeSchoolId}
      schoolBusy={schoolBusy}
      schoolLogoUploadBusy={schoolLogoUploadBusy}
      schoolDraft={schoolDraft}
      setSchoolDraft={setSchoolDraft}
      schoolColorFields={schoolColorFields}
      handleSaveSchool={handleSaveSchool}
      refreshActiveSchool={refreshActiveSchool}
      handleSchoolColorChange={handleSchoolColorChange}
      handleSchoolLogoFileChange={handleSchoolLogoFileChange}
      getColorPickerValue={getColorPickerValue}
      defaultSchoolColorScheme={defaultSchoolColorScheme}
      resolvedSchoolColors={resolvedSchoolColors}
      resolvedSchoolLogoUrl={resolvedSchoolLogoUrl}
      termDrafts={termDrafts}
      setTermDrafts={setTermDrafts}
      createEmptyTermDraft={createEmptyTermDraft}
      handleSaveTerms={handleSaveTerms}
      SchoolLogoPreview={(props: Parameters<typeof SchoolLogoPreview>[0]) => (
        <SchoolLogoPreview {...props} onPreview={handleOpenImagePreview} />
      )}
    />
  );

  const sectionContent = (() => {
    switch (currentSection) {
      case "dashboard":
        return (
          <DashboardScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            adminUserUUID={session?.claims.user_uuid ?? ""}
            onHeaderCountsLoaded={setDashboardHeaderCounts}
            onParkingReportCountLoaded={setOpenParkingReportCount}
          />
        );
      case "school":
        return schoolProfileContent;
      case "terms":
        return schoolProfileContent;
      case "pois":
        return (
          <PoisScreen
            activeSchoolId={activeSchoolId}
            poiBusy={poiBusy}
            poiDrafts={poiDrafts}
            setPoiDrafts={setPoiDrafts}
            activePoiDraftId={activePoiDraftId}
            setActivePoiDraftId={setActivePoiDraftId}
            selectedPoiDraft={selectedPoiDraft}
            selectedPoiLocation={selectedPoiLocation}
            poiMapMarkers={poiMapMarkers}
            totalPOIBonusPoints={totalPOIBonusPoints}
            createEmptyPOIDraft={createEmptyPOIDraft}
            refreshSchoolPOIs={refreshSchoolPOIs}
            handleSavePOIs={handleSavePOIs}
            handlePoiLocationSelect={handlePoiLocationSelect}
            poiEditRequestId={poiEditRequestId}
            onPoiEditRequestHandled={handlePoiEditRequestHandled}
            DetailRow={DetailRow}
          />
        );
      case "zones":
        return (
          <ZonesScreen
            activeSchoolId={activeSchoolId}
            zoneBusy={zoneBusy}
            zoneDrafts={zoneDrafts}
            setZoneDrafts={setZoneDrafts}
            activeZoneDraftId={activeZoneDraftId}
            setActiveZoneDraftId={setActiveZoneDraftId}
            selectedZoneDraft={selectedZoneDraft}
            zoneMapPolygons={zoneMapPolygons}
            mappedZoneCount={mappedZoneCount}
            createEmptyZoneDraft={createEmptyZoneDraft}
            refreshSchoolZones={refreshSchoolZones}
            handleSaveZones={handleSaveZones}
            handleZonePointAdd={handleZonePointAdd}
            handleZonePointInsert={handleZonePointInsert}
            handleZonePointMove={handleZonePointMove}
            zoneEditRequestId={zoneEditRequestId}
            onZoneEditRequestHandled={handleZoneEditRequestHandled}
            DetailRow={DetailRow}
          />
        );
      case "challenges":
        return (
          <ChallengesScreen
            mode="challenges"
            activeSchoolId={activeSchoolId}
            challengeBusy={challengeBusy}
            challengeListBusy={challengeListBusy}
            challengeParticipantsBusy={challengeParticipantsBusy}
            challengeImageUploadBusy={challengeImageUploadBusy}
            selectedChallengeId={selectedChallengeId}
            setSelectedChallengeId={setSelectedChallengeId}
            challengeDraft={challengeDraft}
            setChallengeDraft={setChallengeDraft}
            createEmptyChallengeDraft={createEmptyChallengeDraft}
            refreshSchoolChallenges={refreshSchoolChallenges}
            handleSaveChallenge={handleSaveChallenge}
            handleDeleteSelectedChallenge={handleDeleteSelectedChallenge}
            handleCopyChallengeForResubmit={handleCopyChallengeForResubmit}
            handleChallengeImageFileChange={handleChallengeImageFileChange}
            selectedChallenge={selectedChallenge}
            schoolChallenges={visibleSchoolChallenges}
            currentAndUpcomingChallenges={currentAndUpcomingChallenges}
            pastChallenges={pastChallenges}
            challengeParticipants={challengeParticipants}
            challengeParticipantSummary={challengeParticipantSummary}
            resolveChallengeStatus={resolveChallengeStatus}
            formatChallengeMetricValue={formatChallengeMetricValue}
            formatDateTimeForDisplay={formatDateTimeForDisplay}
            formatNebulaUserName={formatNebulaUserName}
            EntityImagePreview={(
              props: Parameters<typeof EntityImagePreview>[0],
            ) => (
              <EntityImagePreview
                {...props}
                onPreview={handleOpenImagePreview}
              />
            )}
            DetailRow={DetailRow}
            newChallengeSelectionId={newChallengeSelectionId}
            handleImagePreview={handleOpenImagePreview}
            uploadStopImage={async (file) => {
              const r = await uploadSchoolChallengeImage(
                context.managedAppId,
                activeSchoolId,
                file,
              );
              return r.public_url;
            }}
          />
        );
      case "challengeGames":
        return (
          <ChallengesScreen
            mode="games"
            activeSchoolId={activeSchoolId}
            challengeBusy={challengeBusy}
            challengeListBusy={challengeListBusy}
            challengeParticipantsBusy={challengeParticipantsBusy}
            challengeImageUploadBusy={challengeImageUploadBusy}
            selectedChallengeId={selectedChallengeId}
            setSelectedChallengeId={setSelectedChallengeId}
            challengeDraft={challengeDraft}
            setChallengeDraft={setChallengeDraft}
            createEmptyChallengeDraft={createEmptyChallengeDraft}
            refreshSchoolChallenges={refreshSchoolChallenges}
            handleSaveChallenge={handleSaveChallenge}
            handleDeleteSelectedChallenge={handleDeleteSelectedChallenge}
            handleCopyChallengeForResubmit={handleCopyChallengeForResubmit}
            handleChallengeImageFileChange={handleChallengeImageFileChange}
            selectedChallenge={selectedChallenge}
            schoolChallenges={visibleSchoolChallenges}
            currentAndUpcomingChallenges={currentAndUpcomingChallenges}
            pastChallenges={pastChallenges}
            challengeParticipants={challengeParticipants}
            challengeParticipantSummary={challengeParticipantSummary}
            resolveChallengeStatus={resolveChallengeStatus}
            formatChallengeMetricValue={formatChallengeMetricValue}
            formatDateTimeForDisplay={formatDateTimeForDisplay}
            formatNebulaUserName={formatNebulaUserName}
            EntityImagePreview={(
              props: Parameters<typeof EntityImagePreview>[0],
            ) => (
              <EntityImagePreview
                {...props}
                onPreview={handleOpenImagePreview}
              />
            )}
            DetailRow={DetailRow}
            newChallengeSelectionId={newChallengeSelectionId}
            handleImagePreview={handleOpenImagePreview}
            uploadStopImage={async (file) => {
              const r = await uploadSchoolChallengeImage(
                context.managedAppId,
                activeSchoolId,
                file,
              );
              return r.public_url;
            }}
          />
        );
      case "students":
        return (
          <StudentsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            adminUserUUID={session?.claims.user_uuid ?? ""}
            schoolStudentRosterBusy={schoolStudentRosterBusy}
            schoolStudentRosterError={schoolStudentRosterError}
            studentRosterSearch={studentRosterSearch}
            setStudentRosterSearch={setStudentRosterSearch}
            allStudentRoster={sortedSchoolStudentRoster}
            filteredStudentRoster={filteredStudentRoster}
            selectedStudentMembershipId={selectedStudentMembershipId}
            selectedStudentEntry={selectedStudentEntry}
            schoolStudentPhotoKeys={schoolStudentPhotoKeys}
            schoolStudentMediaUrls={schoolStudentMediaUrls}
            schoolStudentProfilePhotoUrls={schoolStudentProfilePhotoUrls}
            studentDevicePhotoUrls={studentDevicePhotoUrls}
            schoolReservationsByMembership={schoolReservationsByMembership}
            studentBusy={studentBusy}
            studentError={studentError}
            studentProfile={studentProfile}
            studentPublicProfile={studentPublicProfile}
            studentPublicProfileError={studentPublicProfileError}
            studentViolations={studentViolations}
            studentRouteHistory={studentRouteHistory}
            studentSchoolZones={studentSchoolZones}
            studentReservationPacks={studentReservationPacks}
            studentRouteHistoryError={studentRouteHistoryError}
            studentViolationMediaByViolation={studentViolationMediaByViolation}
            studentViolationSignedMediaUrls={studentViolationSignedMediaUrls}
            studentViolationError={studentViolationError}
            handleSelectStudentInRoster={handleSelectStudentInRoster}
            refreshStudentRoster={refreshStudentRoster}
            resetSelectedStudentState={resetSelectedStudentState}
            formatNebulaUserName={formatNebulaUserName}
            resolveStudentPhotoObjectKey={resolveStudentPhotoObjectKey}
            formatDateOnly={formatDateOnly}
            formatUnixTimestamp={formatUnixTimestamp}
            handleCopyUuid={handleCopyUuid}
            handleOpenStudentDevice={handleOpenStudentDevice}
            DetailRow={DetailRow}
            UuidCopyField={UuidCopyField}
            handleImagePreview={handleOpenImagePreview}
          />
        );
      case "auditLog":
        return <AuditLogScreen appId={authAppId} />;
      case "studentLeaderboard":
        return (
          <StudentLeaderboardScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
          />
        );
      case "betaInvites":
        return (
          <BetaInvitesScreen
            key={activeSchoolId}
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
          />
        );
      case "notifications":
        return (
          <NotificationsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            studentRoster={sortedSchoolStudentRoster}
            schoolStudentMediaUrls={schoolStudentMediaUrls}
            schoolStudentPhotoKeys={schoolStudentPhotoKeys}
            studentProfilePhotoUrls={schoolStudentProfilePhotoUrls}
            formatNebulaUserName={formatNebulaUserName}
          />
        );
      case "vehicleRegistrations":
        return (
          <VehicleRegistrationsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
          />
        );
      case "campusDevices":
        return (
          <CampusDevicesScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            onOpenStudent={handleOpenStudentFromDashboard}
          />
        );
      case "registrationFees":
        return (
          <RegistrationFeesScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
          />
        );
      case "penaltyReports":
        return (
          <PenaltyReportsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            studentRoster={sortedSchoolStudentRoster}
            studentProfilePhotoUrls={schoolStudentProfilePhotoUrls}
            onOpenStudent={handleOpenStudentFromDashboard}
            onOpenStudentDevice={handleOpenStudentDeviceFromDashboard}
          />
        );
      case "parkingReports":
        return (
          <ParkingReportsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            studentRoster={sortedSchoolStudentRoster}
            studentProfilePhotoUrls={schoolStudentProfilePhotoUrls}
            onOpenStudent={handleOpenStudentFromDashboard}
            onOpenReportCountChange={setOpenParkingReportCount}
          />
        );
      case "studentRideViolations":
        return (
          <StudentRideViolationsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
          />
        );
      case "violationFees":
        return (
          <ViolationFeesScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
          />
        );
      case "reports":
        return (
          <ReportsScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            adminUserUUID={session?.claims.user_uuid ?? ""}
          />
        );
      case "mapOverview":
        return (
          <MapOverviewScreen
            activeSchoolId={activeSchoolId}
            managedAppId={context.managedAppId}
            adminUserUUID={session?.claims.user_uuid ?? ""}
            onSelectZoneForEdit={(zoneId) => {
              setActiveZoneDraftId(zoneId);
              setZoneEditRequestId(zoneId);
            }}
            onSelectPoiForEdit={(poiId) => {
              setActivePoiDraftId(poiId);
              setPoiEditRequestId(poiId);
            }}
            onSelectPackForEdit={handleStartEditingPack}
          />
        );
      case "sightingsMap":
        return <SightingsMapScreen />;
      case "packs":
        return (
          <PacksScreen
            activeSchoolId={activeSchoolId}
            packBusy={packBusy}
            packsLoading={packsLoading}
            activePackTab={activePackTab}
            setActivePackTab={setActivePackTab}
            refreshSchoolPacks={refreshSchoolPacks}
            schoolPacks={schoolPacks}
            existingPackMapMarkers={existingPackMapMarkers}
            packsWithoutLocationsCount={packsWithoutLocationsCount}
            handleCreatePack={handleCreatePack}
            handleCreatePackDraft={createPackFromDraft}
            packDraft={packDraft}
            setPackDraft={setPackDraft}
            schoolDraft={schoolDraft}
            packPhotoPreviewUrl={packPhotoPreviewUrl}
            EntityImagePreview={(
              props: Parameters<typeof EntityImagePreview>[0],
            ) => (
              <EntityImagePreview
                {...props}
                onPreview={handleOpenImagePreview}
              />
            )}
            packPhotoFile={packPhotoFile}
            handlePackPhotoFileChange={handlePackPhotoFileChange}
            setPackPhotoFile={setPackPhotoFile}
            setPackPhotoPreviewUrl={setPackPhotoPreviewUrl}
            resetPackCreateForm={resetPackCreateForm}
            selectedPackLocation={selectedPackLocation}
            handlePackLocationSelect={handlePackLocationSelect}
            editingPackId={editingPackId}
            packEditDraft={packEditDraft}
            getPackPhotoUrl={getPackPhotoUrl}
            packEditPhotoPreviewUrl={packEditPhotoPreviewUrl}
            handleCancelPackEdit={handleCancelPackEdit}
            handleStartEditingPack={handleStartEditingPack}
            packEditBusy={packEditBusy}
            handleDownloadPackQrCode={handleDownloadPackQrCode}
            qrActionTarget={qrActionTarget}
            handleGeneratePackQrCode={handleGeneratePackQrCode}
            handleDownloadPackSpotQrCode={handleDownloadPackSpotQrCode}
            handleGeneratePackSpotQrCode={handleGeneratePackSpotQrCode}
            handleSavePackEdit={handleSavePackEdit}
            setPackEditDraft={setPackEditDraft}
            packEditPhotoFile={packEditPhotoFile}
            handlePackEditPhotoFileChange={handlePackEditPhotoFileChange}
            setPackEditPhotoFile={setPackEditPhotoFile}
            setPackEditPhotoPreviewUrl={setPackEditPhotoPreviewUrl}
            UuidCopyField={UuidCopyField}
            handleCopyUuid={handleCopyUuid}
          />
        );
      case "reservations":
        return (
          <ReservationsScreen
            activeSchoolId={activeSchoolId}
            reservationsBusy={reservationsBusy}
            reservations={reservations}
            selectedReservationId={selectedReservationId}
            setSelectedReservationId={setSelectedReservationId}
            selectedReservation={selectedReservation}
            refreshReservations={refreshReservations}
            handleDenySelected={handleDenySelected}
            handleApproveSelected={handleApproveSelected}
            studentBusy={reservationStudentBusy}
            studentError={reservationStudentError}
            studentProfile={reservationStudentProfile}
            studentDevicePhotoUrls={reservationStudentDevicePhotoUrls}
            relevantMemberships={relevantMemberships}
            formatUnixTimestamp={formatUnixTimestamp}
            formatDateOnly={formatDateOnly}
            resolvedSchoolColors={resolvedSchoolColors}
            DetailRow={DetailRow}
            handleImagePreview={handleOpenImagePreview}
          />
        );
      default:
        return null;
    }
  })();

  const startSidebarDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;
    setSidebarDragging(true);

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(
        180,
        Math.min(480, startWidth + ev.clientX - startX),
      );
      sidebarWidthRef.current = next;
      setSidebarWidth(next);
    };
    const onUp = () => {
      setSidebarDragging(false);
      localStorage.setItem("sidebarWidth", String(sidebarWidthRef.current));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    localStorage.setItem("sidebarOpen", String(next));
  };

  return (
    <div
      className={`app-shell${sidebarDragging ? " sidebar-is-dragging" : ""}${!sidebarOpen ? " app-shell--sidebar-closed" : ""}`}
      style={
        {
          ...appThemeStyle,
          "--sidebar-w": sidebarOpen ? `${sidebarWidth}px` : "48px",
        } as CSSProperties
      }
    >
      <aside
        className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`}
        style={sidebarThemeStyle}
      >
        {/* Visible only when sidebar is collapsed — sits in the 48px strip */}
        <button
          type="button"
          className="sidebar-strip-toggle"
          onClick={toggleSidebar}
          title="Expand sidebar"
        >
          <span className="sidebar-hamburger">
            <span />
            <span />
            <span />
          </span>
        </button>

        <div className="sidebar-content">
          <div className="brand-card sidebar-brand-card">
            <div className="sidebar-brand-header">
              <div className="sidebar-brand-mark">
                <img
                  src="/favicon.svg"
                  alt="Juise"
                  className="sidebar-brand-icon"
                />
              </div>
              <button
                type="button"
                className="sidebar-toggle-btn"
                onClick={toggleSidebar}
                title="Collapse sidebar"
              >
                <span className="sidebar-hamburger">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
            <h2 className="sidebar-brand-title">Juise Rider Dashboard</h2>
            <div className="sidebar-brand-user">
              <div className="sidebar-user-avatar">
                {formatAdminIdentity(session).charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">
                  {formatAdminIdentity(session)}
                </span>
                {session.user && (
                  <span className="sidebar-user-handle">
                    @{session.user.username}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="sidebar-school-switcher"
              onClick={() => setSelectedSchoolId("")}
              title="Switch school"
            >
              {findPickerSchool(activeSchoolId)?.logo_url ? (
                <img
                  src={findPickerSchool(activeSchoolId)?.logo_url}
                  alt=""
                  className="sidebar-school-switcher-logo"
                />
              ) : (
                <span className="sidebar-school-switcher-logo sidebar-school-switcher-logo-placeholder">
                  {schoolDisplayName(activeSchoolId).charAt(0).toUpperCase()}
                </span>
              )}
              <span className="sidebar-school-switcher-name">
                {schoolDisplayName(activeSchoolId)}
              </span>
              <span className="sidebar-school-switcher-change">Change</span>
            </button>
            <button
              type="button"
              className="sidebar-join-code-toggle"
              onClick={() => void handleShowJoinCode()}
              disabled={viewJoinCodeBusy}
            >
              {viewJoinCodeBusy
                ? "Loading…"
                : viewJoinCode !== null
                  ? "Hide join code"
                  : "Show join code to invite admins"}
            </button>
            {viewJoinCode !== null ? (
              <p className="sidebar-join-code-value">{viewJoinCode}</p>
            ) : null}
          </div>

          <nav className="section-nav">
            {/* Top-level flat links */}
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? "nav-button nav-button-active" : "nav-button"
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/map-overview"
              className={({ isActive }) =>
                isActive ? "nav-button nav-button-active" : "nav-button"
              }
            >
              Map Overview
            </NavLink>
            {import.meta.env.DEV && (
              <NavLink
                to="/sightings-map"
                className={({ isActive }) =>
                  isActive ? "nav-button nav-button-active" : "nav-button"
                }
              >
                Sightings Map
              </NavLink>
            )}
            <NavLink
              to="/reports"
              className={({ isActive }) =>
                isActive ? "nav-button nav-button-active" : "nav-button"
              }
            >
              Report Builder
            </NavLink>
            <NavLink
              to="/audit-log"
              className={({ isActive }) =>
                isActive ? "nav-button nav-button-active" : "nav-button"
              }
            >
              Audit Log
            </NavLink>

            {/* Campus Setup group */}
            <div className="nav-group">
              <button
                className="nav-group-header"
                type="button"
                onClick={() =>
                  setOpenNavGroups((p) => ({
                    ...p,
                    campusSetup: !p.campusSetup,
                  }))
                }
              >
                <span>Campus Setup</span>
                <span
                  className={`nav-group-chevron${openNavGroups.campusSetup ? " nav-group-chevron-open" : ""}`}
                >
                  ›
                </span>
              </button>
              {openNavGroups.campusSetup && (
                <div className="nav-group-items">
                  <NavLink
                    to="/school"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Profile
                  </NavLink>
                  <NavLink
                    to="/zones"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Penalty Zones
                  </NavLink>
                  <NavLink
                    to="/pois"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    POI Setup
                  </NavLink>
                  <NavLink
                    to="/challenges"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Ride Challenges
                  </NavLink>
                  <NavLink
                    to="/challenge-games"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Challenge Games
                  </NavLink>
                  <NavLink
                    to="/notifications"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Notifications
                  </NavLink>
                </div>
              )}
            </div>

            {/* Juise Packs section */}
            <div className="nav-group">
              <button
                className={`nav-group-header${openNavGroups.juisePacks ? " nav-group-header-open" : ""}`}
                type="button"
                onClick={() =>
                  setOpenNavGroups((p) => ({ ...p, juisePacks: !p.juisePacks }))
                }
              >
                <span className="nav-group-header-label">
                  Juise Packs
                  {!openNavGroups.juisePacks && reservations.length > 0 && (
                    <span className="nav-badge">{reservations.length}</span>
                  )}
                </span>
                <span
                  className={`nav-group-chevron${openNavGroups.juisePacks ? " nav-group-chevron-open" : ""}`}
                >
                  ›
                </span>
              </button>
              {openNavGroups.juisePacks && (
                <div className="nav-group-items">
                  <NavLink
                    to="/packs"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Manage Juise Packs
                  </NavLink>
                  <NavLink
                    to="/reservations"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    View Parking Reservations
                    {reservations.length > 0 && (
                      <span className="nav-badge">{reservations.length}</span>
                    )}
                  </NavLink>
                </div>
              )}
            </div>

            {/* Campus Information group */}
            <div className="nav-group">
              <button
                className="nav-group-header"
                type="button"
                onClick={() =>
                  setOpenNavGroups((p) => ({ ...p, campusInfo: !p.campusInfo }))
                }
              >
                <span>Campus Information</span>
                <span
                  className={`nav-group-chevron${openNavGroups.campusInfo ? " nav-group-chevron-open" : ""}`}
                >
                  ›
                </span>
              </button>
              {openNavGroups.campusInfo && (
                <div className="nav-group-items">
                  <NavLink
                    to="/students"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Student Information
                  </NavLink>
                  <NavLink
                    to="/student-leaderboard"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Student Leaderboard
                  </NavLink>
                  <NavLink
                    to="/beta-invites"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Beta Invites
                  </NavLink>
                </div>
              )}
            </div>

            {/* Vehicles section */}
            <div className="nav-group">
              <button
                className={`nav-group-header${openNavGroups.vehicles ? " nav-group-header-open" : ""}`}
                type="button"
                onClick={() =>
                  setOpenNavGroups((p) => ({ ...p, vehicles: !p.vehicles }))
                }
              >
                <span className="nav-group-header-label">
                  Vehicles
                  {!openNavGroups.vehicles &&
                    pendingVehicleCount !== null &&
                    pendingVehicleCount > 0 && (
                      <span className="nav-badge">{pendingVehicleCount}</span>
                    )}
                </span>
                <span
                  className={`nav-group-chevron${openNavGroups.vehicles ? " nav-group-chevron-open" : ""}`}
                >
                  ›
                </span>
              </button>
              {openNavGroups.vehicles && (
                <div className="nav-group-items">
                  <NavLink
                    to="/campus-devices"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Campus Devices
                  </NavLink>
                  <NavLink
                    to="/vehicle-registrations"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Vehicle Registrations
                    {pendingVehicleCount !== null &&
                      pendingVehicleCount > 0 && (
                        <span className="nav-badge">{pendingVehicleCount}</span>
                      )}
                  </NavLink>
                  <NavLink
                    to="/registration-fees"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Registration Fees Setup
                  </NavLink>
                </div>
              )}
            </div>

            {/* Parking and Ride Enforcement group */}
            <div className="nav-group">
              <button
                className={`nav-group-header${openNavGroups.parkingEnforcement ? " nav-group-header-open" : ""}`}
                type="button"
                onClick={() =>
                  setOpenNavGroups((p) => ({
                    ...p,
                    parkingEnforcement: !p.parkingEnforcement,
                  }))
                }
              >
                <span className="nav-group-header-label">
                  Compliance Enforcement
                  {!openNavGroups.parkingEnforcement &&
                    complianceEnforcementCount !== null && (
                      <span className="nav-badge">
                        {complianceEnforcementCount}
                      </span>
                    )}
                </span>
                <span
                  className={`nav-group-chevron${openNavGroups.parkingEnforcement ? " nav-group-chevron-open" : ""}`}
                >
                  ›
                </span>
              </button>
              {openNavGroups.parkingEnforcement && (
                <div className="nav-group-items">
                  <NavLink
                    to="/penalty-reports"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Parking Enforcement Reports
                    {openEnforcementCount !== null &&
                      openEnforcementCount > 0 && (
                        <span className="nav-badge">
                          {openEnforcementCount}
                        </span>
                      )}
                  </NavLink>
                  <NavLink
                    to="/parking-reports"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Parking Reports
                    {openParkingReportCount !== null &&
                      openParkingReportCount > 0 && (
                        <span className="nav-badge">
                          {openParkingReportCount}
                        </span>
                      )}
                  </NavLink>
                  <NavLink
                    to="/student-ride-violations"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Ride Information
                  </NavLink>
                  <NavLink
                    to="/violation-fees"
                    className={({ isActive }) =>
                      isActive
                        ? "nav-sub-item nav-sub-item-active"
                        : "nav-sub-item"
                    }
                  >
                    Violation Fee Setup
                  </NavLink>
                </div>
              )}
            </div>
          </nav>

          <div className="sidebar-footer">
            <button
              className="secondary-button full-width-button"
              type="button"
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
        {/* end sidebar-content */}

        {sidebarOpen && (
          <div className="sidebar-drag-handle" onMouseDown={startSidebarDrag} />
        )}
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      {!sidebarOpen && (
        <button
          type="button"
          className="sidebar-floating-toggle"
          onClick={toggleSidebar}
          aria-label="Open navigation"
        >
          <span className="sidebar-hamburger">
            <span />
            <span />
            <span />
          </span>
        </button>
      )}

      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-header-start">
            <div className="workspace-title-block">
              <SchoolLogoPreview
                key={`header-${resolvedSchoolLogoUrl || schoolDraft.logo_url || "fallback"}`}
                logoUrl={resolvedSchoolLogoUrl || schoolDraft.logo_url}
                label={
                  schoolDraft.title ||
                  schoolDraft.name ||
                  activeSchoolId ||
                  "Juise"
                }
                size="header"
                onPreview={handleOpenImagePreview}
              />
              <div>
                <p className="eyebrow">Workspace</p>
                <h1>
                  {schoolDraft.title ||
                    schoolDraft.name ||
                    activeSchoolId ||
                    "School dashboard"}
                </h1>
              </div>
            </div>
          </div>
          {/* workspace-header-start */}
        </header>

        {banner ? (
          <div className={`banner banner-${banner.tone}`}>
            <span>{banner.message}</span>
            <button
              className="text-button"
              type="button"
              onClick={() => setBanner(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {sectionContent}
      </main>
      {seriesEditPrompt ? (
        <div
          className="management-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Update repeating challenge"
          onClick={() => setSeriesEditPrompt(null)}
        >
          <div
            className="management-modal-sheet series-edit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="management-modal-header">
              <div>
                <p className="eyebrow">Repeating challenge</p>
                <h3>Update just this one, or all {seriesEditPrompt.seriesCount}?</h3>
              </div>
              <button
                className="text-button management-modal-close"
                type="button"
                onClick={() => setSeriesEditPrompt(null)}
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
            <p className="muted-text series-edit-modal-copy">
              This challenge repeats as {seriesEditPrompt.seriesCount}{" "}
              separate challenges. Students still join each one on its own —
              choose whether these changes apply to just this challenge, or
              to all of them (each keeps its own dates, shifted the same way
              this one moved).
            </p>
            <div className="form-actions series-edit-modal-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={challengeBusy}
                onClick={() => handleConfirmSeriesEdit(false)}
              >
                Just this challenge
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={challengeBusy}
                onClick={() => handleConfirmSeriesEdit(true)}
              >
                All {seriesEditPrompt.seriesCount} challenges
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {imagePreview ? (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.label || imagePreview.alt}
          onClick={() => setImagePreview(null)}
        >
          <div
            className="image-lightbox-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="image-lightbox-close"
              type="button"
              onClick={() => setImagePreview(null)}
            >
              Close
            </button>
            <img
              className="image-lightbox-image"
              src={imagePreview.imageUrl}
              alt={imagePreview.alt}
            />
            {imagePreview.label ? (
              <p className="image-lightbox-caption">{imagePreview.label}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {selectedStudentDevice ? (
        <StudentVehicleDetailModal
          device={selectedStudentDevice}
          studentName={selectedStudentFullName}
          primaryPhotoUrl={
            studentDevicePhotoUrls[
              selectedStudentDevice.registered_device_uuid
            ] ?? ""
          }
          mediaAssets={selectedStudentDeviceMediaAssets}
          signedMediaUrls={studentDeviceSignedMediaUrls}
          onClose={() => setSelectedStudentDeviceUUID(null)}
          onCopy={handleCopyUuid}
          onPreviewImage={handleOpenImagePreview}
          formatUnixTimestamp={formatUnixTimestamp}
        />
      ) : null}
    </div>
  );
}

export default App;
