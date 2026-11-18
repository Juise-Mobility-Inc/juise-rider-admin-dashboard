import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchSchoolSocialCommentReport,
  resolveSchoolSocialCommentReport,
  type SocialModerationUser,
  type SocialCommentReportAction,
  type SocialCommentReportDetail,
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

type Loaded = { reportUUID: string; detail: SocialCommentReportDetail | null; error: string };

// Review and act on a reported Social comment.
export function CommentReportDetail({
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
    fetchSchoolSocialCommentReport(managedAppId, schoolId, reportUUID)
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

  async function applyAction(action: SocialCommentReportAction) {
    if (!detail) return;
    const anchor = detail.reports[0];
    if (!anchor) return;
    const confirmCopy =
      action === "remove_comment"
        ? "Remove this comment?"
        : action === "ban_user"
          ? `Remove the comment and ban ${userLabel(detail.reported_user)} from Social? This also removes their other posts and comments.`
          : "Dismiss every report on this comment and restore it?";
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
      const updated = await resolveSchoolSocialCommentReport(
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
              ? "Reports dismissed. Comment restored."
              : action === "ban_user"
                ? "Comment removed and rider banned from Social."
                : "Comment removed.",
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
          <p className="eyebrow">Reported comment</p>
          <h3>{userLabel(detail.reported_user)}</h3>
          <p className="muted-text">
            Commented {formatWhen(detail.comment_created_at)} · {detail.report_count}{" "}
            {detail.report_count === 1 ? "report" : "reports"}
            {detail.reported_user_banned ? " · rider banned from Social" : ""}
          </p>
        </div>
      </div>

      <blockquote className="post-reports-post-text">
        {(detail.comment_text || detail.reported_comment_text || "").trim() || "(no text)"}
      </blockquote>

      {detail.reported_comment_text !== undefined &&
      detail.reported_comment_text.trim() !== detail.comment_text.trim() ? (
        <div className="post-reports-snapshot">
          <p className="eyebrow">Text as reported (changed since)</p>
          <blockquote className="post-reports-post-text post-reports-post-text-snapshot">
            {detail.reported_comment_text.trim() || "(no text)"}
          </blockquote>
        </div>
      ) : null}

      {detail.parent_comment_text?.trim() ? (
        <div className="post-reports-snapshot">
          <p className="eyebrow">In reply to</p>
          <blockquote className="post-reports-post-text post-reports-post-text-snapshot">
            {detail.parent_comment_text.trim()}
          </blockquote>
        </div>
      ) : null}

      <div className="post-reports-snapshot">
        <p className="eyebrow">On a post by {userLabel(detail.post_author)}</p>
        <blockquote className="post-reports-post-text post-reports-post-text-snapshot">
          {detail.post_text.trim() || "(no text)"}
        </blockquote>
      </div>

      <div className="post-reports-state-row">
        <span
          className={`challenge-status-badge ${detail.comment_active ? "" : "challenge-status-ended"}`}
        >
          {detail.comment_active
            ? detail.comment_hidden
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
          disabled={actionBusy || !detail.comment_active}
          onClick={() => void applyAction("remove_comment")}
        >
          Remove comment
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
