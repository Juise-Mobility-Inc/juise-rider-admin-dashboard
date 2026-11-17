import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  fetchSchoolSocialCommentReports,
  fetchSchoolSocialPostReports,
  type SocialCommentReportSummary,
  type SocialModerationUser,
  type SocialPostReportSummary,
} from "../../../lib/api";
import { useDetailParamSync } from "../../../lib/useDetailParamSync";
import { CommentReportDetail } from "./CommentReportDetail";
import { PostReportDetail } from "./PostReportDetail";
import { formatWhen, getErrorMessage, reasonLabel, userLabel } from "./format";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type StatusTab = "open" | "resolved";
type TypeFilter = "all" | "posts" | "comments";
type Kind = "post" | "comment";

const PAGE_SIZE = 50;

// One row of the combined table: a reported post or a reported comment.
type ReportRow = {
  kind: Kind;
  // "post:<activity_uuid>" or "comment:<comment_uuid>"; also the ?report= value.
  key: string;
  reportUUID: string;
  createdAt: number;
  reportedUser?: SocialModerationUser;
  latestReporter?: SocialModerationUser;
  text: string;
  reportCount: number;
  reason: string;
  status: "open" | "actioned" | "dismissed";
  active: boolean;
  hidden: boolean;
};

function postRow(row: SocialPostReportSummary): ReportRow {
  return {
    kind: "post",
    key: `post:${row.report.activity_uuid}`,
    reportUUID: row.report.report_uuid,
    createdAt: row.report.created_at,
    reportedUser: row.reported_user,
    latestReporter: row.latest_reporter,
    text: row.post_text,
    reportCount: row.report_count,
    reason: row.report.reason,
    status: row.report.status,
    active: row.post_active,
    hidden: row.post_hidden,
  };
}

function commentRow(row: SocialCommentReportSummary): ReportRow {
  return {
    kind: "comment",
    key: `comment:${row.report.comment_uuid}`,
    reportUUID: row.report.report_uuid,
    createdAt: row.report.created_at,
    reportedUser: row.reported_user,
    latestReporter: row.latest_reporter,
    text: row.comment_text,
    reportCount: row.report_count,
    reason: row.report.reason,
    status: row.report.status,
    active: row.comment_active,
    hidden: row.comment_hidden,
  };
}

function mergeRows(existing: ReportRow[], incoming: ReportRow[]) {
  const seen = new Set(existing.map((row) => row.key));
  return [...existing, ...incoming.filter((row) => !seen.has(row.key))];
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "posts", label: "Posts" },
  { value: "comments", label: "Comments" },
];

// Riders' reports on Social posts and comments, in one table that can be
// filtered to either.
export function SocialReportsScreen({ activeSchoolId, managedAppId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: StatusTab = searchParams.get("tab") === "resolved" ? "resolved" : "open";
  const typeParam = searchParams.get("type");
  const typeFilter: TypeFilter =
    typeParam === "posts" || typeParam === "comments" ? typeParam : "all";

  const setParam = useCallback(
    (key: "tab" | "type", value: string, defaultValue: string) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.delete("report");
        if (value === defaultValue) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        return params;
      });
    },
    [setSearchParams],
  );

  const [postRows, setPostRows] = useState<ReportRow[]>([]);
  const [commentRows, setCommentRows] = useState<ReportRow[]>([]);
  const [postsHaveMore, setPostsHaveMore] = useState(false);
  const [commentsHaveMore, setCommentsHaveMore] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  // The opened report. Kept as the row itself, not looked up in the list, so
  // its detail stays open after an action moves it off this tab.
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);
  const selectedKey = selectedRow?.key ?? "";
  // Which school|tab the loaded rows belong to; the ?report= sync waits for it.
  const scope = `${activeSchoolId}|${tab}`;
  const [loadedScope, setLoadedScope] = useState("");
  const listReqRef = useRef(0);

  const refreshList = useCallback(async () => {
    if (!activeSchoolId) {
      setPostRows([]);
      setCommentRows([]);
      return;
    }
    const reqId = ++listReqRef.current;
    const reqScope = `${activeSchoolId}|${tab}`;
    setListBusy(true);
    setLoadingMore(false);
    setError("");
    try {
      const [posts, comments] = await Promise.all([
        fetchSchoolSocialPostReports(managedAppId, activeSchoolId, { status: tab, limit: PAGE_SIZE }),
        fetchSchoolSocialCommentReports(managedAppId, activeSchoolId, { status: tab, limit: PAGE_SIZE }),
      ]);
      if (reqId !== listReqRef.current) return;
      setPostRows(posts.map(postRow));
      setCommentRows(comments.map(commentRow));
      setPostsHaveMore(posts.length >= PAGE_SIZE);
      setCommentsHaveMore(comments.length >= PAGE_SIZE);
      setLoadedScope(reqScope);
    } catch (nextError) {
      if (reqId !== listReqRef.current) return;
      setError(getErrorMessage(nextError));
      setPostRows([]);
      setCommentRows([]);
      setLoadedScope("");
    } finally {
      if (reqId === listReqRef.current) setListBusy(false);
    }
  }, [activeSchoolId, managedAppId, tab]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // An action that finishes after the moderator switched tab or school must
  // refresh the list now on screen, not the one it started on.
  const refreshListRef = useRef(refreshList);
  useEffect(() => {
    refreshListRef.current = refreshList;
  }, [refreshList]);

  // Bumped on every row click so reselecting a report reloads its detail.
  const [reloadToken, setReloadToken] = useState(0);

  // A school or tab change drops the old rows and selection.
  useEffect(() => {
    setPostRows([]);
    setCommentRows([]);
    setPostsHaveMore(false);
    setCommentsHaveMore(false);
    setLoadedScope("");
    setSelectedRow(null);
  }, [activeSchoolId, tab]);

  // Older pages, only for the kinds the current filter shows.
  const loadMore = useCallback(async () => {
    if (!activeSchoolId || loadingMore || listBusy) return;
    const wantPosts = typeFilter !== "comments" && postsHaveMore;
    const wantComments = typeFilter !== "posts" && commentsHaveMore;
    if (!wantPosts && !wantComments) return;
    const reqId = ++listReqRef.current;
    setLoadingMore(true);
    setError("");
    try {
      const [posts, comments] = await Promise.all([
        wantPosts
          ? fetchSchoolSocialPostReports(managedAppId, activeSchoolId, {
              status: tab,
              limit: PAGE_SIZE,
              offset: postRows.length,
            })
          : Promise.resolve(null),
        wantComments
          ? fetchSchoolSocialCommentReports(managedAppId, activeSchoolId, {
              status: tab,
              limit: PAGE_SIZE,
              offset: commentRows.length,
            })
          : Promise.resolve(null),
      ]);
      if (reqId !== listReqRef.current) return;
      if (posts) {
        setPostRows((prev) => mergeRows(prev, posts.map(postRow)));
        setPostsHaveMore(posts.length >= PAGE_SIZE);
      }
      if (comments) {
        setCommentRows((prev) => mergeRows(prev, comments.map(commentRow)));
        setCommentsHaveMore(comments.length >= PAGE_SIZE);
      }
    } catch (nextError) {
      if (reqId === listReqRef.current) setError(getErrorMessage(nextError));
    } finally {
      if (reqId === listReqRef.current) setLoadingMore(false);
    }
  }, [
    activeSchoolId,
    commentRows.length,
    commentsHaveMore,
    listBusy,
    loadingMore,
    managedAppId,
    postRows.length,
    postsHaveMore,
    tab,
    typeFilter,
  ]);

  const rows = useMemo(() => {
    const visible =
      typeFilter === "posts"
        ? postRows
        : typeFilter === "comments"
          ? commentRows
          : [...postRows, ...commentRows];
    return [...visible].sort((left, right) => right.createdAt - left.createdAt);
  }, [commentRows, postRows, typeFilter]);

  const hasMore =
    (typeFilter !== "comments" && postsHaveMore) || (typeFilter !== "posts" && commentsHaveMore);

  // Keep the open report in ?report= so Back closes it and links reopen it.
  useDetailParamSync(
    "report",
    selectedKey,
    (value) =>
      setSelectedRow(
        value ? ([...postRows, ...commentRows].find((row) => row.key === value) ?? null) : null,
      ),
    loadedScope === scope,
  );

  if (!activeSchoolId) {
    return (
      <section className="panel">
        <p className="empty-state">This admin login is not scoped to a school.</p>
      </section>
    );
  }

  return (
    <section className="management-page post-reports-page social-reports-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Trust &amp; Safety</p>
            <h2>Social Reports</h2>
            <p className="muted-text">
              Riders' reports on Social posts and comments. A post or comment is
              hidden automatically once three different riders report it.
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

        <div className="social-reports-filters">
          <div className="post-reports-tabs">
            {(["open", "resolved"] as StatusTab[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`challenge-screen-tab ${tab === value ? "challenge-screen-tab-active" : ""}`}
                onClick={() => setParam("tab", value, "open")}
              >
                {value === "open" ? "Open" : "Resolved"}
              </button>
            ))}
          </div>
          <div className="segmented-control" role="radiogroup" aria-label="Report type">
            {TYPE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={typeFilter === option.value}
                className={typeFilter === option.value ? "segment-active" : ""}
                onClick={() => setParam("type", option.value, "all")}
              >
                {option.label}
                {option.value === "posts" && postRows.length > 0 ? ` · ${postRows.length}` : ""}
                {option.value === "comments" && commentRows.length > 0
                  ? ` · ${commentRows.length}`
                  : ""}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="post-reports-layout">
          <div className="post-reports-list">
            <div className="management-table-scroll">
              <table className="management-table social-reports-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Rider</th>
                    <th>Content</th>
                    <th>Reason</th>
                    <th>Reports</th>
                    <th>Status</th>
                    <th>Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className={`social-reports-row ${row.key === selectedKey ? "is-selected" : ""}`}
                      tabIndex={0}
                      onClick={() => {
                        setSelectedRow(row);
                        setReloadToken((token) => token + 1);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedRow(row);
                          setReloadToken((token) => token + 1);
                        }
                      }}
                    >
                      <td>
                        <span className="challenge-status-badge">
                          {row.kind === "post" ? "Post" : "Comment"}
                        </span>
                      </td>
                      <td>{userLabel(row.reportedUser)}</td>
                      <td className="social-reports-snippet">{row.text.trim() || "(no text)"}</td>
                      <td>{reasonLabel(row.reason)}</td>
                      <td>{row.reportCount}</td>
                      <td>
                        {!row.active
                          ? "Removed"
                          : row.hidden
                            ? "Hidden"
                            : row.status === "open"
                              ? "Live"
                              : row.status === "actioned"
                                ? "Actioned"
                                : "Dismissed"}
                      </td>
                      <td>{formatWhen(row.createdAt)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && !listBusy ? (
                    <tr>
                      <td colSpan={7}>
                        <span className="empty-state">
                          {tab === "open" ? "No open reports. Nice." : "No resolved reports yet."}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
            {!selectedRow ? (
              <p className="empty-state">Select a report to review it.</p>
            ) : selectedRow.kind === "post" ? (
              <PostReportDetail
                key={selectedRow.key}
                managedAppId={managedAppId}
                schoolId={activeSchoolId}
                reportUUID={selectedRow.reportUUID}
                latestReporter={selectedRow.latestReporter}
                reloadToken={reloadToken}
                onChanged={() => void refreshListRef.current()}
              />
            ) : (
              <CommentReportDetail
                key={selectedRow.key}
                managedAppId={managedAppId}
                schoolId={activeSchoolId}
                reportUUID={selectedRow.reportUUID}
                latestReporter={selectedRow.latestReporter}
                reloadToken={reloadToken}
                onChanged={() => void refreshListRef.current()}
              />
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
