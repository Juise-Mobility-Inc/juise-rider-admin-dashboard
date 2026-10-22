import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  createSchoolInvite,
  deleteUserAccountAndData,
  fetchSchoolInvites,
  fetchSchoolStudentRoster,
  revokeSchoolInvite,
  type SchoolEmailInvite,
  type SchoolStudentRosterEntry,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type BetaStudent = {
  userUuid: string;
  name: string;
  email: string;
  acceptedAt?: number;
  inviteUuid: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitCsvRow(row: string): string[] {
  return row.split(",").map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"));
}

// Expects a header row with a column literally named "email" (case
// insensitive). Falls back to the first column if no such header exists,
// so a plain one-email-per-line file (no header at all) still works.
function parseEmailsFromCsv(text: string): string[] {
  const rows = text
    .split(/\r\n|\r|\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  if (rows.length === 0) return [];

  const header = splitCsvRow(rows[0]).map((cell) => cell.toLowerCase());
  const emailColumnIndex = header.indexOf("email");

  const dataRows = emailColumnIndex === -1 ? rows : rows.slice(1);
  const columnIndex = emailColumnIndex === -1 ? 0 : emailColumnIndex;

  return dataRows
    .map((row) => splitCsvRow(row)[columnIndex]?.trim() ?? "")
    .filter((email) => email.length > 0);
}

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}

function formatAcceptedAt(seconds?: number): string {
  if (!seconds) return "—";
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BetaInvitesScreen({ activeSchoolId, managedAppId }: Props) {
  const navigate = useNavigate();
  const [schoolInvites, setSchoolInvites] = useState<SchoolEmailInvite[]>([]);
  const [schoolInvitesBusy, setSchoolInvitesBusy] = useState(false);
  const [schoolInvitesError, setSchoolInvitesError] = useState("");
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [emailInputValue, setEmailInputValue] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards against a slower, earlier fetch (e.g. the initial mount load)
  // resolving after a later one (e.g. the reload after creating an
  // invite) and overwriting it with stale data.
  const loadSchoolInvitesRequestId = useRef(0);

  const [roster, setRoster] = useState<SchoolStudentRosterEntry[]>([]);
  const [rosterError, setRosterError] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const loadRosterRequestId = useRef(0);
  // Accounts we've just deleted — filtered out immediately so the row goes
  // away before the roster refetch lands (and stays gone if the accepted
  // invite row itself lingers, since it has no FK to the deleted user).
  const [removedUserUuids, setRemovedUserUuids] = useState<Set<string>>(
    () => new Set(),
  );
  const [studentPendingDelete, setStudentPendingDelete] =
    useState<BetaStudent | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function loadSchoolInvites() {
    const requestId = ++loadSchoolInvitesRequestId.current;
    setSchoolInvitesBusy(true);
    setSchoolInvitesError("");
    try {
      const invites = await fetchSchoolInvites(managedAppId, activeSchoolId);
      if (requestId !== loadSchoolInvitesRequestId.current) return;
      setSchoolInvites(invites);
    } catch (err) {
      if (requestId !== loadSchoolInvitesRequestId.current) return;
      setSchoolInvitesError(
        err instanceof Error ? err.message : "Unable to load beta invites.",
      );
    } finally {
      if (requestId === loadSchoolInvitesRequestId.current) {
        setSchoolInvitesBusy(false);
      }
    }
  }

  async function loadRoster() {
    const requestId = ++loadRosterRequestId.current;
    setRosterBusy(true);
    setRosterError("");
    try {
      const entries = await fetchSchoolStudentRoster(
        managedAppId,
        activeSchoolId,
      );
      if (requestId !== loadRosterRequestId.current) return;
      setRoster(entries);
    } catch (err) {
      if (requestId !== loadRosterRequestId.current) return;
      setRosterError(
        err instanceof Error ? err.message : "Unable to load beta students.",
      );
    } finally {
      if (requestId === loadRosterRequestId.current) {
        setRosterBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!activeSchoolId) return;
    setRemovedUserUuids(new Set());
    void loadSchoolInvites();
    void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managedAppId, activeSchoolId]);

  // "Beta students" = riders whose invite is accepted AND who still have a
  // live membership in this school's roster. Once their account is deleted
  // the roster no longer lists them, so the row disappears on its own.
  const betaStudents = useMemo<BetaStudent[]>(() => {
    const rosterByUuid = new Map(
      roster.map((entry) => [entry.user.k_guid, entry]),
    );
    return schoolInvites
      .filter(
        (invite) => invite.status === "accepted" && invite.redeemed_user_uuid,
      )
      .map((invite): BetaStudent | null => {
        const uuid = invite.redeemed_user_uuid as string;
        const entry = rosterByUuid.get(uuid);
        if (!entry || removedUserUuids.has(uuid)) return null;
        const name = `${entry.user.first_name ?? ""} ${
          entry.user.last_name ?? ""
        }`.trim();
        return {
          userUuid: uuid,
          name: name || "(no name on file)",
          email: entry.user.email || invite.email,
          acceptedAt: invite.responded_at,
          inviteUuid: invite.invite_uuid,
        };
      })
      .filter((student): student is BetaStudent => student !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schoolInvites, roster, removedUserUuids]);

  function addEmails(candidates: string[]) {
    setPendingEmails((current) => dedupeEmails([...current, ...candidates]));
  }

  function removeEmail(email: string) {
    setPendingEmails((current) => current.filter((item) => item !== email));
  }

  function commitTypedEmail() {
    const value = emailInputValue.trim();
    if (!value) return;
    addEmails([value]);
    setEmailInputValue("");
  }

  function handleEmailInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      commitTypedEmail();
      return;
    }
    if (
      event.key === "Backspace" &&
      emailInputValue === "" &&
      pendingEmails.length > 0
    ) {
      removeEmail(pendingEmails[pendingEmails.length - 1]);
    }
  }

  async function handleCsvFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setInviteError("");
    try {
      const text = await file.text();
      const emails = parseEmailsFromCsv(text);
      if (emails.length === 0) {
        setInviteError(
          'No emails found in that file. Expect a header row with a column named "email" (or one email per line).',
        );
        return;
      }
      addEmails(emails);
    } catch {
      setInviteError("Unable to read that file.");
    }
  }

  async function handleSendInvites() {
    const typed = emailInputValue.trim();
    const allEmails = dedupeEmails(
      typed ? [...pendingEmails, typed] : pendingEmails,
    );
    const validEmails = allEmails.filter((email) => EMAIL_PATTERN.test(email));
    const invalidEmails = allEmails.filter(
      (email) => !EMAIL_PATTERN.test(email),
    );

    if (validEmails.length === 0) {
      setInviteError(
        invalidEmails.length > 0
          ? "None of those look like valid email addresses."
          : "Add at least one email to invite.",
      );
      return;
    }

    setInviteBusy(true);
    setInviteError("");
    setInviteStatus("");
    setEmailInputValue("");

    const results = await Promise.allSettled(
      validEmails.map((email) =>
        createSchoolInvite(managedAppId, activeSchoolId, { email }),
      ),
    );

    const failedEmails: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failedEmails.push(validEmails[index]);
      }
    });

    setPendingEmails(dedupeEmails([...failedEmails, ...invalidEmails]));

    const sentCount = validEmails.length - failedEmails.length;
    if (failedEmails.length > 0) {
      setInviteError(
        `${failedEmails.length} invite(s) failed to send: ${failedEmails.join(", ")}`,
      );
    } else {
      setInviteError("");
    }
    if (invalidEmails.length > 0) {
      setInviteError((current) =>
        [
          current,
          `Skipped ${invalidEmails.length} invalid address(es): ${invalidEmails.join(", ")}`,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    if (sentCount > 0) {
      setInviteStatus(`Sent ${sentCount} invite${sentCount === 1 ? "" : "s"}.`);
    }

    setInviteBusy(false);
    await loadSchoolInvites();
  }

  async function handleRevokeInvite(inviteUuid: string) {
    setSchoolInvitesError("");
    try {
      await revokeSchoolInvite(managedAppId, activeSchoolId, inviteUuid);
      await loadSchoolInvites();
    } catch (err) {
      setSchoolInvitesError(
        err instanceof Error ? err.message : "Unable to revoke invite.",
      );
    }
  }

  async function handleConfirmDelete() {
    if (!studentPendingDelete) return;
    const target = studentPendingDelete;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const result = await deleteUserAccountAndData(
        managedAppId,
        target.userUuid,
      );
      if (!result.success) {
        const failed = result.steps
          .filter((step) => !step.success)
          .map((step) => step.service);
        setDeleteError(
          `Some services were not fully cleared${
            failed.length ? ` (${failed.join(", ")})` : ""
          }. This is safe to retry.`,
        );
        return;
      }
      setRemovedUserUuids((current) => {
        const next = new Set(current);
        next.add(target.userUuid);
        return next;
      });
      setStudentPendingDelete(null);
      await Promise.all([loadSchoolInvites(), loadRoster()]);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Unable to delete this account. Try again.",
      );
    } finally {
      setDeleteBusy(false);
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
          <h2>Beta Invites</h2>
          <p className="muted-text">
            Invite students by email to join this school&apos;s beta. Type an
            email and press space (or Enter) to add it, or upload a CSV with an
            &quot;email&quot; column. They&apos;ll be added automatically once
            they sign up or log in with that email address.
          </p>
        </div>
        {activeSchoolId ? (
          <div className="school-invite-upload-action">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="school-invite-csv-input"
              onChange={(e) => void handleCsvFileChange(e)}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={inviteBusy}
            >
              Upload CSV
            </button>
          </div>
        ) : null}
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : (
        <>
          <div className="school-invite-panel">
            <div className="school-invite-compose">
              <div className="school-invite-entry-row">
                <div className="school-invite-chip-input">
                  {pendingEmails.map((email) => (
                    <span
                      key={email}
                      className={
                        EMAIL_PATTERN.test(email)
                          ? "school-invite-chip"
                          : "school-invite-chip school-invite-chip-invalid"
                      }
                    >
                      {email}
                      <button
                        type="button"
                        className="school-invite-chip-remove"
                        onClick={() => removeEmail(email)}
                        aria-label={`Remove ${email}`}
                        disabled={inviteBusy}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="school-invite-chip-text-input"
                    placeholder={
                      pendingEmails.length === 0
                        ? "student@example.com"
                        : "Add another…"
                    }
                    value={emailInputValue}
                    onChange={(e) => setEmailInputValue(e.target.value)}
                    onKeyDown={handleEmailInputKeyDown}
                    onBlur={commitTypedEmail}
                    disabled={inviteBusy}
                  />
                </div>
                <button
                  type="button"
                  className="primary-button school-invite-send-button"
                  onClick={() => void handleSendInvites()}
                  disabled={
                    inviteBusy ||
                    (pendingEmails.length === 0 && !emailInputValue.trim())
                  }
                >
                  {inviteBusy ? "Sending…" : "Send invites"}
                </button>
              </div>
            </div>
            {inviteStatus ? <p className="muted-text">{inviteStatus}</p> : null}
            {inviteError ? <p className="error-text">{inviteError}</p> : null}
            {schoolInvitesError ? (
              <p className="error-text">{schoolInvitesError}</p>
            ) : null}
            {schoolInvitesBusy ? (
              <p className="muted-text">Loading invites…</p>
            ) : schoolInvites.length === 0 ? (
              <p className="muted-text">No pending invites yet.</p>
            ) : (
              <ul className="school-invite-list">
                {schoolInvites.map((invite) => (
                  <li
                    key={invite.invite_uuid}
                    className="school-invite-list-item"
                  >
                    <span className="school-invite-email">{invite.email}</span>
                    <span
                      className={`school-invite-status school-invite-status-${invite.status}`}
                    >
                      {invite.status}
                    </span>
                    {invite.status === "pending" ? (
                      <button
                        type="button"
                        className="secondary-button school-invite-revoke-btn"
                        onClick={() =>
                          void handleRevokeInvite(invite.invite_uuid)
                        }
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="school-invite-panel beta-students-panel">
            <div className="school-invite-header">
              <h3>Beta students</h3>
              <p className="muted-text">
                Students who accepted an invite and joined this school&apos;s
                beta. Removing a student permanently deletes their Juise account
                and all of their data across every service — this cannot be
                undone.
              </p>
            </div>
            {rosterError ? <p className="error-text">{rosterError}</p> : null}
            {rosterBusy || schoolInvitesBusy ? (
              <p className="muted-text">Loading beta students…</p>
            ) : betaStudents.length === 0 ? (
              <p className="muted-text">
                No students have accepted an invite yet.
              </p>
            ) : (
              <div className="management-table-scroll">
                <table className="management-table beta-students-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Joined</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {betaStudents.map((student) => (
                      <tr key={student.userUuid}>
                        <td>{student.name}</td>
                        <td>{student.email}</td>
                        <td>{formatAcceptedAt(student.acceptedAt)}</td>
                        <td className="beta-students-actions">
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => {
                              setDeleteError("");
                              setStudentPendingDelete(student);
                            }}
                          >
                            Remove &amp; delete account
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {studentPendingDelete ? (
        <div
          className="management-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Remove beta student"
          onClick={() => {
            if (!deleteBusy) setStudentPendingDelete(null);
          }}
        >
          <div
            className="management-modal-sheet series-edit-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="management-modal-header">
              <div>
                <p className="eyebrow">Delete account</p>
                <h3>Remove {studentPendingDelete.name} from the beta?</h3>
              </div>
              <button
                className="text-button management-modal-close"
                type="button"
                onClick={() => setStudentPendingDelete(null)}
                aria-label="Cancel"
                disabled={deleteBusy}
              >
                ✕
              </button>
            </div>
            <p className="muted-text series-edit-modal-copy">
              This permanently deletes the Juise account for{" "}
              <strong>{studentPendingDelete.email}</strong> and every piece of
              their data across all services (profile, school memberships, ride
              history, credentials). It cannot be undone, and they will need to
              sign up again from scratch to use Juise.
            </p>
            {deleteError ? <p className="error-text">{deleteError}</p> : null}
            <div className="form-actions series-edit-modal-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={deleteBusy}
                onClick={() => setStudentPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleConfirmDelete()}
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
