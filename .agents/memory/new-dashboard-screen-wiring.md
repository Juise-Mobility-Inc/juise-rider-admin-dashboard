---
name: New dashboard screen wiring checklist
description: The set of coordinated edits App.tsx requires when adding a brand-new dashboard screen/route, so nothing is left half-wired.
---

Adding a new full-page dashboard screen (as opposed to editing an existing one) requires touching several places in `App.tsx` plus the source screen it links from. Missing any one leaves a dead route, an unreachable screen, or a broken nav item:

1. Add the new value to the `Section` union type.
2. Add an entry to the `dashboardSections` array (gives it a `path` and label, and makes `sectionPathByName` resolve it).
3. Import the new screen component and add a `case` in the big `switch (currentSection)` render block that renders it with whatever props it needs (commonly `activeSchoolId` / `context.managedAppId`).
4. Add a `NavLink` for it inside the relevant sidebar `nav-group` block (copy the existing `NavLink` pattern with `isActive` className logic) — otherwise the screen is only reachable by typing the URL.
5. If another screen has a card/arrow meant to deep-link into the new screen (e.g. a `DashboardSectionArrow`), update its `to=` prop to the new path.

**Why:** these five touch points are spread across a single ~5000-line file and are easy to partially do (e.g. add the route/case but forget the sidebar nav link, leaving the screen orphaned from normal navigation).

**How to apply:** when asked to add a new dashboard-linked screen, grep for an existing similar screen's wiring (Section type, dashboardSections entry, switch case, NavLink, and any arrow/link pointing to it) and replicate all five edits, not just the render case.
