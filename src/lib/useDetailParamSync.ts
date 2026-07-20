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
 */
export function useDetailParamSync(
  key: string,
  value: string,
  applyFromUrl: (value: string) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = (searchParams.get(key) ?? "").trim();
  const lastValueRef = useRef(value);
  const lastParamRef = useRef<string | null>(null);
  const applyRef = useRef(applyFromUrl);
  applyRef.current = applyFromUrl;

  useEffect(() => {
    const valueChanged = value !== lastValueRef.current;
    const paramChanged =
      lastParamRef.current === null || param !== lastParamRef.current;
    lastValueRef.current = value;
    lastParamRef.current = param;

    if (param === value) {
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
      lastParamRef.current = value;
      return;
    }

    if (paramChanged) {
      applyRef.current(param);
    }
  });
}
