# Juise Rider Admin Dashboard

React + TypeScript dashboard for Juise Pack school administration.

## What it does

- Authenticates admins against `global-auth-service` with `app_id=juise_rider_admin_dashboard`
- Manages Nebula school records and school term calendars
- Reviews pending school term parking reservations
- Approves or denies reservation requests
- Shows the requesting student's Nebula profile, school memberships, and registered devices
- Shows the full school roster with front/back ID photos, student IDs, and school-term parking assignments

## Local development

1. Copy `.env.example` to `.env` if you need to override ports or proxy targets.
2. Start the backing services:
   - `global-auth-service` on `http://localhost:3864`
   - `nebula-user-server` on `http://localhost:7893`
   - `hub-store-service` on `http://localhost:9635`
   - `kca-proxy` on `http://localhost:8088`
3. Run the dashboard:

```bash
npm install
npm run dev
```

The Vite dev server proxies:

- `/auth-api` -> global auth
- `/nebula-api` -> nebula user server
- `/hub-store-api` -> hub-store service
- `/kca-api` -> kca-proxy

## Notes

- The dashboard expects an account that is marked `is_admin=true`.
- Admin tokens are issued for `juise_rider_admin_dashboard`, then used cross-app against `juise-customer-app` resources.
- Hub-store admin reservation routes currently authenticate by the `admin_user` path parameter, so the dashboard uses the signed-in admin UUID there.
