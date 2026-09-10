import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  fetchSchoolSocialPostReport,
  fetchSchoolSocialPostReports,
  resolveSchoolSocialPostReport,
  type SocialModerationUser,
  type SocialPostReportAction,
  type SocialPostReportDetail,
  type SocialPostReportSummary,
} from "../../lib/api";
import { useDetailParamSync } from "../../lib/useDetailParamSync";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type StatusTab = "open" | "resolved";

const PAGE_SIZE = 50;

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate speech",
  violence: "Violence",
  sexual: "Sexual content",
  self_harm: "Self-harm",
  other: "Other",
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

function userLabel(user?: SocialModerationUser): string {
  if (!user) {
    return "Unknown rider";
  }
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.username || user.email || user.user_uuid;
}

function formatWhen(seconds: number): string {
  if (!seconds) {
    return "—";
  }
  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function PostReportsScreen({ activeSchoolId, managedAppId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Keep the tab in the URL so a link to a report opened under "Resolved"
  // reloads on that tab — otherwise the default "open" query never contains
  // the linked row and the detail can't be restored.
  // The tab is derived from the URL every render (no separate state that could
  // lag ?tab= on a Back/Forward), so URL-sync readiness is always keyed to the
  // tab actually requested.
  const tab: StatusTab =
    searchParams.get("tab") === "resolved" ? "resolved" : "open";
  const changeTab = useCallback(
    (next: StatusTab) => {
      // Drop any open report from the URL rather than carrying an id from the
      // other tab into it, and push a new entry so Back returns to the
      // still-valid detail view instead of a tab/report mismatch.
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.delete("report");
        if (next === "resolved") {
          params.set("tab", "resolved");
        } else {
          params.delete("tab");
        }
        return params;
      });
    },
    [setSearchParams],
  );
  const [summaries, setSummaries] = useState<SocialPostReportSummary[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedActivityUUID, setSelectedActivityUUID] = useState("");
  const [detail, setDetail] = useState<SocialPostReportDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // The scope (school|tab) whose rows are currently in `summaries`. The URL
  // sync is only "ready" when this matches the rendered scope, so a combined
  // ?tab=&report= Back waits for the RIGHT list before matching the report id.
  const currentScope = `${activeSchoolId}|${tab}`;
  const [loadedScope, setLoadedScope] = useState("");
  const scopeReady = loadedScope === currentScope;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Monotonic request ids so a slow response for a stale tab/school/report
  // can't overwrite the current view.
  const listReqRef = useRef(0);
  const detailReqRef = useRef(0);
  // A `?report=` deep link whose row isn't on the loaded pages yet — keep
  // paging until it appears or the queue is exhausted.
  const pendingDeepLinkRef = useRef<string | null>(null);

  const refreshList = useCallback(async () => {
    if (!activeSchoolId) {
      setSummaries([]);
      return;
    }
    const reqId = ++listReqRef.current;
    // A full refresh supersedes any in-flight load-more (whose guarded finally
    // will now skip); clear its busy flag here so the button isn't stuck.
    setLoadingMore(false);
    const reqTab = tab;
    const reqSchool = activeSchoolId;
    setListBusy(true);
    setError("");
    try {
      const rows = await fetchSchoolSocialPostReports(managedAppId, reqSchool, {
        status: reqTab,
        limit: PAGE_SIZE,
      });
      if (reqId !== listReqRef.current) {
        return;
      }
      setSummaries(rows);
      setHasMore(rows.length >= PAGE_SIZE);
      // Mark the scope these rows belong to. Only a successful load counts —
      // a failure leaves scopeReady false so the URL sync retries after a
      // Refresh instead of consuming the param against an empty list.
      setLoadedScope(`${reqSchool}|${reqTab}`);
    } catch (nextError) {
      if (reqId !== listReqRef.current) {
        return;
      }
      setError(getErrorMessage(nextError));
      setSummaries([]);
      // A failed refresh clears the rows, so the scope is no longer "loaded" —
      // otherwise the URL sync would match a report id against an empty list
      // and never retry after the next successful refresh.
      setLoadedScope("");
    } finally {
      if (reqId === listReqRef.current) {
        setListBusy(false);
      }
    }
  }, [activeSchoolId, managedAppId, tab]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // Always call the latest refreshList (bound to the current tab/school), even
  // from an async action started under a previous tab.
  const refreshListRef = useRef(refreshList);
  useEffect(() => {
    refreshListRef.current = refreshList;
  }, [refreshList]);

  // Page past the server's per-request cap so no reported post is unreachable.
  const loadMore = useCallback(async () => {
    // Never page while a full list load is running — loadMore shares
    // listReqRef and would invalidate the refresh, leaving it stuck.
    if (!activeSchoolId || loadingMore || listBusy) {
      return;
    }
    // Share the list request generation so a scope change (which bumps it via
    // refreshList / the clearing effect) discards this response too.
    const reqId = ++listReqRef.current;
    setLoadingMore(true);
    setError("");
    try {
      const rows = await fetchSchoolSocialPostReports(managedAppId, activeSchoolId, {
        status: tab,
        limit: PAGE_SIZE,
        offset: summaries.length,
      });
      if (reqId !== listReqRef.current) {
        return;
      }
      setSummaries((prev) => {
        const seen = new Set(prev.map((row) => row.report.activity_uuid));
        return [
          ...prev,
          ...rows.filter((row) => !seen.has(row.report.activity_uuid)),
        ];
      });
      setHasMore(rows.length >= PAGE_SIZE);
    } catch (nextError) {
      if (reqId === listReqRef.current) {
        setError(getErrorMessage(nextError));
        // Stop the deep-link effect from re-firing loadMore in a loop on a
        // persistent failure — the moderator can retry with the button.
        pendingDeepLinkRef.current = null;
      }
    } finally {
      if (reqId === listReqRef.current) {
        setLoadingMore(false);
      }
    }
  }, [activeSchoolId, listBusy, loadingMore, managedAppId, summaries.length, tab]);

  // Changing the scope (tab or school) means the current list no longer
  // contains the selected report — drop the stale rows and detail and
  // invalidate any in-flight detail load so nothing from the old scope stays
  // clickable (and actionable) while the new list loads. `scopeReady` already
  // goes false synchronously (loadedScope !== currentScope), so the URL sync
  // holds until the new scope's rows arrive without an extra effect.
  useEffect(() => {
    detailReqRef.current += 1;
    pendingDeepLinkRef.current = null;
    setSummaries([]);
    setSelectedActivityUUID("");
    setDetail(null);
    setDetailBusy(false);
    setNotice("");
    // Reset pagination for the new scope — and clear loadingMore so a stale
    // load-more (whose finally is now request-guarded) can't leave the button
    // disabled.
    setHasMore(false);
    setLoadingMore(false);
  }, [activeSchoolId, tab]);

  const selectedSummary = useMemo(
    () =>
      summaries.find((row) => row.report.activity_uuid === selectedActivityUUID) ??
      null,
    [summaries, selectedActivityUUID],
  );

  const reporterByUUID = useMemo(() => {
    const map = new Map<string, SocialModerationUser>();
    for (const reporter of detail?.reporters ?? []) {
      if (reporter.user_uuid) {
        map.set(reporter.user_uuid, reporter);
      }
    }
    return map;
  }, [detail]);

  const loadDetail = useCallback(
    async (reportUUID: string, activityUUID: string) => {
      const reqId = ++detailReqRef.current;
      setSelectedActivityUUID(activityUUID);
      // Drop the previous report's detail immediately so its Remove / Ban
      // buttons can't be fired against the wrong post while this loads.
      setDetail(null);
      setDetailBusy(true);
      setNotice("");
      // Clear any stale banner from a previous failed load/action so it
      // doesn't sit above a report that actually loaded fine.
      setError("");
      try {
        const next = await fetchSchoolSocialPostReport(
          managedAppId,
          activeSchoolId,
          reportUUID,
        );
        if (reqId !== detailReqRef.current) {
          return;
        }
        setDetail(next);
      } catch (nextError) {
        if (reqId !== detailReqRef.current) {
          return;
        }
        setError(getErrorMessage(nextError));
        setDetail(null);
        // The load failed, so there's no valid detail to keep in the URL.
        setSelectedActivityUUID("");
      } finally {
        if (reqId === detailReqRef.current) {
          setDetailBusy(false);
        }
      }
    },
    [managedAppId, activeSchoolId],
  );

  // Keep the open report in the URL so browser back/forward closes/reopens the
  // detail and a `?report=<activity_uuid>` link restores it once the list is in.
  // Track selectedActivityUUID directly (not `detail && ...`) so switching from
  // one report to another goes A -> B in history, not A -> "" -> B; a failed
  // load clears selectedActivityUUID so nothing broken lingers in the URL.
  useDetailParamSync(
    "report",
    selectedActivityUUID,
    (value) => {
      if (!value) {
        detailReqRef.current += 1;
        pendingDeepLinkRef.current = null;
        setSelectedActivityUUID("");
        setDetail(null);
        setNotice("");
        return;
      }
      const match = summaries.find(
        (row) => row.report.activity_uuid === value,
      );
      if (match) {
        pendingDeepLinkRef.current = null;
        void loadDetail(match.report.report_uuid, value);
      } else if (hasMore) {
        // The linked report is on a later page — page toward it (the effect
        // below keeps going until it's found or the queue runs out).
        pendingDeepLinkRef.current = value;
        void loadMore();
      }
    },
    scopeReady,
  );

  // Drive `?report=` deep links that point past the loaded pages: page until
  // the row shows up (then open it) or the queue is exhausted.
  useEffect(() => {
    const wanted = pendingDeepLinkRef.current;
    if (!wanted || !scopeReady || loadingMore) {
      return;
    }
    const match = summaries.find(
      (row) => row.report.activity_uuid === wanted,
    );
    if (match) {
      pendingDeepLinkRef.current = null;
      if (selectedActivityUUID !== wanted) {
        void loadDetail(match.report.report_uuid, wanted);
      }
    } else if (hasMore) {
      void loadMore();
    } else {
      pendingDeepLinkRef.current = null;
    }
  }, [
    summaries,
    hasMore,
    loadingMore,
    scopeReady,
    selectedActivityUUID,
    loadDetail,
    loadMore,
  ]);

  async function applyAction(action: SocialPostReportAction) {
    if (!detail) {
      return;
    }
    const anchor = detail.reports[0];
    if (!anchor) {
      return;
    }
    const confirmCopy =
      action === "remove_post"
        ? "Remove this post from the feed?"
        : action === "ban_user"
          ? `Remove the post and ban ${userLabel(detail.reported_user)} from Social?`
          : "Dismiss every report on this post and restore it?";
    if (!window.confirm(confirmCopy)) {
      return;
    }
    // Pin the detail request this action belongs to; if the moderator selects a
    // different report before the response lands, don't clobber the new view —
    // but the server change still happened, so always refresh the list and
    // always release the busy state.
    const reqId = detailReqRef.current;
    setActionBusy(true);
    try {
      const updated = await resolveSchoolSocialPostReport(
        managedAppId,
        activeSchoolId,
        anchor.report_uuid,
        action,
      );
      if (reqId === detailReqRef.current) {
        setDetail(updated);
        setNotice(
          action === "dismiss"
            ? "Reports dismissed. Post restored."
            : action === "ban_user"
              ? "Post removed and rider banned from Social."
              : "Post removed.",
        );
      }
      await refreshListRef.current();
    } catch (nextError) {
      if (reqId === detailReqRef.current) {
        setError(getErrorMessage(nextError));
      }
    } finally {
      setActionBusy(false);
    }
  }

  if (!activeSchoolId) {
    return (
      <section className="panel">
        <p className="empty-state">This admin login is not scoped to a school.</p>
      </section>
    );
  }

  return (
    <section className="management-page post-reports-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Trust &amp; Safety</p>
            <h2>Post Reports</h2>
            <p className="muted-text">
              Riders' reports on Social posts. A post is auto-hidden once three
              different riders report it.
            </p>
          </div>
          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void refreshList()}
              disabled={listBusy}
            >
              {listBusy ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="post-reports-tabs">
          {(["open", "resolved"] as StatusTab[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`challenge-screen-tab ${tab === value ? "challenge-screen-tab-active" : ""}`}
              onClick={() => changeTab(value)}
            >
              {value === "open" ? "Open" : "Resolved"}
            </button>
          ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="post-reports-layout">
          <div className="post-reports-list">
            {summaries.length === 0 && !listBusy ? (
              <p className="empty-state">
                {tab === "open"
                  ? "No open post reports. Nice."
                  : "No resolved reports yet."}
              </p>
            ) : (
              summaries.map((row) => {
                const isSelected =
                  row.report.activity_uuid === selectedActivityUUID;
                return (
                  <button
                    key={row.report.activity_uuid}
                    type="button"
                    className={`post-reports-row ${isSelected ? "is-selected" : ""}`}
                    onClick={() =>
                      void loadDetail(
                        row.report.report_uuid,
                        row.report.activity_uuid,
                      )
                    }
                  >
                    <div className="post-reports-row-head">
                      <strong>{userLabel(row.reported_user)}</strong>
                      <span className="post-reports-count">
                        {row.report_count}{" "}
                        {row.report_count === 1 ? "report" : "reports"}
                      </span>
                    </div>
                    <p className="post-reports-snippet">
                      {row.post_text.trim() || "(no text)"}
                    </p>
                    <div className="post-reports-row-meta">
                      <span className="challenge-status-badge">
                        {reasonLabel(row.report.reason)}
                      </span>
                      {row.post_hidden ? (
                        <span className="challenge-status-badge challenge-status-ended">
                          Hidden
                        </span>
                      ) : null}
                      {!row.post_active ? (
                        <span className="challenge-status-badge challenge-status-ended">
                          Removed
                        </span>
                      ) : null}
                      {row.report.status !== "open" ? (
                        <span className="challenge-status-badge">
                          {row.report.status === "actioned"
                            ? "Actioned"
                            : "Dismissed"}
                        </span>
                      ) : null}
                      <span className="muted-text">
                        {formatWhen(row.report.created_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
            {hasMore ? (
              <button
                className="secondary-button post-reports-load-more"
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore || listBusy}
              >
                {loadingMore ? "Loading…" : "Load older reports"}
              </button>
            ) : null}
          </div>

          <div className="post-reports-detail panel">
            {!detail ? (
              <p className="empty-state">
                {detailBusy ? "Loading…" : "Select a report to review it."}
              </p>
            ) : (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Reported post</p>
                    <h3>{userLabel(detail.reported_user)}</h3>
                    <p className="muted-text">
                      Posted {formatWhen(detail.post_created_at)} ·{" "}
                      {detail.report_count}{" "}
                      {detail.report_count === 1 ? "report" : "reports"}
                      {detail.reported_user_banned
                        ? " · rider banned from Social"
                        : ""}
                    </p>
                  </div>
                </div>

                <blockquote className="post-reports-post-text">
                  {detail.post_text.trim() || "(no text)"}
                </blockquote>

                {detail.reported_post_text !== undefined &&
                detail.reported_post_text.trim() !== detail.post_text.trim() ? (
                  <div className="post-reports-snapshot">
                    <p className="eyebrow">Text as reported (post edited since)</p>
                    <blockquote className="post-reports-post-text post-reports-post-text-snapshot">
                      {detail.reported_post_text.trim() || "(no text)"}
                    </blockquote>
                  </div>
                ) : null}

                <div className="post-reports-state-row">
                  <span
                    className={`challenge-status-badge ${detail.post_active ? "" : "challenge-status-ended"}`}
                  >
                    {detail.post_active
                      ? detail.post_hidden
                        ? "Live · hidden pending review"
                        : "Live"
                      : "Removed"}
                  </span>
                  {selectedSummary?.latest_reporter ? (
                    <span className="muted-text">
                      latest report by{" "}
                      {userLabel(selectedSummary.latest_reporter)}
                    </span>
                  ) : null}
                </div>

                <div className="post-reports-reason-list">
                  {detail.reports.map((report) => (
                    <div key={report.report_uuid} className="post-reports-reason">
                      <div>
                        <strong>{reasonLabel(report.reason)}</strong>
                        <span className="muted-text">
                          {" "}
                          — {formatWhen(report.created_at)}
                        </span>
                      </div>
                      <p className="muted-text">
                        Reported by{" "}
                        {userLabel(
                          reporterByUUID.get(report.reporter_user_uuid),
                        )}
                      </p>
                      {report.details?.trim() ? (
                        <p className="muted-text">{report.details}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {notice ? <p className="form-success">{notice}</p> : null}

                <div className="form-actions post-reports-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void applyAction("dismiss")}
                  >
                    Dismiss
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={actionBusy || !detail.post_active}
                    onClick={() => void applyAction("remove_post")}
                  >
                    Remove post
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void applyAction("ban_user")}
                  >
                    Remove &amp; ban from Social
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
