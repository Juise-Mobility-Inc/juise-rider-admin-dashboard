import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  beginWebAuthnRegistration,
  finishWebAuthnRegistration,
  listMFAMethods,
  removeTOTPMethod,
  removeWebAuthnCredential,
  type MFAMethodsSummary,
} from "../../lib/api";
import {
  isPasskeySupported,
  registerPasskey,
} from "../../lib/webauthn";

type Props = {
  authAppId: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatTimestamp(seconds: number | null): string {
  if (!seconds) return "Never used";
  return new Date(seconds * 1000).toLocaleString();
}

export function SecuritySettingsScreen({ authAppId }: Props) {
  const navigate = useNavigate();
  const [methods, setMethods] = useState<MFAMethodsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const passkeySupported = isPasskeySupported();

  async function loadMethods() {
    setLoading(true);
    setLoadError("");
    try {
      setMethods(await listMFAMethods(authAppId));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAppId]);

  const totalMethods =
    (methods?.totp_enabled ? 1 : 0) +
    (methods?.webauthn_credentials.length ?? 0);
  const canRemoveAMethod = totalMethods > 1;

  async function handleAddPasskey() {
    setBusyKey("add-passkey");
    setActionError("");
    setStatusMessage("");
    try {
      const { challengeId, options } =
        await beginWebAuthnRegistration(authAppId);
      const credential = await registerPasskey(options);
      const updated = await finishWebAuthnRegistration(
        authAppId,
        challengeId,
        credential,
      );
      setMethods(updated);
      setStatusMessage("Passkey added.");
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleRemoveTotp() {
    setBusyKey("totp");
    setActionError("");
    setStatusMessage("");
    try {
      setMethods(await removeTOTPMethod(authAppId));
      setStatusMessage("Authenticator app removed.");
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleRemoveCredential(credentialId: string) {
    setBusyKey(credentialId);
    setActionError("");
    setStatusMessage("");
    try {
      setMethods(await removeWebAuthnCredential(authAppId, credentialId));
      setStatusMessage("Passkey removed.");
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="dashboard-section security-settings-section">
      <button
        type="button"
        className="secondary-button res-back-button"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to dashboard
      </button>

      <div className="section-header">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Security Settings</h2>
          <p className="muted-text">
            Manage the two-step verification methods on your account. You can
            keep an authenticator app and one or more passkeys enrolled at
            the same time, and choose which to use each time you sign in.
            You must always have at least one method enrolled.
          </p>
        </div>
      </div>

      {loading ? <p className="muted-text">Loading&hellip;</p> : null}
      {loadError ? <p className="error-text">{loadError}</p> : null}

      {!loading && methods ? (
        <div className="panel security-methods-panel">
          <div className="panel-header">
            <h3>Authenticator app</h3>
          </div>
          {methods.totp_enabled ? (
            <div className="security-method-row">
              <span>Enabled</span>
              <button
                type="button"
                className="secondary-button"
                disabled={!canRemoveAMethod || busyKey === "totp"}
                title={
                  canRemoveAMethod
                    ? undefined
                    : "Add another method before removing this one."
                }
                onClick={() => void handleRemoveTotp()}
              >
                {busyKey === "totp" ? "Removing…" : "Remove"}
              </button>
            </div>
          ) : (
            <p className="muted-text">
              Not set up. You can add one during your next sign-in, or after
              adding a passkey here.
            </p>
          )}

          <div className="panel-header">
            <h3>Passkeys</h3>
          </div>
          {methods.webauthn_credentials.length === 0 ? (
            <p className="muted-text">No passkeys added yet.</p>
          ) : (
            <ul className="security-passkey-list">
              {methods.webauthn_credentials.map((credential) => (
                <li
                  key={credential.credential_id}
                  className="security-method-row"
                >
                  <span>
                    {credential.label || "Passkey"}
                    <span className="muted-text">
                      {" "}
                      &middot; added {formatTimestamp(credential.created_at)}
                      {" "}
                      &middot; last used{" "}
                      {formatTimestamp(credential.last_used_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      !canRemoveAMethod ||
                      busyKey === credential.credential_id
                    }
                    title={
                      canRemoveAMethod
                        ? undefined
                        : "Add another method before removing this one."
                    }
                    onClick={() =>
                      void handleRemoveCredential(credential.credential_id)
                    }
                  >
                    {busyKey === credential.credential_id
                      ? "Removing…"
                      : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="primary-button"
            disabled={!passkeySupported || busyKey === "add-passkey"}
            title={
              passkeySupported
                ? undefined
                : "Passkeys aren't supported in this browser."
            }
            onClick={() => void handleAddPasskey()}
          >
            {busyKey === "add-passkey" ? "Adding passkey…" : "Add a passkey"}
          </button>

          {statusMessage ? (
            <p className="success-text">{statusMessage}</p>
          ) : null}
          {actionError ? <p className="error-text">{actionError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
