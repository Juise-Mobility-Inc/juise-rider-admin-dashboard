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
  - **Single unified view** — all students' rides shown together, no mode toggle.
  - **Col 1 — Students (filter)**: 4-stat summary grid (Rides/Violations/Check-ins/Active) + student list sorted by ride count. Click a student to filter col 2 to just their rides; click again to clear. Loading progress bar shown while histories fetch in background (concurrency-4).
  - **Col 2 — Rides**: date pills (All/Today/Yesterday/This week), Source + Content dropdowns, search box (matches student name, date, mode). Empty state when no rides match filters.
  - **Col 3 — Detail panel**: unchanged; select any ride to view full stats, GPS map, violations, check-ins.
  - **Dashboard KPI deep-links**: "Rides today/yesterday/This week/POI visits" navigate to `/routes?dateFilter=…` landing with the right date pre-selected.

## Deployment
- **Target:** Static site
- **Build command:** `npm run build`
- **Public directory:** `dist`
