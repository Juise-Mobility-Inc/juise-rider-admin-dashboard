import { useCallback, useEffect, useState } from "react";
import {
  fetchDashboardAuditEvents,
  type AuditOutcome,
  type DashboardAuditEvent,
} from "../../lib/api";

export function AuditLogScreen({ appId }: { appId: string }) {
  const [events, setEvents] = useState<DashboardAuditEvent[]>([]);
  const [cursor, setCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState<AuditOutcome | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DashboardAuditEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await fetchDashboardAuditEvents(appId, {
        action,
        outcome,
        cursor,
        limit: 50,
      });
      setEvents(page.events ?? []);
      setNextCursor(page.next_cursor ?? "");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load audit events",
      );
    } finally {
      setLoading(false);
    }
  }, [appId, action, outcome, cursor]);
  useEffect(() => {
    void load();
  }, [load]);

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
        <button
          className="secondary-button"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      <div className="filter-row">
        <label>
          Action
          <input
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setCursor("");
            }}
            placeholder="auth.login.blocked"
          />
        </label>
        <label>
          Outcome
          <select
            value={outcome}
            onChange={(event) => {
              setOutcome(event.target.value as AuditOutcome | "");
              setCursor("");
            }}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
      </div>
      {error ? <div className="banner banner-error">{error}</div> : null}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Outcome</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.event_uuid}
                onClick={() => setSelected(event)}
                style={{ cursor: "pointer" }}
              >
                <td>{new Date(event.occurred_at).toLocaleString()}</td>
                <td>{event.actor_user_uuid ?? "Unknown"}</td>
                <td>
                  {event.severity === "high" ? "⚠ " : ""}
                  {event.action}
                </td>
                <td>
                  {[event.resource_type, event.resource_id]
                    .filter(Boolean)
                    .join(": ") || "—"}
                </td>
                <td>{event.outcome}</td>
                <td>{event.source_service}</td>
              </tr>
            ))}
            {!loading && events.length === 0 ? (
              <tr>
                <td colSpan={6}>No matching audit events.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button
          className="secondary-button"
          disabled={!cursor}
          onClick={() => setCursor("")}
        >
          First page
        </button>
        <button
          className="secondary-button"
          disabled={!nextCursor}
          onClick={() => setCursor(nextCursor)}
        >
          Next page
        </button>
      </div>
      {selected ? (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <h3>Audit event</h3>
              <button className="text-button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <p>
              <strong>{selected.action}</strong>
            </p>
            <p>Event: {selected.event_uuid}</p>
            <p>School: {selected.school_id ?? "App-wide"}</p>
            <p>HTTP status: {selected.http_status ?? "—"}</p>
            <p>Source IP: {selected.source_ip ?? "—"}</p>
            <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
