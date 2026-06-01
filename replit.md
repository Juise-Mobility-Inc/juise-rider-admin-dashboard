# Juise Rider Admin Dashboard

## Overview
A React-based admin dashboard for managing the "Juise Pack" school system. Administrators can manage school profiles, academic terms, geospatial zones (no-go, speed limit), student challenges/competitions, and parking spot reservations ("Juise Packs").

## Tech Stack
- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite 8
- **Routing:** React Router Dom 7
- **Maps:** Leaflet + React-Leaflet
- **Package Manager:** npm

## Project Structure
- `src/App.tsx` — Main application (~6200 lines), contains routing and most views
- `src/components/` — Reusable map components (PackLocationPicker, SchoolZoneMapEditor)
- `src/lib/api.ts` — API interfaces and request utility for backend microservices
- `src/lib/storage.ts` — localStorage helpers for session and dashboard context
- `public/` — Static assets (favicon, icons)

## Backend Microservices (via Vite proxy)
The app proxies to external backend services:
- `/auth-api` → global-auth-service (default: localhost:3864)
- `/nebula-api` → nebula service (default: localhost:7893)
- `/hub-store-api` → hub-store service (default: localhost:9635)
- `/kca-api` → kca-proxy service (default: localhost:8088)

Proxy targets can be overridden via environment variables:
- `VITE_AUTH_PROXY_TARGET`
- `VITE_NEBULA_PROXY_TARGET`
- `VITE_HUB_STORE_PROXY_TARGET`
- `VITE_KCA_PROXY_TARGET`

## Development
- **Workflow:** "Start application" runs `npm run dev` on port 5000
- **Host:** `0.0.0.0` (required for Replit preview proxy)
- **All hosts allowed** for Replit iframe proxying

## UI Design Improvements (iterative)
- **Login/Signup:** Full-bleed split layout — dark navy hero left, white form panel right, segmented pill tab switcher for Create/Sign In
- **Students screen:** Master-detail layout — searchable sidebar roster + rich detail panel (identity, ID photos, devices, terms, reservations)
- **Juise Packs screen:**
  - Tab switcher is now a segmented control (not two loose pill buttons)
  - Default landing tab is "Existing Packs"; "Create New Pack" tab is accessible from both the segmented control and a "+ New Pack" button in the header
  - Create form: side-by-side layout — form fields (numbered step sections) on left, sticky location map on right
  - Existing pack cards: compact header row (thumbnail photo + name + status/spots/campus/location badges + quick menu), expandable body (spot chips grid with per-spot QR actions, actions row, inline edit form, collapsible spot UUIDs)
  - Spot chips show QR status inline with "↓ QR" or "+ QR" micro-buttons
- **Student Routes screen (`/routes`):**
  - **Dual view mode** — segmented "By Student" / "All Students · By Time" toggle above the 3-column layout
  - **By Student mode** (default): col 1 = student roster, col 2 = that student's rides (with filter bar), col 3 = detail panel
  - **By Time mode**: col 1 = period overview (4-stat grid + student breakdown list), col 2 = ALL students' rides sorted newest-first, col 3 = detail panel for selected ride. Loads all students' histories with concurrency-4 background fetcher; progress bar shown during load.
  - **Filter bar** (shared both modes): date pills (All/Today/Yesterday/This week), Source + Content dropdowns, search box. Search also matches student names in time mode.
  - **Student breakdown** in time mode: click a student to narrow col 2 to just their rides (toggle off to clear); ride count badge turns red if they have violations.
  - **Dashboard KPI deep-links**: "Rides today/yesterday/This week/POI visits" now navigate to `/routes?view=time&dateFilter=…` landing directly in time mode with the right date pre-selected.

## Deployment
- **Target:** Static site
- **Build command:** `npm run build`
- **Public directory:** `dist`
