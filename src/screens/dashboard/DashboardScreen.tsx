import { useCallback, useEffect, useMemo, useState } from "react";

import {
	fetchSchoolPOIs,
	fetchSchoolStudentRoster,
	fetchStudentRouteHistory,
	type SchoolPOI,
	type SchoolStudentRosterEntry,
	type StudentRouteHistorySession,
} from "../../lib/api";

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
	studentsLoadedWithErrors: number;
};

type Props = {
	activeSchoolId: string;
	managedAppId: string;
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

function formatCompactNumber(value: number): string {
	return new Intl.NumberFormat("en-US", {
		notation: value >= 10000 ? "compact" : "standard",
		maximumFractionDigits: value >= 1000 ? 1 : 0,
	}).format(value);
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

function isInRange(timestamp: number, from: number, to?: number): boolean {
	if (!Number.isFinite(timestamp) || timestamp <= 0) {
		return false;
	}
	if (timestamp < from) {
		return false;
	}
	return typeof to === "number" ? timestamp < to : true;
}

function isManualRoute(session: StudentRouteHistorySession): boolean {
	return session.tracking_source.trim().toLowerCase() !== "auto";
}

function calculateEarnedPoints(session: StudentRouteHistorySession): number {
	const routePointPoints = isManualRoute(session) ? session.points.length : 0;
	return routePointPoints + session.bonus_points;
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

function buildLeaderboard(
	students: StudentActivityBundle[],
	from?: number,
	to?: number,
): LeaderboardEntry[] {
	return students
		.map((bundle) => {
			const sessions = filterSessions(bundle, from, to);
			const earnedPoints = sessions.reduce(
				(sum, session) => sum + calculateEarnedPoints(session),
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
			const studentId = bundle.entry.membership.student_id.trim();

			return {
				userUUID: resolveStudentUserUUID(bundle.entry),
				name: formatStudentName(bundle.entry),
				detail:
					studentId || bundle.entry.user.email || bundle.entry.user.username,
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
		(sum, session) => sum + calculateEarnedPoints(session),
		0,
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
					const width = Math.max(4, Math.round((point.visits / maxVisits) * 100));

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
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<article className="dashboard-kpi">
			<span>{label}</span>
			<strong>{value}</strong>
			<small>{detail}</small>
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

export function DashboardScreen({ activeSchoolId, managedAppId }: Props) {
	const [dataset, setDataset] = useState<DashboardDataset | null>(null);
	const [leaderboardWindow, setLeaderboardWindow] =
		useState<LeaderboardWindow>("week");
	const [loadState, setLoadState] = useState<DashboardLoadState>({
		status: "idle",
		message: "",
		completed: 0,
		total: 0,
	});

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
			const [roster, pois] = await Promise.all([
				fetchSchoolStudentRoster(managedAppId, activeSchoolId),
				fetchSchoolPOIs(managedAppId, activeSchoolId).catch(
					() => [] as SchoolPOI[],
				),
			]);

			setLoadState({
				status: "loading",
				message: "Syncing student rides...",
				completed: 0,
				total: roster.length,
			});

			const students = await mapWithConcurrency(
				roster,
				DASHBOARD_CONCURRENCY,
				async (entry) => {
					const studentUserUUID = resolveStudentUserUUID(entry);
					try {
						return {
							entry,
							routeHistory: await fetchStudentRouteHistory(
								managedAppId,
								activeSchoolId,
								studentUserUUID,
							),
							error: "",
						} satisfies StudentActivityBundle;
					} catch (error) {
						return {
							entry,
							routeHistory: [],
							error: getErrorMessage(error),
						} satisfies StudentActivityBundle;
					}
				},
				(completed) => {
					setLoadState({
						status: "loading",
						message: "Syncing student rides...",
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
				status: "ready",
				message: `Dashboard ready for ${roster.length.toLocaleString()} students.`,
				completed: roster.length,
				total: roster.length,
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
	}, [activeSchoolId, managedAppId]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			void loadDashboardData();
		}, 0);

		return () => {
			window.clearTimeout(timer);
		};
	}, [loadDashboardData]);

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
					onClick={() => void loadDashboardData()}
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

			{visuals ? (
				<>
					<div className="dashboard-hero-grid">
						<article className="dashboard-hero-card">
							<span>All-time student points earned</span>
							<strong>{formatCompactNumber(visuals.earnedPoints)}</strong>
							<small>
								{formatCompactNumber(visuals.bonusPoints)} bonus points from
								POIs
							</small>
						</article>
						<DashboardKpi
							label="Rides today"
							value={visuals.ridesToday.toLocaleString()}
							detail={`${visuals.activeRidersToday.toLocaleString()} active riders`}
						/>
						<DashboardKpi
							label="Rides yesterday"
							value={visuals.ridesYesterday.toLocaleString()}
							detail="Daily comparison"
						/>
						<DashboardKpi
							label="This week"
							value={visuals.ridesThisWeek.toLocaleString()}
							detail={`${visuals.activeRidersThisWeek.toLocaleString()} riders · ${formatMiles(
								visuals.distanceMetersThisWeek,
							)} mi`}
						/>
						<DashboardKpi
							label="POI visits"
							value={visuals.poiVisits.toLocaleString()}
							detail={`${visuals.poiRankings.filter((point) => point.visits > 0).length.toLocaleString()} POIs getting traffic`}
						/>
					</div>

					<div className="dashboard-main-grid">
						<article className="dashboard-card dashboard-leaderboard-card">
							<div className="reports-visual-heading-row">
								<div className="reports-visual-heading">
									<h3>Student leaderboard</h3>
									<p>Points earned from rides and POI bonuses.</p>
								</div>
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
							</div>
							<Leaderboard
								entries={leaderboardEntries ?? []}
								windowLabel={leaderboardWindowLabel}
							/>
						</article>

						<article className="dashboard-card">
							<div className="reports-visual-heading">
								<h3>Student points earned</h3>
								<p>
									Top earners turn routes and POI visits into campus momentum.
								</p>
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
						<div className="reports-visual-heading">
							<h3>POI rankings</h3>
							<p>Which POIs are pulling students in this week.</p>
						</div>
						<PoiRankings rankings={visuals.poiRankings} />
					</article>

					<div className="dashboard-footnote-grid">
						<DashboardKpi
							label="Roster"
							value={visuals.rosterCount.toLocaleString()}
							detail="Students in scope"
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
