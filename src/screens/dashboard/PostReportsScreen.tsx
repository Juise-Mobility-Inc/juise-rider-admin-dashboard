import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchSchoolSocialPostReport,
  fetchSchoolSocialPostReports,
  resolveSchoolSocialPostReport,
  type SocialModerationUser,
  type SocialPostReportAction,
  type SocialPostReportDetail,
  type SocialPostReportSummary,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type StatusTab = "open" | "resolved";

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
  const [tab, setTab] = useState<StatusTab>("open");
  const [summaries, setSummaries] = useState<SocialPostReportSummary[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedActivityUUID, setSelectedActivityUUID] = useState("");
  const [detail, setDetail] = useState<SocialPostReportDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // Monotonic request ids so a slow response for a stale tab/school/report
  // can't overwrite the current view.
  const listReqRef = useRef(0);
  const detailReqRef = useRef(0);

  const refreshList = useCallback(async () => {
    if (!activeSchoolId) {
      setSummaries([]);
      return;
    }
    const reqId = ++listReqRef.current;
    const reqTab = tab;
    const reqSchool = activeSchoolId;
    setListBusy(true);
    setError("");
    try {
      const status = reqTab === "open" ? "open" : "";
      const rows = await fetchSchoolSocialPostReports(managedAppId, reqSchool, {
        status,
      });
      if (reqId !== listReqRef.current) {
        return;
      }
      const filtered =
        reqTab === "resolved"
          ? rows.filter((row) => row.report.status !== "open")
          : rows;
      setSummaries(filtered);
    } catch (nextError) {
      if (reqId !== listReqRef.current) {
        return;
      }
      setError(getErrorMessage(nextError));
      setSummaries([]);
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

  const selectedSummary = useMemo(
    () =>
      summaries.find((row) => row.report.activity_uuid === selectedActivityUUID) ??
      null,
    [summaries, selectedActivityUUID],
  );

  const loadDetail = useCallback(
    async (reportUUID: string, activityUUID: string) => {
      const reqId = ++detailReqRef.current;
      setSelectedActivityUUID(activityUUID);
      // Drop the previous report's detail immediately so its Remove / Ban
      // buttons can't be fired against the wrong post while this loads.
      setDetail(null);
      setDetailBusy(true);
      setNotice("");
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
      } finally {
        if (reqId === detailReqRef.current) {
          setDetailBusy(false);
        }
      }
    },
    [managedAppId, activeSchoolId],
  );

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
    // different report before the response lands, don't clobber the new view.
    const reqId = detailReqRef.current;
    setActionBusy(true);
    try {
      const updated = await resolveSchoolSocialPostReport(
        managedAppId,
        activeSchoolId,
        anchor.report_uuid,
        action,
      );
      if (reqId !== detailReqRef.current) {
        return;
      }
      setDetail(updated);
      setNotice(
        action === "dismiss"
          ? "Reports dismissed. Post restored."
          : action === "ban_user"
            ? "Post removed and rider banned from Social."
            : "Post removed.",
      );
      await refreshListRef.current();
    } catch (nextError) {
      if (reqId !== detailReqRef.current) {
        return;
      }
      setError(getErrorMessage(nextError));
    } finally {
      if (reqId === detailReqRef.current) {
        setActionBusy(false);
      }
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
              onClick={() => setTab(value)}
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
