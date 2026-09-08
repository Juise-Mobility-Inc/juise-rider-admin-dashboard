import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Keeps a drill-in detail selection in sync with a URL search param so the
 * browser back/forward buttons work for detail views.
 *
 * - When `value` changes (e.g. a row click opened the detail), the param is
 *   pushed onto the history stack.
 * - When the param changes (back/forward navigation or a deep link),
 *   `applyFromUrl` is called so the screen can open/close the detail view.
 *
 * `ready` guards the load race. Screens routinely clear an out-of-range
 * selection while their list is still loading (`!list.some(...) -> setSel("")`).
 * If the hook trusted that transient empty `value`, it would delete a
 * perfectly valid `?key=<id>` deep link before the data that backs it
 * arrives, and the linked row would never open. While `ready` is false the
 * hook does nothing in either direction; it starts syncing once the screen
 * reports its first load is done. Screens with no async load leave `ready`
 * at its default (`true`).
 *
 * Two more guards keep it from oscillating once `ready`:
 *
 * - `setSearchParams` doesn't flush synchronously, so for a render or two
 *   after we write the URL, `param` still reads the pre-write value. That
 *   stale read looks exactly like a back/forward navigation, and applying
 *   it would re-open a selection that was just cleared (deleting the row you
 *   were viewing) — which clears again, rewrites the URL, forever.
 *   `pendingParamWriteRef` holds the value we last wrote and suppresses
 *   `applyFromUrl` until `param` catches up to it.
 * - A genuine deep link to an id that no longer exists (deleted row) would
 *   otherwise be handed to `applyFromUrl` on every render, since the screen
 *   never adopts it. `lastAppliedParamRef` makes us offer each distinct
 *   param to the screen at most once.
 */
export function useDetailParamSync(
  key: string,
  value: string,
  applyFromUrl: (value: string) => void,
  ready = true,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = (searchParams.get(key) ?? "").trim();
  const lastValueRef = useRef(value);
  const lastAppliedParamRef = useRef<string | null>(null);
  const pendingParamWriteRef = useRef<string | null>(null);
  const applyRef = useRef(applyFromUrl);
  applyRef.current = applyFromUrl;

  useEffect(() => {
    const valueChanged = value !== lastValueRef.current;
    lastValueRef.current = value;

    // Our last URL write has landed — stop suppressing URL-driven changes.
    if (
      pendingParamWriteRef.current !== null &&
      param === pendingParamWriteRef.current
    ) {
      pendingParamWriteRef.current = null;
    }

    if (param === value) {
      lastAppliedParamRef.current = param;
      return;
    }

    // Screen's initial load hasn't finished: neither direction is
    // trustworthy yet. Hold until it reports ready, then reconcile.
    if (!ready) {
      return;
    }

    if (valueChanged) {
      const next = new URLSearchParams(searchParams);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      setSearchParams(next);
      pendingParamWriteRef.current = value;
      return;
    }

    // param differs from value and value didn't change: a URL-driven change
    // (deep link, back/forward). Ignore it while our own write is still in
    // flight, or if we've already offered this exact param once.
    if (pendingParamWriteRef.current !== null) {
      return;
    }
    if (param === lastAppliedParamRef.current) {
      return;
    }

    lastAppliedParamRef.current = param;
    applyRef.current(param);
  });
}
