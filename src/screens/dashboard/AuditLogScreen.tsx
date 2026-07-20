import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchDashboardAuditEvents,
  type AuditOutcome,
  type AuditSeverity,
  type DashboardAuditEvent,
} from "../../lib/api";
import { downloadCsv, type CsvCell } from "../../lib/csv";

const sourceServiceDisplayNames: Record<string, string> = {
  "billing-api-service": "Billing",
  "global-auth-service": "Authentication Service",
  "hub-store-service": "Juise Bar Service",
  "infra-secret-store": "Authentication Store",
  "kca-proxy": "Main Proxy",
  "kca-push-notification": "Push Notification Service",
  "nebula-user-server": "User Server",
  "partner-api": "Partner API",
  "tcp-proxy-layer": "Cloud Communication Server",
  "vehicle-store-service": "Vehicle Service",
  "vehicle-store": "Vehicle Service",
  "zone-cache-service": "Zone Service",
};

function formatSourceService(name: string): string {
  return sourceServiceDisplayNames[name] ?? name;
}

const outcomeFilters: Array<{ value: AuditOutcome | ""; label: string }> = [
  { value: "", label: "All outcomes" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "blocked", label: "Blocked" },
];

const severityFilters: Array<{ value: AuditSeverity | ""; label: string }> = [
  { value: "", label: "All severities" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "high", label: "High" },
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function AuditLogScreen({ appId }: { appId: string }) {
  const [events, setEvents] = useState<DashboardAuditEvent[]>([]);
  const [cursor, setCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState<AuditOutcome | "">("");
  const [severity, setSeverity] = useState<AuditSeverity | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedEventUuid = searchParams.get("event") ?? "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAction(actionInput.trim());
      setCursor("");
      setPageIndex(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [actionInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await fetchDashboardAuditEvents(appId, {
        action,
        outcome,
        severity,
        cursor,
        limit: 50,
      });
      setEvents(page.events ?? []);
      setNextCursor(page.next_cursor ?? "");
    } catch (caught) {
      setEvents([]);
      setNextCursor("");
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load audit events",
      );
    } finally {
      setLoading(false);
    }
  }, [appId, action, outcome, severity, cursor]);
  useEffect(() => {
    void load();
  }, [load]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return events;
    }
    return events.filter((event) => {
      const haystack = [
        event.action,
        event.actor_user_uuid ?? "",
        event.resource_type ?? "",
        event.resource_id ?? "",
        event.outcome,
        event.severity,
        event.source_service,
        formatSourceService(event.source_service),
        event.source_ip ?? "",
        event.school_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [events, searchQuery]);

  const selected = useMemo(
    () =>
      events.find((event) => event.event_uuid === selectedEventUuid) ?? null,
    [events, selectedEventUuid],
  );

  const openEvent = (eventUuid: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("event", eventUuid);
    setSearchParams(next);
  };

  const backToList = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      const next = new URLSearchParams(searchParams);
      next.delete("event");
      setSearchParams(next, { replace: true });
    }
  };

  const exportRangeInvalid = Boolean(
    exportStart && exportEnd && exportStart > exportEnd,
  );

  const handleExport = async () => {
    if (exportBusy || exportRangeInvalid) {
      return;
    }
    setExportBusy(true);
    setExportError("");
    setExportNotice("");
    try {
      const startMs = exportStart
        ? new Date(`${exportStart}T00:00:00`).getTime()
        : null;
      const endMs = exportEnd
        ? new Date(`${exportEnd}T23:59:59.999`).getTime()
        : null;

      const collected: DashboardAuditEvent[] = [];
      const maxEvents = 10000;
      let pageCursor = "";
      let truncated = false;

      for (let pageCount = 0; pageCount < 200; pageCount += 1) {
        const page = await fetchDashboardAuditEvents(appId, {
          action,
          outcome,
          severity,
          cursor: pageCursor,
          limit: 50,
        });
        const pageEvents = page.events ?? [];
        let reachedOlderThanStart = false;

        // Events are returned newest-first across cursor pages, so once we
        // see an event older than the start date we can stop paging.
        for (const event of pageEvents) {
          const occurredMs = new Date(event.occurred_at).getTime();
          if (Number.isNaN(occurredMs)) {
            continue;
          }
          if (endMs !== null && occurredMs > endMs) {
            continue;
          }
          if (startMs !== null && occurredMs < startMs) {
            reachedOlderThanStart = true;
            continue;
          }
          if (collected.length >= maxEvents) {
            truncated = true;
            break;
          }
          collected.push(event);
        }

        if (truncated) {
          break;
        }
        if (reachedOlderThanStart && startMs !== null) {
          break;
        }
        pageCursor = page.next_cursor ?? "";
        if (!pageCursor) {
          break;
        }
      }

      if (collected.length === 0) {
        setExportError("No audit events found for the selected date range.");
        return;
      }

      const header: CsvCell[] = [
        "Occurred at",
        "Action",
        "Outcome",
        "Severity",
        "Actor",
        "School",
        "Resource type",
        "Resource ID",
        "HTTP status",
        "Source IP",
        "Service",
        "Event UUID",
        "Metadata",
      ];
      const rows: CsvCell[][] = [
        header,
        ...collected.map((event) => [
          new Date(event.occurred_at).toISOString(),
          event.action,
          event.outcome,
          event.severity,
          event.actor_user_uuid ?? "",
          event.school_id ?? "",
          event.resource_type ?? "",
          event.resource_id ?? "",
          event.http_status ?? "",
          event.source_ip ?? "",
          formatSourceService(event.source_service),
          event.event_uuid,
          JSON.stringify(event.metadata ?? {}),
        ]),
      ];

      const rangeLabel = [exportStart || "start", exportEnd || "today"].join(
        "_to_",
      );
      downloadCsv(`audit-log_${rangeLabel}`, rows);
      setExportNotice(
        `Downloaded ${collected.length.toLocaleString()} event${
          collected.length === 1 ? "" : "s"
        }${truncated ? " (capped at 10,000 — narrow the date range for the rest)" : ""}.`,
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error
          ? caught.message
          : "Unable to export audit events",
      );
    } finally {
      setExportBusy(false);
    }
  };

  const hasActiveFilters =
    Boolean(action) || Boolean(outcome) || Boolean(severity);

  const clearFilters = () => {
    setActionInput("");
    setAction("");
    setOutcome("");
    setSeverity("");
    setSearchQuery("");
    setCursor("");
    setPageIndex(0);
  };

  if (selectedEventUuid) {
    return (
      <section className="screen-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Security &amp; compliance</p>
            <h2>Audit Event</h2>
            {selected ? (
              <p>{new Date(selected.occurred_at).toLocaleString()}</p>
            ) : null}
          </div>
          <button className="secondary-button" onClick={backToList}>
            ← Back to Audit Log
          </button>
        </div>
        {selected ? (
          <div className="audit-detail-page">
            <div className="audit-detail-badges">
              <span className={`audit-badge audit-outcome-${selected.outcome}`}>
                {selected.outcome}
              </span>
              <span
                className={`audit-badge audit-severity-${selected.severity}`}
              >
                {selected.severity}
              </span>
            </div>
            <p>
              <strong>
                <code className="audit-action-code">{selected.action}</code>
              </strong>
            </p>
            <dl className="audit-detail-grid">
              <div>
                <dt>Occurred</dt>
                <dd>{new Date(selected.occurred_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>{selected.event_uuid}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{selected.actor_user_uuid ?? "Unknown"}</dd>
              </div>
              <div>
                <dt>School</dt>
                <dd>{selected.school_id ?? "App-wide"}</dd>
              </div>
              <div>
                <dt>Resource</dt>
                <dd>
                  {[selected.resource_type, selected.resource_id]
                    .filter(Boolean)
                    .join(": ") || "—"}
                </dd>
              </div>
              <div>
                <dt>HTTP status</dt>
                <dd>{selected.http_status ?? "—"}</dd>
              </div>
              <div>
                <dt>Source IP</dt>
                <dd>{selected.source_ip ?? "—"}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{formatSourceService(selected.source_service)}</dd>
              </div>
            </dl>
            {selected.user_agent ? (
              <p className="audit-user-agent">{selected.user_agent}</p>
            ) : null}
            <pre className="audit-metadata">
              {JSON.stringify(selected.metadata, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="banner">
            {loading
              ? "Loading audit event…"
              : "This audit event is not on the currently loaded page. Go back to the audit log to browse events."}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="screen-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Security &amp; compliance</p>
          <h2>Audit Log</h2>
          <p>
            Authentication, exports, sensitive access, and administrative
            changes.
          </p>
        </div>
        <div className="audit-heading-actions">
          <button
            className="secondary-button"
            onClick={() => {
              setExportOpen((open) => !open);
              setExportError("");
              setExportNotice("");
            }}
            aria-expanded={exportOpen}
          >
            {exportOpen ? "Close download" : "Download CSV"}
          </button>
          <button
            className="secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {exportOpen ? (
        <div className="audit-export-panel">
          <div className="audit-export-fields">
            <label className="audit-export-field">
              <span>Start date</span>
              <input
                type="date"
                value={exportStart}
                max={exportEnd || undefined}
                onChange={(event) => setExportStart(event.target.value)}
              />
            </label>
            <label className="audit-export-field">
              <span>End date</span>
              <input
                type="date"
                value={exportEnd}
                min={exportStart || undefined}
                onChange={(event) => setExportEnd(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary-button audit-export-btn"
              onClick={() => void handleExport()}
              disabled={exportBusy || exportRangeInvalid}
            >
              {exportBusy ? "Preparing…" : "Download CSV"}
            </button>
          </div>
          <p className="audit-export-hint">
            Leave dates empty to export everything. Active outcome, severity,
            and action filters are applied to the download.
          </p>
          {exportRangeInvalid ? (
            <p className="audit-export-error">
              Start date must be on or before the end date.
            </p>
          ) : null}
          {exportError ? (
            <p className="audit-export-error">{exportError}</p>
          ) : null}
          {exportNotice ? (
            <p className="audit-export-notice">{exportNotice}</p>
          ) : null}
        </div>
      ) : null}

      <div className="audit-filter-bar">
        <div className="audit-filter-inputs">
          <input
            className="cd-table-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search this page"
          />
          <input
            className="cd-table-search"
            type="search"
            value={actionInput}
            onChange={(event) => setActionInput(event.target.value)}
            placeholder="Filter by action (e.g. auth.login)"
          />
          {hasActiveFilters || searchQuery ? (
            <button
              type="button"
              className="cd-table-btn"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="audit-filter-chip-rows">
          <div className="audit-filter-chip-row">
            <span className="audit-filter-chip-label">Outcome</span>
            {outcomeFilters.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                className={`audit-filter-chip${
                  outcome === option.value ? " audit-filter-chip-active" : ""
                }`}
                aria-pressed={outcome === option.value}
                onClick={() => {
                  setOutcome(option.value);
                  setCursor("");
                  setPageIndex(0);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="audit-filter-chip-row">
            <span className="audit-filter-chip-label">Severity</span>
            {severityFilters.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                className={`audit-filter-chip${
                  severity === option.value ? " audit-filter-chip-active" : ""
                }`}
                aria-pressed={severity === option.value}
                onClick={() => {
                  setSeverity(option.value);
                  setCursor("");
                  setPageIndex(0);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="table-scroll audit-table-scroll">
        <table className="data-table audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>Outcome</th>
              <th>Severity</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((event) => (
              <tr
                key={event.event_uuid}
                className="audit-table-row"
                onClick={() => openEvent(event.event_uuid)}
              >
                <td className="audit-time-cell">
                  <span className="audit-time-relative">
                    {formatRelativeTime(event.occurred_at)}
                  </span>
                  <span className="audit-time-exact">
                    {formatDateTime(event.occurred_at)}
                  </span>
                </td>
                <td>
                  <code className="audit-action-code">{event.action}</code>
                </td>
                <td className="audit-actor-cell">
                  {event.actor_user_uuid ?? "Unknown"}
                </td>
                <td className="audit-resource-cell">
                  {[event.resource_type, event.resource_id]
                    .filter(Boolean)
                    .join(": ") || "—"}
                </td>
                <td>
                  <span className={`audit-badge audit-outcome-${event.outcome}`}>
                    {event.outcome}
                  </span>
                </td>
                <td>
                  <span
                    className={`audit-badge audit-severity-${event.severity}`}
                  >
                    {event.severity}
                  </span>
                </td>
                <td className="audit-source-cell">
                  {formatSourceService(event.source_service)}
                </td>
              </tr>
            ))}
            {!loading && filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={7} className="audit-empty-cell">
                  {events.length > 0
                    ? "No events on this page match your search."
                    : "No matching audit events."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="form-actions audit-pagination">
        <span className="audit-pagination-info">
          {searchQuery.trim()
            ? `${filteredEvents.length} of ${events.length} events on page ${pageIndex + 1}`
            : `Page ${pageIndex + 1} · ${events.length} events`}
        </span>
        <div className="audit-pagination-buttons">
          <button
            className="secondary-button"
            disabled={!cursor || loading}
            onClick={() => {
              setCursor("");
              setPageIndex(0);
            }}
          >
            First page
          </button>
          <button
            className="secondary-button"
            disabled={!nextCursor || loading}
            onClick={() => {
              setCursor(nextCursor);
              setPageIndex((current) => current + 1);
            }}
          >
            Next page
          </button>
        </div>
      </div>

    </section>
  );
}
