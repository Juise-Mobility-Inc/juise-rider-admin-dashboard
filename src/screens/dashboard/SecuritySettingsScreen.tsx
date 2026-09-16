import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";

import {
  beginTOTPRegistration,
  beginWebAuthnRegistration,
  finishTOTPRegistration,
  finishWebAuthnRegistration,
  listMFAMethods,
  removeTOTPMethod,
  removeWebAuthnCredential,
  type MFAEnrollment,
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
  const [totpChallengeId, setTotpChallengeId] = useState("");
  const [totpEnrollment, setTotpEnrollment] = useState<MFAEnrollment | null>(
    null,
  );
  const [totpQrCode, setTotpQrCode] = useState("");
  const [totpCode, setTotpCode] = useState("");

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

  async function handleBeginTotpEnrollment() {
    setBusyKey("begin-totp");
    setActionError("");
    setStatusMessage("");
    try {
      const { challengeId, enrollment } = await beginTOTPRegistration(
        authAppId,
      );
      setTotpChallengeId(challengeId);
      setTotpEnrollment(enrollment);
      setTotpCode("");
      setTotpQrCode(
        await QRCode.toDataURL(enrollment.otpauth_uri, {
          width: 200,
          margin: 3,
          errorCorrectionLevel: "Q",
        }),
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setBusyKey("");
    }
  }

  function cancelTotpEnrollment() {
    setTotpChallengeId("");
    setTotpEnrollment(null);
    setTotpQrCode("");
    setTotpCode("");
  }

  async function handleConfirmTotpEnrollment(event: FormEvent) {
    event.preventDefault();
    setBusyKey("confirm-totp");
    setActionError("");
    setStatusMessage("");
    try {
      const updated = await finishTOTPRegistration(
        authAppId,
        totpChallengeId,
        totpCode,
      );
      setMethods(updated);
      cancelTotpEnrollment();
      setStatusMessage("Authenticator app added.");
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
          ) : totpEnrollment ? (
            <form
              className="mfa-form mfa-enroll-layout"
              onSubmit={(event) => void handleConfirmTotpEnrollment(event)}
            >
              <div className="mfa-enroll-qr">
                {totpQrCode ? (
                  <img
                    className="mfa-qr-code"
                    src={totpQrCode}
                    alt="Authenticator app setup QR code"
                  />
                ) : null}
              </div>
              <div className="mfa-methods">
                <div className="mfa-method">
                  <p className="mfa-method-title">Use an authenticator app</p>
                  <p className="mfa-help">
                    Scan this QR code with Google Authenticator, Microsoft
                    Authenticator, Authy, 1Password, or a similar app, then
                    enter the 6-digit code it shows below.
                  </p>
                </div>
              </div>
              <details className="mfa-recovery-codes">
                <summary>
                  Recovery codes ({totpEnrollment.recovery_codes.length}) —
                  save these before you finish
                </summary>
                <p>
                  They will not be shown again. Each code can be used once if
                  you lose access to your authenticator app.
                </p>
                <ul className="mfa-recovery-code-list">
                  {totpEnrollment.recovery_codes.map((code) => (
                    <li key={code}>
                      <code>{code}</code>
                    </li>
                  ))}
                </ul>
              </details>
              <label className="field">
                <span>6-digit code</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={6}
                  minLength={6}
                  required
                  value={totpCode}
                  onChange={(event) =>
                    setTotpCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  placeholder="123456"
                />
              </label>
              <div className="mfa-panel-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    busyKey === "confirm-totp" || totpCode.trim().length < 6
                  }
                >
                  {busyKey === "confirm-totp" ? "Confirming…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={cancelTotpEnrollment}
                  disabled={busyKey === "confirm-totp"}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="security-method-row">
              <span className="muted-text">Not set up.</span>
              <button
                type="button"
                className="secondary-button"
                disabled={busyKey === "begin-totp"}
                onClick={() => void handleBeginTotpEnrollment()}
              >
                {busyKey === "begin-totp"
                  ? "Starting…"
                  : "Add authenticator app"}
              </button>
            </div>
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
