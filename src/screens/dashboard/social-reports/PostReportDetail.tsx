import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchSchoolSocialPostReport,
  resolveSchoolSocialPostReport,
  type SocialModerationUser,
  type SocialPostReportAction,
  type SocialPostReportDetail,
} from "../../../lib/api";
import { formatWhen, getErrorMessage, reasonLabel, userLabel } from "./format";
import { confirmAction } from "../../../lib/confirm";

type Props = {
  managedAppId: string;
  schoolId: string;
  reportUUID: string;
  // Bumped when the moderator selects the report again, to reload it.
  reloadToken?: number;
  latestReporter?: SocialModerationUser;
  // Called after an action changes the report, so the list can refresh.
  onChanged: () => void;
};

type Loaded = { reportUUID: string; detail: SocialPostReportDetail | null; error: string };

// Review and act on a reported Social post.
export function PostReportDetail({
  managedAppId,
  schoolId,
  reportUUID,
  reloadToken = 0,
  latestReporter,
  onChanged,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retries, setRetries] = useState(0);
  const [actionBusy, setActionBusy] = useState(false);
  // Messages are tagged with their report so they don't carry over to the
  // next one the moderator opens.
  const [message, setMessage] = useState<{ reportUUID: string; notice: string; error: string } | null>(null);
  // The report the latest load or action belongs to; a response for another
  // report is dropped so it can't overwrite the one now on screen.
  const currentRef = useRef(reportUUID);

  useEffect(() => {
    currentRef.current = reportUUID;
    let cancelled = false;
    fetchSchoolSocialPostReport(managedAppId, schoolId, reportUUID)
      .then((detail) => {
        if (!cancelled) setLoaded({ reportUUID, detail, error: "" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ reportUUID, detail: null, error: getErrorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [managedAppId, schoolId, reportUUID, reloadToken, retries]);

  const current = loaded?.reportUUID === reportUUID ? loaded : null;
  const detail = current?.detail ?? null;
  const shownMessage = message?.reportUUID === reportUUID ? message : null;

  const reporterByUUID = useMemo(() => {
    const map = new Map<string, SocialModerationUser>();
    for (const reporter of detail?.reporters ?? []) {
      if (reporter.user_uuid) {
        map.set(reporter.user_uuid, reporter);
      }
    }
    return map;
  }, [detail]);

  async function applyAction(action: SocialPostReportAction) {
    if (!detail) return;
    const anchor = detail.reports[0];
    if (!anchor) return;
    const confirmCopy =
      action === "remove_post"
        ? "Remove this post from the feed?"
        : action === "ban_user"
          ? `Remove the post and ban ${userLabel(detail.reported_user)} from Social?`
          : "Dismiss every report on this post and restore it?";
    if (
      !(await confirmAction({
        title: action === "dismiss" ? "Dismiss reports?" : "Are you sure?",
        message: confirmCopy,
        confirmLabel: action === "dismiss" ? "Dismiss" : "Continue",
        tone: action === "dismiss" ? "default" : "danger",
      }))
    )
      return;
    const forReport = reportUUID;
    setActionBusy(true);
    setMessage(null);
    try {
      const updated = await resolveSchoolSocialPostReport(
        managedAppId,
        schoolId,
        anchor.report_uuid,
        action,
      );
      if (currentRef.current === forReport) {
        setLoaded({ reportUUID: forReport, detail: updated, error: "" });
        setMessage({
          reportUUID: forReport,
          error: "",
          notice:
            action === "dismiss"
              ? "Reports dismissed. Post restored."
              : action === "ban_user"
                ? "Post removed and rider banned from Social."
                : "Post removed.",
        });
      }
      onChanged();
    } catch (error) {
      if (currentRef.current === forReport) {
        setMessage({ reportUUID: forReport, notice: "", error: getErrorMessage(error) });
      }
    } finally {
      setActionBusy(false);
    }
  }

  if (!current) {
    return <p className="empty-state">Loading…</p>;
  }
  if (!detail) {
    return (
      <div className="post-reports-detail-error">
        <p className="form-error">{current.error || "Unable to load this report."}</p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setLoaded(null);
            setRetries((count) => count + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Reported post</p>
          <h3>{userLabel(detail.reported_user)}</h3>
          <p className="muted-text">
            Posted {formatWhen(detail.post_created_at)} · {detail.report_count}{" "}
            {detail.report_count === 1 ? "report" : "reports"}
            {detail.reported_user_banned ? " · rider banned from Social" : ""}
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
        {latestReporter ? (
          <span className="muted-text">latest report by {userLabel(latestReporter)}</span>
        ) : null}
      </div>

      <div className="post-reports-reason-list">
        {detail.reports.map((report) => (
          <div key={report.report_uuid} className="post-reports-reason">
            <div>
              <strong>{reasonLabel(report.reason)}</strong>
              <span className="muted-text"> — {formatWhen(report.created_at)}</span>
            </div>
            <p className="muted-text">
              Reported by {userLabel(reporterByUUID.get(report.reporter_user_uuid))}
            </p>
            {report.details?.trim() ? <p className="muted-text">{report.details}</p> : null}
          </div>
        ))}
      </div>

      {shownMessage?.notice ? <p className="form-success">{shownMessage.notice}</p> : null}
      {shownMessage?.error ? <p className="form-error">{shownMessage.error}</p> : null}

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
  );
}
