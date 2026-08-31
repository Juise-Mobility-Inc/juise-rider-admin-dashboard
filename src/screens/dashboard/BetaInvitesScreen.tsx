import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  createSchoolInvite,
  fetchSchoolInvites,
  revokeSchoolInvite,
  type SchoolEmailInvite,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
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

  useEffect(() => {
    if (!activeSchoolId) return;
    void loadSchoolInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managedAppId, activeSchoolId]);

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
      )}
    </section>
  );
}
