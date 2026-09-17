import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn();
}

// Normalizes the browser's WebAuthn errors (most commonly the user
// dismissing or timing out the platform prompt) into a message that's safe
// to show directly, so callers don't each have to special-case
// NotAllowedError/AbortError themselves.
function friendlyWebAuthnError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return new Error("Passkey prompt was cancelled or timed out.");
    }
    if (error.name === "InvalidStateError") {
      return new Error("This passkey is already registered.");
    }
  }
  return error instanceof Error ? error : new Error("Unable to use passkey.");
}

export async function registerPasskey(
  optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  try {
    return await startRegistration({ optionsJSON });
  } catch (error) {
    throw friendlyWebAuthnError(error);
  }
}

export async function authenticateWithPasskey(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  try {
    return await startAuthentication({ optionsJSON });
  } catch (error) {
    throw friendlyWebAuthnError(error);
  }
}
