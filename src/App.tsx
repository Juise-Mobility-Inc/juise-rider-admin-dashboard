import {
        type ChangeEvent,
        type CSSProperties,
        type FormEvent,
        useEffect,
        useDeferredValue,
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
        fetchSchoolParkingViolations,
        fetchSchoolRegisteredDevices,
        fetchSchool,
        fetchSchoolChallengeParticipants,
        fetchSchoolChallenges,
        fetchSchoolPOIs,
        fetchSchoolZones,
        fetchStudentProfile,
        fetchUserMediaAssets,
        generateAdminPackQrCode,
        generateAdminPackSpotQrCode,
        getSessionRefreshExpiryMs,
        getAdminPackQrCodeDownloadUrl,
        getAdminPackSpotQrCodeDownloadUrl,
        loginWithIdentifier,
        refreshDashboardSession,
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
import { ChallengesScreen } from "./screens/dashboard/ChallengesScreen";
import { DashboardScreen } from "./screens/dashboard/DashboardScreen";
import { NotificationsScreen } from "./screens/dashboard/NotificationsScreen";
import { PacksScreen } from "./screens/dashboard/PacksScreen";
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
        | "school"
        | "terms"
        | "pois"
        | "zones"
        | "challenges"
        | "challengeGames"
        | "students"
        | "notifications"
        | "vehicleRegistrations"
        | "campusDevices"
        | "registrationFees"
        | "penaltyReports"
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
        { section: "school", label: "School Profile", path: "/school" },
        { section: "terms", label: "School Terms", path: "/terms" },
        { section: "pois", label: "School POIs", path: "/pois" },
        { section: "zones", label: "School Zones", path: "/zones" },
        { section: "challenges", label: "Ride Challenges", path: "/challenges" },
        { section: "challengeGames", label: "Challenge Games", path: "/challenge-games" },
        { section: "students", label: "Students", path: "/students" },
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
                punishment_policy: zone.punishment_policy ?? createDefaultZonePunishmentPolicy(),
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
        return challengeType === "scavenger_hunt"
                ? "scavenger_hunt"
                : "route_metric";
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

function createEmptyChallengeCheckpointDraft(sortOrder = 1): ChallengeCheckpointDraft {
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
        const prizePoints = Number.parseInt(checkpoint.prize_points.trim() || "0", 10);
        const sortOrder = Number.parseInt(checkpoint.sort_order.trim() || String(index + 1), 10);

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
        const now = new Date();
        const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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
                start_time: formatDateTimeLocalValue(Math.floor(now.getTime() / 1000)),
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
                                ? String(checkpoints.filter((checkpoint) => checkpoint.active).length || challenge.target_value)
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
                                                onClick={() => void props.onCopy(props.label, normalizedValue)}>
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
                                        }}>
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
                                        }}>
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
        const [openNavGroups, setOpenNavGroups] = useState({
                campusSetup: true,
                juisePacks: true,
                campusInfo: true,
                parkingEnforcement: true,
                vehicleRegistrations: true,
                penaltyReports: true,
                vehicles: true,
        });
        const [initialSession] = useState<AdminSession | null>(() =>
                readDashboardSession(),
        );
        const [session, setSession] = useState<AdminSession | null>(null);
        const [authInitializing, setAuthInitializing] = useState(
                () => initialSession !== null,
        );
        const [context] = useState<DashboardContext>(() =>
                readDashboardContext(defaultManagedAppId),
        );
        const [banner, setBanner] = useState<BannerState | null>(null);
        const [authMode, setAuthMode] = useState<AuthMode>("login");

        const [identifier, setIdentifier] = useState("");
        const [password, setPassword] = useState("");
        const [authBusy, setAuthBusy] = useState(false);
        const [authError, setAuthError] = useState("");
        const [isSignupSchoolModalOpen, setIsSignupSchoolModalOpen] = useState(false);
        const [signupSchoolName, setSignupSchoolName] = useState("");
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
        const [schoolLogoUploadBusy, setSchoolLogoUploadBusy] = useState(false);
        const [schoolDraft, setSchoolDraft] = useState<SchoolDraft>(() =>
                createEmptySchoolDraft(),
        );
        const [resolvedSchoolLogoUrl, setResolvedSchoolLogoUrl] = useState("");
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
        const scopedSchoolId = session?.claims.school_id?.trim() ?? "";
        const activeSchoolId = scopedSchoolId;
        const currentSection =
                resolveSectionFromPathname(location.pathname) ?? "dashboard";
        const isChallengeGamesSection = currentSection === "challengeGames";
        const deferredStudentRosterSearch = useDeferredValue(studentRosterSearch);
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
        }, [session]);

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
        }, [activeSchoolId, context.managedAppId, session, studentsDispatch]);

        useEffect(() => {
                setDashboardHeaderCounts({
                        studentCount: null,
                        pendingReservationCount: null,
                });
                setPendingVehicleCount(null);
                setOpenEnforcementCount(null);
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
        }, [session, activeSchoolId, context.managedAppId]);

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
        }, [session, activeSchoolId, context.managedAppId]);

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
        }, [session]);

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
        }, [activeSchoolId, context.managedAppId, session, studentsDispatch]);

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
                        return;
                }

                if (selectedChallengeId === newChallengeSelectionId) {
                        if (
                                isChallengeGamesSection &&
                                challengeDraft.challenge_type !== "scavenger_hunt"
                        ) {
                                setChallengeDraft(createEmptyScavengerHuntDraft());
                        }
                        if (
                                !isChallengeGamesSection &&
                                challengeDraft.challenge_type !== "route_metric"
                        ) {
                                setChallengeDraft(createEmptyChallengeDraft());
                        }
                        setChallengeParticipants([]);
                        return;
                }

                if (visibleSchoolChallenges.length === 0) {
                        setSelectedChallengeId("");
                        setChallengeDraft(createEmptyChallengeDraft());
                        setChallengeParticipants([]);
                        return;
                }

                if (!selectedChallenge) {
                        setSelectedChallengeId(
                                visibleSchoolChallenges[0]?.challenge_uuid ?? "",
                        );
                        return;
                }

                setChallengeDraft(challengeToDraft(selectedChallenge));
        }, [
                currentSection,
                challengeDraft.challenge_type,
                isChallengeGamesSection,
                selectedChallenge,
                selectedChallengeId,
                visibleSchoolChallenges,
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
        }, [activeSchoolId, context.managedAppId, session]);

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
                                        return hasCurrentSelection
                                                ? current
                                                : (nextReservations[0]?.reservation_uuid ?? "");
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
        }, [activeSchoolId, context.managedAppId, session]);

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
        }, [activeSchoolId, context.managedAppId, currentSection, session]);

        useEffect(() => {
                if (
                        !session ||
                        !isChallengeManagementSection(currentSection) ||
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
        }, [activeSchoolId, context.managedAppId, selectedReservation, session]);

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

        function handleOpenStudentFromPenaltyReport(membershipId: string) {
                const normalizedMembershipId = membershipId.trim();
                if (!normalizedMembershipId) {
                        return;
                }

                navigate(sectionPathByName.students);
                void handleSelectStudentInRoster(normalizedMembershipId);
        }

        async function handleOpenStudentDeviceFromPenaltyReport(
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
                        setSignupSchoolName("");
                        setIsSignupSchoolModalOpen(false);
                        setBanner({
                                tone: "success",
                                message: `Created school admin account for ${signupForm.school_id} as ${formatAdminIdentity(nextSession)}.`,
                        });
                } catch (error) {
                        const message = getErrorMessage(error);
                        if (message.toLowerCase().includes("school_name")) {
                                setSignupSchoolName(
                                        (current) => current || signupForm.school_id.trim(),
                                );
                                setIsSignupSchoolModalOpen(true);
                                setAuthError("");
                        } else {
                                setAuthError(message);
                        }
                } finally {
                        setAuthBusy(false);
                }
        }

        async function handleCreateSignupSchool(event: FormEvent<HTMLFormElement>) {
                event.preventDefault();
                setAuthBusy(true);
                setAuthError("");

                try {
                        const nextSession = await createSchoolAdminAccount(authAppId, {
                                ...signupForm,
                                school_name: signupSchoolName,
                        });
                        setSession(nextSession);
                        setSignupForm((current) => ({
                                ...current,
                                password: "",
                        }));
                        setSignupSchoolName("");
                        setIsSignupSchoolModalOpen(false);
                        setBanner({
                                tone: "success",
                                message: `Created ${signupSchoolName.trim()} and school admin account for ${signupForm.school_id} as ${formatAdminIdentity(nextSession)}.`,
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
                setSignupSchoolName("");
                setIsSignupSchoolModalOpen(false);
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
                const isScavengerHunt =
                        challengeDraft.challenge_type === "scavenger_hunt";

                try {
                        if (isScavengerHunt) {
                                checkpointInputs = challengeDraft.checkpoints.map(
                                        checkpointDraftToWriteInput,
                                );
                                const activeCheckpointCount = checkpointInputs.filter(
                                        (checkpoint) => checkpoint.active !== false,
                                ).length;
                                if (activeCheckpointCount <= 0) {
                                        throw new Error(
                                                "Scavenger hunts need at least one active stop.",
                                        );
                                }
                                targetValue = activeCheckpointCount;
                                minAccuracyMeters = Number(
                                        challengeDraft.min_accuracy_meters.trim() || "50",
                                );
                                if (
                                        !Number.isFinite(minAccuracyMeters) ||
                                        minAccuracyMeters <= 0
                                ) {
                                        throw new Error("Minimum GPS accuracy must be greater than 0.");
                                }
                                requiredDwellSeconds = Number(
                                        challengeDraft.required_dwell_seconds.trim() || "30",
                                );
                                if (
                                        !Number.isFinite(requiredDwellSeconds) ||
                                        requiredDwellSeconds <= 0
                                ) {
                                        throw new Error("Required visit time must be greater than 0 seconds.");
                                }
                                grandPrizePoints = Number(
                                        challengeDraft.grand_prize_points.trim() || "0",
                                );
                                if (
                                        !Number.isFinite(grandPrizePoints) ||
                                        grandPrizePoints < 0
                                ) {
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

                setChallengeBusy(true);
                try {
                        const payload: SchoolChallengeWriteInput = {
                                challenge_type: challengeDraft.challenge_type,
                                audience_type: isScavengerHunt
                                        ? "user"
                                        : challengeDraft.audience_type,
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
                        };

                        const savedChallenges = challengeDraft.challenge_uuid
                                ? [
                                                await updateSchoolChallenge(
                                                        context.managedAppId,
                                                        activeSchoolId,
                                                        challengeDraft.challenge_uuid,
                                                        payload,
                                                ),
                                        ]
                                : getCreatedChallenges(
                                                await createSchoolChallenge(
                                                        context.managedAppId,
                                                        activeSchoolId,
                                                        !isScavengerHunt &&
                                                                challengeDraft.repeat_enabled &&
                                                                repeatCount > 1
                                                                ? {
                                                                                ...payload,
                                                                                repeat: {
                                                                                        interval_value: repeatIntervalValue,
                                                                                        interval_unit: challengeDraft.repeat_interval_unit,
                                                                                        count: repeatCount,
                                                                                },
                                                                        }
                                                                : payload,
                                                ),
                                        );
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
                        setSelectedChallengeId(savedChallenge.challenge_uuid);
                        setChallengeDraft(challengeToDraft(savedChallenge));
                        await refreshChallengeParticipants(savedChallenge.challenge_uuid);
                        const savedKind = isScavengerHunt ? "game" : "challenge";
                        setBanner({
                                tone: "success",
                                message:
                                        savedChallenges.length > 1
                                                ? `Created ${savedChallenges.length} repeated challenges from ${savedChallenge.title}.`
                                                : `${challengeDraft.challenge_uuid ? "Updated" : "Created"} ${savedKind} ${savedChallenge.title}.`,
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
                                        <div className="login-center-card">
                                                <img
                                                        src="/Juise_Icon_Bolt.png"
                                                        className="login-brand-icon"
                                                        alt="Juise"
                                                />
                                                <p className="login-brand-title">Juise Rider Admin Dashboard</p>

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
                                                                        setIsSignupSchoolModalOpen(false);
                                                                }}>
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
                                                                        setIsSignupSchoolModalOpen(false);
                                                                }}>
                                                                Sign In
                                                        </button>
                                                </div>

                                                {authMode === "signup" ? (
                                                        <form className="login-form" onSubmit={handleCreateSchoolAdmin}>
                                                                <div className="login-form-header">
                                                                        <p className="eyebrow">School Admin Signup</p>
                                                                        <h2>Create your dashboard account</h2>
                                                                </div>
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
                                                                        disabled={authBusy}>
                                                                        {authBusy ? "Creating account…" : "Create School Admin"}
                                                                </button>
                                                        </form>
                                                ) : (
                                                        <form className="login-form" onSubmit={handleLogin}>
                                                                <div className="login-form-header">
                                                                        <p className="eyebrow">Admin Login</p>
                                                                        <h2>Welcome back</h2>
                                                                </div>
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
                                                                        disabled={authBusy}>
                                                                        {authBusy ? "Signing in…" : "Enter Dashboard"}
                                                                </button>
                                                        </form>
                                                )}
                                        </div>
                                </div>
                                {isSignupSchoolModalOpen ? (
                                        <div
                                                className="management-modal-backdrop"
                                                role="dialog"
                                                aria-modal="true"
                                                aria-label="Create school"
                                                onClick={() => setIsSignupSchoolModalOpen(false)}>
                                                <form
                                                        className="management-modal-sheet signup-school-modal"
                                                        onClick={(event) => event.stopPropagation()}
                                                        onSubmit={handleCreateSignupSchool}>
                                                        <div className="management-modal-header">
                                                                <div>
                                                                        <p className="eyebrow">New school</p>
                                                                        <h3>Create school profile</h3>
                                                                </div>
                                                                <button
                                                                        className="text-button management-modal-close"
                                                                        type="button"
                                                                        onClick={() => setIsSignupSchoolModalOpen(false)}>
                                                                        Close
                                                                </button>
                                                        </div>
                                                        <div className="form-grid">
                                                                <label className="field">
                                                                        <span>School ID</span>
                                                                        <input value={signupForm.school_id.trim()} disabled />
                                                                </label>
                                                                <label className="field">
                                                                        <span>School name</span>
                                                                        <input
                                                                                value={signupSchoolName}
                                                                                onChange={(event) =>
                                                                                        setSignupSchoolName(event.target.value)
                                                                                }
                                                                                placeholder="Oakland University"
                                                                                required
                                                                        />
                                                                </label>
                                                        </div>
                                                        {authError ? <p className="error-text">{authError}</p> : null}
                                                        <div className="form-actions">
                                                                <button
                                                                        className="secondary-button"
                                                                        type="button"
                                                                        onClick={() => setIsSignupSchoolModalOpen(false)}
                                                                        disabled={authBusy}>
                                                                        Cancel
                                                                </button>
                                                                <button
                                                                        className="primary-button"
                                                                        type="submit"
                                                                        disabled={authBusy || !signupSchoolName.trim()}>
                                                                        {authBusy ? "Creating..." : "Create School and Account"}
                                                                </button>
                                                        </div>
                                                </form>
                                        </div>
                                ) : null}
                        </>
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
                                                        const r = await uploadSchoolChallengeImage(context.managedAppId, activeSchoolId, file);
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
                                                        const r = await uploadSchoolChallengeImage(context.managedAppId, activeSchoolId, file);
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
                                                onOpenStudent={handleOpenStudentFromPenaltyReport}
                                                onOpenStudentDevice={handleOpenStudentDeviceFromPenaltyReport}
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
                                        />
                                );
                        case "sightingsMap":
                                return import.meta.env.DEV ? <SightingsMapScreen /> : null;
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

        return (
                <div className="app-shell" style={appThemeStyle}>
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
                                        {session.user && <p>@{session.user.username}</p>}
                                </div>

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
                                        {/* Top-level flat links */}
                                        <NavLink
                                                to="/dashboard"
                                                className={({ isActive }) =>
                                                        isActive ? "nav-button nav-button-active" : "nav-button"
                                                }>
                                                Dashboard
                                        </NavLink>
                                        <NavLink
                                                to="/map-overview"
                                                className={({ isActive }) =>
                                                        isActive ? "nav-button nav-button-active" : "nav-button"
                                                }>
                                                Map Overview
                                        </NavLink>
                                        {import.meta.env.DEV && (
                                                <NavLink
                                                        to="/sightings-map"
                                                        className={({ isActive }) =>
                                                                isActive ? "nav-button nav-button-active" : "nav-button"
                                                        }>
                                                        Sightings Map
                                                </NavLink>
                                        )}
                                        <NavLink
                                                to="/reports"
                                                className={({ isActive }) =>
                                                        isActive ? "nav-button nav-button-active" : "nav-button"
                                                }>
                                                Report Builder
                                        </NavLink>

                                        {/* Campus Setup group */}
                                        <div className="nav-group">
                                                <button
                                                        className="nav-group-header"
                                                        type="button"
                                                        onClick={() =>
                                                                setOpenNavGroups((p) => ({ ...p, campusSetup: !p.campusSetup }))
                                                        }>
                                                        <span>Campus Setup</span>
                                                        <span
                                                                className={`nav-group-chevron${openNavGroups.campusSetup ? " nav-group-chevron-open" : ""}`}>
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
                                                                        }>
                                                                        Profile
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/zones"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
                                                                        Penalty Zones
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/pois"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
                                                                        POI Setup
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/challenges"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
                                                                        Ride Challenges
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/challenge-games"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
                                                                        Challenge Games
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/notifications"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
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
                                                        }>
                                                        <span className="nav-group-header-label">
                                                                Juise Packs
                                                                {!openNavGroups.juisePacks && reservations.length > 0 && (
                                                                        <span className="nav-badge">{reservations.length}</span>
                                                                )}
                                                        </span>
                                                        <span
                                                                className={`nav-group-chevron${openNavGroups.juisePacks ? " nav-group-chevron-open" : ""}`}>
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
                                                                        }>
                                                                        Manage Juise Packs
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/reservations"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
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
                                                        }>
                                                        <span>Campus Information</span>
                                                        <span
                                                                className={`nav-group-chevron${openNavGroups.campusInfo ? " nav-group-chevron-open" : ""}`}>
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
                                                                        }>
                                                                        Student Information
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
                                                        }>
                                                        <span className="nav-group-header-label">
                                                                Vehicles
                                                                {!openNavGroups.vehicles && pendingVehicleCount !== null && pendingVehicleCount > 0 && (
                                                                        <span className="nav-badge">{pendingVehicleCount}</span>
                                                                )}
                                                        </span>
                                                        <span
                                                                className={`nav-group-chevron${openNavGroups.vehicles ? " nav-group-chevron-open" : ""}`}>
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
                                                                        }>
                                                                        Campus Devices
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/vehicle-registrations"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
                                                                        Vehicle Registrations
                                                                        {pendingVehicleCount !== null && pendingVehicleCount > 0 && (
                                                                                <span className="nav-badge">{pendingVehicleCount}</span>
                                                                        )}
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/registration-fees"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
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
                                                        }>
                                                        <span className="nav-group-header-label">
                                                                Compliance Enforcement
                                                                {!openNavGroups.parkingEnforcement && openEnforcementCount !== null && openEnforcementCount > 0 && (
                                                                        <span className="nav-badge">{openEnforcementCount}</span>
                                                                )}
                                                        </span>
                                                        <span
                                                                className={`nav-group-chevron${openNavGroups.parkingEnforcement ? " nav-group-chevron-open" : ""}`}>
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
                                                                        }>
                                                                        Parking Enforcement Reports
                                                                        {openEnforcementCount !== null && openEnforcementCount > 0 && (
                                                                                <span className="nav-badge">{openEnforcementCount}</span>
                                                                        )}
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/student-ride-violations"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
                                                                        Ride Information
                                                                </NavLink>
                                                                <NavLink
                                                                        to="/violation-fees"
                                                                        className={({ isActive }) =>
                                                                                isActive
                                                                                        ? "nav-sub-item nav-sub-item-active"
                                                                                        : "nav-sub-item"
                                                                        }>
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
                                                onClick={handleLogout}>
                                                Sign Out
                                        </button>
                                </div>
                        </aside>

                        <main className="workspace">
                                <header className="workspace-header">
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
                                </header>

                                {banner ? (
                                        <div className={`banner banner-${banner.tone}`}>
                                                <span>{banner.message}</span>
                                                <button
                                                        className="text-button"
                                                        type="button"
                                                        onClick={() => setBanner(null)}>
                                                        Dismiss
                                                </button>
                                        </div>
                                ) : null}

                                {sectionContent}
                        </main>
                        {imagePreview ? (
                                <div
                                        className="image-lightbox"
                                        role="dialog"
                                        aria-modal="true"
                                        aria-label={imagePreview.label || imagePreview.alt}
                                        onClick={() => setImagePreview(null)}>
                                        <div
                                                className="image-lightbox-sheet"
                                                onClick={(event) => event.stopPropagation()}>
                                                <button
                                                        className="image-lightbox-close"
                                                        type="button"
                                                        onClick={() => setImagePreview(null)}>
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
