---
name: Detail-view URL sync
description: Convention for making browser back/forward work on drill-in detail views in the admin dashboard
---

Rule: every drill-in detail view (table row → detail screen) syncs its selection to a URL search param using the shared `useDetailParamSync(key, value, applyFromUrl)` hook.

**Why:** Users expect browser back to close a detail view. State-only drill-ins broke back-button navigation; a bidirectional ref-guarded hook avoids sync loops and deep-link mount races (URL wins on mount, latest change wins after).

**How to apply:** In the screen component, pass the selected id as `value` ("" when closed) and open/close the detail in `applyFromUrl`. Param keys in use: challenge, student, reservation, registration, report, device, event (audit log). Gotchas: if a screen auto-selects a default row (Challenges), only sync when the drill-in view is actually open, or history gets polluted; screens with selection held in App state get cleaned up on remount because the hook applies the empty param on mount.
