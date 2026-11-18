import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  exportSchoolAuditEvents,
  fetchSchoolAuditActions,
  fetchSchoolAuditEvent,
  fetchSchoolAuditEvents,
  type AuditOutcome,
  type AuditSeverity,
  type DashboardAuditActionCount,
  type DashboardAuditEvent,
  type DashboardAuditFilters,
  type DashboardAuditPage,
} from "../../lib/api";
import { useDetailParamSync } from "../../lib/useDetailParamSync";

const sourceServiceDisplayNames: Record<string, string> = {
  "billing-api-service": "Billing",
  dashboard: "Dashboard (browser-reported)",
  "global-auth": "Sign-in service",
  "global-auth-service": "Sign-in service",
  "hub-store-service": "Juise Bar Service",
  "kca-proxy": "Main Proxy",
  "nebula-user-server": "User Server",
};

function formatSourceService(name: string): string {
  return sourceServiceDisplayNames[name] ?? name;
}

// Categories are action prefixes; the server filters on them.
const categories: Array<{ value: string; label: string }> = [
  { value: "", label: "All activity" },
  { value: "auth.", label: "Sign-in & security" },
  { value: "dashboard.parking_incident_reports", label: "Parking reports" },
  { value: "dashboard.violations", label: "Violations" },
  { value: "dashboard.violation_fee_rules", label: "Violation fees" },
  { value: "dashboard.registered_devices", label: "Vehicle registrations" },
  { value: "dashboard.registered_device_fee_rules", label: "Registration fees" },
  { value: "dashboard.parking_pass", label: "Device ID tags" },
  { value: "dashboard.staff", label: "Staff & access" },
  { value: "dashboard.admin_school_memberships", label: "Admin memberships" },
  { value: "dashboard.social_", label: "Social moderation" },
  { value: "dashboard.students", label: "Student records viewed" },
  { value: "dashboard.export", label: "Data exports" },
  { value: "dashboard.audit_log", label: "Audit log exports" },
  { value: "dashboard.challenges", label: "Challenges" },
  { value: "dashboard.school", label: "School settings" },
];

const actionLabels: Record<string, string> = {
  "auth.login.success": "Signed in",
  "auth.login.failed": "Sign-in failed",
  "auth.login.blocked": "Sign-in locked out",
  "auth.login.repeated_blocks": "Repeated lockouts",
  "auth.mfa.success": "MFA verified",
  "auth.mfa.failed": "MFA failed",
  "auth.mfa.enrollment_confirmed": "MFA set up",
  "auth.mfa.webauthn_enrolled": "Passkey set up",
  "auth.mfa.webauthn_added": "Passkey added",
  "auth.mfa.webauthn_removed": "Passkey removed",
  "auth.mfa.totp_added": "Authenticator app added",
  "auth.mfa.totp_removed": "Authenticator app removed",
  "auth.password_reset.requested": "Password reset requested",
  "auth.password_reset.recovery_code_used": "Recovery code used",
  "auth.password_recovery.failed": "Password recovery failed",
  "auth.password.changed": "Password changed",
  "auth.password.admin_set": "Password set by an admin",
  "auth.account.school_admin_created": "School admin account created",
  "auth.school_membership.joined": "Joined a school",
  "auth.school_membership.left": "Left a school",
  "dashboard.parking_incident_reports.assignment": "Parking report: responsible student set",
  "dashboard.parking_incident_reports.flag": "Parking report flagged",
  "dashboard.parking_incident_reports.clear_flag": "Parking report flag cleared",
  "dashboard.parking_incident_reports.issue_violation": "Violation issued from report",
  "dashboard.parking_incident_reports.update": "Parking report updated",
  "dashboard.parking_incident_reports.delete": "Parking report deleted",
  "dashboard.registered_devices.approve": "Vehicle registration approved",
  "dashboard.registered_devices.decline": "Vehicle registration declined",
  "dashboard.parking_passes.deactivate": "ID tag deactivated",
  "dashboard.parking_passes.tags": "ID tag labels changed",
  "dashboard.parking_pass_batches.create": "ID tag batch created",
  "dashboard.staff.create": "Staff member added",
  "dashboard.staff.update": "Staff access changed",
  "dashboard.staff.delete": "Staff member removed",
  "dashboard.social_post_reports.resolve": "Post report resolved",
  "dashboard.social_comment_reports.resolve": "Comment report resolved",
  "dashboard.audit_log.exported": "Audit log exported",
  "dashboard.export.download": "Data exported",
};

function humanizeAction(action: string): string {
  if (actionLabels[action]) {
    return actionLabels[action];
  }
  const words = action
    .replace(/^(dashboard|auth|billing|rider)\./, "")
    .split(/[._]+/)
    .filter(Boolean)
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const roleLabels: Record<string, string> = {
  juise_admin: "Juise staff",
  school_admin: "School admin",
  enforcement_officer: "Officer",
  rider: "Student",
  user: "User",
};

// Where an event's resource opens in the Dashboard, when it has a screen.
function resourceLink(event: DashboardAuditEvent): string | null {
  const id = event.resource_id ? encodeURIComponent(event.resource_id) : "";
  switch (event.resource_type) {
    case "parking_incident_reports":
      return id ? `/parking-reports?report=${id}` : "/parking-reports";
    case "violations":
      return id ? `/penalty-reports?report=${id}` : "/penalty-reports";
    case "registered_devices":
      return id
        ? `/vehicle-registrations?registration=${id}`
        : "/vehicle-registrations";
    case "parking_passes":
      return id ? `/device-tags?pass=${id}` : "/device-tags";
    case "staff":
    case "admin_school_memberships":
      return "/staff";
    case "violation_fee_rules":
      return "/violation-fees";
    case "registered_device_fee_rules":
      return "/registration-fees";
    case "challenges":
    case "campaign_challenges":
      return "/challenges";
    case "social_post_reports":
    case "social_comment_reports":
      return "/social-reports";
    default:
      return null;
  }
}

type RangePreset = "24h" | "7d" | "30d" | "90d" | "all" | "custom";

const rangePresets: Array<{ value: RangePreset; label: string }> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

type AppliedFilters = {
  q: string;
  category: string;
  action: string;
  outcome: AuditOutcome | "";
  severity: AuditSeverity | "";
  actor: string;
  actorLabel: string;
  resourceType: string;
  resourceId: string;
  sourceIp: string;
  range: RangePreset;
  from: string;
  to: string;
  sort: "asc" | "desc";
};

const emptyFilters: AppliedFilters = {
  q: "",
  category: "",
  action: "",
  outcome: "",
  severity: "",
  actor: "",
  actorLabel: "",
  resourceType: "",
  resourceId: "",
  sourceIp: "",
  range: "7d",
  from: "",
  to: "",
  sort: "desc",
};

function rangeStart(range: RangePreset, now: number): string {
  const hours: Record<string, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90 };
  const span = hours[range];
  return span ? new Date(now - span * 3600 * 1000).toISOString() : "";
}

function toQuery(filters: AppliedFilters, now: number): DashboardAuditFilters {
  return {
    q: filters.q,
    category: filters.category,
    action: filters.action,
    outcome: filters.outcome,
    severity: filters.severity,
    actor_user_uuid: filters.actor,
    resource_type: filters.resourceType,
    resource_id: filters.resourceId,
    source_ip: filters.sourceIp,
    from: filters.range === "custom" ? filters.from : rangeStart(filters.range, now),
    to: filters.range === "custom" ? filters.to : "",
    sort: filters.sort,
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actorLabel(event: DashboardAuditEvent): string {
  return (
    event.actor_name ||
    event.actor_email ||
    event.actor_user_uuid ||
    (event.actor_type === "anonymous" ? "Not signed in" : "Unknown")
  );
}

function shortId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…` : value;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type Props = {
  managedAppId: string;
  activeSchoolId: string;
};

export function AuditLogScreen({ managedAppId, activeSchoolId }: Props) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AppliedFilters>(emptyFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Cursors of the pages before the current one, for Previous.
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [cursor, setCursor] = useState("");
  const [pageSize, setPageSize] = useState(50);
  // "now" is pinned when the filters change, so relative ranges stay stable
  // while paging.
  const [queryTime, setQueryTime] = useState(() => Date.now());
  const [refreshCount, setRefreshCount] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");

  useDetailParamSync("event", selectedEventId, setSelectedEventId);

  const scope = `${managedAppId}:${activeSchoolId}`;
  const query = useMemo(() => toQuery(filters, queryTime), [filters, queryTime]);
  const requestKey = JSON.stringify({ scope, query, cursor, pageSize, refreshCount });

  const [result, setResult] = useState<{
    key: string;
    page: DashboardAuditPage | null;
    error: string;
  }>({ key: "", page: null, error: "" });
  const loading = result.key !== requestKey;

  useEffect(() => {
    if (!managedAppId || !activeSchoolId) {
      return;
    }
    let cancelled = false;
    fetchSchoolAuditEvents(managedAppId, activeSchoolId, {
      ...query,
      cursor,
      limit: pageSize,
    }).then(
      (page) => {
        if (!cancelled) setResult({ key: requestKey, page, error: "" });
      },
      (caught: unknown) => {
        if (!cancelled)
          setResult({
            key: requestKey,
            page: null,
            error: caught instanceof Error ? caught.message : "Unable to load audit events",
          });
      },
    );
    return () => {
      cancelled = true;
    };
    // requestKey covers every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const [actions, setActions] = useState<{
    scope: string;
    list: DashboardAuditActionCount[];
  }>({ scope: "", list: [] });
  useEffect(() => {
    if (!managedAppId || !activeSchoolId) {
      return;
    }
    let cancelled = false;
    fetchSchoolAuditActions(managedAppId, activeSchoolId).then(
      (list) => {
        if (!cancelled) setActions({ scope, list });
      },
      () => {
        if (!cancelled) setActions({ scope, list: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, managedAppId, scope]);
  const actionOptions = actions.scope === scope ? actions.list : [];

  // Debounce the search box into the applied filters.
  useEffect(() => {
    if (searchDraft.trim() === filters.q) {
      return;
    }
    const timer = window.setTimeout(() => {
      applyFilters({ q: searchDraft.trim() });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.q]);

  function applyFilters(change: Partial<AppliedFilters>) {
    setFilters((current) => ({ ...current, ...change }));
    setCursor("");
    setCursorStack([]);
    setQueryTime(Date.now());
  }

  function clearFilters() {
    setSearchDraft("");
    applyFilters({ ...emptyFilters });
  }

  const events = useMemo(
    () => (loading ? [] : (result.page?.events ?? [])),
    [loading, result.page],
  );
  const nextCursor = loading ? "" : (result.page?.next_cursor ?? "");
  const error = loading ? "" : result.error;

  // The open event: from the page, else fetched (a deep link or an event
  // on another page).
  const [detail, setDetail] = useState<{
    key: string;
    event: DashboardAuditEvent | null;
    error: string;
  }>({ key: "", event: null, error: "" });
  const pageEvent = events.find((event) => event.event_uuid === selectedEventId) ?? null;
  const detailKey = `${scope}:${selectedEventId}`;
  useEffect(() => {
    if (!selectedEventId || pageEvent || !managedAppId || !activeSchoolId) {
      return;
    }
    let cancelled = false;
    fetchSchoolAuditEvent(managedAppId, activeSchoolId, selectedEventId).then(
      (event) => {
        if (!cancelled) setDetail({ key: detailKey, event, error: "" });
      },
      (caught: unknown) => {
        if (!cancelled)
          setDetail({
            key: detailKey,
            event: null,
            error: caught instanceof Error ? caught.message : "Audit event not found",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, detailKey, managedAppId, pageEvent, selectedEventId]);
  const selected =
    pageEvent ?? (detail.key === detailKey ? detail.event : null);
  const detailError = !pageEvent && detail.key === detailKey ? detail.error : "";

  async function handleExport(format: "csv" | "json") {
    if (exportBusy || !activeSchoolId) {
      return;
    }
    setExportBusy(true);
    setExportError("");
    setExportMessage("");
    try {
      const exported = await exportSchoolAuditEvents(
        managedAppId,
        activeSchoolId,
        query,
        format,
      );
      saveBlob(exported.blob, exported.filename);
      const count =
        exported.count === null
          ? "The audit log"
          : `${exported.count.toLocaleString()} event${exported.count === 1 ? "" : "s"}`;
      setExportMessage(
        `${count} downloaded as ${format.toUpperCase()}.${
          exported.truncated
            ? " The export stopped at 50,000 events; narrow the date range for the rest."
            : ""
        } This export is recorded in the audit log.`,
      );
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "Unable to export the audit log");
    } finally {
      setExportBusy(false);
    }
  }

  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (filters.q) activeChips.push({ label: `Search: “${filters.q}”`, clear: () => { setSearchDraft(""); applyFilters({ q: "" }); } });
  if (filters.category)
    activeChips.push({
      label: categories.find((item) => item.value === filters.category)?.label ?? filters.category,
      clear: () => applyFilters({ category: "" }),
    });
  if (filters.action) activeChips.push({ label: `Action: ${humanizeAction(filters.action)}`, clear: () => applyFilters({ action: "" }) });
  if (filters.outcome) activeChips.push({ label: `Outcome: ${filters.outcome}`, clear: () => applyFilters({ outcome: "" }) });
  if (filters.severity) activeChips.push({ label: `Severity: ${filters.severity}`, clear: () => applyFilters({ severity: "" }) });
  if (filters.actor) activeChips.push({ label: `Actor: ${filters.actorLabel || shortId(filters.actor)}`, clear: () => applyFilters({ actor: "", actorLabel: "" }) });
  if (filters.resourceType || filters.resourceId)
    activeChips.push({
      label: `Target: ${[filters.resourceType, filters.resourceId && shortId(filters.resourceId)].filter(Boolean).join(" ")}`,
      clear: () => applyFilters({ resourceType: "", resourceId: "" }),
    });
  if (filters.sourceIp) activeChips.push({ label: `IP: ${filters.sourceIp}`, clear: () => applyFilters({ sourceIp: "" }) });

  if (!activeSchoolId) {
    return (
      <section className="screen-section">
        <div className="banner">Choose a school to view its audit log.</div>
      </section>
    );
  }

  if (selectedEventId) {
    const link = selected ? resourceLink(selected) : null;
    return (
      <section className="screen-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Security &amp; compliance</p>
            <h2>{selected ? humanizeAction(selected.action) : "Audit Event"}</h2>
            {selected ? <p>{formatDateTime(selected.occurred_at)}</p> : null}
          </div>
          <button className="secondary-button" onClick={() => setSelectedEventId("")}>
            ← Back to Audit Log
          </button>
        </div>
        {selected ? (
          <div className="audit-detail-page">
            <div className="audit-detail-badges">
              <span className={`audit-badge audit-outcome-${selected.outcome}`}>{selected.outcome}</span>
              <span className={`audit-badge audit-severity-${selected.severity}`}>{selected.severity}</span>
              <code className="audit-action-code">{selected.action}</code>
            </div>
            <dl className="audit-detail-grid">
              <div>
                <dt>When (UTC)</dt>
                <dd>{new Date(selected.occurred_at).toISOString()}</dd>
              </div>
              <div>
                <dt>Who</dt>
                <dd>
                  {actorLabel(selected)}
                  {selected.actor_email && selected.actor_name ? <small> · {selected.actor_email}</small> : null}
                  {selected.actor_role ? <small> · {roleLabels[selected.actor_role] ?? selected.actor_role}</small> : null}
                </dd>
              </div>
              <div>
                <dt>Actor ID</dt>
                <dd>{selected.actor_user_uuid ?? "—"}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>
                  {[selected.resource_type, selected.resource_id].filter(Boolean).join(": ") || "—"}
                  {link ? (
                    <>
                      {" "}
                      <button type="button" className="audit-link" onClick={() => navigate(link)}>
                        Open
                      </button>
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>School</dt>
                <dd>{selected.school_id ?? "Not school-specific"}</dd>
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
                <dt>Recorded by</dt>
                <dd>{formatSourceService(selected.source_service)}</dd>
              </div>
              <div>
                <dt>Request ID</dt>
                <dd>{selected.correlation_id ?? "—"}</dd>
              </div>
              <div>
                <dt>Event ID</dt>
                <dd>{selected.event_uuid}</dd>
              </div>
            </dl>
            {selected.user_agent ? <p className="audit-user-agent">{selected.user_agent}</p> : null}
            <div className="audit-related">
              <span>Show all events for:</span>
              {selected.actor_user_uuid ? (
                <button
                  type="button"
                  className="cd-table-btn"
                  onClick={() => {
                    applyFilters({ actor: selected.actor_user_uuid ?? "", actorLabel: actorLabel(selected), range: "all" });
                    setSelectedEventId("");
                  }}
                >
                  This person
                </button>
              ) : null}
              {selected.resource_id ? (
                <button
                  type="button"
                  className="cd-table-btn"
                  onClick={() => {
                    applyFilters({ resourceType: selected.resource_type ?? "", resourceId: selected.resource_id ?? "", range: "all" });
                    setSelectedEventId("");
                  }}
                >
                  This target
                </button>
              ) : null}
              {selected.source_ip ? (
                <button
                  type="button"
                  className="cd-table-btn"
                  onClick={() => {
                    applyFilters({ sourceIp: selected.source_ip ?? "", range: "all" });
                    setSelectedEventId("");
                  }}
                >
                  This IP
                </button>
              ) : null}
            </div>
            <p className="audit-metadata-label">Details recorded with this event</p>
            <pre className="audit-metadata">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre>
          </div>
        ) : (
          <div className={`banner${detailError ? " banner-error" : ""}`}>
            {detailError || "Loading audit event…"}
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
          <p className="muted">
            Changes made in the Dashboard and the enforcement app, sign-ins and security events
            for your staff, and data exports. Records can&apos;t be edited or deleted.
          </p>
        </div>
        <div className="audit-heading-actions">
          <button className="secondary-button" disabled={exportBusy} onClick={() => void handleExport("csv")}>
            {exportBusy ? "Exporting…" : "Export CSV"}
          </button>
          <button className="secondary-button" disabled={exportBusy} onClick={() => void handleExport("json")}>
            Export JSON
          </button>
          <button className="secondary-button" onClick={() => setRefreshCount((current) => current + 1)}>
            Refresh
          </button>
        </div>
      </div>
      {exportMessage ? <p className="audit-export-notice">{exportMessage}</p> : null}
      {exportError ? <p className="audit-export-error">{exportError}</p> : null}

      <div className="audit-filter-bar">
        <input
          className="cd-table-search audit-search"
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Search people, actions, IDs, IPs, details…"
          aria-label="Search the audit log"
        />
        <select
          value={filters.range}
          aria-label="Time range"
          onChange={(event) => applyFilters({ range: event.target.value as RangePreset })}
        >
          {rangePresets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
        {filters.range === "custom" ? (
          <>
            <label className="audit-date-field">
              From
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => applyFilters({ from: event.target.value })} />
            </label>
            <label className="audit-date-field">
              To
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => applyFilters({ to: event.target.value })} />
            </label>
          </>
        ) : null}
        <select value={filters.category} aria-label="Category" onChange={(event) => applyFilters({ category: event.target.value })}>
          {categories.map((category) => (
            <option key={category.value || "all"} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        <select
          value={filters.outcome}
          aria-label="Outcome"
          onChange={(event) => applyFilters({ outcome: event.target.value as AuditOutcome | "" })}
        >
          <option value="">Any outcome</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="blocked">Blocked</option>
        </select>
        <button type="button" className={`cd-table-btn${advancedOpen ? " cd-table-btn-active" : ""}`} onClick={() => setAdvancedOpen((current) => !current)}>
          More filters
        </button>
      </div>

      {advancedOpen ? (
        <div className="audit-advanced">
          <label className="field">
            <span>Action</span>
            <select value={filters.action} onChange={(event) => applyFilters({ action: event.target.value })}>
              <option value="">Any action</option>
              {actionOptions.map((option) => (
                <option key={option.action} value={option.action}>
                  {humanizeAction(option.action)} ({option.count.toLocaleString()})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Severity</span>
            <select value={filters.severity} onChange={(event) => applyFilters({ severity: event.target.value as AuditSeverity | "" })}>
              <option value="">Any severity</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="field">
            <span>Source IP</span>
            <input
              defaultValue={filters.sourceIp}
              key={`ip-${filters.sourceIp}`}
              placeholder="203.0.113.7"
              onBlur={(event) => applyFilters({ sourceIp: event.target.value.trim() })}
            />
          </label>
          <label className="field">
            <span>Target ID</span>
            <input
              defaultValue={filters.resourceId}
              key={`resource-${filters.resourceId}`}
              placeholder="Report, vehicle, tag or violation ID"
              onBlur={(event) => applyFilters({ resourceId: event.target.value.trim() })}
            />
          </label>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="audit-chips">
          {activeChips.map((chip) => (
            <button key={chip.label} type="button" className="audit-chip" onClick={chip.clear}>
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="audit-link" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      ) : null}

      {error ? <div className="banner banner-error">{error}</div> : null}

      <div className="table-scroll audit-table-scroll">
        <table className="data-table audit-table">
          <thead>
            <tr>
              <th aria-sort={filters.sort === "asc" ? "ascending" : "descending"}>
                <button
                  type="button"
                  className="audit-sort"
                  onClick={() => applyFilters({ sort: filters.sort === "asc" ? "desc" : "asc" })}
                >
                  Time {filters.sort === "asc" ? "↑ oldest first" : "↓ newest first"}
                </button>
              </th>
              <th>Event</th>
              <th>Who</th>
              <th>Target</th>
              <th>Outcome</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.event_uuid} className="audit-table-row" onClick={() => setSelectedEventId(event.event_uuid)}>
                <td className="audit-time-cell">
                  <span className="audit-time-exact">{formatDateTime(event.occurred_at)}</span>
                </td>
                <td>
                  <span className="audit-event-label">{humanizeAction(event.action)}</span>
                  <code className="audit-action-code">{event.action}</code>
                </td>
                <td className="audit-actor-cell">
                  {event.actor_user_uuid ? (
                    <button
                      type="button"
                      className="audit-link"
                      title="Show only this person's events"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        applyFilters({ actor: event.actor_user_uuid ?? "", actorLabel: actorLabel(event) });
                      }}
                    >
                      {actorLabel(event)}
                    </button>
                  ) : (
                    actorLabel(event)
                  )}
                  {event.actor_role ? <small className="audit-role">{roleLabels[event.actor_role] ?? event.actor_role}</small> : null}
                </td>
                <td className="audit-resource-cell">
                  {event.resource_id ? (
                    <button
                      type="button"
                      className="audit-link"
                      title="Show only events for this target"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        applyFilters({ resourceType: event.resource_type ?? "", resourceId: event.resource_id ?? "" });
                      }}
                    >
                      {(event.resource_type ?? "").replace(/_/g, " ")} {shortId(event.resource_id)}
                    </button>
                  ) : (
                    (event.resource_type ?? "—").replace(/_/g, " ")
                  )}
                </td>
                <td>
                  <span className={`audit-badge audit-outcome-${event.outcome}`}>{event.outcome}</span>
                  {event.severity !== "info" ? (
                    <span className={`audit-badge audit-severity-${event.severity}`}>{event.severity}</span>
                  ) : null}
                </td>
                <td className="audit-source-cell">
                  {event.source_ip ? (
                    <button
                      type="button"
                      className="audit-link"
                      title="Show only events from this IP"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        applyFilters({ sourceIp: event.source_ip ?? "" });
                      }}
                    >
                      {event.source_ip}
                    </button>
                  ) : (
                    "—"
                  )}
                  <small>{formatSourceService(event.source_service)}</small>
                </td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td colSpan={6} className="audit-empty-cell">
                  Loading audit events…
                </td>
              </tr>
            ) : null}
            {!loading && events.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="audit-empty-cell">
                  No audit events match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="form-actions audit-pagination">
        <span className="audit-pagination-info">
          Page {cursorStack.length + 1} · {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        <div className="audit-pagination-buttons">
          <label className="audit-page-size">
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCursor("");
                setCursorStack([]);
              }}
            >
              {[25, 50, 100, 200].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={cursorStack.length === 0 || loading}
            onClick={() => {
              setCursor(cursorStack[cursorStack.length - 1] ?? "");
              setCursorStack((current) => current.slice(0, -1));
            }}
          >
            Previous
          </button>
          <button
            className="secondary-button"
            disabled={!nextCursor || loading}
            onClick={() => {
              setCursorStack((current) => [...current, cursor]);
              setCursor(nextCursor);
            }}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
