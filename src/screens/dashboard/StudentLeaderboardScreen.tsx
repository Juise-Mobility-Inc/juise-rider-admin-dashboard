import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchSchoolStudentRoster,
  fetchStudentRouteHistory,
  type SchoolStudentRosterEntry,
  type StudentRouteHistorySession,
} from "../../lib/api";
import { getRouteHistoryEarnedPoints } from "../../lib/routeHistoryPoints";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type LeaderboardWindow = "today" | "week" | "all";

type StudentActivityBundle = {
  entry: SchoolStudentRosterEntry;
  routeHistory: StudentRouteHistorySession[];
  error: string;
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

type LoadState =
  | { status: "idle" }
  | { status: "loading"; message: string; completed: number; total: number }
  | { status: "ready" }
  | { status: "error"; message: string };

const LEADERBOARD_CONCURRENCY = 5;

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

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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
    });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress: (completed: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runNext(): Promise<void> {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= items.length) {
      return;
    }
    results[currentIndex] = await worker(items[currentIndex], currentIndex);
    completed += 1;
    onProgress(completed);
    await runNext();
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runNext(),
  );
  await Promise.all(workers);
  return results;
}

export function StudentLeaderboardScreen({ activeSchoolId, managedAppId }: Props) {
  const [students, setStudents] = useState<StudentActivityBundle[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [leaderboardWindow, setLeaderboardWindow] =
    useState<LeaderboardWindow>("all");
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    if (!activeSchoolId || !managedAppId) {
      setStudents([]);
      setLoadState({
        status: "error",
        message: "A school-scoped admin session is required.",
      });
      return;
    }

    setLoadState({
      status: "loading",
      message: "Loading student roster...",
      completed: 0,
      total: 0,
    });

    try {
      const roster = await fetchSchoolStudentRoster(managedAppId, activeSchoolId);

      setLoadState({
        status: "loading",
        message: "Syncing student rides...",
        completed: 0,
        total: roster.length,
      });

      const bundles = await mapWithConcurrency(
        roster,
        LEADERBOARD_CONCURRENCY,
        async (entry) => {
          const studentUserUUID = resolveStudentUserUUID(entry);
          try {
            const routeHistory = await fetchStudentRouteHistory(
              managedAppId,
              activeSchoolId,
              studentUserUUID,
            );
            return { entry, routeHistory, error: "" } satisfies StudentActivityBundle;
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

      setStudents(bundles);
      setLoadState({ status: "ready" });
    } catch (error) {
      setStudents([]);
      setLoadState({ status: "error", message: getErrorMessage(error) });
    }
  }, [activeSchoolId, managedAppId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const now = Date.now();
  const todayStart = useMemo(() => startOfLocalDay(now), [now]);
  const weekStart = useMemo(() => startOfLocalWeek(now), [now]);

  const leaderboardEntries = useMemo(() => {
    if (leaderboardWindow === "today") {
      return buildLeaderboard(students, todayStart);
    }
    if (leaderboardWindow === "week") {
      return buildLeaderboard(students, weekStart);
    }
    return buildLeaderboard(students);
  }, [students, leaderboardWindow, todayStart, weekStart]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return leaderboardEntries;
    return leaderboardEntries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(query) ||
        entry.detail.toLowerCase().includes(query),
    );
  }, [leaderboardEntries, search]);

  const windowLabel =
    leaderboardWindow === "today"
      ? "today"
      : leaderboardWindow === "week"
        ? "week"
        : "all-time";

  const isLoading = loadState.status === "loading";

  return (
    <section className="dashboard-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">Student activity</p>
          <h2>Full Student Leaderboard</h2>
          <p className="muted-text">
            Every student ranked by points earned from rides and POI bonuses.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void loadData()}
        >
          Refresh
        </button>
      </div>

      <div className="reg-table-tools">
        <div className="segmented-control">
          {(["today", "week", "all"] as const).map((windowKey) => (
            <button
              key={windowKey}
              type="button"
              className={leaderboardWindow === windowKey ? "segment-active" : ""}
              onClick={() => setLeaderboardWindow(windowKey)}
            >
              {windowKey === "all" ? "All time" : windowKey}
            </button>
          ))}
        </div>
        <input
          className="reg-table-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student name or ID..."
        />
      </div>

      {loadState.status === "error" ? (
        <p className="error-text">{loadState.message}</p>
      ) : null}
      {isLoading ? (
        <div className="dashboard-load-progress">
          <p className="muted-text">
            {loadState.message}
            {loadState.total > 0
              ? ` (${loadState.completed.toLocaleString()}/${loadState.total.toLocaleString()})`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="management-table-card reg-table-card">
        <div className="reg-table-summary">
          <strong>{visibleEntries.length.toLocaleString()} students</strong>
          <span>Ranked by {windowLabel} points</span>
        </div>
        {visibleEntries.length === 0 && !isLoading ? (
          <p className="cd-empty">No students match this filter.</p>
        ) : (
          <div className="dashboard-leaderboard-list dashboard-leaderboard-list-full">
            {visibleEntries.map((entry, index) => (
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
