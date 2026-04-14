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

## Deployment
- **Target:** Static site
- **Build command:** `npm run build`
- **Public directory:** `dist`
