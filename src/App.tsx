import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import {
  approveReservation,
  createSchoolChallenge,
  createSchoolPack,
  createSchoolAdminAccount,
  deleteSchoolChallenge,
  denyReservation,
  fetchAdminSchoolPacks,
  fetchNebulaUser,
  fetchPendingReservations,
  fetchSchool,
  fetchSchoolChallengeParticipants,
  fetchSchoolChallenges,
  fetchSchoolPOIs,
  fetchSchoolZones,
  fetchSchoolStudentRoster,
  fetchSchoolTermReservations,
  fetchStudentProfile,
  fetchUserMediaAssets,
  generateAdminPackQrCode,
  generateAdminPackSpotQrCode,
  getAdminPackQrCodeDownloadUrl,
  getAdminPackSpotQrCodeDownloadUrl,
  loginWithIdentifier,
  saveSchool,
  saveSchoolPOIs,
  saveSchoolZones,
  saveSchoolTerms,
  setApiSession,
  setSessionObserver,
  signSchoolMedia,
  type AdminSession,
  type Pack,
  type PackSpot,
  type PackSpotReservation,
  type School,
  type SchoolColorScheme,
  type SchoolChallenge,
  type SchoolChallengeParticipantProgress,
  type SchoolPOI,
  type SchoolZone,
  type SchoolStudentRosterEntry,
  type SchoolTerm,
  type StudentProfileBundle,
  updateSchoolChallenge,
  uploadSchoolChallengeImage,
  type UserMediaAsset,
  type UserSchoolMembership,
  updateSchoolPack,
} from "./lib/api";
import {
  PackLocationPicker,
  PackLocationsMap,
  type PackMapMarker,
  type PackMapPoint,
} from "./components/PackLocationPicker";
import {
  SchoolZoneMapEditor,
  SchoolZonesMap,
  type SchoolZoneMapPolygon,
} from "./components/SchoolZoneMapEditor";
import {
  clearDashboardSession,
  readDashboardContext,
  readDashboardSession,
  writeDashboardContext,
  writeDashboardSession,
  type DashboardContext,
} from "./lib/storage";

type Section =
  | "school"
  | "terms"
  | "pois"
  | "zones"
  | "challenges"
  | "students"
  | "packs"
  | "reservations";
type PackTab = "create" | "existing";
type BannerTone = "success" | "error" | "info";
type AuthMode = "login" | "signup";

const dashboardSections: Array<{
  section: Section;
  label: string;
  path: string;
}> = [
  { section: "school", label: "School Profile", path: "/school" },
  { section: "terms", label: "School Terms", path: "/terms" },
  { section: "pois", label: "School POIs", path: "/pois" },
  { section: "zones", label: "School Zones", path: "/zones" },
  { section: "challenges", label: "Challenges", path: "/challenges" },
  { section: "students", label: "Students", path: "/students" },
  { section: "packs", label: "Juise Packs", path: "/packs" },
  {
    section: "reservations",
    label: "Pending Reservations",
    path: "/reservations",
  },
];

const sectionPathByName: Record<Section, string> = Object.fromEntries(
  dashboardSections.map(({ section, path }) => [section, path]),
) as Record<Section, string>;

interface BannerState {
  tone: BannerTone;
  message: string;
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
}

interface SignupFormState {
  school_id: string;
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

interface ChallengeDraft {
  challenge_uuid: string;
  title: string;
  description: string;
  image_url: string;
  metric_type: "distance_miles" | "points";
  target_value: string;
  start_time: string;
  end_time: string;
  active: boolean;
}

type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;
const newChallengeSelectionId = "__new_challenge__";

const authAppId =
  import.meta.env.VITE_AUTH_APP_ID ?? "juise_rider_admin_dashboard";
const defaultManagedAppId =
  import.meta.env.VITE_DEFAULT_MANAGED_APP_ID ?? "juise-customer-app";
const juiseColors = {
  red: "#FF5C5C",
  green: "#27CC5E",
  mediumgreen: "#28AE4C",
  darkGreen: "#03200D",
  darkGrey: "#010C05",
  mediumGrey: "#1e2124",
  gold: "#EEC253",
  lightGrey: "#424549",
  text: "#E6EAE8",
  fadedText: "#b5b5b5",
  disabledText: "#999999",
};
const schoolColorHexPattern = /^#(?:[0-9a-fA-F]{6})$/;
const defaultSchoolColorScheme: Required<SchoolColorScheme> = {
  primary: juiseColors.green,
  secondary: juiseColors.mediumGrey,
  accent: juiseColors.gold,
  background: juiseColors.darkGreen,
  text: juiseColors.text,
};
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
type SidebarThemeStyle = CSSProperties & Record<string, string>;

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

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function resolveHexColor(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return schoolColorHexPattern.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = resolveHexColor(color, "#000000").slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function hexToRgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

function mixHexColors(base: string, tint: string, weight: number): string {
  const normalizedWeight = Math.min(1, Math.max(0, weight));
  const baseRgb = hexToRgb(base);
  const tintRgb = hexToRgb(tint);
  const r = clampChannel(
    baseRgb.r + (tintRgb.r - baseRgb.r) * normalizedWeight,
  );
  const g = clampChannel(
    baseRgb.g + (tintRgb.g - baseRgb.g) * normalizedWeight,
  );
  const b = clampChannel(
    baseRgb.b + (tintRgb.b - baseRgb.b) * normalizedWeight,
  );
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getReadableTextColor(background: string): string {
  const { r, g, b } = hexToRgb(background);
  const [sr, sg, sb] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
  return luminance > 0.52 ? juiseColors.darkGrey : juiseColors.text;
}

function normalizeSchoolColorScheme(
  value?: SchoolColorScheme,
): SchoolColorScheme {
  return {
    primary: resolveHexColor(value?.primary, defaultSchoolColorScheme.primary),
    secondary: resolveHexColor(
      value?.secondary,
      defaultSchoolColorScheme.secondary,
    ),
    accent: resolveHexColor(value?.accent, defaultSchoolColorScheme.accent),
    background: resolveHexColor(
      value?.background,
      defaultSchoolColorScheme.background,
    ),
    text: resolveHexColor(value?.text, defaultSchoolColorScheme.text),
  };
}

function getColorPickerValue(
  value: string | undefined,
  fallback: keyof typeof defaultSchoolColorScheme,
): string {
  return resolveHexColor(value, defaultSchoolColorScheme[fallback]);
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
    bonus_points: "0",
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

function createEmptyChallengeDraft(): ChallengeDraft {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    challenge_uuid: "",
    title: "",
    description: "",
    image_url: "",
    metric_type: "distance_miles",
    target_value: "10",
    start_time: formatDateTimeLocalValue(Math.floor(now.getTime() / 1000)),
    end_time: formatDateTimeLocalValue(Math.floor(end.getTime() / 1000)),
    active: true,
  };
}

function challengeToDraft(challenge: SchoolChallenge): ChallengeDraft {
  return {
    challenge_uuid: challenge.challenge_uuid,
    title: challenge.title,
    description: challenge.description,
    image_url: challenge.image_url,
    metric_type: challenge.metric_type,
    target_value: String(challenge.target_value),
    start_time: formatDateTimeLocalValue(challenge.start_time),
    end_time: formatDateTimeLocalValue(challenge.end_time),
    active: challenge.active,
  };
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

function triggerFileDownload(url: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function buildStudentIdEntityUUID(schoolId: string, campusId: string): string {
  return `${schoolId.trim()}.${campusId.trim()}`;
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

function collectStudentIdPhotoKeys(
  assets: UserMediaAsset[],
): StudentIdPhotoKeys {
  const photoKeys: StudentIdPhotoKeys = {};
  for (const asset of assets) {
    const slot = asset.slot?.trim();
    if ((slot === "front" || slot === "back") && !photoKeys[slot]) {
      const objectKey = asset.object_key?.trim() ?? "";
      if (objectKey) {
        photoKeys[slot] = objectKey;
      }
    }
  }
  return photoKeys;
}

async function resolveSchoolStudentPhotoState(
  managedAppId: string,
  schoolId: string,
  roster: SchoolStudentRosterEntry[],
): Promise<{
  photoKeysByMembership: StudentRosterPhotoKeyMap;
  signedUrls: Record<string, string>;
}> {
  const photoKeysByMembership: StudentRosterPhotoKeyMap = {};
  const fallbackMediaEntries = roster.filter((entry) => {
    const membership = entry.membership;
    return (
      !resolveMediaObjectKey(membership.front_photo) ||
      !resolveMediaObjectKey(membership.back_photo)
    );
  });

  const fallbackMediaResults = await Promise.allSettled(
    fallbackMediaEntries.map(async (entry) => {
      const membership = entry.membership;
      const assets = await fetchUserMediaAssets(
        managedAppId,
        entry.user.k_guid || membership.user_uuid,
        "student_id",
        buildStudentIdEntityUUID(membership.school_id, membership.campus_id),
      );
      return {
        membershipUUID: membership.membership_uuid,
        photoKeys: collectStudentIdPhotoKeys(assets),
      };
    }),
  );

  for (const result of fallbackMediaResults) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const { membershipUUID, photoKeys } = result.value;
    if (photoKeys.front || photoKeys.back) {
      photoKeysByMembership[membershipUUID] = photoKeys;
    }
  }

  const objectKeys = roster.flatMap((entry) => {
    const membership = entry.membership;
    return [
      resolveStudentPhotoObjectKey(membership, photoKeysByMembership, "front"),
      resolveStudentPhotoObjectKey(membership, photoKeysByMembership, "back"),
    ].filter((value): value is string => value !== "");
  });

  const signedUrls =
    objectKeys.length > 0 ? await signSchoolMedia(schoolId, objectKeys) : {};

  return {
    photoKeysByMembership,
    signedUrls,
  };
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
  size?: "header" | "field";
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const normalizedUrl = props.logoUrl?.trim() ?? "";
  const showImage = normalizedUrl !== "" && !hasImageError;
  const monogram = buildSchoolMonogram(props.label);

  return (
    <div className={`school-logo school-logo-${props.size ?? "field"}`}>
      {showImage ? (
        <img
          className="school-logo-image"
          src={normalizedUrl}
          alt={`${props.label} logo`}
          onError={() => setHasImageError(true)}
        />
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
}) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const normalizedUrl = props.imageUrl?.trim() ?? "";
  const showImage = normalizedUrl !== "" && failedImageUrl !== normalizedUrl;

  return (
    <div className="challenge-image-preview">
      {showImage ? (
        <img
          className="challenge-image-preview-image"
          src={normalizedUrl}
          alt={`${props.label} ${props.altSuffix ?? "image"}`}
          onError={() => setFailedImageUrl(normalizedUrl)}
        />
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
  return session.claims.user_uuid;
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
  const [session, setSession] = useState<AdminSession | null>(() =>
    readDashboardSession(),
  );
  const [context, setContext] = useState<DashboardContext>(() =>
    readDashboardContext(defaultManagedAppId),
  );
  const [managedAppInput, setManagedAppInput] = useState(context.managedAppId);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signupForm, setSignupForm] = useState<SignupFormState>({
    school_id: "",
    first: "",
    last: "",
    username: "",
    email: "",
    phone: "",
    password: "",
  });

  const [schoolBusy, setSchoolBusy] = useState(false);
  const [schoolDraft, setSchoolDraft] = useState<SchoolDraft>(() =>
    createEmptySchoolDraft(),
  );
  const [termDrafts, setTermDrafts] = useState<TermDraft[]>([]);
  const [poiDrafts, setPoiDrafts] = useState<POIDraft[]>([]);
  const [poiBusy, setPoiBusy] = useState(false);
  const [activePoiDraftId, setActivePoiDraftId] = useState("");
  const [zoneDrafts, setZoneDrafts] = useState<ZoneDraft[]>([]);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [activeZoneDraftId, setActiveZoneDraftId] = useState("");
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
  const [challengeParticipants, setChallengeParticipants] = useState<
    SchoolChallengeParticipantProgress[]
  >([]);
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
  const [activePackTab, setActivePackTab] = useState<PackTab>("create");
  const [editingPackId, setEditingPackId] = useState("");
  const [packEditDraft, setPackEditDraft] = useState<PackEditDraft | null>(
    null,
  );
  const [packEditPhotoFile, setPackEditPhotoFile] = useState<File | null>(null);
  const [packEditPhotoPreviewUrl, setPackEditPhotoPreviewUrl] = useState("");
  const [packEditBusy, setPackEditBusy] = useState(false);
  const [qrActionTarget, setQrActionTarget] = useState("");

  const [reservations, setReservations] = useState<PackSpotReservation[]>([]);
  const [reservationsBusy, setReservationsBusy] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [studentProfile, setStudentProfile] =
    useState<StudentProfileBundle | null>(null);
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [schoolStudentRoster, setSchoolStudentRoster] = useState<
    SchoolStudentRosterEntry[]
  >([]);
  const [schoolStudentReservations, setSchoolStudentReservations] = useState<
    PackSpotReservation[]
  >([]);
  const [schoolStudentMediaUrls, setSchoolStudentMediaUrls] = useState<
    Record<string, string>
  >({});
  const [schoolStudentPhotoKeys, setSchoolStudentPhotoKeys] =
    useState<StudentRosterPhotoKeyMap>({});
  const [schoolStudentRosterBusy, setSchoolStudentRosterBusy] = useState(false);
  const [schoolStudentRosterError, setSchoolStudentRosterError] = useState("");
  const scopedSchoolId = session?.claims.school_id?.trim() ?? "";
  const activeSchoolId = scopedSchoolId;
  const currentSection =
    resolveSectionFromPathname(location.pathname) ?? "school";

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

  const selectedChallenge = useMemo(
    () =>
      schoolChallenges.find(
        (challenge) => challenge.challenge_uuid === selectedChallengeId,
      ) ?? null,
    [schoolChallenges, selectedChallengeId],
  );
  const currentAndUpcomingChallenges = useMemo(
    () =>
      schoolChallenges.filter(
        (challenge) => resolveChallengeStatus(challenge) !== "Ended",
      ),
    [schoolChallenges],
  );
  const pastChallenges = useMemo(
    () =>
      schoolChallenges.filter(
        (challenge) => resolveChallengeStatus(challenge) === "Ended",
      ),
    [schoolChallenges],
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
        const descriptionParts = [
          poi.description.trim(),
          Number.isFinite(bonusPoints) ? `${bonusPoints} bonus points` : "",
        ].filter(Boolean);

        return [
          {
            id: poi.poi_uuid || poi.id,
            label: poi.title.trim() || "Untitled POI",
            description: descriptionParts.join(" · ") || undefined,
            lat,
            lng,
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
        description: [
          zone.description.trim(),
          zone.zone_type === "no_go"
            ? "No-go zone"
            : zone.speed_limit_mph.trim()
              ? `${zone.speed_limit_mph.trim()} mph limit`
              : "Speed limit zone",
        ]
          .filter(Boolean)
          .join(" · "),
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
    if (!studentProfile) {
      return [];
    }

    return studentProfile.memberships.filter(
      (membership) => membership.school_id === activeSchoolId,
    );
  }, [activeSchoolId, studentProfile]);

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

  const resolvedSchoolColors = useMemo(
    () => normalizeSchoolColorScheme(schoolDraft.color_scheme),
    [schoolDraft.color_scheme],
  );

  const sidebarThemeStyle = useMemo<SidebarThemeStyle>(() => {
    const primary =
      resolvedSchoolColors.primary || defaultSchoolColorScheme.primary;
    const secondary =
      resolvedSchoolColors.secondary || defaultSchoolColorScheme.secondary;
    const accent =
      resolvedSchoolColors.accent || defaultSchoolColorScheme.accent;
    const background =
      resolvedSchoolColors.background || defaultSchoolColorScheme.background;
    const text = resolvedSchoolColors.text || defaultSchoolColorScheme.text;
    const sidebarBgStart = mixHexColors(background, primary, 0.16);
    const sidebarBgEnd = mixHexColors(juiseColors.darkGrey, background, 0.7);
    const surface = hexToRgba(mixHexColors(background, secondary, 0.42), 0.88);
    const surfaceStrong = hexToRgba(
      mixHexColors(background, primary, 0.18),
      0.98,
    );
    const itemBg = hexToRgba(mixHexColors(background, secondary, 0.58), 0.54);
    const itemHoverBg = hexToRgba(
      mixHexColors(background, primary, 0.28),
      0.74,
    );
    const activeBase = mixHexColors(primary, accent, 0.26);
    const activeBg = `linear-gradient(135deg, ${activeBase}, ${accent})`;

    return {
      "--sidebar-bg-start": sidebarBgStart,
      "--sidebar-bg-end": sidebarBgEnd,
      "--sidebar-glow-primary": hexToRgba(primary, 0.24),
      "--sidebar-glow-accent": hexToRgba(accent, 0.18),
      "--sidebar-text": text,
      "--sidebar-muted": hexToRgba(text, 0.76),
      "--sidebar-soft-text": hexToRgba(text, 0.58),
      "--sidebar-border": hexToRgba(text, 0.12),
      "--sidebar-accent-border": hexToRgba(accent, 0.32),
      "--sidebar-surface": surface,
      "--sidebar-surface-strong": surfaceStrong,
      "--sidebar-item-bg": itemBg,
      "--sidebar-item-hover-bg": itemHoverBg,
      "--sidebar-item-active-bg": activeBg,
      "--sidebar-item-active-text": getReadableTextColor(activeBase),
      "--sidebar-form-bg": hexToRgba(
        mixHexColors(background, secondary, 0.68),
        0.92,
      ),
      "--sidebar-form-border": hexToRgba(accent, 0.16),
      "--sidebar-chip-bg": hexToRgba(accent, 0.2),
      "--sidebar-chip-text": getReadableTextColor(accent),
      "--sidebar-primary": primary,
      "--sidebar-secondary": secondary,
      "--sidebar-accent": accent,
    };
  }, [resolvedSchoolColors]);

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

  function upsertSchoolChallenge(nextChallenge: SchoolChallenge) {
    setSchoolChallenges((current) =>
      sortChallengesForDisplay([
        nextChallenge,
        ...current.filter(
          (challenge) => challenge.challenge_uuid !== nextChallenge.challenge_uuid,
        ),
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

  function handleDownloadPackQrCode(targetPack: Pack) {
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

    triggerFileDownload(
      getAdminPackQrCodeDownloadUrl(
        session.claims.user_uuid,
        targetPack.pack_uuid,
      ),
    );
  }

  function handleDownloadPackSpotQrCode(spot: PackSpot) {
    if (!session?.claims.user_uuid || !spot.spot_uuid || !spot.qr_code) {
      setBanner({
        tone: "error",
        message: "Pack spot QR code is not available yet.",
      });
      return;
    }

    triggerFileDownload(
      getAdminPackSpotQrCodeDownloadUrl(
        session.claims.user_uuid,
        spot.spot_uuid,
      ),
    );
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

    navigate(sectionPathByName.school, { replace: true });
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

    setActivePoiDraftId((current) =>
      poiDrafts.some((poi) => poi.id === current) ? current : poiDrafts[0].id,
    );
  }, [poiDrafts]);

  useEffect(() => {
    if (zoneDrafts.length === 0) {
      setActiveZoneDraftId("");
      return;
    }

    setActiveZoneDraftId((current) =>
      zoneDrafts.some((zone) => zone.id === current)
        ? current
        : zoneDrafts[0].id,
    );
  }, [zoneDrafts]);

  useEffect(() => {
    setManagedAppInput(context.managedAppId);
  }, [context.managedAppId]);

  useEffect(() => {
    setApiSession(session);
    if (session) {
      writeDashboardSession(session);
    } else {
      clearDashboardSession();
    }
  }, [session]);

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
  }, [session]);

  useEffect(() => {
    writeDashboardContext(context);
  }, [context]);

  useEffect(() => {
    setSessionObserver((nextSession) => {
      setSession(nextSession);
    });

    return () => {
      setSessionObserver(null);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setReservations([]);
      setSelectedReservationId("");
      setStudentProfile(null);
      setSchoolPacks([]);
      setPoiDrafts([]);
      setActivePoiDraftId("");
      setSchoolStudentRoster([]);
      setSchoolStudentReservations([]);
      setSchoolStudentMediaUrls({});
      setSchoolStudentRosterError("");
      setSchoolChallenges([]);
      setChallengeParticipants([]);
      setChallengeDraft(createEmptyChallengeDraft());
      setSelectedChallengeId("");
      setSchoolDraft(createEmptySchoolDraft());
      setTermDrafts([]);
      return;
    }
  }, [session]);

  useEffect(() => {
    if (selectedChallengeId === newChallengeSelectionId) {
      setChallengeDraft(createEmptyChallengeDraft());
      setChallengeParticipants([]);
      return;
    }

    if (schoolChallenges.length === 0) {
      setSelectedChallengeId("");
      setChallengeDraft(createEmptyChallengeDraft());
      setChallengeParticipants([]);
      return;
    }

    if (!selectedChallenge) {
      setSelectedChallengeId(schoolChallenges[0]?.challenge_uuid ?? "");
      return;
    }

    setChallengeDraft(challengeToDraft(selectedChallenge));
  }, [schoolChallenges, selectedChallenge, selectedChallengeId]);

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
  }, [activeSchoolId, context.managedAppId, session]);

  useEffect(() => {
    if (!session || currentSection !== "reservations" || !activeSchoolId) {
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
        const hasCurrentSelection = nextReservations.some(
          (reservation) =>
            reservation.reservation_uuid === selectedReservationId,
        );
        setSelectedReservationId(
          hasCurrentSelection
            ? selectedReservationId
            : (nextReservations[0]?.reservation_uuid ?? ""),
        );
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
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    selectedReservationId,
    session,
  ]);

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
  }, [activeSchoolId, context.managedAppId, currentSection, session]);

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
  }, [activeSchoolId, context.managedAppId, currentSection, session]);

  useEffect(() => {
    if (!session || currentSection !== "challenges" || !activeSchoolId) {
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
  }, [activeSchoolId, context.managedAppId, currentSection, session]);

  useEffect(() => {
    if (
      !session ||
      currentSection !== "challenges" ||
      !activeSchoolId ||
      !selectedChallenge ||
      selectedChallengeId === newChallengeSelectionId
    ) {
      setChallengeParticipants([]);
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
  }, [
    activeSchoolId,
    context.managedAppId,
    currentSection,
    selectedChallenge,
    selectedChallengeId,
    session,
  ]);

  useEffect(() => {
    if (!session || !selectedReservation) {
      setStudentProfile(null);
      setStudentError("");
      return;
    }

    const studentUserUUID = selectedReservation.user_uuid;
    let cancelled = false;

    async function loadStudentProfile() {
      setStudentBusy(true);
      setStudentError("");
      try {
        const nextProfile = await fetchStudentProfile(
          context.managedAppId,
          studentUserUUID,
        );
        if (cancelled) {
          return;
        }

        setStudentProfile(nextProfile);
      } catch (error) {
        if (!cancelled) {
          setStudentProfile(null);
          setStudentError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setStudentBusy(false);
        }
      }
    }

    void loadStudentProfile();

    return () => {
      cancelled = true;
    };
  }, [context.managedAppId, selectedReservation, session]);

  useEffect(() => {
    if (!session || currentSection !== "students" || !activeSchoolId) {
      return;
    }

    let cancelled = false;
    const adminUserUUID = session.claims.user_uuid;

    async function loadSchoolStudentRoster() {
      setSchoolStudentRosterBusy(true);
      setSchoolStudentRosterError("");
      try {
        const [nextRoster, nextReservations] = await Promise.all([
          fetchSchoolStudentRoster(context.managedAppId, activeSchoolId),
          fetchSchoolTermReservations(
            adminUserUUID,
            context.managedAppId,
            activeSchoolId,
          ),
        ]);
        if (cancelled) {
          return;
        }

        setSchoolStudentRoster(nextRoster);
        setSchoolStudentReservations(nextReservations);

        try {
          const { photoKeysByMembership, signedUrls } =
            await resolveSchoolStudentPhotoState(
              context.managedAppId,
              activeSchoolId,
              nextRoster,
            );
          if (!cancelled) {
            setSchoolStudentPhotoKeys(photoKeysByMembership);
            setSchoolStudentMediaUrls(signedUrls);
          }
        } catch (error) {
          if (!cancelled) {
            setSchoolStudentPhotoKeys({});
            setSchoolStudentMediaUrls({});
            setBanner({
              tone: "error",
              message: getErrorMessage(error),
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSchoolStudentRoster([]);
          setSchoolStudentReservations([]);
          setSchoolStudentPhotoKeys({});
          setSchoolStudentMediaUrls({});
          setSchoolStudentRosterError(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setSchoolStudentRosterBusy(false);
        }
      }
    }

    void loadSchoolStudentRoster();

    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, context.managedAppId, currentSection, session]);

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
  }, [activeSchoolId, context.managedAppId, currentSection, session]);

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
      const zones = await fetchSchoolZones(context.managedAppId, activeSchoolId);
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

    const targetChallengeUUID = challengeUUID || selectedChallenge?.challenge_uuid;
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
      setSelectedReservationId((current) => {
        const hasCurrent = nextReservations.some(
          (reservation) => reservation.reservation_uuid === current,
        );
        return hasCurrent
          ? current
          : (nextReservations[0]?.reservation_uuid ?? "");
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

    setSchoolStudentRosterBusy(true);
    setSchoolStudentRosterError("");
    try {
      const [nextRoster, nextReservations] = await Promise.all([
        fetchSchoolStudentRoster(context.managedAppId, activeSchoolId),
        fetchSchoolTermReservations(
          session.claims.user_uuid,
          context.managedAppId,
          activeSchoolId,
        ),
      ]);
      setSchoolStudentRoster(nextRoster);
      setSchoolStudentReservations(nextReservations);
      try {
        const { photoKeysByMembership, signedUrls } =
          await resolveSchoolStudentPhotoState(
            context.managedAppId,
            activeSchoolId,
            nextRoster,
          );
        setSchoolStudentPhotoKeys(photoKeysByMembership);
        setSchoolStudentMediaUrls(signedUrls);
      } catch (error) {
        setSchoolStudentPhotoKeys({});
        setSchoolStudentMediaUrls({});
        setBanner({
          tone: "error",
          message: getErrorMessage(error),
        });
      }
    } catch (error) {
      setSchoolStudentRoster([]);
      setSchoolStudentReservations([]);
      setSchoolStudentPhotoKeys({});
      setSchoolStudentMediaUrls({});
      setSchoolStudentRosterError(getErrorMessage(error));
    } finally {
      setSchoolStudentRosterBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      const nextSession = await loginWithIdentifier(
        identifier.trim(),
        password,
        authAppId,
      );
      setSession(nextSession);
      setPassword("");
      setAuthMode("login");
      setBanner({
        tone: "success",
        message: `Signed in as ${formatAdminIdentity(nextSession)}.`,
      });
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCreateSchoolAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      const nextSession = await createSchoolAdminAccount(authAppId, signupForm);
      setSession(nextSession);
      setSignupForm((current) => ({
        ...current,
        password: "",
      }));
      setBanner({
        tone: "success",
        message: `Created school admin account for ${signupForm.school_id} as ${formatAdminIdentity(nextSession)}.`,
      });
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    setSession(null);
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

  function handleSwitchManagedApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedAppId = managedAppInput.trim();
    if (!trimmedAppId) {
      setBanner({
        tone: "error",
        message: "Managed app id is required.",
      });
      return;
    }

    setContext({
      managedAppId: trimmedAppId,
    });
    if (
      normalizeDashboardPath(location.pathname) !== sectionPathByName.school
    ) {
      navigate(sectionPathByName.school);
    }
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

  function resetPackCreateForm(defaultCampusId = schoolDraft.default_campus_id) {
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

  async function handleSavePOIs() {
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before managing POIs.",
      });
      return;
    }

    setPoiBusy(true);
    try {
      const savedPOIs = await saveSchoolPOIs(
        context.managedAppId,
        activeSchoolId,
        poiDrafts.map((poi, index) => {
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

          return {
            poi_uuid: poi.poi_uuid.trim() || undefined,
            title,
            description: poi.description.trim(),
            lat,
            lng,
            bonus_points: bonusPoints,
          };
        }),
      );

      setPoiDrafts(sortPOIsForDisplay(savedPOIs).map(poiToDraft));
      setBanner({
        tone: "success",
        message: `Updated ${savedPOIs.length} school point${savedPOIs.length === 1 ? "" : "s"} of interest.`,
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setPoiBusy(false);
    }
  }

  async function handleSaveZones() {
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "Save the school profile first before managing zones.",
      });
      return;
    }

    setZoneBusy(true);
    try {
      const savedZones = await saveSchoolZones(
        context.managedAppId,
        activeSchoolId,
        zoneDrafts.map((zone, index) => {
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
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
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
        message: "Save the school profile first before uploading challenge media.",
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

    try {
      targetValue = Number(challengeDraft.target_value.trim());
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        throw new Error("Challenge target must be greater than 0.");
      }

      startTime = parseDateTimeLocalInput(
        challengeDraft.start_time,
        "Challenge start",
      );
      endTime = parseDateTimeLocalInput(challengeDraft.end_time, "Challenge end");
      if (endTime <= startTime) {
        throw new Error("Challenge end must be after the start time.");
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return;
    }

    setChallengeBusy(true);
    try {
      const payload = {
        title: challengeDraft.title.trim(),
        description: challengeDraft.description.trim(),
        image_url: challengeDraft.image_url.trim(),
        metric_type: challengeDraft.metric_type,
        target_value: targetValue,
        start_time: startTime,
        end_time: endTime,
        active: challengeDraft.active,
      } as const;

      const savedChallenge = challengeDraft.challenge_uuid
        ? await updateSchoolChallenge(
            context.managedAppId,
            activeSchoolId,
            challengeDraft.challenge_uuid,
            payload,
          )
        : await createSchoolChallenge(
            context.managedAppId,
            activeSchoolId,
            payload,
          );

      upsertSchoolChallenge(savedChallenge);
      setSelectedChallengeId(savedChallenge.challenge_uuid);
      setChallengeDraft(challengeToDraft(savedChallenge));
      await refreshChallengeParticipants(savedChallenge.challenge_uuid);
      setBanner({
        tone: "success",
        message: `${challengeDraft.challenge_uuid ? "Updated" : "Created"} challenge ${savedChallenge.title}.`,
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

  async function handleDeleteSelectedChallenge() {
    if (!selectedChallenge || !activeSchoolId) {
      return;
    }

    const shouldContinue = window.confirm(
      `Delete challenge "${selectedChallenge.title}"? Students will no longer see or join it.`,
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
        message: `Deleted challenge ${selectedChallenge.title}.`,
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

  async function handleCreatePack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }
    if (!activeSchoolId) {
      setBanner({
        tone: "error",
        message: "This admin login is not scoped to a school.",
      });
      return;
    }

    let parsedLat = 0;
    let parsedLng = 0;
    let parsedSpotCount = 0;

    try {
      parsedLat = parseCoordinateInput(packDraft.lat, "Latitude");
      parsedLng = parseCoordinateInput(packDraft.lng, "Longitude");
      parsedSpotCount = Number.parseInt(packDraft.number_of_spots.trim(), 10);
      if (!Number.isFinite(parsedSpotCount) || parsedSpotCount < 1) {
        throw new Error("Number of spots must be greater than 0.");
      }
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
      return;
    }

    setPackBusy(true);
    try {
      const campusId =
        packDraft.campus_id.trim() ||
        schoolDraft.default_campus_id.trim() ||
        undefined;
      const created = await createSchoolPack(session.claims.user_uuid, {
        name: packDraft.name.trim() || undefined,
        description: packDraft.description.trim() || undefined,
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
      }, packPhotoFile);

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
    } catch (error) {
      setBanner({
        tone: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setPackBusy(false);
    }
  }

  async function handleApproveSelected() {
    if (!session || !selectedReservation) {
      return;
    }

    setReservationsBusy(true);
    try {
      await approveReservation(
        session.claims.user_uuid,
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

  if (!session) {
    return (
      <div className="login-shell">
        <section className="login-panel login-hero">
          <p className="eyebrow">Juise Rider Admin Dashboard</p>
          <h1>Manage schools, terms, and parking approvals from one place.</h1>
          <p className="hero-copy">
            Sign in with an admin account from <code>{authAppId}</code> to
            manage school-owned Juise Pack reservations and student
            registrations.
          </p>
          <div className="hero-grid">
            <div className="hero-card">
              <span>School profile</span>
              <strong>
                Edit the Nebula school record and branding fields.
              </strong>
            </div>
            <div className="hero-card">
              <span>Academic calendar</span>
              <strong>
                Define reservable terms that drive pack term requests.
              </strong>
            </div>
            <div className="hero-card">
              <span>Pending queue</span>
              <strong>
                Approve or deny student requests with their device history
                beside it.
              </strong>
            </div>
          </div>
        </section>

        <section className="login-panel login-form-panel">
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
              Create School Admin
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
              Login
            </button>
          </div>

          {authMode === "signup" ? (
            <form className="login-form" onSubmit={handleCreateSchoolAdmin}>
              <p className="eyebrow">School Admin Signup</p>
              <h2>Create a separate school dashboard account</h2>
              <label className="field">
                <span>School ID</span>
                <input
                  value={signupForm.school_id}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      school_id: event.target.value,
                    }))
                  }
                  placeholder="ou"
                  required
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>First name</span>
                  <input
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
                  type="email"
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
                  type="password"
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
              {authError ? <p className="error-text">{authError}</p> : null}
              <button
                className="primary-button"
                type="submit"
                disabled={authBusy}
              >
                {authBusy ? "Creating account…" : "Create School Admin"}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleLogin}>
              <p className="eyebrow">Admin Login</p>
              <h2>Sign in</h2>
              <label className="field">
                <span>Username, email, or phone</span>
                <input
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="admin@example.com"
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              {authError ? <p className="error-text">{authError}</p> : null}
              <button
                className="primary-button"
                type="submit"
                disabled={authBusy}
              >
                {authBusy ? "Signing in…" : "Enter Dashboard"}
              </button>
            </form>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" style={sidebarThemeStyle}>
        <div className="brand-card sidebar-brand-card">
          <div className="sidebar-brand-top">
            <div>
              <p className="eyebrow">Juise Rider Admin</p>
              <h2>School operations</h2>
            </div>
            <span className="sidebar-theme-chip">
              {activeSchoolId || schoolDraft.school_id || "Juise default"}
            </span>
          </div>
          <p>Signed in as {formatAdminIdentity(session)}</p>
          <p>School scope: {activeSchoolId || "Unscoped login"}</p>
        </div>

        <form className="scope-form" onSubmit={handleSwitchManagedApp}>
          <label className="field compact-field">
            <span>Managed App ID</span>
            <input
              value={managedAppInput}
              onChange={(event) => setManagedAppInput(event.target.value)}
              placeholder="juise-customer-app"
            />
          </label>
          <button className="secondary-button" type="submit">
            Load App
          </button>
        </form>

        <div className="sidebar-block">
          <div className="sidebar-block-header">
            <span>School Account</span>
          </div>
          <div className="school-list">
            {activeSchoolId ? (
              <div className="school-pill school-pill-active">
                <strong>
                  {schoolDraft.title.trim() ||
                    schoolDraft.name.trim() ||
                    activeSchoolId}
                </strong>
                <span>{activeSchoolId}</span>
              </div>
            ) : (
              <p className="muted-text">
                This dashboard manages one school per login. Use a different
                school account to switch schools.
              </p>
            )}
          </div>
        </div>

        <nav className="section-nav">
          {dashboardSections.map(({ section, label, path }) => (
            <NavLink
              key={section}
              to={path}
              className={({ isActive }) =>
                isActive ? "nav-button nav-button-active" : "nav-button"
              }
            >
              {label}
            </NavLink>
          ))}
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
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-title-block">
            <SchoolLogoPreview
              key={`header-${schoolDraft.logo_url || "fallback"}`}
              logoUrl={schoolDraft.logo_url}
              label={
                schoolDraft.title ||
                schoolDraft.name ||
                activeSchoolId ||
                "Juise"
              }
              size="header"
            />
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>
                {schoolDraft.title ||
                  schoolDraft.name ||
                  activeSchoolId ||
                  "School dashboard"}
              </h1>
              <p className="workspace-copy">
                App scope: <code>{context.managedAppId}</code>
                {" · "}
                School:{" "}
                <code>
                  {activeSchoolId || schoolDraft.school_id || "unscoped"}
                </code>
              </p>
            </div>
          </div>
          <div className="header-stats">
            <div className="stat-card">
              <span>School</span>
              <strong>{activeSchoolId || "None"}</strong>
            </div>
            <div className="stat-card">
              <span>Terms</span>
              <strong>{termDrafts.length}</strong>
            </div>
            <div className="stat-card">
              <span>Students</span>
              <strong>{schoolStudentRoster.length}</strong>
            </div>
            <div className="stat-card">
              <span>Pending</span>
              <strong>{reservations.length}</strong>
            </div>
          </div>
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

        {currentSection === "school" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">School Identity</p>
                <h2>Edit school profile</h2>
              </div>
              {schoolBusy ? <span className="muted-text">Saving…</span> : null}
            </div>

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}

            <form className="school-form" onSubmit={handleSaveSchool}>
              <div className="form-grid">
                <label className="field">
                  <span>School ID</span>
                  <input
                    value={schoolDraft.school_id || activeSchoolId}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        school_id: event.target.value,
                      }))
                    }
                    disabled
                    placeholder="ou"
                  />
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={schoolDraft.name}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Oakland University"
                  />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input
                    value={schoolDraft.title}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Oakland University"
                  />
                </label>
                <label className="field">
                  <span>Default Campus ID</span>
                  <input
                    value={schoolDraft.default_campus_id}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        default_campus_id: event.target.value,
                      }))
                    }
                    placeholder="main"
                  />
                </label>
                <div className="logo-field-row field-span-2">
                  <label className="field">
                    <span>Logo URL</span>
                    <input
                      value={schoolDraft.logo_url}
                      onChange={(event) =>
                        setSchoolDraft((current) => ({
                          ...current,
                          logo_url: event.target.value,
                        }))
                      }
                      placeholder="https://…"
                    />
                  </label>
                  <div className="logo-field-preview">
                    <span>Logo Preview</span>
                    <SchoolLogoPreview
                      key={`field-${schoolDraft.logo_url || "fallback"}`}
                      logoUrl={schoolDraft.logo_url}
                      label={
                        schoolDraft.title ||
                        schoolDraft.name ||
                        activeSchoolId ||
                        "Juise"
                      }
                      size="field"
                    />
                  </div>
                </div>
                <label className="field checkbox-field">
                  <span>Active</span>
                  <input
                    type="checkbox"
                    checked={schoolDraft.active}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                </label>
                <div className="field field-span-2">
                  <span>Color Scheme</span>
                  <div className="color-scheme-grid">
                    {schoolColorFields.map((field) => (
                      <div className="color-input-row" key={field.key}>
                        <div className="color-input-copy">
                          <strong>{field.label}</strong>
                          <span>{field.key}</span>
                        </div>
                        <input
                          type="text"
                          value={schoolDraft.color_scheme[field.key] ?? ""}
                          onChange={(event) =>
                            handleSchoolColorChange(
                              field.key,
                              event.target.value,
                            )
                          }
                          placeholder={field.fallback}
                        />
                        <input
                          type="color"
                          className="color-picker-input"
                          value={getColorPickerValue(
                            schoolDraft.color_scheme[field.key],
                            field.key as keyof typeof defaultSchoolColorScheme,
                          )}
                          onChange={(event) =>
                            handleSchoolColorChange(
                              field.key,
                              event.target.value,
                            )
                          }
                          aria-label={`${field.label} color`}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    className="color-preview-card"
                    style={{
                      background: resolvedSchoolColors.background,
                      color: resolvedSchoolColors.text,
                      borderColor: resolvedSchoolColors.secondary,
                    }}
                  >
                    <div className="color-preview-swatches" aria-hidden="true">
                      <span
                        style={{ background: resolvedSchoolColors.primary }}
                      />
                      <span
                        style={{ background: resolvedSchoolColors.secondary }}
                      />
                      <span
                        style={{ background: resolvedSchoolColors.accent }}
                      />
                      <span
                        style={{ background: resolvedSchoolColors.background }}
                      />
                      <span style={{ background: resolvedSchoolColors.text }} />
                    </div>
                    <strong>
                      {schoolDraft.title.trim() ||
                        schoolDraft.name.trim() ||
                        "Brand preview"}
                    </strong>
                    <p>
                      Preview the school palette before saving. The admin
                      dashboard sends this as the structured{" "}
                      <code>SchoolColorScheme</code> object.
                    </p>
                    <button
                      className="color-preview-button"
                      type="button"
                      style={{
                        background: resolvedSchoolColors.primary,
                        color: resolvedSchoolColors.background,
                      }}
                    >
                      Sample Primary Action
                    </button>
                  </div>
                </div>
                <label className="field field-span-2">
                  <span>Metadata JSON</span>
                  <textarea
                    value={schoolDraft.metadata}
                    onChange={(event) =>
                      setSchoolDraft((current) => ({
                        ...current,
                        metadata: event.target.value,
                      }))
                    }
                    rows={8}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={schoolBusy || !activeSchoolId}
                >
                  Save School
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshActiveSchool()}
                  disabled={schoolBusy || !activeSchoolId}
                >
                  Reload
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {currentSection === "terms" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Academic Calendar</p>
                <h2>Reservable terms</h2>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setTermDrafts((current) => [
                      ...current,
                      createEmptyTermDraft(),
                    ])
                  }
                  disabled={!activeSchoolId}
                >
                  Add Term
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleSaveTerms()}
                  disabled={schoolBusy || !activeSchoolId}
                >
                  Save Terms
                </button>
              </div>
            </div>

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}

            {activeSchoolId ? (
              <div className="term-list">
                {termDrafts.length === 0 ? (
                  <p className="empty-state">
                    No terms configured yet for this school.
                  </p>
                ) : null}
                {termDrafts.map((term, index) => (
                  <div className="term-row" key={term.id}>
                    <label className="field">
                      <span>Term Name</span>
                      <input
                        value={term.name}
                        onChange={(event) =>
                          setTermDrafts((current) =>
                            current.map((item) =>
                              item.id === term.id
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder={`Term ${index + 1}`}
                      />
                    </label>
                    <label className="field">
                      <span>Start Date</span>
                      <input
                        type="date"
                        value={term.start_date}
                        onChange={(event) =>
                          setTermDrafts((current) =>
                            current.map((item) =>
                              item.id === term.id
                                ? { ...item, start_date: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="field">
                      <span>End Date</span>
                      <input
                        type="date"
                        value={term.end_date}
                        onChange={(event) =>
                          setTermDrafts((current) =>
                            current.map((item) =>
                              item.id === term.id
                                ? { ...item, end_date: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() =>
                        setTermDrafts((current) =>
                          current.filter((item) => item.id !== term.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {currentSection === "pois" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">School Points of Interest</p>
                <h2>Manage school ride bonus checkpoints</h2>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setPoiDrafts((current) => [
                      ...current,
                      createEmptyPOIDraft(),
                    ])
                  }
                  disabled={!activeSchoolId}
                >
                  Add POI
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshSchoolPOIs()}
                  disabled={poiBusy || !activeSchoolId}
                >
                  Reload
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleSavePOIs()}
                  disabled={poiBusy || !activeSchoolId}
                >
                  Save POIs
                </button>
              </div>
            </div>

            {poiBusy ? (
              <p className="muted-text">Syncing school POIs…</p>
            ) : null}

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}

            {activeSchoolId ? (
              <div className="poi-layout">
                <div className="poi-map-grid">
                  <div className="map-card">
                    <div className="data-section-header">
                      <h3>POI map editor</h3>
                      <span>
                        {selectedPoiDraft
                          ? selectedPoiDraft.title.trim() || "Selected POI"
                          : "No POI selected"}
                      </span>
                    </div>
                    {poiDrafts.length === 0 ? (
                      <p className="empty-state">
                        Add a point of interest to place it on the map.
                      </p>
                    ) : (
                      <>
                        <PackLocationPicker
                          disabled={!selectedPoiDraft}
                          onChange={handlePoiLocationSelect}
                          value={selectedPoiLocation}
                        />
                        <p className="muted-text">
                          Choose a POI row, then click on the map to place or
                          move its checkpoint pin.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="map-card">
                    <div className="data-section-header">
                      <h3>School POI coverage</h3>
                      <span>{poiMapMarkers.length} mapped pins</span>
                    </div>
                    <PackLocationsMap markers={poiMapMarkers} />
                    <div className="detail-grid">
                      <DetailRow
                        label="Active POIs"
                        value={String(poiDrafts.length)}
                      />
                      <DetailRow
                        label="Mapped Pins"
                        value={String(poiMapMarkers.length)}
                      />
                      <DetailRow
                        label="Potential Bonus"
                        value={`${totalPOIBonusPoints} pts`}
                      />
                      <DetailRow
                        label="Unmapped"
                        value={String(poiDrafts.length - poiMapMarkers.length)}
                      />
                    </div>
                  </div>
                </div>

                <div className="poi-list">
                  {poiDrafts.length === 0 ? (
                    <p className="empty-state">
                      No POIs configured yet for this school.
                    </p>
                  ) : null}
                  {poiDrafts.map((poi, index) => (
                    <div
                      className={`poi-row ${
                        poi.id === activePoiDraftId ? "poi-row-active" : ""
                      }`}
                      key={poi.id}
                    >
                      <div className="poi-row-header">
                        <div>
                          <p className="eyebrow">POI {index + 1}</p>
                          <h3>{poi.title.trim() || "Untitled POI"}</h3>
                        </div>
                        <div className="poi-row-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setActivePoiDraftId(poi.id)}
                          >
                            {poi.id === activePoiDraftId
                              ? "Editing on Map"
                              : "Pick on Map"}
                          </button>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() =>
                              setPoiDrafts((current) =>
                                current.filter((item) => item.id !== poi.id),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="form-grid">
                        <label className="field">
                          <span>Title</span>
                          <input
                            value={poi.title}
                            onChange={(event) =>
                              setPoiDrafts((current) =>
                                current.map((item) =>
                                  item.id === poi.id
                                    ? { ...item, title: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Main Tower"
                          />
                        </label>
                        <label className="field">
                          <span>Bonus Points</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={poi.bonus_points}
                            onChange={(event) =>
                              setPoiDrafts((current) =>
                                current.map((item) =>
                                  item.id === poi.id
                                    ? {
                                        ...item,
                                        bonus_points: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            placeholder="25"
                          />
                        </label>
                        <label className="field">
                          <span>Latitude</span>
                          <input
                            value={poi.lat}
                            onChange={(event) =>
                              setPoiDrafts((current) =>
                                current.map((item) =>
                                  item.id === poi.id
                                    ? { ...item, lat: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="30.284900"
                          />
                        </label>
                        <label className="field">
                          <span>Longitude</span>
                          <input
                            value={poi.lng}
                            onChange={(event) =>
                              setPoiDrafts((current) =>
                                current.map((item) =>
                                  item.id === poi.id
                                    ? { ...item, lng: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="-97.734100"
                          />
                        </label>
                        <label className="field field-span-2">
                          <span>Description</span>
                          <textarea
                            value={poi.description}
                            onChange={(event) =>
                              setPoiDrafts((current) =>
                                current.map((item) =>
                                  item.id === poi.id
                                    ? {
                                        ...item,
                                        description: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Give riders a quick reason this checkpoint matters."
                            rows={4}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {currentSection === "zones" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">School Zones</p>
                <h2>Manage no-go and speed limit polygons</h2>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setZoneDrafts((current) => [
                      ...current,
                      createEmptyZoneDraft("no_go"),
                    ])
                  }
                  disabled={!activeSchoolId}
                >
                  Add No-Go Zone
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setZoneDrafts((current) => [
                      ...current,
                      createEmptyZoneDraft("speed_limit"),
                    ])
                  }
                  disabled={!activeSchoolId}
                >
                  Add Speed Zone
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshSchoolZones()}
                  disabled={zoneBusy || !activeSchoolId}
                >
                  Reload
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleSaveZones()}
                  disabled={zoneBusy || !activeSchoolId}
                >
                  Save Zones
                </button>
              </div>
            </div>

            {zoneBusy ? (
              <p className="muted-text">Syncing school zones…</p>
            ) : null}

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}

            {activeSchoolId ? (
              <div className="zone-layout">
                <div className="zone-map-grid">
                  <div className="map-card">
                    <div className="data-section-header">
                      <h3>Zone polygon editor</h3>
                      <span>
                        {selectedZoneDraft
                          ? selectedZoneDraft.title.trim() || "Selected zone"
                          : "No zone selected"}
                      </span>
                    </div>
                    {zoneDrafts.length === 0 ? (
                      <p className="empty-state">
                        Add a no-go or speed limit zone to begin drawing a
                        polygon.
                      </p>
                    ) : (
                      <>
                        <SchoolZoneMapEditor
                          disabled={!selectedZoneDraft}
                          onAddPoint={handleZonePointAdd}
                          onInsertPoint={handleZonePointInsert}
                          onMovePoint={handleZonePointMove}
                          polygons={zoneMapPolygons}
                          selectedPolygon={
                            selectedZoneDraft
                              ? zoneMapPolygons.find(
                                  (polygon) =>
                                    polygon.id ===
                                    (selectedZoneDraft.zone_uuid ||
                                      selectedZoneDraft.id),
                                ) ?? null
                              : null
                          }
                        />
                        <p className="muted-text">
                          Choose a zone row, then click to add vertices, drag
                          any existing point to reshape the outline, and tap
                          midpoint handles to insert a new point without
                          redrawing the whole zone.
                        </p>
                      </>
                    )}
                  </div>

                  <div className="map-card">
                    <div className="data-section-header">
                      <h3>School zone coverage</h3>
                      <span>{mappedZoneCount} mapped polygons</span>
                    </div>
                    <SchoolZonesMap polygons={zoneMapPolygons} />
                    <div className="detail-grid">
                      <DetailRow
                        label="Active Zones"
                        value={String(zoneDrafts.length)}
                      />
                      <DetailRow
                        label="Mapped Polygons"
                        value={String(mappedZoneCount)}
                      />
                      <DetailRow
                        label="No-Go Zones"
                        value={String(
                          zoneDrafts.filter((zone) => zone.zone_type === "no_go")
                            .length,
                        )}
                      />
                      <DetailRow
                        label="Speed Zones"
                        value={String(
                          zoneDrafts.filter(
                            (zone) => zone.zone_type === "speed_limit",
                          ).length,
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="zone-list">
                  {zoneDrafts.length === 0 ? (
                    <p className="empty-state">
                      No school zones configured yet for this school.
                    </p>
                  ) : null}
                  {zoneDrafts.map((zone, index) => (
                    <div
                      className={`zone-row ${
                        zone.id === activeZoneDraftId ? "zone-row-active" : ""
                      }`}
                      key={zone.id}
                    >
                      <div className="zone-row-header">
                        <div>
                          <p className="eyebrow">Zone {index + 1}</p>
                          <h3>{zone.title.trim() || "Untitled zone"}</h3>
                        </div>
                        <div className="zone-row-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setActiveZoneDraftId(zone.id)}
                          >
                            {zone.id === activeZoneDraftId
                              ? "Editing on Map"
                              : "Pick on Map"}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setZoneDrafts((current) =>
                                current.map((item) =>
                                  item.id === zone.id
                                    ? {
                                        ...item,
                                        polygon: item.polygon.slice(0, -1),
                                      }
                                    : item,
                                ),
                              )
                            }
                            disabled={zone.polygon.length === 0}
                          >
                            Undo Point
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setZoneDrafts((current) =>
                                current.map((item) =>
                                  item.id === zone.id
                                    ? { ...item, polygon: [] }
                                    : item,
                                ),
                              )
                            }
                            disabled={zone.polygon.length === 0}
                          >
                            Clear Shape
                          </button>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() =>
                              setZoneDrafts((current) =>
                                current.filter((item) => item.id !== zone.id),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="form-grid">
                        <label className="field">
                          <span>Title</span>
                          <input
                            value={zone.title}
                            onChange={(event) =>
                              setZoneDrafts((current) =>
                                current.map((item) =>
                                  item.id === zone.id
                                    ? { ...item, title: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="North Mall No-Go Zone"
                          />
                        </label>
                        <label className="field">
                          <span>Zone Type</span>
                          <select
                            value={zone.zone_type}
                            onChange={(event) =>
                              setZoneDrafts((current) =>
                                current.map((item) =>
                                  item.id === zone.id
                                    ? {
                                        ...item,
                                        zone_type: event.target
                                          .value as ZoneDraft["zone_type"],
                                        speed_limit_mph:
                                          event.target.value === "speed_limit"
                                            ? item.speed_limit_mph || "15"
                                            : "",
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="no_go">No-go zone</option>
                            <option value="speed_limit">Speed limit zone</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Speed Limit (mph)</span>
                          <input
                            disabled={zone.zone_type !== "speed_limit"}
                            min={1}
                            step={1}
                            type="number"
                            value={zone.speed_limit_mph}
                            onChange={(event) =>
                              setZoneDrafts((current) =>
                                current.map((item) =>
                                  item.id === zone.id
                                    ? {
                                        ...item,
                                        speed_limit_mph: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            placeholder="15"
                          />
                        </label>
                        <label className="field">
                          <span>Vertices</span>
                          <input
                            disabled
                            value={String(zone.polygon.length)}
                            placeholder="0"
                          />
                        </label>
                        <label className="field field-span-2">
                          <span>Description</span>
                          <textarea
                            value={zone.description}
                            onChange={(event) =>
                              setZoneDrafts((current) =>
                                current.map((item) =>
                                  item.id === zone.id
                                    ? {
                                        ...item,
                                        description: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Explain why riders lose points here."
                            rows={4}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {currentSection === "challenges" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Campaigns</p>
                <h2>Manage school challenges</h2>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setSelectedChallengeId(newChallengeSelectionId);
                    setChallengeDraft(createEmptyChallengeDraft());
                    setChallengeParticipants([]);
                  }}
                  disabled={!activeSchoolId}
                >
                  New Challenge
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshSchoolChallenges()}
                  disabled={challengeListBusy || !activeSchoolId}
                >
                  Refresh
                </button>
              </div>
            </div>

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}

            {activeSchoolId ? (
              <div className="challenge-layout">
                <div className="challenge-editor">
                  <form className="school-form" onSubmit={handleSaveChallenge}>
                    <div className="panel-header">
                      <div>
                        <p className="eyebrow">Challenge Editor</p>
                        <h3>
                          {challengeDraft.challenge_uuid
                            ? "Edit existing challenge"
                            : "Create a new challenge"}
                        </h3>
                      </div>
                      {challengeBusy ? (
                        <span className="muted-text">Saving…</span>
                      ) : null}
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Title</span>
                        <input
                          value={challengeDraft.title}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          placeholder="Ride 25 miles in 7 days"
                        />
                      </label>
                      <label className="field">
                        <span>Metric</span>
                        <select
                          value={challengeDraft.metric_type}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              metric_type: event.target
                                .value as ChallengeDraft["metric_type"],
                              target_value:
                                event.target.value === "points"
                                  ? current.metric_type === "points"
                                    ? current.target_value
                                    : "100"
                                  : current.metric_type === "distance_miles"
                                    ? current.target_value
                                    : "10",
                            }))
                          }
                        >
                          <option value="distance_miles">Distance in miles</option>
                          <option value="points">Points</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>
                          Target{" "}
                          {challengeDraft.metric_type === "points"
                            ? "(points)"
                            : "(miles)"}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step={
                            challengeDraft.metric_type === "points" ? "1" : "0.1"
                          }
                          value={challengeDraft.target_value}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              target_value: event.target.value,
                            }))
                          }
                          placeholder={
                            challengeDraft.metric_type === "points"
                              ? "100"
                              : "10"
                          }
                        />
                      </label>
                      <label className="field checkbox-field">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          checked={challengeDraft.active}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              active: event.target.checked,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Start</span>
                        <input
                          type="datetime-local"
                          value={challengeDraft.start_time}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              start_time: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>End</span>
                        <input
                          type="datetime-local"
                          value={challengeDraft.end_time}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              end_time: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field field-span-2">
                        <span>Description</span>
                        <textarea
                          value={challengeDraft.description}
                          onChange={(event) =>
                            setChallengeDraft((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Invite students to participate and explain how they win."
                          rows={5}
                        />
                      </label>
                      <div className="field field-span-2">
                        <span>Challenge Image</span>
                        <div className="challenge-image-field">
                          <EntityImagePreview
                            imageUrl={challengeDraft.image_url}
                            label={challengeDraft.title || "School"}
                            altSuffix="challenge"
                            fallbackLabel="Challenge image preview"
                          />
                          <div className="challenge-image-field-controls">
                            <label className="field">
                              <span>Image URL</span>
                              <input
                                value={challengeDraft.image_url}
                                onChange={(event) =>
                                  setChallengeDraft((current) => ({
                                    ...current,
                                    image_url: event.target.value,
                                  }))
                                }
                                placeholder="https://example.com/challenge-cover.jpg"
                              />
                            </label>
                            <div className="challenge-image-upload-row">
                              <label className="secondary-button challenge-upload-button">
                                <input
                                  className="challenge-upload-input"
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                                  onChange={handleChallengeImageFileChange}
                                  disabled={
                                    challengeImageUploadBusy || !activeSchoolId
                                  }
                                />
                                {challengeImageUploadBusy
                                  ? "Uploading..."
                                  : "Upload Image"}
                              </label>
                              {challengeDraft.image_url.trim() ? (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() =>
                                    setChallengeDraft((current) => ({
                                      ...current,
                                      image_url: "",
                                    }))
                                  }
                                  disabled={challengeImageUploadBusy}
                                >
                                  Clear Image
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <DetailRow
                        label="Goal"
                        value={formatChallengeMetricValue(
                          challengeDraft.metric_type,
                          Number(challengeDraft.target_value),
                        )}
                      />
                      <DetailRow
                        label="Window"
                        value={
                          challengeDraft.start_time && challengeDraft.end_time
                            ? `${challengeDraft.start_time.replace("T", " ")} to ${challengeDraft.end_time.replace("T", " ")}`
                            : "Set a start and end time"
                        }
                      />
                    </div>

                    <div className="form-actions">
                      {challengeDraft.challenge_uuid ? (
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => void handleDeleteSelectedChallenge()}
                          disabled={challengeBusy}
                        >
                          Delete
                        </button>
                      ) : null}
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={challengeBusy}
                      >
                        {challengeDraft.challenge_uuid
                          ? "Save Challenge"
                          : "Create Challenge"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="challenge-sidebar">
                  <div className="data-section">
                    <div className="data-section-header">
                      <h4>Challenge library</h4>
                      <span>{currentAndUpcomingChallenges.length}</span>
                    </div>
                    {challengeListBusy ? (
                      <p className="muted-text">Loading challenges…</p>
                    ) : null}
                    {!challengeListBusy &&
                    currentAndUpcomingChallenges.length === 0 ? (
                      <p className="empty-state">
                        No live or upcoming challenges are in the library right
                        now.
                      </p>
                    ) : null}
                    <div className="challenge-list">
                      {currentAndUpcomingChallenges.map((challenge) => {
                        const status = resolveChallengeStatus(challenge);
                        return (
                          <button
                            key={challenge.challenge_uuid}
                            className={`challenge-card ${
                              challenge.challenge_uuid === selectedChallengeId
                                ? "challenge-card-active"
                                : ""
                            }`}
                            type="button"
                            onClick={() =>
                              setSelectedChallengeId(challenge.challenge_uuid)
                            }
                          >
                            {challenge.image_url.trim() ? (
                              <img
                                className="challenge-card-image"
                                src={challenge.image_url}
                                alt={`${challenge.title} challenge`}
                              />
                            ) : null}
                            <div className="challenge-card-header">
                              <strong>{challenge.title}</strong>
                              <span className="student-badge">
                                {status}
                              </span>
                            </div>
                            <span>
                              {formatChallengeMetricValue(
                                challenge.metric_type,
                                challenge.target_value,
                              )}
                            </span>
                            <span>
                              {formatDateTimeForDisplay(challenge.start_time)} -{" "}
                              {formatDateTimeForDisplay(challenge.end_time)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="data-section">
                    <div className="data-section-header">
                      <h4>Past challenges</h4>
                      <span>{pastChallenges.length}</span>
                    </div>
                    {!challengeListBusy && pastChallenges.length === 0 ? (
                      <p className="empty-state">
                        Ended challenges will move here once their campaign
                        window closes.
                      </p>
                    ) : null}
                    <div className="challenge-list">
                      {pastChallenges.map((challenge) => {
                        const status = resolveChallengeStatus(challenge);
                        return (
                          <button
                            key={challenge.challenge_uuid}
                            className={`challenge-card ${
                              challenge.challenge_uuid === selectedChallengeId
                                ? "challenge-card-active"
                                : ""
                            }`}
                            type="button"
                            onClick={() =>
                              setSelectedChallengeId(challenge.challenge_uuid)
                            }
                          >
                            {challenge.image_url.trim() ? (
                              <img
                                className="challenge-card-image"
                                src={challenge.image_url}
                                alt={`${challenge.title} challenge`}
                              />
                            ) : null}
                            <div className="challenge-card-header">
                              <strong>{challenge.title}</strong>
                              <span className="student-badge">{status}</span>
                            </div>
                            <span>
                              {formatChallengeMetricValue(
                                challenge.metric_type,
                                challenge.target_value,
                              )}
                            </span>
                            <span>
                              {formatDateTimeForDisplay(challenge.start_time)} -{" "}
                              {formatDateTimeForDisplay(challenge.end_time)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="data-section">
                    <div className="data-section-header">
                      <h4>Student progress</h4>
                      <span>{challengeParticipantSummary.joined}</span>
                    </div>

                    {!selectedChallenge ? (
                      <p className="empty-state">
                        Select a saved challenge to review student enrollment
                        and progress.
                      </p>
                    ) : (
                      <>
                        <div className="detail-grid">
                          <DetailRow
                            label="Status"
                            value={resolveChallengeStatus(selectedChallenge)}
                          />
                          <DetailRow
                            label="Goal"
                            value={formatChallengeMetricValue(
                              selectedChallenge.metric_type,
                              selectedChallenge.target_value,
                            )}
                          />
                          <DetailRow
                            label="Joined"
                            value={String(challengeParticipantSummary.joined)}
                          />
                          <DetailRow
                            label="Completed"
                            value={String(
                              challengeParticipantSummary.completed,
                            )}
                          />
                        </div>

                        {challengeParticipantsBusy ? (
                          <p className="muted-text">
                            Loading student challenge progress…
                          </p>
                        ) : null}
                        {!challengeParticipantsBusy &&
                        challengeParticipants.length === 0 ? (
                          <p className="empty-state">
                            No students have joined this challenge yet.
                          </p>
                        ) : null}

                        <div className="participant-progress-list">
                          {challengeParticipants.map((participant) => (
                            <article
                              className="participant-progress-card"
                              key={participant.participation_uuid}
                            >
                              <div className="student-roster-header">
                                <div>
                                  <p className="eyebrow">Student</p>
                                  <h3>
                                    {formatNebulaUserName({
                                      first_name: participant.first_name,
                                      last_name: participant.last_name,
                                      email: participant.email,
                                      username: participant.username,
                                    })}
                                  </h3>
                                </div>
                                <div className="student-roster-badges">
                                  <span className="student-badge">
                                    {participant.completed
                                      ? "Completed"
                                      : participant.active
                                        ? "In Progress"
                                        : "Left"}
                                  </span>
                                  <span className="student-badge student-badge-muted">
                                    {participant.student_id || "No student ID"}
                                  </span>
                                </div>
                              </div>

                              <div className="challenge-progress-meta">
                                <div className="challenge-progress-copy">
                                  <strong>
                                    {formatChallengeMetricValue(
                                      participant.metric_type,
                                      participant.progress_value,
                                    )}
                                  </strong>
                                  <span>
                                    Goal{" "}
                                    {formatChallengeMetricValue(
                                      participant.metric_type,
                                      participant.target_value,
                                    )}
                                  </span>
                                </div>
                                <span className="challenge-progress-percent">
                                  {Math.round(
                                    participant.completion_percent,
                                  )}
                                  %
                                </span>
                              </div>
                              <div className="challenge-progress-bar">
                                <span
                                  className="challenge-progress-bar-fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, participant.completion_percent))}%`,
                                  }}
                                />
                              </div>

                              <div className="detail-grid">
                                <DetailRow
                                  label="Username"
                                  value={
                                    participant.username ||
                                    participant.email ||
                                    participant.user_uuid
                                  }
                                />
                                <DetailRow
                                  label="Sessions"
                                  value={String(participant.total_sessions)}
                                />
                                <DetailRow
                                  label="Joined"
                                  value={formatDateTimeForDisplay(
                                    participant.joined_at,
                                  )}
                                />
                                <DetailRow
                                  label="Last Activity"
                                  value={formatDateTimeForDisplay(
                                    participant.last_activity_at ?? undefined,
                                  )}
                                />
                              </div>
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {currentSection === "students" ? (
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">School Roster</p>
                <h2>Registered students</h2>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void refreshStudentRoster()}
                disabled={schoolStudentRosterBusy || !activeSchoolId}
              >
                Refresh
              </button>
            </div>

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}
            {activeSchoolId && schoolStudentRosterBusy ? (
              <p className="muted-text">Loading registered students…</p>
            ) : null}
            {schoolStudentRosterError ? (
              <p className="error-text">{schoolStudentRosterError}</p>
            ) : null}
            {activeSchoolId &&
            !schoolStudentRosterBusy &&
            !schoolStudentRosterError &&
            sortedSchoolStudentRoster.length === 0 ? (
              <p className="empty-state">
                No registered students were found for this school yet.
              </p>
            ) : null}

            <div className="student-roster-list">
              {sortedSchoolStudentRoster.map((entry) => {
                const membership = entry.membership;
                const frontPhotoObjectKey = resolveStudentPhotoObjectKey(
                  membership,
                  schoolStudentPhotoKeys,
                  "front",
                );
                const backPhotoObjectKey = resolveStudentPhotoObjectKey(
                  membership,
                  schoolStudentPhotoKeys,
                  "back",
                );
                const frontPhotoUrl = frontPhotoObjectKey
                  ? (schoolStudentMediaUrls[frontPhotoObjectKey] ?? "")
                  : "";
                const backPhotoUrl = backPhotoObjectKey
                  ? (schoolStudentMediaUrls[backPhotoObjectKey] ?? "")
                  : "";
                const reservationsForMembership =
                  schoolReservationsByMembership.get(
                    membership.membership_uuid,
                  ) ?? [];

                return (
                  <article
                    className="student-roster-card"
                    key={membership.membership_uuid}
                  >
                    <div className="student-roster-header">
                      <div>
                        <p className="eyebrow">Student</p>
                        <h3>{formatNebulaUserName(entry.user)}</h3>
                      </div>
                      <div className="student-roster-badges">
                        <span className="student-badge">
                          {membership.status || "active"}
                        </span>
                        <span className="student-badge student-badge-muted">
                          {membership.student_id || "No student ID"}
                        </span>
                      </div>
                    </div>

                    <div className="student-roster-content">
                      <div className="student-roster-photos">
                        <div className="student-photo-card">
                          <span>Front of ID</span>
                          {frontPhotoUrl ? (
                            <img
                              className="student-photo-image"
                              src={frontPhotoUrl}
                              alt={`${formatNebulaUserName(entry.user)} front ID`}
                            />
                          ) : (
                            <div className="student-photo-placeholder">
                              Front ID not available
                            </div>
                          )}
                        </div>
                        <div className="student-photo-card">
                          <span>Back of ID</span>
                          {backPhotoUrl ? (
                            <img
                              className="student-photo-image"
                              src={backPhotoUrl}
                              alt={`${formatNebulaUserName(entry.user)} back ID`}
                            />
                          ) : (
                            <div className="student-photo-placeholder">
                              Back ID not available
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="student-roster-data">
                        <div className="detail-grid">
                          <DetailRow
                            label="Student ID"
                            value={membership.student_id || "Not set"}
                          />
                          <DetailRow
                            label="Campus"
                            value={membership.campus_id || "Not set"}
                          />
                          <DetailRow
                            label="Email"
                            value={entry.user.email || "Not set"}
                          />
                          <DetailRow
                            label="Phone"
                            value={entry.user.phone || "Not set"}
                          />
                        </div>

                        <div className="data-section">
                          <div className="data-section-header">
                            <h4>School terms</h4>
                            <span>{membership.terms.length}</span>
                          </div>
                          {membership.terms.length === 0 ? (
                            <p className="muted-text">
                              No membership terms assigned.
                            </p>
                          ) : (
                            <div className="stack-list">
                              {membership.terms.map((term) => (
                                <div className="data-card" key={term.term_uuid}>
                                  <strong>{term.name}</strong>
                                  <span>
                                    {formatDateOnly(term.start_date)} -{" "}
                                    {formatDateOnly(term.end_date)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="data-section">
                          <div className="data-section-header">
                            <h4>Parking reservations by term</h4>
                            <span>{reservationsForMembership.length}</span>
                          </div>
                          {reservationsForMembership.length === 0 ? (
                            <p className="muted-text">
                              No parking reservations have been submitted for
                              this student.
                            </p>
                          ) : (
                            <div className="stack-list">
                              {reservationsForMembership.map((reservation) => (
                                <div
                                  className="data-card"
                                  key={reservation.reservation_uuid}
                                >
                                  <strong>
                                    {reservation.term_name || "School term"}
                                  </strong>
                                  <span>
                                    {reservation.pack_name || "Juise Pack"} ·
                                    Spot {reservation.spot_number || "TBD"}
                                  </span>
                                  <div className="uuid-copy-stack">
                                    <UuidCopyField
                                      label="pack_uuid"
                                      value={reservation.pack_uuid}
                                      onCopy={handleCopyUuid}
                                    />
                                    <UuidCopyField
                                      label="pack_spot_uuid"
                                      value={reservation.spot_uuid}
                                      onCopy={handleCopyUuid}
                                    />
                                  </div>
                                  <span>
                                    Status: {reservation.status} ·{" "}
                                    {formatUnixTimestamp(
                                      reservation.start_time,
                                    )}{" "}
                                    -{" "}
                                    {formatUnixTimestamp(reservation.end_time)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {currentSection === "packs" ? (
          <section className="panel pack-tabs-panel">
            <div className="panel-header pack-tabs-header">
              <div>
                <p className="eyebrow">Juise Packs</p>
                <h2>Manage school-owned parking packs</h2>
              </div>
              {activePackTab === "create" && packBusy ? (
                <span className="muted-text">Creating…</span>
              ) : activePackTab === "existing" && packsLoading ? (
                <span className="muted-text">Refreshing…</span>
              ) : null}
            </div>

            <div
              className="pack-tabs"
              role="tablist"
              aria-label="Juise pack sections"
            >
              <button
                className={`pack-tab-button ${
                  activePackTab === "create" ? "pack-tab-button-active" : ""
                }`}
                type="button"
                role="tab"
                id="pack-tab-create"
                aria-selected={activePackTab === "create"}
                aria-controls="pack-tab-panel-create"
                onClick={() => setActivePackTab("create")}
              >
                Create Juise Pack
              </button>
              <button
                className={`pack-tab-button ${
                  activePackTab === "existing" ? "pack-tab-button-active" : ""
                }`}
                type="button"
                role="tab"
                id="pack-tab-existing"
                aria-selected={activePackTab === "existing"}
                aria-controls="pack-tab-panel-existing"
                onClick={() => setActivePackTab("existing")}
              >
                Existing Juise Packs
              </button>
            </div>

            {!activeSchoolId ? (
              <p className="empty-state">
                This admin login is not scoped to a school.
              </p>
            ) : null}

            {activePackTab === "create" ? (
              <div
                className="pack-tab-panel pack-builder"
                role="tabpanel"
                id="pack-tab-panel-create"
                aria-labelledby="pack-tab-create"
              >
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Juise Pack Builder</p>
                    <h3>Create a school-owned parking pack</h3>
                  </div>
                </div>

                <form className="school-form" onSubmit={handleCreatePack}>
                  <div className="form-grid">
                    <label className="field">
                      <span>School ID</span>
                      <input value={activeSchoolId} disabled />
                    </label>
                    <label className="field">
                      <span>Campus ID</span>
                      <input
                        value={packDraft.campus_id}
                        onChange={(event) =>
                          setPackDraft((current) => ({
                            ...current,
                            campus_id: event.target.value,
                          }))
                        }
                        placeholder={schoolDraft.default_campus_id || "main"}
                        disabled={!activeSchoolId}
                      />
                    </label>
                    <label className="field">
                      <span>Pack Name</span>
                      <input
                        value={packDraft.name}
                        onChange={(event) =>
                          setPackDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="North Garage Pack"
                        disabled={!activeSchoolId}
                      />
                    </label>
                    <label className="field">
                      <span>Number of Spots</span>
                      <input
                        type="number"
                        min={1}
                        value={packDraft.number_of_spots}
                        onChange={(event) =>
                          setPackDraft((current) => ({
                            ...current,
                            number_of_spots: event.target.value,
                          }))
                        }
                        disabled={!activeSchoolId}
                      />
                    </label>
                    <label className="field field-span-2">
                      <span>Description</span>
                      <textarea
                        value={packDraft.description}
                        onChange={(event) =>
                          setPackDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Covered student parking near the library entrance."
                        rows={5}
                        disabled={!activeSchoolId}
                      />
                    </label>
                    <div className="field field-span-2">
                      <span>Pack Photo</span>
                      <div className="challenge-image-field">
                        <EntityImagePreview
                          imageUrl={packPhotoPreviewUrl}
                          label={packDraft.name || "Juise Pack"}
                          altSuffix="pack photo"
                          fallbackLabel="Pack photo preview"
                        />
                        <div className="challenge-image-field-controls">
                          <p className="muted-text">
                            Upload a cover image for this Juise Pack. The image
                            will be saved with the pack record.
                          </p>
                          <div className="challenge-image-upload-row">
                            <label className="secondary-button challenge-upload-button">
                              <input
                                className="challenge-upload-input"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={handlePackPhotoFileChange}
                                disabled={packBusy || !activeSchoolId}
                              />
                              {packPhotoFile ? "Replace Photo" : "Upload Photo"}
                            </label>
                            {packPhotoFile ? (
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setPackPhotoFile(null);
                                  setPackPhotoPreviewUrl("");
                                }}
                                disabled={packBusy}
                              >
                                Clear Photo
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pack-map-grid">
                    <div className="map-card">
                      <div className="data-section-header">
                        <h3>Pack location</h3>
                        <span>
                          {selectedPackLocation ? "Pin placed" : "No pin yet"}
                        </span>
                      </div>
                      <PackLocationPicker
                        disabled={!activeSchoolId}
                        onChange={handlePackLocationSelect}
                        value={selectedPackLocation}
                      />
                    </div>

                    <div className="map-card">
                      <div className="data-section-header">
                        <h3>Coordinates</h3>
                        <span>Fine tune manually</span>
                      </div>
                      <div className="coordinate-grid">
                        <label className="field">
                          <span>Latitude</span>
                          <input
                            value={packDraft.lat}
                            onChange={(event) =>
                              setPackDraft((current) => ({
                                ...current,
                                lat: event.target.value,
                              }))
                            }
                            placeholder="42.678000"
                            disabled={!activeSchoolId}
                          />
                        </label>
                        <label className="field">
                          <span>Longitude</span>
                          <input
                            value={packDraft.lng}
                            onChange={(event) =>
                              setPackDraft((current) => ({
                                ...current,
                                lng: event.target.value,
                              }))
                            }
                            placeholder="-83.195000"
                            disabled={!activeSchoolId}
                          />
                        </label>
                      </div>
                      <p className="muted-text">
                        Click the map to drop a pin. The created pack is
                        automatically assigned to{" "}
                        <code>{activeSchoolId || "school-scope"}</code> for{" "}
                        <code>{context.managedAppId}</code>.
                      </p>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={packBusy || !activeSchoolId}
                    >
                      {packBusy ? "Creating Pack…" : "Create Juise Pack"}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={packBusy}
                      onClick={() =>
                        resetPackCreateForm(schoolDraft.default_campus_id ?? "")
                      }
                    >
                      Reset Form
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div
                className="pack-tab-panel pack-preview-panel"
                role="tabpanel"
                id="pack-tab-panel-existing"
                aria-labelledby="pack-tab-existing"
              >
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">School Inventory</p>
                    <h3>Existing Juise Packs</h3>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void refreshSchoolPacks()}
                    disabled={packsLoading || !activeSchoolId}
                  >
                    Refresh
                  </button>
                </div>

                {activeSchoolId && packsLoading && schoolPacks.length === 0 ? (
                  <p className="muted-text">Loading school packs…</p>
                ) : null}

                {activeSchoolId && !packsLoading && schoolPacks.length === 0 ? (
                  <p className="empty-state">
                    No school-owned Juise packs have been created for this
                    school yet.
                  </p>
                ) : null}

                {activeSchoolId && schoolPacks.length > 0 ? (
                  <div className="pack-inventory-layout">
                    <div className="map-card pack-map-card">
                      <div className="data-section-header">
                        <div>
                          <h3>Pack pins</h3>
                          <p className="muted-text">
                            All saved Juise Pack locations for this school.
                          </p>
                        </div>
                        <span>{existingPackMapMarkers.length} pins</span>
                      </div>
                      <PackLocationsMap markers={existingPackMapMarkers} />
                      {packsWithoutLocationsCount > 0 ? (
                        <p className="muted-text">
                          {packsWithoutLocationsCount} pack
                          {packsWithoutLocationsCount === 1 ? "" : "s"} do not
                          have saved coordinates yet.
                        </p>
                      ) : null}
                    </div>

                    <div className="stack-list">
                      {schoolPacks.map((pack) => {
                        const isEditingPack =
                          editingPackId === pack.pack_uuid &&
                          packEditDraft !== null;
                        const currentPackEditDraft = isEditingPack
                          ? packEditDraft
                          : null;
                        const packPhotoUrl = getPackPhotoUrl(pack);
                        const displayedPackPhoto = isEditingPack
                          ? packEditPhotoPreviewUrl || packPhotoUrl
                          : packPhotoUrl;

                        return (
                          <article
                            className="data-card pack-record-card"
                            key={pack.pack_uuid}
                          >
                            <div className="pack-record-top">
                              <div className="pack-record-summary">
                                <div className="pack-record-preview">
                                  <EntityImagePreview
                                    imageUrl={displayedPackPhoto}
                                    label={pack.name || "Juise Pack"}
                                    altSuffix="pack photo"
                                    fallbackLabel="Pack photo preview"
                                  />
                                </div>
                                <div className="pack-record-copy">
                                  <strong>{pack.name || "Juise Pack"}</strong>
                                  <p className="muted-text">
                                    {pack.description || "No description set."}
                                  </p>
                                  <div className="pack-record-meta">
                                    <span>{pack.spot_count} spots</span>
                                    <span>
                                      {packPhotoUrl ? "Photo saved" : "No photo yet"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="pack-record-actions">
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() =>
                                    isEditingPack
                                      ? handleCancelPackEdit()
                                      : handleStartEditingPack(pack)
                                  }
                                  disabled={packEditBusy}
                                >
                                  {isEditingPack ? "Cancel Edit" : "Edit Details"}
                                </button>
                              </div>
                            </div>

                            <div className="detail-grid">
                              <DetailRow
                                label="School ID"
                                value={
                                  pack.school_owner?.school_id || activeSchoolId
                                }
                              />
                              <DetailRow
                                label="Campus ID"
                                value={pack.school_owner?.campus_id || "Not set"}
                              />
                              <DetailRow
                                label="Latitude"
                                value={
                                  pack.location
                                    ? formatCoordinateValue(pack.location.lat)
                                    : "Not set"
                                }
                              />
                              <DetailRow
                                label="Longitude"
                                value={
                                  pack.location
                                    ? formatCoordinateValue(pack.location.lng)
                                    : "Not set"
                                }
                              />
                            </div>

                            {currentPackEditDraft ? (
                              <form
                                className="data-section pack-edit-form"
                                onSubmit={(event) =>
                                  void handleSavePackEdit(event, pack)
                                }
                              >
                                <div className="data-section-header">
                                  <div>
                                    <h4>Edit pack details</h4>
                                    <p className="muted-text">
                                      Update the pack name, description, pin, and
                                      photo.
                                    </p>
                                  </div>
                                </div>

                                <div className="form-grid">
                                  <label className="field">
                                    <span>Pack Name</span>
                                    <input
                                      value={currentPackEditDraft.name}
                                      onChange={(event) =>
                                        setPackEditDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                name: event.target.value,
                                              }
                                            : current,
                                        )
                                      }
                                      placeholder="North Garage Pack"
                                      disabled={packEditBusy}
                                    />
                                  </label>
                                  <label className="field">
                                    <span>Latitude</span>
                                    <input
                                      value={currentPackEditDraft.lat}
                                      onChange={(event) =>
                                        setPackEditDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                lat: event.target.value,
                                              }
                                            : current,
                                        )
                                      }
                                      placeholder="42.678000"
                                      disabled={packEditBusy}
                                    />
                                  </label>
                                  <label className="field">
                                    <span>Longitude</span>
                                    <input
                                      value={currentPackEditDraft.lng}
                                      onChange={(event) =>
                                        setPackEditDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                lng: event.target.value,
                                              }
                                            : current,
                                        )
                                      }
                                      placeholder="-83.195000"
                                      disabled={packEditBusy}
                                    />
                                  </label>
                                  <label className="field field-span-2">
                                    <span>Description</span>
                                    <textarea
                                      value={currentPackEditDraft.description}
                                      onChange={(event) =>
                                        setPackEditDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                description: event.target.value,
                                              }
                                            : current,
                                        )
                                      }
                                      placeholder="Covered student parking near the library entrance."
                                      rows={4}
                                      disabled={packEditBusy}
                                    />
                                  </label>
                                  <div className="field field-span-2">
                                    <span>Pack Photo</span>
                                    <div className="challenge-image-field">
                                      <EntityImagePreview
                                        imageUrl={displayedPackPhoto}
                                        label={pack.name || "Juise Pack"}
                                        altSuffix="pack photo"
                                        fallbackLabel="Pack photo preview"
                                      />
                                      <div className="challenge-image-field-controls">
                                        <p className="muted-text">
                                          Upload a new pack photo to replace the
                                          current image.
                                        </p>
                                        <div className="challenge-image-upload-row">
                                          <label className="secondary-button challenge-upload-button">
                                            <input
                                              className="challenge-upload-input"
                                              type="file"
                                              accept="image/png,image/jpeg,image/webp,image/gif"
                                              onChange={
                                                handlePackEditPhotoFileChange
                                              }
                                              disabled={packEditBusy}
                                            />
                                            {packEditPhotoFile
                                              ? "Replace Photo"
                                              : "Upload Photo"}
                                          </label>
                                          {packEditPhotoFile ? (
                                            <button
                                              className="secondary-button"
                                              type="button"
                                              onClick={() => {
                                                setPackEditPhotoFile(null);
                                                setPackEditPhotoPreviewUrl("");
                                              }}
                                              disabled={packEditBusy}
                                            >
                                              Use Current Photo
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="form-actions pack-edit-actions">
                                  <button
                                    className="primary-button"
                                    type="submit"
                                    disabled={packEditBusy}
                                  >
                                    {packEditBusy ? "Saving Changes…" : "Save Changes"}
                                  </button>
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    onClick={handleCancelPackEdit}
                                    disabled={packEditBusy}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : null}

                            <div className="uuid-copy-stack">
                              <UuidCopyField
                                label="pack_uuid"
                                value={pack.pack_uuid}
                                onCopy={handleCopyUuid}
                              />
                            </div>

                            <div className="form-actions pack-download-actions">
                              {pack.qr_code ? (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => handleDownloadPackQrCode(pack)}
                                >
                                  Download Pack QR
                                </button>
                              ) : (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() =>
                                    void handleGeneratePackQrCode(pack)
                                  }
                                  disabled={
                                    qrActionTarget === `pack:${pack.pack_uuid}`
                                  }
                                >
                                  {qrActionTarget === `pack:${pack.pack_uuid}`
                                    ? "Generating Pack QR…"
                                    : "Generate Pack QR"}
                                </button>
                              )}
                            </div>

                            <div className="data-section">
                              <div className="data-section-header">
                                <h4>Spots</h4>
                                <span>{pack.spots.length}</span>
                              </div>
                              <div className="stack-list">
                                {pack.spots.map((spot) => (
                                  <div
                                    className="data-card pack-spot-card"
                                    key={spot.spot_uuid}
                                  >
                                    <div className="pack-spot-header">
                                      <div className="pack-spot-copy">
                                        <strong>Spot {spot.spot_number}</strong>
                                        <span>{pack.name || pack.pack_uuid}</span>
                                      </div>
                                      {spot.qr_code ? (
                                        <button
                                          className="secondary-button"
                                          type="button"
                                          onClick={() =>
                                            handleDownloadPackSpotQrCode(spot)
                                          }
                                        >
                                          Download Spot QR
                                        </button>
                                      ) : (
                                        <button
                                          className="secondary-button"
                                          type="button"
                                          onClick={() =>
                                            void handleGeneratePackSpotQrCode(
                                              spot,
                                            )
                                          }
                                          disabled={
                                            qrActionTarget ===
                                            `spot:${spot.spot_uuid}`
                                          }
                                        >
                                          {qrActionTarget ===
                                          `spot:${spot.spot_uuid}`
                                            ? "Generating Spot QR…"
                                            : "Generate Spot QR"}
                                        </button>
                                      )}
                                    </div>

                                    <UuidCopyField
                                      label="pack_spot_uuid"
                                      value={spot.spot_uuid}
                                      onCopy={handleCopyUuid}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        {currentSection === "reservations" ? (
          <section className="reservation-layout">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Pending Queue</p>
                  <h2>Reservation requests</h2>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void refreshReservations()}
                  disabled={reservationsBusy || !activeSchoolId}
                >
                  Refresh
                </button>
              </div>

              {!activeSchoolId ? (
                <p className="empty-state">
                  This admin login is not scoped to a school.
                </p>
              ) : null}
              {activeSchoolId && reservationsBusy ? (
                <p className="muted-text">Loading pending reservations…</p>
              ) : null}
              {activeSchoolId &&
              !reservationsBusy &&
              reservations.length === 0 ? (
                <p className="empty-state">
                  No pending term reservations for this school.
                </p>
              ) : null}

              <div className="reservation-list">
                {reservations.map((reservation) => (
                  <button
                    key={reservation.reservation_uuid}
                    type="button"
                    className={`reservation-card ${
                      reservation.reservation_uuid === selectedReservationId
                        ? "reservation-card-active"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedReservationId(reservation.reservation_uuid)
                    }
                  >
                    <div>
                      <strong>{reservation.pack_name || "Juise Pack"}</strong>
                      <span>Spot {reservation.spot_number ?? "TBD"}</span>
                    </div>
                    <div>
                      <span>{reservation.term_name || "Term request"}</span>
                      <span>{reservation.user_uuid}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Reservation Detail</p>
                  <h2>
                    {selectedReservation?.reservation_uuid ||
                      "Select a reservation"}
                  </h2>
                </div>
                <div className="form-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void handleDenySelected()}
                    disabled={!selectedReservation || reservationsBusy}
                  >
                    Deny
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleApproveSelected()}
                    disabled={!selectedReservation || reservationsBusy}
                  >
                    Approve
                  </button>
                </div>
              </div>

              {!selectedReservation ? (
                <p className="empty-state">
                  Select a request from the left to review it.
                </p>
              ) : null}

              {selectedReservation ? (
                <>
                  <div className="detail-grid">
                    <DetailRow
                      label="Pack"
                      value={
                        selectedReservation.pack_name ||
                        selectedReservation.pack_uuid
                      }
                    />
                    <DetailRow
                      label="Spot"
                      value={
                        selectedReservation.spot_number
                          ? `Spot ${selectedReservation.spot_number}`
                          : selectedReservation.spot_uuid
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={selectedReservation.status}
                    />
                    <DetailRow
                      label="Term"
                      value={selectedReservation.term_name || "Not set"}
                    />
                    <DetailRow
                      label="Start"
                      value={formatUnixTimestamp(
                        selectedReservation.start_time,
                      )}
                    />
                    <DetailRow
                      label="End"
                      value={formatUnixTimestamp(selectedReservation.end_time)}
                    />
                    <DetailRow
                      label="Student UUID"
                      value={selectedReservation.user_uuid}
                    />
                    <DetailRow
                      label="Membership UUID"
                      value={selectedReservation.membership_uuid || "Not set"}
                    />
                  </div>

                  <div className="student-panel">
                    <div className="student-panel-header">
                      <div>
                        <p className="eyebrow">Student</p>
                        <h3>Registered information</h3>
                      </div>
                      {studentBusy ? (
                        <span className="muted-text">Loading…</span>
                      ) : null}
                    </div>

                    {studentError ? (
                      <p className="error-text">{studentError}</p>
                    ) : null}

                    {studentProfile ? (
                      <>
                        <div className="detail-grid">
                          <DetailRow
                            label="Name"
                            value={`${studentProfile.user.first_name} ${studentProfile.user.last_name}`.trim()}
                          />
                          <DetailRow
                            label="Username"
                            value={studentProfile.user.username}
                          />
                          <DetailRow
                            label="Email"
                            value={studentProfile.user.email}
                          />
                          <DetailRow
                            label="Phone"
                            value={studentProfile.user.phone || "Not set"}
                          />
                        </div>

                        <div className="data-section">
                          <div className="data-section-header">
                            <h4>School memberships</h4>
                            <span>{relevantMemberships.length}</span>
                          </div>
                          {relevantMemberships.length === 0 ? (
                            <p className="muted-text">
                              No memberships found for this school.
                            </p>
                          ) : (
                            <div className="stack-list">
                              {relevantMemberships.map((membership) => (
                                <div
                                  className="data-card"
                                  key={membership.membership_uuid}
                                >
                                  <strong>
                                    {membership.student_id ||
                                      membership.membership_uuid}
                                  </strong>
                                  <span>
                                    {membership.school_id} ·{" "}
                                    {membership.campus_id} · {membership.status}
                                  </span>
                                  <span>
                                    {membership.terms.length > 0
                                      ? membership.terms
                                          .map(
                                            (term) =>
                                              `${term.name} (${formatDateOnly(term.start_date)} - ${formatDateOnly(term.end_date)})`,
                                          )
                                          .join(", ")
                                      : "No membership term records"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="data-section">
                          <div className="data-section-header">
                            <h4>Registered devices</h4>
                            <span>{studentProfile.devices.length}</span>
                          </div>
                          {studentProfile.devices.length === 0 ? (
                            <p className="muted-text">
                              No registered devices found.
                            </p>
                          ) : (
                            <div className="stack-list">
                              {studentProfile.devices.map((device) => (
                                <div
                                  className="data-card"
                                  key={device.registered_device_uuid}
                                >
                                  <strong>
                                    {device.nickname || device.device_type}
                                  </strong>
                                  <span>
                                    {device.make || "Unknown make"} ·{" "}
                                    {device.model || "Unknown model"}
                                  </span>
                                  <span>
                                    Serial: {device.serial_number || "Not set"}{" "}
                                    · Color: {device.color || "Not set"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
