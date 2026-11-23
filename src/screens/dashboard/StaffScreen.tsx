import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  addSchoolStaff,
  fetchSchoolStaff,
  removeSchoolStaff,
  updateSchoolStaffLevel,
  type SchoolStaffLevel,
  type SchoolStaffMember,
} from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import {
  DataRow,
  DataTable,
  TableCard,
  TableMessageRow,
} from "../../components/table/DataTable";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
  currentUserUuid: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LEVEL_LABELS: Record<SchoolStaffLevel, string> = {
  admin: "Admin",
  enforcement_officer: "Enforcement officer",
};

function staffName(member: SchoolStaffMember): string {
  const name = `${member.first_name} ${member.last_name}`.trim();
  return name || member.username || member.email || member.user_uuid;
}

export function StaffScreen({
  activeSchoolId,
  managedAppId,
  currentUserUuid,
}: Props) {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<SchoolStaffMember[]>([]);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<SchoolStaffLevel>("enforcement_officer");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [status, setStatus] = useState("");
  const [rowBusyUuid, setRowBusyUuid] = useState("");
  // Same stale-response guard as BetaInvitesScreen.
  const loadStaffRequestId = useRef(0);

  async function loadStaff() {
    const requestId = ++loadStaffRequestId.current;
    setStaffBusy(true);
    setStaffError("");
    try {
      const members = await fetchSchoolStaff(managedAppId, activeSchoolId);
      if (requestId !== loadStaffRequestId.current) return;
      setStaff(members);
    } catch (err) {
      if (requestId !== loadStaffRequestId.current) return;
      setStaffError(
        err instanceof Error ? err.message : "Unable to load staff.",
      );
    } finally {
      if (requestId === loadStaffRequestId.current) {
        setStaffBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!activeSchoolId) return;
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managedAppId, activeSchoolId]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setAddError("Enter the email address of their Dashboard account.");
      return;
    }
    setAddBusy(true);
    setAddError("");
    setStatus("");
    try {
      const member = await addSchoolStaff(managedAppId, activeSchoolId, {
        email: trimmed,
        level,
      });
      setEmail("");
      setStatus(`${staffName(member)} is now ${LEVEL_LABELS[member.level]}.`);
      await loadStaff();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setAddError(
        /no dashboard account/i.test(message)
          ? "No Dashboard account uses that email. Ask them to create one on the Dashboard sign-up page first, then add them here."
          : message || "Unable to add staff member.",
      );
    } finally {
      setAddBusy(false);
    }
  }

  async function handleLevelChange(
    member: SchoolStaffMember,
    nextLevel: SchoolStaffLevel,
  ) {
    if (nextLevel === member.level) return;
    setRowBusyUuid(member.user_uuid);
    setStaffError("");
    setStatus("");
    try {
      await updateSchoolStaffLevel(
        managedAppId,
        activeSchoolId,
        member.user_uuid,
        nextLevel,
      );
      setStatus(`${staffName(member)} is now ${LEVEL_LABELS[nextLevel]}.`);
      await loadStaff();
    } catch (err) {
      setStaffError(
        err instanceof Error ? err.message : "Unable to change level.",
      );
    } finally {
      setRowBusyUuid("");
    }
  }

  async function handleRemove(member: SchoolStaffMember) {
    if (
      !(await confirmAction({
        title: "Remove staff member?",
        message: `Remove ${staffName(member)} from this school? They will lose Dashboard and enforcement app access for it.`,
        confirmLabel: "Remove",
      }))
    ) {
      return;
    }
    setRowBusyUuid(member.user_uuid);
    setStaffError("");
    setStatus("");
    try {
      await removeSchoolStaff(managedAppId, activeSchoolId, member.user_uuid);
      setStatus(`${staffName(member)} was removed.`);
      await loadStaff();
    } catch (err) {
      setStaffError(
        err instanceof Error ? err.message : "Unable to remove staff member.",
      );
    } finally {
      setRowBusyUuid("");
    }
  }

  return (
    <section className="dashboard-section beta-invites-section">
      <button
        type="button"
        className="secondary-button res-back-button"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to dashboard
      </button>

      <div className="section-header beta-invites-header">
        <div>
          <p className="eyebrow">Campus information</p>
          <h2>Staff &amp; Access</h2>
          <p className="muted-text">
            Admins manage this school in the Dashboard and the Juise
            e-nforce app. Enforcement officers use only the Juise e-nforce
            app. Officers can sign up themselves in the app with this
            school&apos;s join code (shown in the sidebar) and join as
            officers. You can also add anyone with a Dashboard account here
            by their email, or change their level.
          </p>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : (
        <div className="school-invite-panel">
          <form className="school-invite-compose" onSubmit={handleAdd}>
            <div className="school-invite-entry-row">
              <input
                type="email"
                className="school-invite-chip-text-input"
                placeholder="staff@example.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={addBusy}
                aria-label="Dashboard account email"
              />
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as SchoolStaffLevel)}
                disabled={addBusy}
                aria-label="Level"
              >
                <option value="enforcement_officer">
                  {LEVEL_LABELS.enforcement_officer}
                </option>
                <option value="admin">{LEVEL_LABELS.admin}</option>
              </select>
              <button
                type="submit"
                className="primary-button school-invite-send-button"
                disabled={addBusy || !email.trim()}
              >
                {addBusy ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
          {status ? <p className="muted-text">{status}</p> : null}
          {addError ? <p className="error-text">{addError}</p> : null}
          {staffError ? <p className="error-text">{staffError}</p> : null}
          <TableCard
            title={`${staff.length.toLocaleString()} staff member${staff.length === 1 ? "" : "s"}`}
            meta={staffBusy && staff.length > 0 ? "Refreshing…" : undefined}
          >
            <DataTable minWidth={620} aria-label="Staff">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Level</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const isSelf = member.user_uuid === currentUserUuid;
                  const busy = rowBusyUuid === member.user_uuid;
                  return (
                    <DataRow key={member.user_uuid}>
                      <td>
                        <strong>
                          {staffName(member)}
                          {isSelf ? " (you)" : ""}
                        </strong>
                        <span>
                          {member.email && member.email !== staffName(member)
                            ? member.email
                            : member.username || "—"}
                        </span>
                      </td>
                      <td>
                        <select
                          className="staff-level-select"
                          value={member.level}
                          onChange={(e) =>
                            void handleLevelChange(
                              member,
                              e.target.value as SchoolStaffLevel,
                            )
                          }
                          disabled={isSelf || busy}
                          aria-label={`Level for ${staffName(member)}`}
                        >
                          <option value="admin">{LEVEL_LABELS.admin}</option>
                          <option value="enforcement_officer">
                            {LEVEL_LABELS.enforcement_officer}
                          </option>
                        </select>
                      </td>
                      <td className="dt-actions-cell">
                        {isSelf ? null : (
                          <button
                            type="button"
                            className="secondary-button school-invite-revoke-btn"
                            onClick={() => void handleRemove(member)}
                            disabled={busy}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </DataRow>
                  );
                })}
                {staffBusy && staff.length === 0 ? (
                  <TableMessageRow colSpan={3} tone="loading">
                    Loading staff…
                  </TableMessageRow>
                ) : null}
                {!staffBusy && staff.length === 0 ? (
                  <TableMessageRow colSpan={3}>No staff yet.</TableMessageRow>
                ) : null}
              </tbody>
            </DataTable>
          </TableCard>
        </div>
      )}
    </section>
  );
}
