// In-app replacement for window.confirm: same "ask, then continue or stop"
// flow, but styled like the dashboard, keyboard friendly, and not blocked
// or suppressed by the browser. Rendered by <ConfirmDialogHost /> in App.

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

export interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (confirmed: boolean) => void;
}

type Listener = (pending: PendingConfirm | null) => void;

let listener: Listener | null = null;
let current: PendingConfirm | null = null;
let nextId = 1;

export function subscribeConfirm(next: Listener): () => void {
  listener = next;
  next(current);
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

export function settleConfirm(id: number, confirmed: boolean) {
  if (!current || current.id !== id) {
    return;
  }
  const settled = current;
  current = null;
  listener?.(null);
  settled.resolve(confirmed);
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (!listener) {
    // No host mounted (e.g. a screen rendered outside the main shell).
    return Promise.resolve(window.confirm(options.message));
  }
  if (current) {
    // Only one question at a time; a second ask while one is open is a
    // double click on the same action.
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    current = { ...options, id: nextId++, resolve };
    listener?.(current);
  });
}
