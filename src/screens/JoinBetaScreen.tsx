import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";

import { submitBetaSelfSignup } from "../lib/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Standalone, unauthenticated page reached via the public link a school
// admin generates on the Beta Invites screen. It carries an opaque signed
// token (?t=) that identifies the school server-side; ?s= is just the
// school name for display and is not trusted for anything.
export function JoinBetaScreen() {
  const location = useLocation();
  const { token, schoolName } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      token: params.get("t")?.trim() ?? "",
      schoolName: params.get("s")?.trim() ?? "",
    };
  }, [location.search]);

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const programLabel = schoolName
    ? `${schoolName}’s Juise beta`
    : "the Juise Rider beta";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!consent) {
      setError("Please confirm you'd like to join the beta.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await submitBetaSelfSignup(token, trimmed);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-center-card join-beta-card">
        <img
          src="/Juise_Icon_Bolt.png"
          className="login-brand-icon"
          alt="Juise"
        />

        {!token ? (
          <>
            <p className="login-brand-title">Join the Juise beta</p>
            <p className="join-beta-lead">
              This invite link is missing or invalid. Ask whoever shared it with
              you for an up-to-date link.
            </p>
          </>
        ) : done ? (
          <>
            <p className="login-brand-title">You’re on the list 🎉</p>
            <p className="join-beta-lead">
              We’ve emailed <strong>{email.trim()}</strong> a link to download
              the Juise Rider app. Open it on your phone, then sign up (or log
              in) with this same email address to finish joining{" "}
              {schoolName ? <strong>{schoolName}</strong> : "your school"}.
            </p>
            <p className="join-beta-fineprint">
              Didn’t get it? Check your spam folder — the email can take a few
              minutes to arrive.
            </p>
          </>
        ) : (
          <>
            <p className="login-brand-title">Join {programLabel}</p>
            <p className="join-beta-lead">
              Enter your email and we’ll send you a link to download the app and
              get started. You’ll be added to {programLabel} automatically when
              you sign up with this address.
            </p>
            <form className="login-form join-beta-form" onSubmit={handleSubmit}>
              <label className="join-beta-field">
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label className="join-beta-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  disabled={busy}
                />
                <span>
                  I’d like to join the beta and agree to receive an email with a
                  link to download the app.
                </span>
              </label>
              {error ? <p className="error-text">{error}</p> : null}
              <button
                type="submit"
                className="primary-button join-beta-submit"
                disabled={busy}
              >
                {busy ? "Adding you…" : "Join the beta"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
