import { useEffect, useRef, useState } from "react";
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

export function BetaInvitesScreen({ activeSchoolId, managedAppId }: Props) {
  const navigate = useNavigate();
  const [schoolInvites, setSchoolInvites] = useState<SchoolEmailInvite[]>([]);
  const [schoolInvitesBusy, setSchoolInvitesBusy] = useState(false);
  const [schoolInvitesError, setSchoolInvitesError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCampusId, setInviteCampusId] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
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

  async function handleCreateInvite() {
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Enter an email address to invite.");
      return;
    }
    setInviteBusy(true);
    setInviteError("");
    try {
      await createSchoolInvite(managedAppId, activeSchoolId, {
        email,
        campus_id: inviteCampusId.trim() || undefined,
      });
      setInviteEmail("");
      setInviteCampusId("");
      await loadSchoolInvites();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Unable to send invite.");
    } finally {
      setInviteBusy(false);
    }
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
    <section className="dashboard-section">
      <button
        type="button"
        className="secondary-button res-back-button"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to dashboard
      </button>

      <div className="section-header">
        <div>
          <p className="eyebrow">Campus information</p>
          <h2>Beta Invites</h2>
          <p className="muted-text">
            Invite a student by email to join this school&apos;s beta.
            They&apos;ll be added automatically once they sign up or log in
            with that email address.
          </p>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : (
        <div className="school-invite-panel">
          <div className="school-invite-form">
            <input
              className="school-invite-email-input"
              type="email"
              placeholder="student@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviteBusy}
            />
            <input
              className="school-invite-campus-input"
              type="text"
              placeholder="Campus ID (optional)"
              value={inviteCampusId}
              onChange={(e) => setInviteCampusId(e.target.value)}
              disabled={inviteBusy}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleCreateInvite()}
              disabled={inviteBusy || !inviteEmail.trim()}
            >
              {inviteBusy ? "Sending…" : "Send invite"}
            </button>
          </div>
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
                <li key={invite.invite_uuid} className="school-invite-list-item">
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
                      onClick={() => void handleRevokeInvite(invite.invite_uuid)}
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
