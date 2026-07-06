---
name: Deep-linking to a screen's edit modal
description: Pattern for opening a specific record's edit modal when navigating into a setup screen from elsewhere (e.g. map overview pins)
---

Each dashboard setup screen (Packs, Zones, POIs) owns its "which draft is being edited" state differently:

- **Packs**: modal visibility is derived directly from `editingPack && packEditDraft` in App.tsx — no local `isOpen` flag. Calling the existing `handleStartEditingPack(pack)` before navigating is sufficient; no extra effect needed.
- **Zones / POIs**: each screen keeps its own local `isZoneModalOpen` / `isPoiModalOpen` boolean, separate from the `activeZoneDraftId` / `activePoiDraftId` prop (which only tracks *which* draft, not modal visibility). Setting the active-id prop alone does NOT open the modal.

**Why:** These three screens evolved independently and never unified their modal-open state management, so a generic "set active id and it opens" assumption is wrong for Zones/POIs.

**How to apply:** To deep-link into a Zones/POIs edit modal from another screen, set the active draft id via the exposed setter, navigate to the screen, and add a `useEffect` inside that screen which opens the modal once the matching draft exists in its list — guarded with a ref (e.g. `autoOpenedIdRef`) so it doesn't reopen after the user manually closes it. For Packs, just call the existing start-editing handler before navigating.
