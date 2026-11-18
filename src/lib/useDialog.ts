import { useEffect, useRef } from "react";

// Open dialogs, innermost last. Only the top one reacts to Escape/Tab, and
// the page behind stays scroll-locked while any is open.
const openDialogs: HTMLElement[] = [];
let savedBodyOverflow = "";

// The element focused before the current one. A dialog's own autoFocus
// (React focuses during commit, before effects run) can move focus inside
// before useDialog records what opened it; this remembers the opener.
let focusBeforeCurrent: HTMLElement | null = null;
let currentFocus: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLElement && event.target !== currentFocus) {
        focusBeforeCurrent = currentFocus;
        currentFocus = event.target;
      }
    },
    true,
  );
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(element: HTMLElement): HTMLElement[] {
  return Array.from(
    element.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((node) => node.offsetParent !== null || node === document.activeElement);
}

/**
 * Gives a hand-rolled modal the keyboard and scroll behaviour of a real
 * dialog: Escape closes it, Tab stays inside it, focus moves in on open and
 * back to whatever opened it on close, and the page behind doesn't scroll.
 * Attach the returned ref to the dialog's outermost element (the backdrop).
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const element = ref.current;
    if (!open || !element) {
      return;
    }

    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previouslyFocused =
      active && element.contains(active)
        ? focusBeforeCurrent && !element.contains(focusBeforeCurrent)
          ? focusBeforeCurrent
          : null
        : active;

    if (openDialogs.length === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(element);

    if (!element.contains(document.activeElement)) {
      const autofocus = element.querySelector<HTMLElement>(
        "[data-autofocus], [autofocus]",
      );
      const target = autofocus ?? focusableWithin(element)[0];
      if (target) {
        target.focus({ preventScroll: true });
      } else {
        if (!element.hasAttribute("tabindex")) {
          element.setAttribute("tabindex", "-1");
        }
        element.focus({ preventScroll: true });
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== element || !element) {
        return;
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = focusableWithin(element);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !element.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !element.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = openDialogs.lastIndexOf(element);
      if (index >= 0) {
        openDialogs.splice(index, 1);
      }
      if (openDialogs.length === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return ref;
}
