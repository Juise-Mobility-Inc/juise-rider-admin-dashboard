# Juise Rider Admin Dashboard

The Juise Rider Admin Dashboard gives school administrators one place to manage campus mobility programs, students, vehicles, parking, safety rules, engagement, and reports.

This help center is written for dashboard users. You do not need technical or software-development experience to follow it.

## Start here

If this is your first time using the dashboard:

1. Follow [Getting started](getting-started.md) to sign in and learn the layout.
2. Use [Set up your school](school-setup.md) if your organization is new to Juise.
3. Open the guide for the task you need to complete.

## What you can manage

* School identity, academic terms, zones, and points of interest
* Student records and leaderboards
* Vehicle registrations, campus devices, and fees
* Juise Packs, parking reservations, and parking incidents
* Ride penalties and violation reviews
* Challenges, games, and student notifications
* Downloadable operational reports

## Before making changes

Your access is limited to the school associated with your account. If the wrong school appears—or no school appears—stop and contact your Juise administrator.

Actions such as approving a reservation, declining a vehicle, sending a notification, or deleting a rule can immediately affect students. Confirm the selected student, school, audience, dates, and status before continuing.

## Developer API boundary

The dashboard has one backend origin: KCA. It must not connect directly to
Global Auth, Nebula User Server, or Hub Store Service. KCA validates Juise
administrator tokens and adds its Google Cloud service identity when invoking
those private services.

The KCA target is selected from the Git branch at build/start time:

| Git branch | Environment | KCA URL |
| --- | --- | --- |
| `qa` | QA | `https://qa-kca-proxy.juisemobility.com` |
| `main`, `prod`, `production` | Production | `https://kca-proxy.juisemobility.com` |
| Feature, development, or unknown branch | QA | `https://qa-kca-proxy.juisemobility.com` |

Unknown branches intentionally use QA so a new branch cannot accidentally
send traffic to production. The Vite development and preview servers expose a
same-origin `/kca-api` path and forward it to the selected KCA URL.

For normal local development, configure only:

```env
VITE_API_BASE=/kca-api
```

Use `VITE_DEPLOYMENT_ENV=qa|prod`, `VITE_GIT_BRANCH=<branch>`, or
`VITE_KCA_PROXY_TARGET=<url>` only when an explicit override is required. For
a deployment without the Vite same-origin proxy, build with the appropriate
direct KCA origin:

```env
VITE_API_BASE=https://qa-kca-proxy.juisemobility.com
```

Do not disable TLS verification in Vite. Direct private service URLs returning
Google `403` is expected behavior.

## Google Cloud deployment

The dashboard is migrating from Replit to a public Cloud Run service. Replit
remains available until QA is verified and the public DNS record is changed.

| Environment | Branch | Intended URL | Google project | KCA upstream |
| --- | --- | --- | --- | --- |
| QA | `qa` | `https://qa-dashboard.juisemobility.com` | `juise-fed-pre-run-154427` | QA KCA Cloud Run origin |
| Production | `prod` | `https://dashboard.juisemobility.com` | `juise-fed-prod-run-154427` | Production KCA Cloud Run origin |

The container serves the compiled Vite application and forwards `/kca-api/*`
to the KCA target configured by Terraform. This keeps API traffic same-origin
in the browser and prevents direct dashboard access to private services.

See [GCP-DEPLOYMENT.md](GCP-DEPLOYMENT.md) for bootstrap, release, DNS cutover,
verification, and rollback instructions.
