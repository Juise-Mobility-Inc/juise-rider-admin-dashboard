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
 * Two guards keep this from oscillating when the selection is cleared out
 * from under a still-present param (deleting the row you were viewing):
 *
 * - `setSearchParams` doesn't flush synchronously, so for a render or two
 *   after we write the URL, `param` still reads the pre-write value. That
 *   stale read looks exactly like a back/forward navigation, and applying
 *   it would re-open the selection the parent just cleared — which clears
 *   again, which rewrites the URL, forever. `pendingParamWriteRef` holds
 *   the value we last wrote and suppresses `applyFromUrl` until `param`
 *   actually catches up to it.
 * - A genuine deep link to an id that no longer exists (deleted row) would
 *   otherwise be handed to `applyFromUrl` on every render, since the parent
 *   never adopts it. `lastAppliedParamRef` makes us offer each distinct
 *   param to the parent at most once.
 */
export function useDetailParamSync(
  key: string,
  value: string,
  applyFromUrl: (value: string) => void,
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
