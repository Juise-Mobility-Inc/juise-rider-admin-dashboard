import {
	useState,
	type ComponentType,
	type Dispatch,
	type SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import { StudentEventMiniMap } from "../../components/StudentEventMiniMap";
import {
	csvObjectRow,
	downloadCsv,
	sanitizeCsvFilename,
	type CsvCell,
} from "../../lib/csv";

import {
	fetchAdminSchoolPacks,
	fetchSchoolZones,
	fetchStudentParkingViolations,
	fetchStudentProfile,
	fetchStudentPublicProfile,
	fetchStudentRouteHistory,
	type Pack,
	type PackSpotReservation,
	type SchoolZone,
	type SchoolStudentRosterEntry,
	type StudentParkingViolation,
	type StudentProfileBundle,
	type StudentPublicProfile,
	type StudentRouteHistorySession,
	type UserMediaAsset,
	type UserSchoolMembership,
} from "../../lib/api";

type StudentIdPhotoSlot = "front" | "back";
type StudentIdPhotoKeys = Partial<Record<StudentIdPhotoSlot, string>>;
type StudentRosterPhotoKeyMap = Record<string, StudentIdPhotoKeys>;
type StudentViolationMediaAssetMap = Record<string, UserMediaAsset[]>;
type StudentExportProgress = {
	completed: number;
	total: number;
};

type DetailRowComponent = ComponentType<{
	label: string;
	value: string;
}>;

type UuidCopyFieldProps = {
	label: string;
	value?: string;
	onCopy: (label: string, value: string) => void | Promise<void>;
};

type UuidCopyFieldComponent = ComponentType<UuidCopyFieldProps>;

type Props = {
	activeSchoolId: string;
	managedAppId: string;
	adminUserUUID: string;
	schoolStudentRosterBusy: boolean;
	schoolStudentRosterError: string;
	studentRosterSearch: string;
	setStudentRosterSearch: Dispatch<SetStateAction<string>>;
	allStudentRoster: SchoolStudentRosterEntry[];
	filteredStudentRoster: SchoolStudentRosterEntry[];
	selectedStudentMembershipId: string | null;
	selectedStudentEntry: SchoolStudentRosterEntry | null;
	schoolStudentPhotoKeys: StudentRosterPhotoKeyMap;
	schoolStudentMediaUrls: Record<string, string>;
	schoolStudentProfilePhotoUrls: Record<string, string>;
	studentDevicePhotoUrls: Record<string, string>;
	schoolReservationsByMembership: Map<string, PackSpotReservation[]>;
	studentBusy: boolean;
	studentError: string;
	studentProfile: StudentProfileBundle | null;
	studentPublicProfile: StudentPublicProfile | null;
	studentPublicProfileError: string;
	studentViolations: StudentParkingViolation[];
	studentRouteHistory: StudentRouteHistorySession[];
	studentSchoolZones: SchoolZone[];
	studentReservationPacks: Pack[];
	studentRouteHistoryError: string;
	studentViolationMediaByViolation: StudentViolationMediaAssetMap;
	studentViolationSignedMediaUrls: Record<string, string>;
	studentViolationError: string;
	handleSelectStudentInRoster: (membershipUUID: string) => Promise<void>;
	refreshStudentRoster: () => Promise<void>;
	resetSelectedStudentState: () => void;
	handleOpenStudentDevice: (deviceUUID: string) => void;
	formatNebulaUserName: (profile: {
		first_name?: string;
		last_name?: string;
		username?: string;
		email?: string;
	}) => string;
	resolveStudentPhotoObjectKey: (
		membership: UserSchoolMembership,
		photoKeysByMembership: StudentRosterPhotoKeyMap,
		slot: StudentIdPhotoSlot,
	) => string;
	formatDateOnly: (value: string) => string;
	formatUnixTimestamp: (value?: number) => string;
	handleCopyUuid: (label: string, value: string) => void | Promise<void>;
	handleImagePreview: (imageUrl: string, alt: string, label?: string) => void;
	DetailRow: DetailRowComponent;
	UuidCopyField: UuidCopyFieldComponent;
};

const studentExportColumns = [
	"row_type",
	"full_name",
	"username",
	"email",
	"phone",
	"student_id",
	"campus_id",
	"user_uuid",
	"membership_uuid",
	"membership_status",
	"membership_active",
	"public_total_points",
	"profile_error",
	"public_profile_error",
	"route_history_error",
	"violation_error",
	"summary_total_route_sessions",
	"summary_total_route_points",
	"summary_total_poi_visits",
	"summary_total_penalty_events",
	"summary_total_violations",
	"summary_total_reservations",
	"summary_total_devices",
	"summary_total_membership_terms",
	"summary_total_bonus_points",
	"summary_total_penalty_points",
	"summary_total_distance_miles",
	"summary_total_duration_minutes",
	"term_uuid",
	"term_name",
	"term_start_date",
	"term_end_date",
	"term_active",
	"device_uuid",
	"device_nickname",
	"device_type",
	"device_make",
	"device_model",
	"device_color",
	"device_serial_number",
	"device_active",
	"session_id",
	"session_trip_mode",
	"session_tracking_source",
	"session_started_at",
	"session_ended_at",
	"session_distance_miles",
	"session_duration_minutes",
	"session_top_speed_mph",
	"session_average_speed_mph",
	"session_bonus_points",
	"session_penalty_points",
	"session_total_point_delta",
	"session_point_count",
	"poi_uuid",
	"poi_title",
	"poi_description",
	"poi_bonus_points",
	"poi_visited_at",
	"poi_latitude",
	"poi_longitude",
	"penalty_zone_uuid",
	"penalty_title",
	"penalty_description",
	"penalty_reason",
	"penalty_zone_type",
	"penalty_speed_limit_mph",
	"penalty_estimated_speed_mph",
	"penalty_points_lost",
	"penalty_duration_minutes",
	"penalty_occurred_at",
	"route_point_id",
	"route_point_recorded_at",
	"route_point_latitude",
	"route_point_longitude",
	"route_point_speed_mph",
	"route_point_altitude",
	"route_point_accuracy",
	"route_point_heading",
	"reservation_uuid",
	"reservation_status",
	"reservation_kind",
	"reservation_term_name",
	"reservation_start_time",
	"reservation_end_time",
	"reservation_approved_at",
	"reservation_pack_uuid",
	"reservation_pack_name",
	"reservation_spot_uuid",
	"reservation_spot_number",
	"reservation_pack_location_latitude",
	"reservation_pack_location_longitude",
	"violation_uuid",
	"violation_status",
	"violation_description",
	"violation_created_at",
	"violation_device_uuid",
	"violation_media_count",
] as const;

type StudentExportColumn = (typeof studentExportColumns)[number];
type StudentExportRow = Partial<Record<StudentExportColumn, CsvCell>>;

function formatViolationSlotLabel(slot: string, index: number) {
	const normalized = slot.trim();
	if (!normalized) {
		return `Photo ${index + 1}`;
	}

	return normalized
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPenaltyZoneType(zoneType: string) {
	switch (zoneType.trim()) {
		case "no_go":
			return "No-go zone";
		case "speed_limit":
			return "Speed zone";
		default:
			return zoneType.trim() || "Penalty zone";
	}
}

function formatSpeedMph(value: number) {
	return `${value.toFixed(1)} mph`;
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
	event: StudentRouteHistorySession["penalty_events"][number],
): number | null {
	if (
		typeof event.max_speed_mps === "number" &&
		Number.isFinite(event.max_speed_mps)
	) {
		return event.max_speed_mps * 2.2369362920544;
	}

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
			Math.abs(best.latitude - event.lat) +
			Math.abs(best.longitude - event.lng);
		const pointCoordDiff =
			Math.abs(point.latitude - event.lat) +
			Math.abs(point.longitude - event.lng);
		return pointCoordDiff < bestCoordDiff ? point : best;
	});

	return typeof bestPoint.speed_mps === "number"
		? bestPoint.speed_mps * 2.2369362920544
		: null;
}

function formatConfidencePercent(value?: number | null): string {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return "Unavailable";
	}

	return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function routeTimestampWindow(referenceTimestamp: number): number {
	return referenceTimestamp > 100_000_000_000 ? 120_000 : 120;
}

function routeDurationSeconds(
	startTimestamp: number,
	endTimestamp: number,
): number {
	const duration = Math.max(0, endTimestamp - startTimestamp);
	return Math.max(startTimestamp, endTimestamp) > 100_000_000_000
		? duration / 1000
		: duration;
}

function formatRideContextDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "0s";
	}

	const roundedSeconds = Math.round(seconds);
	const minutes = Math.floor(roundedSeconds / 60);
	const remainingSeconds = roundedSeconds % 60;
	if (minutes > 0 && remainingSeconds > 0) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	if (minutes > 0) {
		return `${minutes}m`;
	}
	return `${remainingSeconds}s`;
}

function formatRideContextDistance(meters: number): string {
	if (!Number.isFinite(meters) || meters <= 0) {
		return "0 ft";
	}
	if (meters < 305) {
		return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
	}
	return `${(meters / 1609.344).toFixed(1)} mi`;
}

function routePointDistanceMeters(
	left: StudentRouteHistorySession["points"][number],
	right: StudentRouteHistorySession["points"][number],
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
	event: StudentRouteHistorySession["penalty_events"][number],
) {
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
			points: [] as { lat: number; lng: number }[],
			pointCount: 0,
			distanceMeters: 0,
			durationSeconds: 0,
			nearestPoint: null as StudentRouteHistorySession["points"][number] | null,
		};
	}

	const nearestPointIndex = points.reduce((bestIndex, point, index) => {
		const bestPoint = points[bestIndex];
		const bestTimeDiff = Math.abs(bestPoint.timestamp - event.occurred_at);
		const pointTimeDiff = Math.abs(point.timestamp - event.occurred_at);
		if (pointTimeDiff !== bestTimeDiff) {
			return pointTimeDiff < bestTimeDiff ? index : bestIndex;
		}

		const bestCoordDiff =
			Math.abs(bestPoint.latitude - event.lat) +
			Math.abs(bestPoint.longitude - event.lng);
		const pointCoordDiff =
			Math.abs(point.latitude - event.lat) +
			Math.abs(point.longitude - event.lng);
		return pointCoordDiff < bestCoordDiff ? index : bestIndex;
	}, 0);
	const window = routeTimestampWindow(event.occurred_at);
	let contextPoints = points.filter(
		(point) => Math.abs(point.timestamp - event.occurred_at) <= window,
	);
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
		points: contextPoints.map((point) => ({
			lat: point.latitude,
			lng: point.longitude,
		})),
		pointCount: contextPoints.length,
		distanceMeters,
		durationSeconds:
			firstPoint && lastPoint
				? routeDurationSeconds(firstPoint.timestamp, lastPoint.timestamp)
				: 0,
		nearestPoint: points[nearestPointIndex] ?? null,
	};
}

type DetailTab = "profile" | "activity" | "records";

type StudentExportParams = {
	entry: SchoolStudentRosterEntry;
	profile: StudentProfileBundle | null;
	publicProfile: StudentPublicProfile | null;
	routeHistory: StudentRouteHistorySession[];
	schoolZones: SchoolZone[];
	reservations: PackSpotReservation[];
	reservationPacks: Pack[];
	violations: StudentParkingViolation[];
	violationMediaByViolation: StudentViolationMediaAssetMap | null;
	studentError: string;
	studentPublicProfileError: string;
	studentRouteHistoryError: string;
	studentViolationError: string;
	formatNebulaUserName: Props["formatNebulaUserName"];
	formatDateOnly: Props["formatDateOnly"];
	formatUnixTimestamp: Props["formatUnixTimestamp"];
};

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

function resolveStudentUserUUID(entry: SchoolStudentRosterEntry): string {
	return (entry.membership.user_uuid || "").trim() || entry.user.k_guid;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "An unexpected error occurred.";
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

function downloadRosterCSV(
	roster: SchoolStudentRosterEntry[],
	formatDateOnly: (v: string) => string,
) {
	const header = [
		"Full Name",
		"Username",
		"Email",
		"Phone",
		"Student ID",
		"Campus",
		"Membership UUID",
		"Status",
		"Active",
		"Terms",
	] satisfies CsvCell[];
	const rows = roster.map(
		(entry) =>
			[
				`${entry.user.first_name} ${entry.user.last_name}`.trim(),
				entry.user.username,
				entry.user.email,
				entry.user.phone ?? "",
				entry.membership.student_id,
				entry.membership.campus_id,
				entry.membership.membership_uuid,
				entry.membership.status,
				String(entry.membership.active),
				entry.membership.terms
					.map(
						(t) =>
							`${t.name} (${formatDateOnly(t.start_date)} - ${formatDateOnly(t.end_date)})`,
					)
					.join("; "),
			] satisfies CsvCell[],
	);
	downloadCsv("student-roster.csv", [header, ...rows]);
}

function buildStudentExportRows({
	entry,
	profile,
	publicProfile,
	routeHistory,
	schoolZones,
	reservations,
	reservationPacks,
	violations,
	violationMediaByViolation,
	studentError,
	studentPublicProfileError,
	studentRouteHistoryError,
	studentViolationError,
	formatNebulaUserName,
	formatDateOnly,
	formatUnixTimestamp,
}: StudentExportParams): { fullName: string; rows: StudentExportRow[] } {
	const fullName = formatNebulaUserName(entry.user) || "Unnamed student";
	const userUUID = resolveStudentUserUUID(entry);
	const totalRoutePoints = routeHistory.reduce(
		(sum, session) => sum + session.points.length,
		0,
	);
	const totalPoiVisits = routeHistory.reduce(
		(sum, session) => sum + session.visited_pois.length,
		0,
	);
	const totalPenaltyEvents = routeHistory.reduce(
		(sum, session) => sum + session.penalty_events.length,
		0,
	);
	const totalBonusPoints = routeHistory.reduce(
		(sum, session) => sum + session.bonus_points,
		0,
	);
	const totalPenaltyPoints = routeHistory.reduce(
		(sum, session) => sum + session.penalty_points,
		0,
	);
	const totalDistanceMeters = routeHistory.reduce(
		(sum, session) => sum + session.distance_meters,
		0,
	);
	const totalDurationSeconds = routeHistory.reduce(
		(sum, session) => sum + session.duration_seconds,
		0,
	);
	const reservationPackByUUID = new Map(
		reservationPacks.map((pack) => [pack.pack_uuid, pack]),
	);
	const baseRow: StudentExportRow = {
		full_name: fullName,
		username: entry.user.username,
		email: entry.user.email,
		phone: entry.user.phone ?? "",
		student_id: entry.membership.student_id,
		campus_id: entry.membership.campus_id,
		user_uuid: userUUID,
		membership_uuid: entry.membership.membership_uuid,
		membership_status: entry.membership.status,
		membership_active: entry.membership.active,
		public_total_points: publicProfile?.total_point_count ?? "",
		profile_error: studentError,
		public_profile_error: studentPublicProfileError,
		route_history_error: studentRouteHistoryError,
		violation_error: studentViolationError,
	};
	const rows: StudentExportRow[] = [
		{
			...baseRow,
			row_type: "student_summary",
			summary_total_route_sessions: routeHistory.length,
			summary_total_route_points: totalRoutePoints,
			summary_total_poi_visits: totalPoiVisits,
			summary_total_penalty_events: totalPenaltyEvents,
			summary_total_violations: violations.length,
			summary_total_reservations: reservations.length,
			summary_total_devices: profile?.devices.length ?? 0,
			summary_total_membership_terms: entry.membership.terms.length,
			summary_total_bonus_points: totalBonusPoints,
			summary_total_penalty_points: totalPenaltyPoints,
			summary_total_distance_miles: milesFromMeters(totalDistanceMeters),
			summary_total_duration_minutes: minutesFromSeconds(totalDurationSeconds),
		},
	];

	entry.membership.terms.forEach((term) => {
		rows.push({
			...baseRow,
			row_type: "membership_term",
			term_uuid: term.term_uuid,
			term_name: term.name,
			term_start_date: formatDateOnly(term.start_date),
			term_end_date: formatDateOnly(term.end_date),
			term_active: term.active,
		});
	});

	profile?.devices.forEach((device) => {
		rows.push({
			...baseRow,
			row_type: "registered_device",
			device_uuid: device.registered_device_uuid,
			device_nickname: device.nickname,
			device_type: device.device_type,
			device_make: device.make,
			device_model: device.model,
			device_color: device.color,
			device_serial_number: device.serial_number,
			device_active: device.active,
		});
	});

	routeHistory.forEach((session) => {
		rows.push({
			...baseRow,
			row_type: "route_session",
			session_id: session.session_id,
			session_trip_mode: session.trip_mode,
			session_tracking_source: session.tracking_source,
			session_started_at: formatUnixTimestamp(session.started_at),
			session_ended_at: session.ended_at
				? formatUnixTimestamp(session.ended_at)
				: "",
			session_distance_miles: milesFromMeters(session.distance_meters),
			session_duration_minutes: minutesFromSeconds(session.duration_seconds),
			session_top_speed_mph: mphFromMetersPerSecond(session.top_speed_mps),
			session_average_speed_mph: mphFromMetersPerSecond(
				session.average_speed_mps,
			),
			session_bonus_points: session.bonus_points,
			session_penalty_points: session.penalty_points,
			session_total_point_delta: session.bonus_points - session.penalty_points,
			session_point_count: session.points.length,
		});

		session.points.forEach((point) => {
			rows.push({
				...baseRow,
				row_type: "route_point",
				session_id: session.session_id,
				session_trip_mode: session.trip_mode,
				route_point_id: point.id,
				route_point_recorded_at: formatUnixTimestamp(point.timestamp),
				route_point_latitude: point.latitude,
				route_point_longitude: point.longitude,
				route_point_speed_mph: mphFromMetersPerSecond(point.speed_mps),
				route_point_altitude: point.altitude ?? "",
				route_point_accuracy: point.accuracy ?? "",
				route_point_heading: point.heading ?? "",
			});
		});

		session.visited_pois.forEach((poi) => {
			rows.push({
				...baseRow,
				row_type: "poi_visit",
				session_id: session.session_id,
				session_trip_mode: session.trip_mode,
				session_started_at: formatUnixTimestamp(session.started_at),
				poi_uuid: poi.poi_uuid,
				poi_title: poi.title,
				poi_description: poi.description,
				poi_bonus_points: poi.bonus_points,
				poi_visited_at: formatUnixTimestamp(poi.visited_at),
				poi_latitude: poi.lat,
				poi_longitude: poi.lng,
			});
		});

		session.penalty_events.forEach((event) => {
			const matchingZone = resolvePenaltyZone(
				session,
				schoolZones,
				event.zone_uuid,
			);
			const estimatedSpeedMph =
				event.zone_type === "speed_limit"
					? estimatePenaltySpeedMph(session, event)
					: null;

			rows.push({
				...baseRow,
				row_type: "penalty_event",
				session_id: session.session_id,
				session_trip_mode: session.trip_mode,
				session_started_at: formatUnixTimestamp(session.started_at),
				penalty_zone_uuid: event.zone_uuid,
				penalty_title:
					event.title ||
					matchingZone?.title ||
					formatPenaltyZoneType(event.zone_type),
				penalty_description: event.description,
				penalty_reason: event.reason,
				penalty_zone_type: formatPenaltyZoneType(event.zone_type),
				penalty_speed_limit_mph: event.speed_limit_mph ?? "",
				penalty_estimated_speed_mph:
					estimatedSpeedMph == null ? "" : roundCsvNumber(estimatedSpeedMph, 1),
				penalty_points_lost: event.points_lost,
				penalty_duration_minutes: minutesFromMilliseconds(event.duration_ms),
				penalty_occurred_at: formatUnixTimestamp(event.occurred_at),
			});
		});
	});

	reservations.forEach((reservation) => {
		const matchingPack =
			reservationPackByUUID.get(reservation.pack_uuid) ?? null;

		rows.push({
			...baseRow,
			row_type: "parking_reservation",
			reservation_uuid: reservation.reservation_uuid,
			reservation_status: reservation.status,
			reservation_kind: reservation.reservation_kind,
			reservation_term_name: reservation.term_name,
			reservation_start_time: formatUnixTimestamp(reservation.start_time),
			reservation_end_time: formatUnixTimestamp(reservation.end_time),
			reservation_approved_at: reservation.approved_at
				? formatUnixTimestamp(reservation.approved_at)
				: "",
			reservation_pack_uuid: reservation.pack_uuid,
			reservation_pack_name:
				reservation.pack_name || matchingPack?.name || "Juise Pack",
			reservation_spot_uuid: reservation.spot_uuid,
			reservation_spot_number: reservation.spot_number ?? "",
			reservation_pack_location_latitude: matchingPack?.location?.lat ?? "",
			reservation_pack_location_longitude: matchingPack?.location?.lng ?? "",
		});
	});

	violations.forEach((violation) => {
		rows.push({
			...baseRow,
			row_type: "parking_violation",
			violation_uuid: violation.violation_uuid,
			violation_status: violation.status,
			violation_description: violation.description,
			violation_created_at: formatUnixTimestamp(violation.created_at),
			violation_device_uuid: violation.registered_device_uuid ?? "",
			violation_media_count:
				violationMediaByViolation == null
					? ""
					: (violationMediaByViolation[violation.violation_uuid]?.length ?? 0),
		});
	});

	return { fullName, rows };
}

function downloadStudentCSV(params: StudentExportParams) {
	const { fullName, rows } = buildStudentExportRows(params);

	downloadCsv(
		sanitizeCsvFilename(
			`${fullName || params.entry.membership.student_id || "student"}-detail-export`,
			"student-detail-export",
		),
		[
			studentExportColumns,
			...rows.map((row) => csvObjectRow(studentExportColumns, row)),
		],
	);
}

export function StudentsScreen(props: Props) {
	const navigate = useNavigate();
	const {
		activeSchoolId,
		managedAppId,
		adminUserUUID,
		schoolStudentRosterBusy,
		schoolStudentRosterError,
		studentRosterSearch,
		setStudentRosterSearch,
		allStudentRoster = [],
		filteredStudentRoster,
		selectedStudentMembershipId,
		selectedStudentEntry,
		schoolStudentPhotoKeys,
		schoolStudentMediaUrls,
		schoolStudentProfilePhotoUrls,
		studentDevicePhotoUrls,
		schoolReservationsByMembership,
		studentBusy,
		studentError,
		studentProfile,
		studentPublicProfile,
		studentPublicProfileError,
		studentViolations,
		studentRouteHistory,
		studentSchoolZones,
		studentReservationPacks,
		studentRouteHistoryError,
		studentViolationMediaByViolation,
		studentViolationSignedMediaUrls,
		studentViolationError,
		handleSelectStudentInRoster,
		refreshStudentRoster,
		resetSelectedStudentState,
		handleOpenStudentDevice,
		formatNebulaUserName,
		resolveStudentPhotoObjectKey,
		formatDateOnly,
		formatUnixTimestamp,
		handleCopyUuid,
		handleImagePreview,
		DetailRow,
		UuidCopyField,
	} = props;

	const [detailTab, setDetailTab] = useState<DetailTab>("profile");
	const [allStudentExportBusy, setAllStudentExportBusy] = useState(false);
	const [allStudentExportProgress, setAllStudentExportProgress] =
		useState<StudentExportProgress>({ completed: 0, total: 0 });
	const [allStudentExportError, setAllStudentExportError] = useState("");
	const allStudentExportDisabled =
		allStudentExportBusy ||
		schoolStudentRosterBusy ||
		!activeSchoolId ||
		!managedAppId ||
		allStudentRoster.length === 0;

	async function handleDownloadAllStudentInformation() {
		if (allStudentExportDisabled) {
			return;
		}

		const roster = allStudentRoster;
		const total = roster.length;
		setAllStudentExportBusy(true);
		setAllStudentExportError("");
		setAllStudentExportProgress({ completed: 0, total });

		try {
			const [zonesResult, packsResult] = await Promise.allSettled([
				studentSchoolZones.length > 0
					? Promise.resolve(studentSchoolZones)
					: fetchSchoolZones(managedAppId, activeSchoolId),
				studentReservationPacks.length > 0 || !adminUserUUID.trim()
					? Promise.resolve(studentReservationPacks)
					: fetchAdminSchoolPacks(adminUserUUID, managedAppId, activeSchoolId),
			]);
			const exportSchoolZones =
				zonesResult.status === "fulfilled" ? zonesResult.value : [];
			const exportReservationPacks =
				packsResult.status === "fulfilled" ? packsResult.value : [];

			const exportParams = await mapWithConcurrency(
				roster,
				4,
				async (entry) => {
					const studentUserUUID = resolveStudentUserUUID(entry);
					const [
						profileResult,
						publicProfileResult,
						routeHistoryResult,
						violationsResult,
					] = await Promise.allSettled([
						fetchStudentProfile(managedAppId, studentUserUUID),
						fetchStudentPublicProfile(
							managedAppId,
							activeSchoolId,
							studentUserUUID,
						),
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

					return {
						entry,
						profile:
							profileResult.status === "fulfilled" ? profileResult.value : null,
						publicProfile:
							publicProfileResult.status === "fulfilled"
								? publicProfileResult.value
								: null,
						routeHistory:
							routeHistoryResult.status === "fulfilled"
								? routeHistoryResult.value
								: [],
						schoolZones: exportSchoolZones,
						reservations:
							schoolReservationsByMembership.get(
								entry.membership.membership_uuid,
							) ?? [],
						reservationPacks: exportReservationPacks,
						violations:
							violationsResult.status === "fulfilled"
								? violationsResult.value
								: [],
						violationMediaByViolation: null,
						studentError:
							profileResult.status === "rejected"
								? getErrorMessage(profileResult.reason)
								: "",
						studentPublicProfileError:
							publicProfileResult.status === "rejected"
								? getErrorMessage(publicProfileResult.reason)
								: "",
						studentRouteHistoryError:
							routeHistoryResult.status === "rejected"
								? getErrorMessage(routeHistoryResult.reason)
								: "",
						studentViolationError:
							violationsResult.status === "rejected"
								? getErrorMessage(violationsResult.reason)
								: "",
						formatNebulaUserName,
						formatDateOnly,
						formatUnixTimestamp,
					} satisfies StudentExportParams;
				},
				(completed) => {
					setAllStudentExportProgress({ completed, total });
				},
			);
			const rows = exportParams.flatMap(
				(params) => buildStudentExportRows(params).rows,
			);

			downloadCsv(
				sanitizeCsvFilename(
					`${activeSchoolId}-all-student-information`,
					"all-student-information",
				),
				[
					studentExportColumns,
					...rows.map((row) => csvObjectRow(studentExportColumns, row)),
				],
			);
		} catch (error) {
			setAllStudentExportError(getErrorMessage(error));
		} finally {
			setAllStudentExportBusy(false);
		}
	}

	return (
		<section className="panel students-section">
			<div className="panel-header">
				<div>
					<p className="eyebrow">School Roster</p>
					<h2>Registered students</h2>
				</div>
				<div className="student-roster-header-row">
					<div className="student-export-actions">
						<button
							className="student-export-btn"
							type="button"
							title={`Download ${filteredStudentRoster.length} matching roster rows`}
							onClick={() =>
								downloadRosterCSV(filteredStudentRoster, formatDateOnly)
							}
							disabled={
								filteredStudentRoster.length === 0 || schoolStudentRosterBusy
							}
						>
							Download Roster CSV
						</button>
						<button
							className="student-export-btn student-export-btn-primary"
							type="button"
							title={`Download full student report data for ${allStudentRoster.length} students`}
							onClick={() => void handleDownloadAllStudentInformation()}
							disabled={allStudentExportDisabled}
						>
							{allStudentExportBusy
								? `Preparing ${allStudentExportProgress.completed}/${allStudentExportProgress.total}`
								: "Download All CSV"}
						</button>
					</div>
					{allStudentExportBusy ? (
						<span className="student-export-status">
							Building student report CSV…
						</span>
					) : null}
					{allStudentExportError ? (
						<span className="student-export-status student-export-status-error">
							{allStudentExportError}
						</span>
					) : null}
					<button
						className="secondary-button"
						type="button"
						onClick={() => {
							void refreshStudentRoster();
							resetSelectedStudentState();
						}}
						disabled={schoolStudentRosterBusy || !activeSchoolId}
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
			{schoolStudentRosterError ? (
				<p className="error-text">{schoolStudentRosterError}</p>
			) : null}

			{activeSchoolId ? (
				<div className="students-layout">
					<div className="students-sidebar">
						<div className="students-search-row">
							<input
								className="students-search-input"
								type="search"
								placeholder="Search by name, ID or email…"
								value={studentRosterSearch}
								onChange={(e) => setStudentRosterSearch(e.target.value)}
							/>
							<span className="students-count-badge">
								{filteredStudentRoster.length}
							</span>
						</div>

						{schoolStudentRosterBusy ? (
							<p className="muted-text students-loading">Loading roster…</p>
						) : filteredStudentRoster.length === 0 ? (
							<p className="empty-state">
								{studentRosterSearch
									? "No students match your search."
									: "No registered students found yet."}
							</p>
						) : (
							<div className="students-list">
								{filteredStudentRoster.map((entry) => {
									const membership = entry.membership;
									const isSelected =
										selectedStudentMembershipId === membership.membership_uuid;
									const rosterProfilePhotoUrl =
										schoolStudentProfilePhotoUrls[entry.user.k_guid] ?? "";
									const initials = formatNebulaUserName(entry.user)
										.split(" ")
										.filter(Boolean)
										.slice(0, 2)
										.map((w) => w[0])
										.join("")
										.toUpperCase();
									return (
										<button
											key={membership.membership_uuid}
											type="button"
											className={`student-list-item${
												isSelected ? " student-list-item-active" : ""
											}`}
											onClick={() =>
												void handleSelectStudentInRoster(
													membership.membership_uuid,
												)
											}
										>
											<div className="student-list-avatar">
												{rosterProfilePhotoUrl ? (
													<img
														className="student-list-avatar-image"
														src={rosterProfilePhotoUrl}
														alt={`${formatNebulaUserName(entry.user)} profile`}
														onClick={(event) => {
															event.stopPropagation();
															handleImagePreview(
																rosterProfilePhotoUrl,
																`${formatNebulaUserName(entry.user)} profile`,
																formatNebulaUserName(entry.user),
															);
														}}
													/>
												) : (
													initials || "?"
												)}
											</div>
											<div className="student-list-info">
												<strong>{formatNebulaUserName(entry.user)}</strong>
												<span>
													{membership.student_id || "No ID"} ·{" "}
													{membership.campus_id || "—"}
												</span>
											</div>
											<span
												className={`student-status-dot student-status-dot-${
													membership.status || "active"
												}`}
											/>
										</button>
									);
								})}
							</div>
						)}
					</div>

					<div className="students-detail">
						{!selectedStudentEntry ? (
							<div className="students-detail-empty">
								<div className="students-detail-empty-icon">👤</div>
								<strong>Select a student</strong>
								<span>
									Choose a student from the list to view their full profile, ID
									photos, devices, and activity.
								</span>
							</div>
						) : (
							(() => {
								const entry = selectedStudentEntry;
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
								const fullName = formatNebulaUserName(entry.user);
								const initials = fullName
									.split(" ")
									.filter(Boolean)
									.slice(0, 2)
									.map((w) => w[0])
									.join("")
									.toUpperCase();
								const selectedStudentUserUUID =
									membership.user_uuid || entry.user.k_guid;
								const matchedPublicProfile =
									studentPublicProfile &&
									(studentPublicProfile.user.user_uuid ===
										selectedStudentUserUUID ||
										studentPublicProfile.user.user_uuid === entry.user.k_guid)
										? studentPublicProfile
										: null;
								const matchedStudentProfile =
									studentProfile &&
									(studentProfile.user.k_guid === selectedStudentUserUUID ||
										studentProfile.user.k_guid === entry.user.k_guid)
										? studentProfile
										: null;
								const profileImageUrl =
									matchedPublicProfile?.user.profile_image_url?.trim() ||
									schoolStudentProfilePhotoUrls[selectedStudentUserUUID] ||
									schoolStudentProfilePhotoUrls[entry.user.k_guid] ||
									"";
								const studentReservationPackByUUID = new Map(
									studentReservationPacks.map((pack) => [pack.pack_uuid, pack]),
								);
								const visitedPoiVisits = studentRouteHistory
									.flatMap((session) =>
										session.visited_pois.map((poi) => ({
											poi,
											session,
										})),
									)
									.sort(
										(left, right) => right.poi.visited_at - left.poi.visited_at,
									);
								const penaltyEvents = studentRouteHistory
									.flatMap((session) =>
										session.penalty_events.map((event) => ({
											event,
											session,
										})),
									)
									.sort(
										(left, right) =>
											right.event.occurred_at - left.event.occurred_at,
									);

								return (
									<>
										<div className="student-detail-header">
											<div className="student-detail-avatar">
												{profileImageUrl ? (
													<img
														className="student-detail-avatar-image"
														src={profileImageUrl}
														alt={`${fullName} profile`}
														onClick={() =>
															handleImagePreview(
																profileImageUrl,
																`${fullName} profile`,
																fullName,
															)
														}
													/>
												) : (
													initials || "?"
												)}
											</div>
											<div className="student-detail-header-info">
												<h3>{fullName}</h3>
												<div className="student-detail-header-meta">
													<span className="student-badge">
														{membership.status || "active"}
													</span>
													{membership.student_id ? (
														<span className="student-badge student-badge-muted">
															ID: {membership.student_id}
														</span>
													) : null}
													{membership.campus_id ? (
														<span className="student-badge student-badge-muted">
															{membership.campus_id}
														</span>
													) : null}
													{matchedPublicProfile ? (
														<span className="student-badge student-badge-highlight">
															{matchedPublicProfile.total_point_count.toLocaleString()}{" "}
															pts
														</span>
													) : null}
												</div>
											</div>
											<div className="student-detail-header-actions">
												<span className="student-export-scope">
													Single student
												</span>
												<button
													className="student-export-btn"
													type="button"
													onClick={() =>
														downloadStudentCSV({
															entry,
															profile: matchedStudentProfile,
															publicProfile: matchedPublicProfile,
															routeHistory: studentRouteHistory,
															schoolZones: studentSchoolZones,
															reservations: reservationsForMembership,
															reservationPacks: studentReservationPacks,
															violations: studentViolations,
															violationMediaByViolation:
																studentViolationMediaByViolation,
															studentError,
															studentPublicProfileError,
															studentRouteHistoryError,
															studentViolationError,
															formatNebulaUserName,
															formatDateOnly,
															formatUnixTimestamp,
														})
													}
													disabled={studentBusy}
													title={`Download ${fullName} as CSV`}
												>
													Download CSV
												</button>
												{studentBusy ? (
													<span className="muted-text">Loading…</span>
												) : null}
											</div>
										</div>

										{(studentError || studentPublicProfileError) && (
											<div className="student-detail-errors">
												{studentError ? (
													<p className="error-text">{studentError}</p>
												) : null}
												{studentPublicProfileError ? (
													<p className="muted-text">
														Public rider profile unavailable:{" "}
														{studentPublicProfileError}
													</p>
												) : null}
											</div>
										)}

										<div className="student-tabs-bar">
											<button
												type="button"
												className={`student-tab-btn${detailTab === "profile" ? " student-tab-btn-active" : ""}`}
												onClick={() => setDetailTab("profile")}
											>
												Profile
											</button>
											<button
												type="button"
												className={`student-tab-btn${detailTab === "activity" ? " student-tab-btn-active" : ""}`}
												onClick={() => setDetailTab("activity")}
											>
												Activity
												{visitedPoiVisits.length + penaltyEvents.length > 0 && (
													<span className="student-tab-count">
														{visitedPoiVisits.length + penaltyEvents.length}
													</span>
												)}
											</button>
											<button
												type="button"
												className={`student-tab-btn${detailTab === "records" ? " student-tab-btn-active" : ""}`}
												onClick={() => setDetailTab("records")}
											>
												Records
												{reservationsForMembership.length +
													studentViolations.length >
													0 && (
													<span className="student-tab-count">
														{reservationsForMembership.length +
															studentViolations.length}
													</span>
												)}
											</button>
										</div>

										<div className="student-tab-panel">
											{detailTab === "profile" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Identity &amp; contact</h4>
													</div>
													<div className="detail-grid">
														<DetailRow
															label="Full name"
															value={fullName || "Not set"}
														/>
														<DetailRow
															label="Username"
															value={entry.user.username || "Not set"}
														/>
														<DetailRow
															label="Email"
															value={entry.user.email || "Not set"}
														/>
														<DetailRow
															label="Phone"
															value={entry.user.phone || "Not set"}
														/>
														<DetailRow
															label="Student ID"
															value={membership.student_id || "Not set"}
														/>
														<DetailRow
															label="Campus"
															value={membership.campus_id || "Not set"}
														/>
													</div>
													<div className="uuid-copy-stack">
														<UuidCopyField
															label="user_uuid"
															value={entry.user.k_guid}
															onCopy={handleCopyUuid}
														/>
														<UuidCopyField
															label="membership_uuid"
															value={membership.membership_uuid}
															onCopy={handleCopyUuid}
														/>
													</div>
												</div>
											)}

											{detailTab === "profile" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Student ID photos</h4>
													</div>
													<div className="student-photos-grid">
														<div className="student-photo-card">
															<span>Front of ID</span>
															{frontPhotoUrl ? (
																<img
																	className="student-photo-image"
																	src={frontPhotoUrl}
																	alt={`${fullName} front ID`}
																	onClick={() =>
																		handleImagePreview(
																			frontPhotoUrl,
																			`${fullName} front ID`,
																			`${fullName} front ID`,
																		)
																	}
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
																	alt={`${fullName} back ID`}
																	onClick={() =>
																		handleImagePreview(
																			backPhotoUrl,
																			`${fullName} back ID`,
																			`${fullName} back ID`,
																		)
																	}
																/>
															) : (
																<div className="student-photo-placeholder">
																	Back ID not available
																</div>
															)}
														</div>
													</div>
												</div>
											)}

											{detailTab === "profile" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Registered devices</h4>
														{matchedStudentProfile ? (
															<span>
																{matchedStudentProfile.devices.length}
															</span>
														) : null}
													</div>
													{studentBusy ? (
														<p className="muted-text">Loading devices…</p>
													) : matchedStudentProfile ? (
														matchedStudentProfile.devices.length === 0 ? (
															<p className="muted-text">
																No registered devices found.
															</p>
														) : (
															<div className="devices-grid">
																{matchedStudentProfile.devices.map((device) => {
																	const devicePhotoUrl =
																		studentDevicePhotoUrls[
																			device.registered_device_uuid
																		] ?? "";

																	return (
																		<button
																			className="device-card device-card-button"
																			key={device.registered_device_uuid}
																			type="button"
																			onClick={() =>
																				handleOpenStudentDevice(
																					device.registered_device_uuid,
																				)
																			}
																		>
																			{devicePhotoUrl ? (
																				<img
																					className="device-card-photo"
																					src={devicePhotoUrl}
																					alt={`${device.nickname || device.device_type} device`}
																					onClick={(event) => {
																						event.stopPropagation();
																						handleImagePreview(
																							devicePhotoUrl,
																							`${device.nickname || device.device_type} device`,
																							device.nickname ||
																								device.device_type,
																						);
																					}}
																				/>
																			) : (
																				<div className="device-card-icon">
																					🛴
																				</div>
																			)}
																			<div className="device-card-body">
																				<strong>
																					{device.nickname ||
																						device.device_type}
																				</strong>
																				<span>
																					{[device.make, device.model]
																						.filter(Boolean)
																						.join(" ") || "Unknown device"}
																				</span>
																				<span className="device-card-meta">
																					{device.color
																						? `${device.color} · `
																						: ""}
																					Serial:{" "}
																					{device.serial_number || "Not set"}
																				</span>
																				<span className="device-card-meta">
																					{device.active
																						? "Active"
																						: "Inactive"}
																				</span>
																				<span className="device-card-open">
																					View device details
																				</span>
																			</div>
																		</button>
																	);
																})}
															</div>
														)
													) : (
														<p className="muted-text">
															Select a student to load device information.
														</p>
													)}
												</div>
											)}

											{detailTab === "profile" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Enrollment terms</h4>
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
																		{formatDateOnly(term.start_date)} –{" "}
																		{formatDateOnly(term.end_date)}
																	</span>
																	<span>
																		{term.active ? "Active" : "Inactive"}
																	</span>
																</div>
															))}
														</div>
													)}
												</div>
											)}

											{detailTab === "records" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Parking reservations</h4>
														<span>{reservationsForMembership.length}</span>
													</div>
													{reservationsForMembership.length === 0 ? (
														<p className="muted-text">
															No parking reservations submitted.
														</p>
													) : (
														<div className="stack-list">
															{reservationsForMembership.map((reservation) => {
																const matchingPack =
																	studentReservationPackByUUID.get(
																		reservation.pack_uuid,
																	) ?? null;
																const packPhotoUrl =
																	matchingPack?.photo?.path_do_spaces?.trim() ??
																	"";

																return (
																	<div
																		className="data-card"
																		key={reservation.reservation_uuid}
																	>
																		<div className="reservation-card-top">
																			<strong>
																				{reservation.term_name || "School term"}
																			</strong>
																			<span
																				className={`student-badge student-badge-status-${reservation.status}`}
																			>
																				{reservation.status}
																			</span>
																		</div>
																		<span>
																			{reservation.pack_name ||
																				matchingPack?.name ||
																				"Juise Pack"}{" "}
																			· Spot {reservation.spot_number || "TBD"}
																		</span>
																		<span>
																			{formatUnixTimestamp(
																				reservation.start_time,
																			)}{" "}
																			–{" "}
																			{formatUnixTimestamp(
																				reservation.end_time,
																			)}
																		</span>
																		<div className="student-reservation-media-grid">
																			<div className="student-photo-card">
																				<span>Juise Pack Photo</span>
																				{packPhotoUrl ? (
																					<img
																						className="student-photo-image"
																						src={packPhotoUrl}
																						alt={`${
																							matchingPack?.name ||
																							reservation.pack_name ||
																							"Juise Pack"
																						} photo`}
																						onClick={() =>
																							handleImagePreview(
																								packPhotoUrl,
																								`${
																									matchingPack?.name ||
																									reservation.pack_name ||
																									"Juise Pack"
																								} photo`,
																								matchingPack?.name ||
																									reservation.pack_name ||
																									"Juise Pack",
																							)
																						}
																					/>
																				) : (
																					<div className="student-photo-placeholder">
																						Juise Pack photo unavailable
																					</div>
																				)}
																			</div>
																			<div className="student-photo-card">
																				<span>Juise Pack Location</span>
																				{matchingPack?.location ? (
																					<StudentEventMiniMap
																						label={
																							matchingPack?.name ||
																							reservation.pack_name ||
																							"Juise Pack"
																						}
																						lat={matchingPack.location.lat}
																						lng={matchingPack.location.lng}
																						tone="poi"
																					/>
																				) : (
																					<div className="student-photo-placeholder">
																						Juise Pack location unavailable
																					</div>
																				)}
																			</div>
																		</div>
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
																	</div>
																);
															})}
														</div>
													)}
												</div>
											)}

											{detailTab === "activity" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Visited POIs</h4>
														<span>{visitedPoiVisits.length}</span>
													</div>
													{studentBusy ? (
														<p className="muted-text">Loading route history…</p>
													) : studentRouteHistoryError ? (
														<p className="muted-text">
															Visited POIs unavailable right now:{" "}
															{studentRouteHistoryError}
														</p>
													) : visitedPoiVisits.length === 0 ? (
														<p className="muted-text">
															No visited POIs recorded for this student yet.
														</p>
													) : (
														<div className="stack-list">
															{visitedPoiVisits.map(
																({ poi, session }, index) => (
																	<div
																		className="data-card"
																		key={`${session.session_id}-${poi.poi_uuid}-${poi.visited_at}-${index}`}
																	>
																		<div className="student-event-card">
																			<div className="student-event-copy">
																				<div className="reservation-card-top">
																					<strong>
																						{poi.title || "Visited POI"}
																					</strong>
																					<span className="student-badge student-badge-highlight">
																						+{poi.bonus_points} pts
																					</span>
																				</div>
																				<span>
																					{formatUnixTimestamp(poi.visited_at)}
																				</span>
																				<span>
																					Trip: {session.trip_mode || "Unknown"}{" "}
																					· Session{" "}
																					{formatUnixTimestamp(
																						session.started_at,
																					)}
																				</span>
																				<span>
																					{poi.description ||
																						"No POI description provided."}
																				</span>
																				<div className="uuid-copy-stack">
																					<UuidCopyField
																						label="poi_uuid"
																						value={poi.poi_uuid}
																						onCopy={handleCopyUuid}
																					/>
																					<UuidCopyField
																						label="session_id"
																						value={session.session_id}
																						onCopy={handleCopyUuid}
																					/>
																				</div>
																			</div>
																			<StudentEventMiniMap
																				label={poi.title || "Visited POI"}
																				lat={poi.lat}
																				lng={poi.lng}
																				tone="poi"
																			/>
																		</div>
																	</div>
																),
															)}
														</div>
													)}
												</div>
											)}

											{detailTab === "activity" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Route penalties</h4>
														<span>{penaltyEvents.length}</span>
													</div>
													{studentBusy ? (
														<p className="muted-text">Loading route history…</p>
													) : studentRouteHistoryError ? (
														<p className="muted-text">
															Penalty events unavailable right now:{" "}
															{studentRouteHistoryError}
														</p>
													) : penaltyEvents.length === 0 ? (
														<p className="muted-text">
															No route penalty events recorded for this student.
														</p>
													) : (
														<div className="stack-list">
															{penaltyEvents.map(({ event, session }, index) =>
																(() => {
																	const matchingZone = resolvePenaltyZone(
																		session,
																		studentSchoolZones,
																		event.zone_uuid,
																	);
																	const estimatedSpeedMph =
																		event.zone_type === "speed_limit"
																			? estimatePenaltySpeedMph(session, event)
																			: null;
																	const rideContext = buildRidePenaltyContext(
																		session,
																		event,
																	);
																	const confidenceLabel =
																		formatConfidencePercent(
																			event.confidence_percent,
																		);
																	const nearestAccuracy =
																		typeof rideContext.nearestPoint
																			?.accuracy === "number" &&
																		Number.isFinite(
																			rideContext.nearestPoint.accuracy,
																		)
																			? `±${Math.round(
																					rideContext.nearestPoint.accuracy,
																				)} m`
																			: "Accuracy unavailable";
																	const nearestSpeed =
																		typeof rideContext.nearestPoint
																			?.speed_mps === "number" &&
																		Number.isFinite(
																			rideContext.nearestPoint.speed_mps,
																		)
																			? formatSpeedMph(
																					rideContext.nearestPoint.speed_mps *
																						2.2369362920544,
																				)
																			: estimatedSpeedMph
																				? formatSpeedMph(estimatedSpeedMph)
																				: "Speed unavailable";
																	const evidenceCount =
																		typeof event.evidence_point_count ===
																			"number" &&
																		Number.isFinite(event.evidence_point_count)
																			? Math.max(
																					0,
																					Math.round(
																						event.evidence_point_count,
																					),
																				)
																			: null;

																	const studentUUID =
																		selectedStudentEntry?.membership?.user_uuid?.trim() ||
																		selectedStudentEntry?.user?.k_guid ||
																		"";

																	return (
																		<div
																			className="data-card"
																			key={`${session.session_id}-${event.zone_uuid}-${event.occurred_at}-${index}`}
																			style={{
																				cursor: studentUUID
																					? "pointer"
																					: undefined,
																			}}
																			title={
																				studentUUID
																					? "View on Student Routes map"
																					: undefined
																			}
																			onClick={() => {
																				if (!studentUUID) return;
																				const params = new URLSearchParams({
																					user: studentUUID,
																					session: session.session_id,
																					lat: String(event.lat),
																					lng: String(event.lng),
																				});
																				navigate(
																					`/routes?${params.toString()}`,
																				);
																			}}
																		>
																			<div className="student-event-card">
																				<div className="student-event-copy">
																					<div className="reservation-card-top">
																						<strong>
																							{event.title ||
																								formatPenaltyZoneType(
																									event.zone_type,
																								)}
																						</strong>
																						<span className="student-badge student-badge-status-denied">
																							-{event.points_lost} pts
																						</span>
																					</div>
																					<span>
																						{formatUnixTimestamp(
																							event.occurred_at,
																						)}
																					</span>
																					<span>
																						Type:{" "}
																						{formatPenaltyZoneType(
																							event.zone_type,
																						)}
																						{event.speed_limit_mph
																							? ` · Limit ${event.speed_limit_mph} mph`
																							: ""}
																					</span>
																					{event.zone_type === "speed_limit" ? (
																						<span>
																							Max speed caught:{" "}
																							{estimatedSpeedMph
																								? formatSpeedMph(
																										estimatedSpeedMph,
																									)
																								: "Unavailable from route points"}
																						</span>
																					) : null}
																					<span>
																						Reason:{" "}
																						{event.reason ||
																							"No penalty reason provided."}
																					</span>
																					<span>
																						{event.description ||
																							"No penalty description provided."}
																					</span>
																					<div className="student-ride-context">
																						<div className="student-ride-context-header">
																							<strong>Ride Context</strong>
																							<span className="student-badge student-badge-muted">
																								Confidence {confidenceLabel}
																							</span>
																						</div>
																						<div className="student-ride-context-grid">
																							<span>
																								Snippet{" "}
																								{formatRideContextDistance(
																									rideContext.distanceMeters,
																								)}{" "}
																								·{" "}
																								{formatRideContextDuration(
																									rideContext.durationSeconds,
																								)}
																							</span>
																							<span>
																								{rideContext.pointCount.toLocaleString()}{" "}
																								route samples near the penalty
																							</span>
																							<span>
																								Evidence samples{" "}
																								{evidenceCount == null
																									? "Unavailable"
																									: evidenceCount.toLocaleString()}
																							</span>
																							<span>
																								Nearest speed {nearestSpeed} ·{" "}
																								{nearestAccuracy}
																							</span>
																							<span>
																								Trip{" "}
																								{session.trip_mode || "Unknown"}{" "}
																								·{" "}
																								{formatUnixTimestamp(
																									session.started_at,
																								)}
																							</span>
																						</div>
																					</div>
																					<div className="uuid-copy-stack">
																						<UuidCopyField
																							label="zone_uuid"
																							value={event.zone_uuid}
																							onCopy={handleCopyUuid}
																						/>
																						<UuidCopyField
																							label="session_id"
																							value={session.session_id}
																							onCopy={handleCopyUuid}
																						/>
																					</div>
																				</div>
																				<StudentEventMiniMap
																					label={
																						event.title ||
																						formatPenaltyZoneType(
																							event.zone_type,
																						)
																					}
																					lat={event.lat}
																					lng={event.lng}
																					polygon={matchingZone?.polygon}
																					routePoints={rideContext.points}
																					tone="penalty"
																				/>
																			</div>
																		</div>
																	);
																})(),
															)}
														</div>
													)}
												</div>
											)}

											{detailTab === "records" && (
												<div className="data-section">
													<div className="data-section-header">
														<h4>Parking violations</h4>
														<span>{studentViolations.length}</span>
													</div>
													{studentBusy ? (
														<p className="muted-text">Loading violations…</p>
													) : studentViolationError ? (
														<p className="muted-text">
															Violation history unavailable right now:{" "}
															{studentViolationError}
														</p>
													) : studentViolations.length === 0 ? (
														<p className="muted-text">
															No parking violations reported for this student.
														</p>
													) : (
														<div className="stack-list">
															{studentViolations.map((violation) => {
																const violationMediaAssets =
																	studentViolationMediaByViolation[
																		violation.violation_uuid
																	] ?? [];

																return (
																	<div
																		className="data-card"
																		key={violation.violation_uuid}
																	>
																		<div className="reservation-card-top">
																			<strong>
																				{formatUnixTimestamp(
																					violation.created_at,
																				)}
																			</strong>
																			<span className="student-badge student-badge-muted">
																				{violation.status || "reported"}
																			</span>
																		</div>
																		<span>
																			{violation.description ||
																				"No description provided."}
																		</span>
																		<span>
																			Device:{" "}
																			{violation.registered_device_uuid ||
																				"Not linked"}
																		</span>
																		<div className="uuid-copy-stack">
																			<UuidCopyField
																				label="violation_uuid"
																				value={violation.violation_uuid}
																				onCopy={handleCopyUuid}
																			/>
																			<UuidCopyField
																				label="registered_device_uuid"
																				value={
																					violation.registered_device_uuid ??
																					undefined
																				}
																				onCopy={handleCopyUuid}
																			/>
																		</div>
																		{violationMediaAssets.length > 0 ? (
																			<div className="student-photos-grid">
																				{violationMediaAssets.map(
																					(asset, index) => {
																						const violationPhotoUrl =
																							studentViolationSignedMediaUrls[
																								asset.object_key
																							] ?? "";
																						if (!violationPhotoUrl) {
																							return null;
																						}

																						return (
																							<div
																								className="student-photo-card"
																								key={asset.media_uuid}
																							>
																								<span>
																									{formatViolationSlotLabel(
																										asset.slot,
																										index,
																									)}
																								</span>
																								<img
																									className="student-photo-image"
																									src={violationPhotoUrl}
																									alt={`${fullName} violation photo ${index + 1}`}
																									onClick={() =>
																										handleImagePreview(
																											violationPhotoUrl,
																											`${fullName} violation photo ${index + 1}`,
																											`${fullName} violation photo ${index + 1}`,
																										)
																									}
																								/>
																							</div>
																						);
																					},
																				)}
																			</div>
																		) : (
																			<p className="muted-text">
																				No violation photos attached.
																			</p>
																		)}
																	</div>
																);
															})}
														</div>
													)}
												</div>
											)}
										</div>
										{/* end student-tab-panel */}
									</>
								);
							})()
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
