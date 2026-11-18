import { lazy, type ComponentType } from "react";

const reloadFlagKey = "juise-dashboard-chunk-reload";

// A tab left open across a deploy still has the old index.html, whose screen
// chunks no longer exist on the server (each image only ships its own build).
// The first failed chunk load reloads the page once to pick up the new build;
// if it fails again right after that reload, the error is real and surfaces
// through the error boundary instead of looping.
// Same constraint as React.lazy itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<T extends ComponentType<any>>(
  load: () => Promise<T>,
) {
  return lazy(async () => {
    try {
      const component = await load();
      try {
        window.sessionStorage.removeItem(reloadFlagKey);
      } catch {
        // Storage unavailable (private mode): nothing to clear.
      }
      return { default: component };
    } catch (error) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded =
          window.sessionStorage.getItem(reloadFlagKey) !== null;
        if (!alreadyReloaded) {
          window.sessionStorage.setItem(reloadFlagKey, String(Date.now()));
        }
      } catch {
        // Without storage we can't tell a reload loop apart, so don't reload.
        alreadyReloaded = true;
      }
      if (!alreadyReloaded) {
        window.location.reload();
        // Keep Suspense showing its fallback until the reload happens.
        return new Promise<never>(() => {});
      }
      throw error;
    }
  });
}
