import type { StudentRouteHistorySession } from "./api";

const ROUTE_POINT_DISTANCE_INTERVAL_METERS = 0.5 * 1609.344;

function finiteNumber(value: number | null | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function isManualRouteHistorySession(
	session: StudentRouteHistorySession,
): boolean {
	return session.tracking_source.trim().toLowerCase() !== "auto";
}

export function getRouteHistoryRidePoints(
	session: StudentRouteHistorySession,
): number {
	if (!isManualRouteHistorySession(session)) {
		return 0;
	}

	return Math.floor(
		Math.max(0, finiteNumber(session.distance_meters)) /
			ROUTE_POINT_DISTANCE_INTERVAL_METERS,
	);
}

export function getRouteHistoryEarnedPoints(
	session: StudentRouteHistorySession,
): number {
	return getRouteHistoryRidePoints(session) + finiteNumber(session.bonus_points);
}

export function getRouteHistoryNetPoints(
	session: StudentRouteHistorySession,
): number {
	return getRouteHistoryEarnedPoints(session) - finiteNumber(session.penalty_points);
}
