---
name: Deep-linking to a screen's edit modal
description: Pattern for opening a specific record's edit modal when navigating into a setup screen from elsewhere (e.g. map overview pins)
---

Each dashboard setup screen (Packs, Zones, POIs) owns its "which draft is being edited" state differently:

- **Packs**: modal visibility is derived directly from `editingPack && packEditDraft` in App.tsx — no local `isOpen` flag. Calling the existing `handleStartEditingPack(pack)` before navigating is sufficient; no extra effect needed.
- **Zones / POIs**: each screen keeps its own local `isZoneModalOpen` / `isPoiModalOpen` boolean. The `activeZoneDraftId` / `activePoiDraftId` prop is dual-purpose — it's also used for map highlighting and as the target for point-edit patch functions — so it must NOT be reused as the "open the modal" signal.

**Why:** An earlier version watched `activeZoneDraftId`/`activePoiDraftId` directly with a `useEffect` + `useRef` "already auto-opened" guard. The ref resets on every remount (i.e. every time the user navigates to the tab), but the id itself can still be non-empty from a prior session — so the modal force-opened on plain screen entry, not just on deep-link. Guarding with a ref instead of a dedicated signal doesn't survive remounts.

**How to apply:** Use a separate one-shot request id (e.g. `zoneEditRequestId` / `poiEditRequestId`), owned by App.tsx and passed as its own prop alongside a `on...RequestHandled` callback. Only the deep-link caller (e.g. `onSelectZoneForEdit`) sets this id; the target screen's `useEffect` watches only that id, opens the modal if the draft exists, then immediately calls the handled-callback to clear it back to empty so it can't refire. Do not gate on `activeZoneDraftId`/`activePoiDraftId` or a ref-based dedupe — those don't distinguish "user navigated here" from "someone deep-linked here." For Packs, just call the existing start-editing handler before navigating.
