import { useEffect, useState } from "react";

import {
  settleConfirm,
  subscribeConfirm,
  type PendingConfirm,
} from "../lib/confirm";
import { useDialog } from "../lib/useDialog";

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  useEffect(() => subscribeConfirm(setPending), []);

  const dialogRef = useDialog(pending !== null, () => {
    if (pending) {
      settleConfirm(pending.id, false);
    }
  });

  if (!pending) {
    return null;
  }

  const danger = pending.tone !== "default";
  return (
    <div
      ref={dialogRef}
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          settleConfirm(pending.id, false);
        }
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <h2 id="confirm-dialog-title">{pending.title ?? "Are you sure?"}</h2>
        <p id="confirm-dialog-message">{pending.message}</p>
        <div className="confirm-dialog-actions">
          <button
            className="secondary-button"
            type="button"
            data-autofocus
            onClick={() => settleConfirm(pending.id, false)}
          >
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            className={danger ? "danger-button" : "primary-button"}
            type="button"
            onClick={() => settleConfirm(pending.id, true)}
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
