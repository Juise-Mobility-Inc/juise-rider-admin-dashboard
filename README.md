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

For local QA development, configure only:

```env
VITE_API_BASE=/kca-api
VITE_KCA_PROXY_TARGET=https://qa-kca-proxy.juisemobility.com
```

For a deployed QA dashboard without a same-origin reverse proxy, build with:

```env
VITE_API_BASE=https://qa-kca-proxy.juisemobility.com
```

Do not disable TLS verification in Vite. Direct private service URLs returning
Google `403` is expected behavior.
