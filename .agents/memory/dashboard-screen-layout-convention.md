---
name: Dashboard screen layout convention
description: Preferred layout pattern for approval/queue-style admin screens (e.g. reservations, devices) in this app
---

Approval/queue screens (things an admin works through one at a time, like pending reservation requests) should default to a searchable table of all items. Clicking a row opens a full-width detail view with a "back" button to return to the table — not an always-visible two-column sidebar+detail split.

**Why:** The user explicitly asked for the Parking Registration (reservations) screen to match the table-first pattern already used by screens like Campus Devices, rather than the persistent list+detail layout it originally had. A permanently visible narrow queue list wastes horizontal space and doesn't scale well when the list grows; a searchable table does.

**How to apply:** When redesigning or building a new admin queue/approval screen, default the view to a table (with a search box filtering by the record's key fields) and render the detail content only after a row is clicked, with a back action to return. Keep existing prop interfaces/data-fetching in the parent unchanged where possible — this is purely a presentation-layer restructuring within the screen component.
