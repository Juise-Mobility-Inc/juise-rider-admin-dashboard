import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
        fetchPendingReservations,
        fetchSchoolIncomeSummary,
        fetchSchoolPOIs,
        fetchSchoolRegisteredDevices,
        fetchSchoolStudentRoster,
        fetchStudentParkingViolations,
        fetchStudentRouteHistory,
        type SchoolPOI,
        type SchoolIncomeSummary,
        type SchoolIncomeWindow,
        type SchoolStudentRosterEntry,
        type StudentParkingViolation,
        type StudentRouteHistorySession,
} from "../../lib/api";
import { getRouteHistoryEarnedPoints } from "../../lib/routeHistoryPoints";

type DashboardLoadStatus = "idle" | "loading" | "ready" | "error";
type LeaderboardWindow = "today" | "week" | "all";

type DashboardLoadState = {
        status: DashboardLoadStatus;
        message: string;
        completed: number;
        total: number;
};

type StudentActivityBundle = {
        entry: SchoolStudentRosterEntry;
        routeHistory: StudentRouteHistorySession[];
        parkingViolations: StudentParkingViolation[];
        error: string;
};

type DashboardDataset = {
        generatedAt: number;
        roster: SchoolStudentRosterEntry[];
        pois: SchoolPOI[];
        students: StudentActivityBundle[];
};

type LeaderboardEntry = {
        userUUID: string;
        name: string;
        detail: string;
        earnedPoints: number;
        bonusPoints: number;
        rideCount: number;
        distanceMeters: number;
};

type PoiRankingEntry = {
        key: string;
        title: string;
        visits: number;
        uniqueStudents: number;
        bonusPoints: number;
        configuredBonusPoints: number;
};

type RidePenaltyTypeSummary = {
        key: string;
        title: string;
        count: number;
        pointsLost: number;
};

type StudentPenaltySummary = {
        userUUID: string;
        name: string;
        detail: string;
        count: number;
        pointsLost: number;
        lastOccurredAt: number;
};

type RecentRidePenalty = {
        key: string;
        name: string;
        detail: string;
        title: string;
        zoneType: string;
        reason: string;
        pointsLost: number;
        occurredAt: number;
        userUUID: string;
        sessionId: string;
        lat: number;
        lng: number;
};

type ActivePenaltyReport = {
        key: string;
        name: string;
        detail: string;
        status: string;
        description: string;
        deviceUUID: string;
        createdAt: number;
};

type StudentPenaltyReportSummary = {
        userUUID: string;
        name: string;
        detail: string;
        count: number;
        lastCreatedAt: number;
        latestViolationUUID: string;
};

type DashboardVisuals = {
        generatedAt: number;
        rosterCount: number;
        activeRidersToday: number;
        activeRidersThisWeek: number;
        ridesToday: number;
        ridesYesterday: number;
        ridesThisWeek: number;
        earnedPoints: number;
        bonusPoints: number;
        poiVisits: number;
        distanceMetersThisWeek: number;
        leaderboardToday: LeaderboardEntry[];
        leaderboardWeek: LeaderboardEntry[];
        leaderboardAll: LeaderboardEntry[];
        poiRankings: PoiRankingEntry[];
        ridePenaltyCount: number;
        ridePenaltyCountThisWeek: number;
        ridePenaltyPointsLost: number;
        ridePenaltyStudentCount: number;
        ridePenaltyTypes: RidePenaltyTypeSummary[];
        ridePenaltyStudents: StudentPenaltySummary[];
        recentRidePenalties: RecentRidePenalty[];
        penaltyReportCount: number;
        activePenaltyReportCount: number;
        activePenaltyReportStudentCount: number;
        activePenaltyReports: ActivePenaltyReport[];
        activePenaltyReportStudents: StudentPenaltyReportSummary[];
        studentsLoadedWithErrors: number;
};

type Props = {
        activeSchoolId: string;
        managedAppId: string;
        adminUserUUID: string;
        onHeaderCountsLoaded?: (counts: {
                studentCount: number;
                pendingReservationCount: number;
        }) => void;
};

const DASHBOARD_CONCURRENCY = 5;

function getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
                return error.message;
        }

        return "An unexpected error occurred.";
}

function formatStudentName(entry: SchoolStudentRosterEntry): string {
        const fullName =
                `${entry.user.first_name?.trim() ?? ""} ${entry.user.last_name?.trim() ?? ""}`.trim();
        return (
                fullName ||
                entry.user.username?.trim() ||
                entry.user.email?.trim() ||
                "Unnamed student"
        );
}

function resolveStudentUserUUID(entry: SchoolStudentRosterEntry): string {
        return entry.membership.user_uuid?.trim() || entry.user.k_guid;
}

function formatStudentDetail(entry: SchoolStudentRosterEntry): string {
        const studentId = entry.membership.student_id.trim();
        return studentId || entry.user.email || entry.user.username || "Student";
}

const PIE_COLORS = [
        "#f6ae2d",
        "#cf3f3f",
        "#3a7ebf",
        "#6bbf8e",
        "#e67e22",
        "#9b59b6",
        "#4ecdc4",
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
        const rad = ((angleDeg - 90) * Math.PI) / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(
        cx: number,
        cy: number,
        outerR: number,
        innerR: number,
        startAngle: number,
        endAngle: number,
): string {
        const large = endAngle - startAngle > 180 ? 1 : 0;
        const o1 = polarToCartesian(cx, cy, outerR, startAngle);
        const o2 = polarToCartesian(cx, cy, outerR, endAngle);
        const i1 = polarToCartesian(cx, cy, innerR, endAngle);
        const i2 = polarToCartesian(cx, cy, innerR, startAngle);
        return [
                `M ${o1.x.toFixed(3)} ${o1.y.toFixed(3)}`,
                `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x.toFixed(3)} ${o2.y.toFixed(3)}`,
                `L ${i1.x.toFixed(3)} ${i1.y.toFixed(3)}`,
                `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x.toFixed(3)} ${i2.y.toFixed(3)}`,
                "Z",
        ].join(" ");
}

function PenaltyTypePieChart({ types }: { types: RidePenaltyTypeSummary[] }) {
        const [hovered, setHovered] = useState<string | null>(null);
        const total = types.reduce((sum, t) => sum + t.count, 0);

        if (types.length === 0) {
                return <p className="reports-visual-empty">No ride penalties recorded.</p>;
        }

        const slices = types.map((type, i) => {
                const pct = type.count / total;
                const startAngle =
                        types
                                .slice(0, i)
                                .reduce((sum, previousType) => sum + previousType.count / total, 0) *
                        360;
                const endAngle = startAngle + pct * 360;
                return {
                        ...type,
                        color: PIE_COLORS[i % PIE_COLORS.length],
                        startAngle,
                        endAngle,
                        pct,
                };
        });

        return (
                <div className="penalty-pie-wrap">
                        <svg viewBox="0 0 160 160" className="penalty-pie-svg">
                                {slices.map((slice) =>
                                        slice.endAngle - slice.startAngle >= 359.99 ? (
                                                // Full circle — SVG arc degenerates at 360°, use circle elements instead
                                                <g
                                                        key={slice.key}
                                                        opacity={hovered === null || hovered === slice.key ? 1 : 0.35}
                                                        style={{ transition: "opacity 0.15s" }}
                                                        onMouseEnter={() => setHovered(slice.key)}
                                                        onMouseLeave={() => setHovered(null)}>
                                                        <circle cx="80" cy="80" r="70" fill={slice.color} />
                                                        <circle cx="80" cy="80" r="42" fill="var(--surface, #fff)" />
                                                        <title>
                                                                {slice.title}: {slice.count.toLocaleString()} events (100%)
                                                        </title>
                                                </g>
                                        ) : (
                                                <path
                                                        key={slice.key}
                                                        d={donutSlicePath(
                                                                80,
                                                                80,
                                                                70,
                                                                42,
                                                                slice.startAngle,
                                                                slice.endAngle,
                                                        )}
                                                        fill={slice.color}
                                                        opacity={hovered === null || hovered === slice.key ? 1 : 0.35}
                                                        style={{ transition: "opacity 0.15s" }}
                                                        onMouseEnter={() => setHovered(slice.key)}
                                                        onMouseLeave={() => setHovered(null)}>
                                                        <title>
                                                                {slice.title}: {slice.count.toLocaleString()} events (
                                                                {(slice.pct * 100).toFixed(1)}%)
                                                        </title>
                                                </path>
                                        ),
                                )}
                                <text x="80" y="75" className="penalty-pie-center-num">
                                        {total.toLocaleString()}
                                </text>
                                <text x="80" y="90" className="penalty-pie-center-label">
                                        events
                                </text>
                        </svg>
                        <div className="penalty-pie-legend">
                                {slices.map((slice) => (
                                        <div
                                                key={slice.key}
                                                className={`penalty-pie-legend-row${hovered === slice.key ? " penalty-pie-legend-row--active" : ""}`}
                                                onMouseEnter={() => setHovered(slice.key)}
                                                onMouseLeave={() => setHovered(null)}>
                                                <span
                                                        className="penalty-pie-swatch"
                                                        style={{ background: slice.color }}
                                                />
                                                <span className="penalty-pie-legend-title">{slice.title}</span>
                                                <span className="penalty-pie-legend-count">
                                                        {slice.count.toLocaleString()}
                                                </span>
                                                <span className="penalty-pie-legend-pct">
                                                        {(slice.pct * 100).toFixed(0)}%
                                                </span>
                                        </div>
                                ))}
                        </div>
                </div>
        );
}

function FitText({
        children,
        maxFontSize = 54,
        className,
}: {
        children: React.ReactNode;
        maxFontSize?: number;
        className?: string;
}) {
        const ref = useRef<HTMLElement>(null);
        useLayoutEffect(() => {
                const el = ref.current;
                if (!el) return;
                let size = maxFontSize;
                el.style.fontSize = `${size}px`;
                while (el.scrollWidth > el.offsetWidth && size > 8) {
                        size -= 1;
                        el.style.fontSize = `${size}px`;
                }
        });
        return (
                <strong
                        ref={ref}
                        className={className}
                        style={{ whiteSpace: "nowrap", display: "block", overflow: "visible" }}>
                        {children}
                </strong>
        );
}

function formatCompactNumber(value: number): string {
        return new Intl.NumberFormat("en-US", {
                notation: value >= 10000 ? "compact" : "standard",
                maximumFractionDigits: value >= 1000 ? 1 : 0,
        }).format(value);
}

function formatCurrencyCents(value: number, currency = "USD"): string {
        return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency,
                maximumFractionDigits: 2,
        }).format((Number.isFinite(value) ? value : 0) / 100);
}

function formatMiles(meters: number): string {
        return new Intl.NumberFormat("en-US", {
                maximumFractionDigits: meters >= 160934 ? 0 : 1,
        }).format(meters / 1609.344);
}

function startOfLocalDay(timestamp = Date.now()): number {
        const date = new Date(timestamp);
        date.setHours(0, 0, 0, 0);
        return Math.floor(date.getTime() / 1000);
}

function startOfLocalWeek(timestamp = Date.now()): number {
        const date = new Date(timestamp);
        date.setHours(0, 0, 0, 0);
        const day = date.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        date.setDate(date.getDate() + mondayOffset);
        return Math.floor(date.getTime() / 1000);
}

function startOfPastSevenDays(timestamp = Date.now()): number {
        return Math.floor((timestamp - 7 * 24 * 60 * 60 * 1000) / 1000);
}

function isInRange(timestamp: number, from: number, to?: number): boolean {
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
                return false;
        }
        if (timestamp < from) {
                return false;
        }
        return typeof to === "number" ? timestamp < to : true;
}

function filterSessions(
        bundle: StudentActivityBundle,
        from?: number,
        to?: number,
): StudentRouteHistorySession[] {
        if (typeof from !== "number") {
                return bundle.routeHistory;
        }

        return bundle.routeHistory.filter((session) =>
                isInRange(session.started_at, from, to),
        );
}

function getStudentParkingViolations(
        bundle: StudentActivityBundle,
): StudentParkingViolation[] {
        return Array.isArray(bundle.parkingViolations)
                ? bundle.parkingViolations.filter(
                                (violation): violation is StudentParkingViolation => Boolean(violation),
                        )
                : [];
}

function formatDashboardTimestamp(timestamp: number): string {
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
                return "No timestamp";
        }

        return new Date(timestamp * 1000).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
        });
}

function formatPenaltyZoneType(zoneType: string): string {
        switch (zoneType.trim()) {
                case "no_go":
                        return "No-go zone";
                case "speed_limit":
                        return "Speed limit zone";
                default:
                        return zoneType.trim() || "Ride penalty";
        }
}

function formatReportStatus(status: string): string {
        return status.trim() || "reported";
}

function buildLeaderboard(
        students: StudentActivityBundle[],
        from?: number,
        to?: number,
): LeaderboardEntry[] {
        return students
                        .map((bundle) => {
                                const sessions = filterSessions(bundle, from, to);
                                const earnedPoints = sessions.reduce(
                                        (sum, session) => sum + getRouteHistoryEarnedPoints(session),
                                        0,
                                );
                        const bonusPoints = sessions.reduce(
                                (sum, session) => sum + session.bonus_points,
                                0,
                        );
                        const distanceMeters = sessions.reduce(
                                (sum, session) => sum + session.distance_meters,
                                0,
                        );
                        return {
                                userUUID: resolveStudentUserUUID(bundle.entry),
                                name: formatStudentName(bundle.entry),
                                detail: formatStudentDetail(bundle.entry),
                                earnedPoints,
                                bonusPoints,
                                rideCount: sessions.length,
                                distanceMeters,
                        };
                })
                .filter((entry) => entry.earnedPoints > 0 || entry.rideCount > 0)
                .sort((left, right) => {
                        if (left.earnedPoints !== right.earnedPoints) {
                                return right.earnedPoints - left.earnedPoints;
                        }
                        if (left.distanceMeters !== right.distanceMeters) {
                                return right.distanceMeters - left.distanceMeters;
                        }
                        if (left.rideCount !== right.rideCount) {
                                return right.rideCount - left.rideCount;
                        }
                        return left.name.localeCompare(right.name);
                })
                .slice(0, 10);
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

function buildPoiRankings(
        dataset: DashboardDataset,
        weekStart: number,
): PoiRankingEntry[] {
        const poiByUUID = new Map(dataset.pois.map((poi) => [poi.poi_uuid, poi]));
        const statsByPOI = new Map<
                string,
                {
                        title: string;
                        visits: number;
                        students: Set<string>;
                        bonusPoints: number;
                        configuredBonusPoints: number;
                }
        >();

        for (const bundle of dataset.students) {
                const studentUserUUID = resolveStudentUserUUID(bundle.entry);
                for (const session of filterSessions(bundle, weekStart)) {
                        for (const poi of session.visited_pois) {
                                const key = poi.poi_uuid.trim() || `${poi.lat}:${poi.lng}:${poi.title}`;
                                const current = statsByPOI.get(key);
                                if (current) {
                                        current.visits += 1;
                                        current.students.add(studentUserUUID);
                                        current.bonusPoints += poi.bonus_points;
                                } else {
                                        const configuredPoi = poiByUUID.get(poi.poi_uuid);
                                        statsByPOI.set(key, {
                                                title: poi.title || poiByUUID.get(poi.poi_uuid)?.title || "POI",
                                                visits: 1,
                                                students: new Set([studentUserUUID]),
                                                bonusPoints: poi.bonus_points,
                                                configuredBonusPoints:
                                                        configuredPoi?.bonus_points ?? poi.bonus_points ?? 0,
                                        });
                                }
                        }
                }
        }

        for (const poi of dataset.pois) {
                if (!statsByPOI.has(poi.poi_uuid)) {
                        statsByPOI.set(poi.poi_uuid, {
                                title: poi.title || "POI",
                                visits: 0,
                                students: new Set(),
                                bonusPoints: 0,
                                configuredBonusPoints: poi.bonus_points,
                        });
                }
        }

        return Array.from(statsByPOI.entries())
                .map(([key, stats]) => ({
                        key,
                        title: stats.title,
                        visits: stats.visits,
                        uniqueStudents: stats.students.size,
                        bonusPoints: stats.bonusPoints,
                        configuredBonusPoints: stats.configuredBonusPoints,
                }))
                .sort((left, right) => {
                        if (left.visits !== right.visits) {
                                return right.visits - left.visits;
                        }
                        return left.title.localeCompare(right.title);
                })
                .slice(0, 12);
}

function getRidePenaltyRecords(
        students: StudentActivityBundle[],
        from?: number,
        to?: number,
) {
        return students.flatMap((bundle) =>
                bundle.routeHistory.flatMap((session) =>
                        session.penalty_events
                                .filter((event) =>
                                        typeof from === "number"
                                                ? isInRange(event.occurred_at, from, to)
                                                : true,
                                )
                                .map((event) => ({ bundle, session, event })),
                ),
        );
}

function buildRidePenaltyTypes(
        records: ReturnType<typeof getRidePenaltyRecords>,
): RidePenaltyTypeSummary[] {
        const summaryByType = new Map<string, RidePenaltyTypeSummary>();

        for (const { event } of records) {
                const key = event.zone_type.trim() || "unknown";
                const current = summaryByType.get(key);
                if (current) {
                        current.count += 1;
                        current.pointsLost += event.points_lost;
                } else {
                        summaryByType.set(key, {
                                key,
                                title: formatPenaltyZoneType(event.zone_type),
                                count: 1,
                                pointsLost: event.points_lost,
                        });
                }
        }

        return Array.from(summaryByType.values()).sort((left, right) => {
                if (left.count !== right.count) {
                        return right.count - left.count;
                }
                if (left.pointsLost !== right.pointsLost) {
                        return right.pointsLost - left.pointsLost;
                }
                return left.title.localeCompare(right.title);
        });
}

function buildRidePenaltyStudents(
        records: ReturnType<typeof getRidePenaltyRecords>,
): StudentPenaltySummary[] {
        const summaryByStudent = new Map<string, StudentPenaltySummary>();

        for (const { bundle, event } of records) {
                const userUUID = resolveStudentUserUUID(bundle.entry);
                const current = summaryByStudent.get(userUUID);
                if (current) {
                        current.count += 1;
                        current.pointsLost += event.points_lost;
                        current.lastOccurredAt = Math.max(
                                current.lastOccurredAt,
                                event.occurred_at,
                        );
                } else {
                        summaryByStudent.set(userUUID, {
                                userUUID,
                                name: formatStudentName(bundle.entry),
                                detail: formatStudentDetail(bundle.entry),
                                count: 1,
                                pointsLost: event.points_lost,
                                lastOccurredAt: event.occurred_at,
                        });
                }
        }

        return Array.from(summaryByStudent.values())
                .sort((left, right) => {
                        if (left.count !== right.count) {
                                return right.count - left.count;
                        }
                        if (left.pointsLost !== right.pointsLost) {
                                return right.pointsLost - left.pointsLost;
                        }
                        return right.lastOccurredAt - left.lastOccurredAt;
                })
                .slice(0, 5);
}

function buildRecentRidePenalties(
        records: ReturnType<typeof getRidePenaltyRecords>,
): RecentRidePenalty[] {
        return records
                .map(({ bundle, session, event }) => ({
                        key: `${session.session_id}:${event.zone_uuid}:${event.occurred_at}`,
                        name: formatStudentName(bundle.entry),
                        detail: formatStudentDetail(bundle.entry),
                        title: event.title || formatPenaltyZoneType(event.zone_type),
                        zoneType: formatPenaltyZoneType(event.zone_type),
                        reason: event.reason || event.description || "No reason provided.",
                        pointsLost: event.points_lost,
                        occurredAt: event.occurred_at,
                        userUUID:
                                bundle.entry.membership.user_uuid?.trim() || bundle.entry.user.k_guid,
                        sessionId: session.session_id,
                        lat: event.lat,
                        lng: event.lng,
                }))
                .sort((left, right) => right.occurredAt - left.occurredAt)
                .slice(0, 5);
}

function buildActivePenaltyReports(
        students: StudentActivityBundle[],
): ActivePenaltyReport[] {
        return students
                .flatMap((bundle) =>
                        getStudentParkingViolations(bundle)
                                .filter((violation) => violation.active)
                                .map((violation) => ({
                                        key: violation.violation_uuid,
                                        name: formatStudentName(bundle.entry),
                                        detail: formatStudentDetail(bundle.entry),
                                        status: formatReportStatus(violation.status),
                                        description: violation.description || "No description provided.",
                                        deviceUUID: violation.registered_device_uuid ?? "",
                                        createdAt: violation.created_at,
                                })),
                )
                .sort((left, right) => right.createdAt - left.createdAt)
                .slice(0, 6);
}

function buildActivePenaltyReportStudents(
        students: StudentActivityBundle[],
): StudentPenaltyReportSummary[] {
        const summaryByStudent = new Map<string, StudentPenaltyReportSummary>();

        for (const bundle of students) {
                const activeReports = getStudentParkingViolations(bundle).filter(
                        (violation) => violation.active,
                );
                if (activeReports.length === 0) {
                        continue;
                }

                const userUUID = resolveStudentUserUUID(bundle.entry);
                const latestReport = activeReports.reduce((latest, violation) =>
                        violation.created_at > latest.created_at ? violation : latest,
                );
                summaryByStudent.set(userUUID, {
                        userUUID,
                        name: formatStudentName(bundle.entry),
                        detail: formatStudentDetail(bundle.entry),
                        count: activeReports.length,
                        lastCreatedAt: Math.max(
                                0,
                                ...activeReports.map((violation) => violation.created_at),
                        ),
                        latestViolationUUID: latestReport.violation_uuid,
                });
        }

        return Array.from(summaryByStudent.values())
                .sort((left, right) => {
                        if (left.count !== right.count) {
                                return right.count - left.count;
                        }
                        return right.lastCreatedAt - left.lastCreatedAt;
                })
                .slice(0, 5);
}

function buildDashboardVisuals(dataset: DashboardDataset): DashboardVisuals {
        const now = Date.now();
        const todayStart = startOfLocalDay(now);
        const tomorrowStart = todayStart + 86400;
        const yesterdayStart = todayStart - 86400;
        const weekStart = startOfLocalWeek(now);
        const allSessions = dataset.students.flatMap((bundle) => bundle.routeHistory);
        const todaySessions = allSessions.filter((session) =>
                isInRange(session.started_at, todayStart, tomorrowStart),
        );
        const yesterdaySessions = allSessions.filter((session) =>
                isInRange(session.started_at, yesterdayStart, todayStart),
        );
        const weekSessions = allSessions.filter((session) =>
                isInRange(session.started_at, weekStart),
        );
        const earnedPoints = allSessions.reduce(
                (sum, session) => sum + getRouteHistoryEarnedPoints(session),
                0,
        );
        const ridePenaltyRecords = getRidePenaltyRecords(dataset.students);
        const weeklyRidePenaltyRecords = getRidePenaltyRecords(
                dataset.students,
                weekStart,
        );
        const allPenaltyReports = dataset.students.flatMap((bundle) =>
                getStudentParkingViolations(bundle),
        );

        return {
                generatedAt: dataset.generatedAt,
                rosterCount: dataset.roster.length,
                activeRidersToday: new Set(
                        todaySessions.map((session) => session.user_uuid),
                ).size,
                activeRidersThisWeek: new Set(
                        weekSessions.map((session) => session.user_uuid),
                ).size,
                ridesToday: todaySessions.length,
                ridesYesterday: yesterdaySessions.length,
                ridesThisWeek: weekSessions.length,
                earnedPoints,
                bonusPoints: allSessions.reduce(
                        (sum, session) => sum + session.bonus_points,
                        0,
                ),
                poiVisits: allSessions.reduce(
                        (sum, session) => sum + session.visited_pois.length,
                        0,
                ),
                distanceMetersThisWeek: weekSessions.reduce(
                        (sum, session) => sum + session.distance_meters,
                        0,
                ),
                leaderboardToday: buildLeaderboard(
                        dataset.students,
                        todayStart,
                        tomorrowStart,
                ),
                leaderboardWeek: buildLeaderboard(dataset.students, weekStart),
                leaderboardAll: buildLeaderboard(dataset.students),
                poiRankings: buildPoiRankings(dataset, weekStart),
                ridePenaltyCount: ridePenaltyRecords.length,
                ridePenaltyCountThisWeek: weeklyRidePenaltyRecords.length,
                ridePenaltyPointsLost: ridePenaltyRecords.reduce(
                        (sum, { event }) => sum + event.points_lost,
                        0,
                ),
                ridePenaltyStudentCount: new Set(
                        ridePenaltyRecords.map(({ bundle }) =>
                                resolveStudentUserUUID(bundle.entry),
                        ),
                ).size,
                ridePenaltyTypes: buildRidePenaltyTypes(ridePenaltyRecords),
                ridePenaltyStudents: buildRidePenaltyStudents(ridePenaltyRecords),
                recentRidePenalties: buildRecentRidePenalties(ridePenaltyRecords),
                penaltyReportCount: allPenaltyReports.length,
                activePenaltyReportCount: allPenaltyReports.filter(
                        (violation) => violation.active,
                ).length,
                activePenaltyReportStudentCount: new Set(
                        dataset.students
                                .filter((bundle) =>
                                        getStudentParkingViolations(bundle).some(
                                                (violation) => violation.active,
                                        ),
                                )
                                .map((bundle) => resolveStudentUserUUID(bundle.entry)),
                ).size,
                activePenaltyReports: buildActivePenaltyReports(dataset.students),
                activePenaltyReportStudents: buildActivePenaltyReportStudents(
                        dataset.students,
                ),
                studentsLoadedWithErrors: dataset.students.filter((bundle) => bundle.error)
                        .length,
        };
}

function getInitials(name: string): string {
        return name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase();
}

function PoiRankings({ rankings }: { rankings: PoiRankingEntry[] }) {
        const maxVisits = Math.max(1, ...rankings.map((point) => point.visits));

        return (
                <div className="dashboard-poi-ranking-list">
                        {rankings.length === 0 ? (
                                <p className="reports-visual-empty">No POIs configured yet.</p>
                        ) : (
                                rankings.map((point, index) => {
                                        const width = Math.max(
                                                4,
                                                Math.round((point.visits / maxVisits) * 100),
                                        );

                                        return (
                                                <div className="dashboard-poi-ranking-row" key={point.key}>
                                                        <span className="dashboard-rank">{index + 1}</span>
                                                        <div className="dashboard-poi-ranking-main">
                                                                <div className="reports-bar-row-top">
                                                                        <span>{point.title}</span>
                                                                        <strong>{point.visits.toLocaleString()} visits</strong>
                                                                </div>
                                                                <div className="reports-bar-track">
                                                                        <div
                                                                                className="reports-bar-fill dashboard-poi-ranking-fill"
                                                                                style={{ width: `${width}%` }}
                                                                        />
                                                                </div>
                                                                <span className="dashboard-poi-ranking-meta">
                                                                        {point.uniqueStudents.toLocaleString()} students ·{" "}
                                                                        {point.bonusPoints.toLocaleString()} bonus points awarded ·{" "}
                                                                        {point.configuredBonusPoints.toLocaleString()} pts per visit
                                                                </span>
                                                        </div>
                                                </div>
                                        );
                                })
                        )}
                </div>
        );
}

function DashboardKpi({
        label,
        value,
        detail,
        to,
}: {
        label: string;
        value: string;
        detail: string;
        to?: string;
}) {
        const card = (
                <article className={`dashboard-kpi${to ? " dashboard-kpi--clickable" : ""}`}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                        {to ? <span className="dashboard-kpi-arrow" aria-hidden>→</span> : null}
                </article>
        );
        return to ? (
                <Link to={to} className="dashboard-kpi-link">
                        {card}
                </Link>
        ) : card;
}

function DashboardMiniKpi({
        label,
        value,
        detail,
}: {
        label: string;
        value: string;
        detail: string;
}) {
        return (
                <div className="dashboard-mini-kpi">
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{detail}</small>
                </div>
        );
}

function getIncomeCategoryAmount(
        window: SchoolIncomeWindow,
        categoryKey: string,
): number {
        return (
                window.categories.find((category) => category.key === categoryKey)
                        ?.amount_cents ?? 0
        );
}

function IncomeSummarySection({
        summary,
        loading,
        error,
}: {
        summary: SchoolIncomeSummary | null;
        loading: boolean;
        error: string;
}) {
        const currency = summary?.currency || "USD";
        const categoryMap = new Map<string, string>();
        for (const window of [
                summary?.windows.today,
                summary?.windows.past_week,
                summary?.windows.lifetime,
                summary?.windows.pending,
        ]) {
                for (const category of window?.categories ?? []) {
                        categoryMap.set(category.key, category.label);
                }
        }
        const categoryRows = Array.from(categoryMap.entries());

        return (
                <article className="dashboard-card dashboard-income-card">
                        <div className="reports-visual-heading-row">
                                <div className="reports-visual-heading">
                                        <h3>Income breakdown</h3>
                                        <p>Collected and awaiting-payment school fees by category.</p>
                                </div>
                                {summary ? (
                                        <small className="dashboard-income-updated">
                                                Updated{" "}
                                                {new Date(summary.generated_at * 1000).toLocaleTimeString([], {
                                                        hour: "numeric",
                                                        minute: "2-digit",
                                                })}
                                        </small>
                                ) : null}
                        </div>
                        {error ? <p className="error-text">{error}</p> : null}
                        {loading && !summary ? (
                                <p className="muted-text">Loading income totals...</p>
                        ) : null}
                        <div className="dashboard-income-table" role="table">
                                <div
                                        className="dashboard-income-row dashboard-income-row-heading"
                                        role="row">
                                        <span>Category</span>
                                        <span>Today</span>
                                        <span>Past week</span>
                                        <span>Lifetime</span>
                                        <span>Pending</span>
                                </div>
                                {categoryRows.length === 0 ? (
                                        <p className="reports-visual-empty">No fee income yet.</p>
                                ) : (
                                        categoryRows.map(([key, label]) => (
                                                <div className="dashboard-income-row" key={key} role="row">
                                                        <strong>{label}</strong>
                                                        <span>
                                                                {formatCurrencyCents(
                                                                        getIncomeCategoryAmount(
                                                                                summary?.windows.today ?? {
                                                                                        total_cents: 0,
                                                                                        categories: [],
                                                                                },
                                                                                key,
                                                                        ),
                                                                        currency,
                                                                )}
                                                        </span>
                                                        <span>
                                                                {formatCurrencyCents(
                                                                        getIncomeCategoryAmount(
                                                                                summary?.windows.past_week ?? {
                                                                                        total_cents: 0,
                                                                                        categories: [],
                                                                                },
                                                                                key,
                                                                        ),
                                                                        currency,
                                                                )}
                                                        </span>
                                                        <span>
                                                                {formatCurrencyCents(
                                                                        getIncomeCategoryAmount(
                                                                                summary?.windows.lifetime ?? {
                                                                                        total_cents: 0,
                                                                                        categories: [],
                                                                                },
                                                                                key,
                                                                        ),
                                                                        currency,
                                                                )}
                                                        </span>
                                                        <span className="dashboard-income-pending-value">
                                                                {formatCurrencyCents(
                                                                        getIncomeCategoryAmount(
                                                                                summary?.windows.pending ?? {
                                                                                        total_cents: 0,
                                                                                        categories: [],
                                                                                },
                                                                                key,
                                                                        ),
                                                                        currency,
                                                                )}
                                                        </span>
                                                </div>
                                        ))
                                )}
                        </div>
                </article>
        );
}

function DashboardSectionArrow({ to, label }: { to: string; label: string }) {
        return (
                <Link className="dashboard-section-arrow" to={to} aria-label={label}>
                        →
                </Link>
        );
}

function RidePenaltySection({ visuals }: { visuals: DashboardVisuals }) {
        const navigate = useNavigate();

        return (
                <article className="dashboard-card dashboard-penalty-card">
                        <div className="reports-visual-heading-row">
                                <div className="reports-visual-heading">
                                        <h3>Ride Penalties</h3>
                                        <p>Speed-limit and no-go events students have hit during rides.</p>
                                </div>
                                <DashboardSectionArrow to="/zones" label="Open School Zones" />
                        </div>
                        <div className="dashboard-penalty-kpi-grid">
                                <DashboardMiniKpi
                                        label="All ride penalties"
                                        value={visuals.ridePenaltyCount.toLocaleString()}
                                        detail={`${visuals.ridePenaltyCountThisWeek.toLocaleString()} this week`}
                                />
                                <DashboardMiniKpi
                                        label="Points lost"
                                        value={visuals.ridePenaltyPointsLost.toLocaleString()}
                                        detail="Across ride events"
                                />
                                <DashboardMiniKpi
                                        label="Students affected"
                                        value={visuals.ridePenaltyStudentCount.toLocaleString()}
                                        detail="Students"
                                />
                        </div>
                        <div className="dashboard-penalty-panel">
                                <h4>Penalty type mix</h4>
                                <PenaltyTypePieChart types={visuals.ridePenaltyTypes} />
                        </div>
                        <div className="dashboard-penalty-panel">
                                <h4>Recent ride penalties</h4>
                                <div className="dashboard-penalty-list">
                                        {visuals.recentRidePenalties.length === 0 ? (
                                                <p className="reports-visual-empty">No recent ride penalties.</p>
                                        ) : (
                                                visuals.recentRidePenalties.map((penalty) => (
                                                        <div
                                                                className="dashboard-penalty-row dashboard-penalty-row--clickable"
                                                                key={penalty.key}
                                                                title="View on Student Routes map"
                                                                onClick={() => {
                                                                        const params = new URLSearchParams({
                                                                                user: penalty.userUUID,
                                                                                session: penalty.sessionId,
                                                                                lat: String(penalty.lat),
                                                                                lng: String(penalty.lng),
                                                                        });
                                                                        navigate(`/routes?${params.toString()}`);
                                                                }}>
                                                                <div className="dashboard-penalty-copy">
                                                                        <strong>{penalty.name}</strong>
                                                                        <span>
                                                                                {penalty.title} · {penalty.zoneType}
                                                                        </span>
                                                                        <small>
                                                                                {penalty.reason} ·{" "}
                                                                                {formatDashboardTimestamp(penalty.occurredAt)}
                                                                        </small>
                                                                </div>
                                                                <div className="dashboard-penalty-score">
                                                                        <strong>{penalty.pointsLost.toLocaleString()}</strong>
                                                                        <span>pts lost</span>
                                                                </div>
                                                        </div>
                                                ))
                                        )}
                                </div>
                        </div>
                </article>
        );
}

function ActivePenaltyReportsSection({
        visuals,
}: {
        visuals: DashboardVisuals;
}) {
        const navigate = useNavigate();
        return (
                <article className="dashboard-card dashboard-penalty-card">
                        <div className="reports-visual-heading-row">
                                <div className="reports-visual-heading">
                                        <h3>Parking Enforcement Reports</h3>
                                        <p>Reports by Parking Enforcement</p>
                                </div>
                                <DashboardSectionArrow to="/penalty-reports" label="Penalty Reports" />
                        </div>
                        <div className="dashboard-penalty-kpi-grid">
                                <DashboardMiniKpi
                                        label="Active reports"
                                        value={visuals.activePenaltyReportCount.toLocaleString()}
                                        detail="Currently active"
                                />
                                <DashboardMiniKpi
                                        label="All reports"
                                        value={visuals.penaltyReportCount.toLocaleString()}
                                        detail="Active and archived"
                                />
                                <DashboardMiniKpi
                                        label="Students flagged"
                                        value={visuals.activePenaltyReportStudentCount.toLocaleString()}
                                        detail="Students"
                                />
                        </div>
                        <div className="dashboard-penalty-panel">
                                <h4>Latest active reports</h4>
                                <div className="dashboard-penalty-list">
                                        {visuals.activePenaltyReports.length === 0 ? (
                                                <p className="reports-visual-empty">No active reports to show.</p>
                                        ) : (
                                                visuals.activePenaltyReports.map((report) => (
                                                        <div
                                                                className="dashboard-penalty-row dashboard-penalty-row--clickable"
                                                                key={report.key}
                                                                title="Open penalty report"
                                                                onClick={() =>
                                                                        navigate(`/penalty-reports?report=${report.key}`)
                                                                }>
                                                                <div className="dashboard-penalty-copy">
                                                                        <strong>{report.name}</strong>
                                                                        <span>{report.description}</span>
                                                                        <small>
                                                                                {report.deviceUUID ? `Device ${report.deviceUUID} · ` : ""}
                                                                                {formatDashboardTimestamp(report.createdAt)}
                                                                        </small>
                                                                </div>
                                                                <span className="dashboard-penalty-chip">{report.status}</span>
                                                        </div>
                                                ))
                                        )}
                                </div>
                        </div>
                </article>
        );
}

function Leaderboard({
        entries,
        windowLabel,
}: {
        entries: LeaderboardEntry[];
        windowLabel: string;
}) {
        return (
                <div className="dashboard-leaderboard-list">
                        {entries.length === 0 ? (
                                <p className="reports-visual-empty">No points in this window yet.</p>
                        ) : (
                                entries.map((entry, index) => (
                                        <div className="dashboard-leaderboard-row" key={entry.userUUID}>
                                                <span className="dashboard-rank">{index + 1}</span>
                                                <span className="dashboard-avatar">
                                                        {getInitials(entry.name) || "S"}
                                                </span>
                                                <div className="dashboard-leaderboard-copy">
                                                        <strong>{entry.name}</strong>
                                                        <span>
                                                                {entry.detail || "Student"} · {entry.rideCount.toLocaleString()}{" "}
                                                                rides · {formatMiles(entry.distanceMeters)} mi
                                                        </span>
                                                </div>
                                                <div className="dashboard-leaderboard-score">
                                                        <strong>{entry.earnedPoints.toLocaleString()}</strong>
                                                        <span>{windowLabel} pts</span>
                                                </div>
                                        </div>
                                ))
                        )}
                </div>
        );
}

export function DashboardScreen({
        activeSchoolId,
        managedAppId,
        adminUserUUID,
        onHeaderCountsLoaded,
}: Props) {
        const [dataset, setDataset] = useState<DashboardDataset | null>(null);
        const [leaderboardWindow, setLeaderboardWindow] =
                useState<LeaderboardWindow>("week");
        const [loadState, setLoadState] = useState<DashboardLoadState>({
                status: "idle",
                message: "",
                completed: 0,
                total: 0,
        });
        const [incomeSummary, setIncomeSummary] =
                useState<SchoolIncomeSummary | null>(null);
        const [incomeLoading, setIncomeLoading] = useState(false);
        const [incomeError, setIncomeError] = useState("");
        const [deviceTotalCount, setDeviceTotalCount] = useState<number | null>(null);
        const [devicePendingCount, setDevicePendingCount] = useState<number | null>(null);

        const visuals = useMemo(
                () => (dataset ? buildDashboardVisuals(dataset) : null),
                [dataset],
        );
        const progressPercent =
                loadState.total > 0
                        ? Math.round((loadState.completed / loadState.total) * 100)
                        : 0;
        const leaderboardEntries =
                leaderboardWindow === "today"
                        ? visuals?.leaderboardToday
                        : leaderboardWindow === "week"
                                ? visuals?.leaderboardWeek
                                : visuals?.leaderboardAll;
        const leaderboardWindowLabel =
                leaderboardWindow === "today"
                        ? "today"
                        : leaderboardWindow === "week"
                                ? "week"
                                : "all-time";

        useEffect(() => {
                if (!activeSchoolId || !managedAppId) {
                        setDeviceTotalCount(null);
                        setDevicePendingCount(null);
                        return;
                }
                let cancelled = false;
                Promise.all([
                        fetchSchoolRegisteredDevices(managedAppId, activeSchoolId, ""),
                        fetchSchoolRegisteredDevices(managedAppId, activeSchoolId, "pending"),
                ])
                        .then(([all, pending]) => {
                                if (!cancelled) {
                                        setDeviceTotalCount(all.length);
                                        setDevicePendingCount(pending.length);
                                }
                        })
                        .catch(() => {
                                if (!cancelled) {
                                        setDeviceTotalCount(null);
                                        setDevicePendingCount(null);
                                }
                        });
                return () => { cancelled = true; };
        }, [activeSchoolId, managedAppId]);

        const loadIncomeSummary = useCallback(async () => {
                if (!activeSchoolId || !managedAppId) {
                        setIncomeSummary(null);
                        setIncomeError("");
                        return;
                }

                setIncomeLoading(true);
                setIncomeError("");
                try {
                        const now = Date.now();
                        const summary = await fetchSchoolIncomeSummary(
                                managedAppId,
                                activeSchoolId,
                                {
                                        todayStart: startOfLocalDay(now),
                                        pastWeekStart: startOfPastSevenDays(now),
                                },
                        );
                        setIncomeSummary(summary);
                } catch (error) {
                        setIncomeError(getErrorMessage(error));
                } finally {
                        setIncomeLoading(false);
                }
        }, [activeSchoolId, managedAppId]);

        const loadDashboardData = useCallback(async () => {
                if (!activeSchoolId || !managedAppId) {
                        setDataset(null);
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
                        message: "Loading school activity...",
                        completed: 0,
                        total: 0,
                });

                try {
                        const [roster, pois, pendingReservations] = await Promise.all([
                                fetchSchoolStudentRoster(managedAppId, activeSchoolId),
                                fetchSchoolPOIs(managedAppId, activeSchoolId).catch(
                                        () => [] as SchoolPOI[],
                                ),
                                adminUserUUID.trim()
                                        ? fetchPendingReservations(
                                                        adminUserUUID,
                                                        managedAppId,
                                                        activeSchoolId,
                                                ).catch(() => [])
                                        : Promise.resolve([]),
                        ]);

                        setLoadState({
                                status: "loading",
                                message: "Syncing student rides and reports...",
                                completed: 0,
                                total: roster.length,
                        });

                        const students = await mapWithConcurrency(
                                roster,
                                DASHBOARD_CONCURRENCY,
                                async (entry) => {
                                        const studentUserUUID = resolveStudentUserUUID(entry);
                                        const [routeHistoryResult, parkingViolationsResult] =
                                                await Promise.allSettled([
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
                                        const errors = [
                                                routeHistoryResult.status === "rejected"
                                                        ? `Route history: ${getErrorMessage(routeHistoryResult.reason)}`
                                                        : "",
                                                parkingViolationsResult.status === "rejected"
                                                        ? `Penalty reports: ${getErrorMessage(
                                                                        parkingViolationsResult.reason,
                                                                )}`
                                                        : "",
                                        ].filter(Boolean);

                                        return {
                                                entry,
                                                routeHistory:
                                                        routeHistoryResult.status === "fulfilled"
                                                                ? routeHistoryResult.value
                                                                : [],
                                                parkingViolations:
                                                        parkingViolationsResult.status === "fulfilled"
                                                                ? parkingViolationsResult.value
                                                                : [],
                                                error: errors.join("; "),
                                        } satisfies StudentActivityBundle;
                                },
                                (completed) => {
                                        setLoadState({
                                                status: "loading",
                                                message: "Syncing student rides and reports...",
                                                completed,
                                                total: roster.length,
                                        });
                                },
                        );

                        setDataset({
                                generatedAt: Math.floor(Date.now() / 1000),
                                roster,
                                pois,
                                students,
                        });
                        setLoadState({
                                status: "idle",
                                message: "",
                                completed: 0,
                                total: 0,
                        });
                        onHeaderCountsLoaded?.({
                                studentCount: roster.length,
                                pendingReservationCount: pendingReservations.length,
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
        }, [activeSchoolId, adminUserUUID, managedAppId, onHeaderCountsLoaded]);

        useEffect(() => {
                const timer = window.setTimeout(() => {
                        void loadDashboardData();
                        void loadIncomeSummary();
                }, 0);

                return () => {
                        window.clearTimeout(timer);
                };
        }, [loadDashboardData, loadIncomeSummary]);

        return (
                <section className="panel dashboard-home-section">
                        <div className="panel-header">
                                <div>
                                        <p className="eyebrow">Dashboard</p>
                                        <h2>Campus momentum</h2>
                                </div>
                                <button
                                        className="primary-button"
                                        type="button"
                                        onClick={() => {
                                                void loadDashboardData();
                                                void loadIncomeSummary();
                                        }}
                                        disabled={loadState.status === "loading" || !activeSchoolId}>
                                        {loadState.status === "loading"
                                                ? "Refreshing..."
                                                : "Refresh Dashboard"}
                                </button>
                        </div>

                        {!activeSchoolId ? (
                                <p className="empty-state">
                                        This admin login is not scoped to a school.
                                </p>
                        ) : null}

                        {loadState.status !== "idle" ? (
                                <div
                                        className={`reports-status reports-status-${loadState.status}`}
                                        aria-live="polite">
                                        <div className="reports-status-copy">
                                                <strong>{loadState.message}</strong>
                                                {loadState.status === "ready" ? (
                                                        <button
                                                                className="reports-status-dismiss"
                                                                type="button"
                                                                onClick={() =>
                                                                        setLoadState({
                                                                                status: "idle",
                                                                                message: "",
                                                                                completed: 0,
                                                                                total: 0,
                                                                        })
                                                                }>
                                                                Dismiss
                                                        </button>
                                                ) : loadState.total > 0 ? (
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

                        {visuals ? (
                                <>
                                        <div className="dashboard-summary-row">
                                                <Link className="dashboard-summary-stat dashboard-summary-stat-link" to="/students">
                                                        <span className="dashboard-summary-label">Registered students</span>
                                                        <strong className="dashboard-summary-value">{visuals.rosterCount.toLocaleString()}</strong>
                                                        <small className="dashboard-summary-detail">Students under this school →</small>
                                                </Link>
                                                <div className="dashboard-summary-divider" />
                                                <div className="dashboard-summary-stat">
                                                        <span className="dashboard-summary-label">Total registered devices</span>
                                                        <strong className="dashboard-summary-value">
                                                                {deviceTotalCount !== null ? deviceTotalCount.toLocaleString() : "—"}
                                                        </strong>
                                                        <small className="dashboard-summary-detail">All vehicle registrations</small>
                                                </div>
                                                <div className="dashboard-summary-divider" />
                                                <Link className="dashboard-summary-stat dashboard-summary-stat-pending dashboard-summary-stat-link" to="/vehicle-registrations">
                                                        <span className="dashboard-summary-label">Pending review</span>
                                                        <strong className="dashboard-summary-value">
                                                                {devicePendingCount !== null ? devicePendingCount.toLocaleString() : "—"}
                                                        </strong>
                                                        <small className="dashboard-summary-detail">Devices awaiting approval →</small>
                                                </Link>
                                        </div>

                                        <div className="dashboard-hero-grid">
                                                <article className="dashboard-hero-card">
                                                        <span>All-time student points</span>
                                                        <div className="dashboard-hero-points-balance">
                                                                <div className="dashboard-hero-points-earned">
                                                                        <small>Earned</small>
                                                                        <FitText className="stat-value">
                                                                                +{formatCompactNumber(visuals.earnedPoints)}
                                                                        </FitText>
                                                                </div>
                                                                <div className="dashboard-hero-points-lost">
                                                                        <small>Lost</small>
                                                                        <strong>
                                                                                -{formatCompactNumber(visuals.ridePenaltyPointsLost)}
                                                                        </strong>
                                                                </div>
                                                        </div>
                                                </article>
                                                <DashboardKpi
                                                        label="Rides today"
                                                        value={visuals.ridesToday.toLocaleString()}
                                                        detail={`${visuals.activeRidersToday.toLocaleString()} active riders`}
                                                        to="/routes?view=time&dateFilter=today"
                                                />
                                                <DashboardKpi
                                                        label="Rides yesterday"
                                                        value={visuals.ridesYesterday.toLocaleString()}
                                                        detail="Daily comparison"
                                                        to="/routes?view=time&dateFilter=yesterday"
                                                />
                                                <DashboardKpi
                                                        label="This week"
                                                        value={visuals.ridesThisWeek.toLocaleString()}
                                                        detail={`${visuals.activeRidersThisWeek.toLocaleString()} riders · ${formatMiles(
                                                                visuals.distanceMetersThisWeek,
                                                        )} mi`}
                                                        to="/routes?view=time&dateFilter=week"
                                                />
                                                <DashboardKpi
                                                        label="POI visits"
                                                        value={visuals.poiVisits.toLocaleString()}
                                                        detail={`${visuals.poiRankings.filter((point) => point.visits > 0).length.toLocaleString()} POIs getting the most traffic`}
                                                        to="/routes?view=time&tab=pois&contentFilter=pois"
                                                />
                                        </div>

                                        <div className="dashboard-main-grid">
                                                <article className="dashboard-card dashboard-leaderboard-card">
                                                        <div className="reports-visual-heading-row">
                                                                <div className="reports-visual-heading">
                                                                        <h3>Student leaderboard</h3>
                                                                        <p>Points earned from rides and POI bonuses.</p>
                                                                </div>
                                                                <div className="dashboard-heading-actions">
                                                                        <div className="dashboard-segmented">
                                                                                {(["today", "week", "all"] as const).map((windowKey) => (
                                                                                        <button
                                                                                                className={
                                                                                                        leaderboardWindow === windowKey
                                                                                                                ? "dashboard-segment dashboard-segment-active"
                                                                                                                : "dashboard-segment"
                                                                                                }
                                                                                                key={windowKey}
                                                                                                type="button"
                                                                                                onClick={() => setLeaderboardWindow(windowKey)}>
                                                                                                {windowKey === "all" ? "All time" : windowKey}
                                                                                        </button>
                                                                                ))}
                                                                        </div>
                                                                        <DashboardSectionArrow to="/students" label="Open Students" />
                                                                </div>
                                                        </div>
                                                        <Leaderboard
                                                                entries={leaderboardEntries ?? []}
                                                                windowLabel={leaderboardWindowLabel}
                                                        />
                                                </article>

                                                <article className="dashboard-card">
                                                        <div className="reports-visual-heading-row">
                                                                <div className="reports-visual-heading">
                                                                        <h3>Student points earned</h3>
                                                                        <p>
                                                                                Top earners turn routes and POI visits into campus momentum.
                                                                        </p>
                                                                </div>
                                                                <DashboardSectionArrow to="/students" label="Open Students" />
                                                        </div>
                                                        <div className="dashboard-points-bars">
                                                                {(visuals.leaderboardAll.length > 0
                                                                        ? visuals.leaderboardAll.slice(0, 7)
                                                                        : visuals.leaderboardWeek.slice(0, 7)
                                                                ).map((entry) => {
                                                                        const max = Math.max(
                                                                                1,
                                                                                ...visuals.leaderboardAll.map((item) => item.earnedPoints),
                                                                                ...visuals.leaderboardWeek.map((item) => item.earnedPoints),
                                                                        );
                                                                        const width = Math.max(
                                                                                5,
                                                                                Math.round((entry.earnedPoints / max) * 100),
                                                                        );

                                                                        return (
                                                                                <div className="dashboard-points-row" key={entry.userUUID}>
                                                                                        <div className="reports-bar-row-top">
                                                                                                <span>{entry.name}</span>
                                                                                                <strong>{entry.earnedPoints.toLocaleString()}</strong>
                                                                                        </div>
                                                                                        <div className="reports-bar-track">
                                                                                                <div
                                                                                                        className="reports-bar-fill dashboard-points-fill"
                                                                                                        style={{ width: `${width}%` }}
                                                                                                />
                                                                                        </div>
                                                                                </div>
                                                                        );
                                                                })}
                                                        </div>
                                                </article>
                                        </div>

                                        <article className="dashboard-card dashboard-poi-card">
                                                <div className="reports-visual-heading-row">
                                                        <div className="reports-visual-heading">
                                                                <h3>POI rankings</h3>
                                                                <p>Which POIs are pulling students in this week.</p>
                                                        </div>
                                                        <DashboardSectionArrow to="/pois" label="Open School POIs" />
                                                </div>
                                                <PoiRankings rankings={visuals.poiRankings} />
                                        </article>

                                        <div className="dashboard-penalty-grid">
                                                <RidePenaltySection visuals={visuals} />
                                                <ActivePenaltyReportsSection visuals={visuals} />
                                        </div>

                                        <IncomeSummarySection
                                                summary={incomeSummary}
                                                loading={incomeLoading}
                                                error={incomeError}
                                        />

                                        <div className="dashboard-footnote-grid">
                                                <DashboardKpi
                                                        label="Registered students"
                                                        value={visuals.rosterCount.toLocaleString()}
                                                        detail="Students under this school"
                                                />
                                                <DashboardKpi
                                                        label="Updated"
                                                        value={new Date(visuals.generatedAt * 1000).toLocaleTimeString(
                                                                [],
                                                                {
                                                                        hour: "numeric",
                                                                        minute: "2-digit",
                                                                },
                                                        )}
                                                        detail="Latest refresh"
                                                />
                                        </div>
                                </>
                        ) : null}
                </section>
        );
}
