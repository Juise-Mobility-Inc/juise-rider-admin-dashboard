# Juise Rider Admin Dashboard Customer Guide

## Purpose of this guide

The Juise Rider Admin Dashboard helps a school manage student mobility, vehicle registration, parking, riding rules, rewards, notifications, and reporting from one place.

This guide explains:

- how to sign in and navigate the dashboard;
- what each area of the dashboard is used for;
- what common terms and statuses mean;
- what an administrative action changes for students; and
- which actions should be reviewed carefully before they are completed.

The features and data visible to you are scoped to your school. If a page says that the login is not scoped to a school, contact your Juise administrator instead of entering data under the wrong organization.

## Signing in and account security

1. Open the dashboard and select **Sign In**.
2. Enter your username, email address, or phone number and your password.
3. When prompted for the first time, scan the QR code with Google Authenticator or another TOTP-compatible authenticator app.
4. Enter the current six-digit security code.
5. Save the one-time recovery codes somewhere secure. They are only displayed during setup.

After a successful two-factor authentication check, that browser is trusted for 30 days. During that period, password sign-ins from the same browser do not require another authenticator code. A different browser, cleared browser storage, or an expired trust period will require two-factor authentication again.

A recovery code can replace an authenticator code once. Used recovery codes cannot be reused.

## Navigating the dashboard

Use the left sidebar to open a workspace. Sidebar groups can be expanded or collapsed, and the sidebar itself can be resized or collapsed.

Most pages use the following patterns:

- **Refresh** reloads current information from the server. It does not save unsaved form changes.
- **Save** or **Save Changes** writes the current form values to the school record.
- **Cancel**, **Close**, or **Discard** exits an editor. Unsaved changes may be lost.
- **Active** means a rule or configuration is eligible for use by the student app and backend services.
- **Inactive** keeps the record for reference but prevents it from being applied to new activity.
- **Delete** removes a record. Treat deletion as permanent unless the screen explicitly says otherwise.
- **Download CSV** exports the currently described dataset for spreadsheet or reporting use. It does not change dashboard data.
- **Copy ID** copies an internal identifier for support and troubleshooting. It does not change the record.

## Recommended initial setup order

For a new school, configure the dashboard in this order:

1. Complete the **School Profile**.
2. Add **School Terms**.
3. Create **Registration Fee** and **Violation Fee** rules.
4. Add **School Zones** and their enforcement policies.
5. Add **Points of Interest**.
6. Create **Juise Packs** and parking spots.
7. Review vehicle registrations and pending parking reservations.
8. Add challenges, games, and notification campaigns as needed.

The school profile must be saved before several other areas—including media uploads and campus configuration—can be managed.

## Dashboard home

The main **Dashboard** is a summary of current campus activity. It can include student counts, registered devices, reservations, income, penalties, parking reports, ride activity, student rankings, and POI rankings.

Use summary cards to identify work that needs attention. Opening a card or linked row takes you to the detailed workspace where the record can be reviewed.

Dashboard totals are operational indicators, not financial settlement statements. Use the downloadable reports for reconciliation and detailed analysis.

## School Profile

The **School Profile** defines the identity and default settings used throughout the dashboard and student experience.

### Important fields

- **School ID** is the stable identifier used to scope records to the school. Avoid changing it after launch unless directed by Juise support.
- **School name/title** is the customer-facing school label.
- **Default campus ID** is the campus automatically selected when a feature needs a campus and none is specified.
- **Logo** is displayed in school-branded experiences.
- **Color scheme** controls primary, secondary, accent, background, and text colors.
- **Active** indicates whether the school configuration is enabled.
- **Metadata** contains advanced structured settings. Only edit it when you understand the expected JSON format.

### What actions mean

- **Save School Profile** publishes the current identity and configuration values.
- **Upload Logo** stores and associates a new school logo. Save the school profile before uploading.
- Changing brand colors can immediately affect dashboard and customer-facing presentation after the new configuration is loaded.

## School Terms

A **term** is an academic date range during which parking reservations or other term-based programs are available. Examples include Fall 2026, Winter 2027, or Summer Session.

- **Start date** is the first day of the term.
- **End date** is the final day of the term.
- **Reservable term** means the term can be referenced by student parking reservation workflows.

### What actions mean

- **Add Term** creates another term row in the editor.
- **Remove** removes the term from the draft list.
- **Save Terms** publishes the complete displayed term list. Review removed or changed dates carefully because existing customer reservations may refer to a term.

## School Zones / Penalty Zones

A **zone** is a geographic polygon used to evaluate riding behavior.

### Zone types

- **No-go zone** is an area where riding is not permitted.
- **Speed-limit zone** is an area where riders must stay at or below the configured speed.

### Enforcement terms

- **Polygon** is the boundary drawn on the map.
- **Speed limit** is the maximum permitted speed for a speed-limit zone.
- **Punishment policy** defines what happens after one or more detected violations.
- **Tier/rule** defines a consequence for a range of violation counts.
- **Points lost** is the number of reward points removed when the tier applies.
- **Notify student** sends or enables a student-facing notice for the event.
- **Dashboard review required** places the event into an administrative review workflow.
- **Warning** records a warning without necessarily deducting points.

### What actions mean

- **Create/Save Zone** publishes the boundary and policy used for future ride evaluation.
- **Active** allows the zone to be used for enforcement. Inactive zones remain stored but should not affect new rides.
- **Delete/Remove Zone** removes the configured area. Historical ride events may still retain their original zone information.
- **Import CSV** creates or updates zones from a structured file. Verify coordinates and units before saving.

Changes to a zone affect future detection. They do not necessarily recalculate previously recorded rides.

## Points of Interest (POIs)

A **Point of Interest**, or **POI**, is a mapped destination or check-in area used for engagement, ride tracking, or rewards.

- **Latitude/longitude** identifies the center point.
- **Radius** defines how close a rider must be to count as visiting the POI.
- **Bonus points** is the reward associated with a qualifying visit.
- **Active** determines whether the POI is available for new activity.

### What actions mean

- **Create/Save POI** publishes the location and reward settings.
- **Delete/Remove POI** removes it from active configuration; historical visits can remain in reports.
- **Import CSV** adds multiple POIs. Review coordinates, radius units, and bonus values before saving.
- Selecting a POI on the map opens its details or editor.

## Ride Challenges

A **Ride Challenge** is a time-limited campaign in which students work toward a measurable goal.

- **Metric type** describes what is counted, such as distance or points.
- **Target value** is the amount needed to complete the challenge.
- **Audience** identifies who can participate.
- **Start/end time** determines whether the challenge is upcoming, live, or ended.
- **Participant progress** shows how close a participant is to completion.
- **Repeat** creates additional challenge periods using the selected interval and count.

### Challenge statuses

- **Upcoming** means the start time has not arrived.
- **Live** means the current time is between the start and end times and the challenge is active.
- **Ended/Past** means the end time has passed or the challenge is no longer active.

### What actions mean

- **Create Challenge** publishes a new campaign.
- **Save Changes** updates the selected challenge.
- **Delete** removes the challenge after confirmation. This can remove the campaign from customer access; export progress first if records are needed.
- **Download CSV** exports participant progress.
- **Upload Image** changes campaign artwork.

## Challenge Games

A **Challenge Game** is a scavenger-hunt-style experience built from GPS check-in stops.

- **Stop/checkpoint** is a location a participant must visit.
- **Clue** is the customer-facing instruction that helps locate a stop.
- **Check-in radius** is the permitted distance from the stop coordinates.
- **Prize points** are awarded for completing a stop when supported by the game rules.
- **Sort order** controls the displayed or required sequence.

Adding, removing, or reordering stops changes the customer game. Review all coordinates and clues before publishing.

## Notifications

The **Notifications** workspace sends custom push notifications and displays dashboard notification history.

### Audiences

- **Campus Wide** targets the school-wide audience configured by the notification service.
- **Students** targets only the selected students or supplied recipient identifiers.

### Message fields

- **Title** is the notification heading.
- **Message** is the main customer-facing copy.
- **URL/deep link** controls where the app opens when the notification is selected.
- **Image and icons** control supported notification artwork.
- **Preview** is an approximation; final appearance varies by device and operating system.

### What actions mean

- **Send Notification** attempts immediate delivery to the selected audience. It is not a draft or approval action.
- A **Sent** history status means the provider accepted the request; it does not guarantee every device displayed the notification.
- A **Failed** status means the send request did not complete successfully. Open the history details for diagnostics.

Always confirm the audience and recipient count before sending. Push notifications can be customer-visible immediately and generally cannot be recalled.

## Juise Packs and parking spots

A **Juise Pack** is a school-managed parking location containing one or more reservable spots.

- **Pack** is the parent parking location.
- **Spot** is an individual parking space within a pack.
- **Campus ID** associates the pack with a campus.
- **Pack QR code** identifies or opens the overall pack experience.
- **Spot QR code** identifies a specific space.

### What actions mean

- **Create Pack** creates the parking location and requested number of spots.
- **Save Changes** updates pack details such as name, description, and location.
- **Generate QR** creates QR data for the selected pack or spot when needed.
- **Download QR** downloads a printable QR image.
- **Import CSV** creates multiple packs from a structured file.

Print and install the QR code for the correct pack or spot. A spot QR placed at the wrong physical location can cause incorrect customer check-ins or reservations.

## Pending parking reservations

A **reservation** is a student's request to use a Juise Pack spot for a school term.

- **Pending** means an administrator has not made a decision.
- **Approved** means the reservation is accepted and removed from the pending queue.
- **Denied** means the request is rejected and removed from the pending queue.

### What actions mean

- **Approve** accepts the selected student's reservation request.
- **Deny** rejects it after confirmation.
- Opening a request shows the student, term, pack, spot, and device information used to make the decision.

Approval can affect spot availability and the student's parking access. Confirm the term, spot, and applicant before acting.

## Students

The **Students** workspace is the school roster and the main place to inspect a student's complete record.

A student profile can include:

- membership and student ID;
- contact/profile information;
- registered devices and beacons;
- parking reservations;
- ride sessions and route history;
- POI visits;
- parking and ride violations;
- challenge participation; and
- photos or other associated media.

### What actions mean

- **Refresh** reloads the roster and related data.
- **Download Roster CSV** exports the currently filtered roster rows.
- **Download All CSV** prepares the broader student information export.
- **Download CSV** within a student profile exports that student's displayed information.
- Selecting a registered device opens its identifiers, registration details, beacon information, and related records.

## Student Leaderboard

The **Student Leaderboard** ranks students using recorded activity and the selected reporting period. Depending on the displayed metric, ranking can reflect points, distance, rides, or another activity value.

Leaderboard values depend on completed data processing. Recently completed rides may not appear immediately. Use the student detail and downloadable reports when an exact audit trail is required.

## Vehicle Registrations

The **Vehicle Registration Review Queue** contains student-submitted bikes, e-bikes, scooters, and other devices awaiting or retaining a review status.

### Registration terms

- **Matched fee** is the most specific active registration fee rule matching the device and powertrain.
- **Manual fee** is an amount entered by the administrator for this registration.
- **Waived fee** means the registration is approved with no payment due.
- **Awaiting payment** means approval was granted, but the student must pay before QR access unlocks.
- **QR locked/unlocked** indicates whether the registered device has the relevant QR access available.
- **Review note** is customer-facing context. A note is optional for approval and required for decline.

### What approval actions mean

- **Approve + request matched fee** approves the registration and charges the matching configured fee. QR access remains locked until payment when a balance is due.
- **Approve + request manual fee** approves the registration using the amount entered in **Manual fee**.
- **Approve – no fee due** approves the registration when no positive matching rule exists.
- **Waive fee + approve** approves the registration and records that no payment is due.
- **Decline** rejects the registration and sends/stores the required review explanation for the student.

Verify the device, student, evidence photo, selected fee, and note before approval or decline.

## Registration Fees

A **registration fee rule** determines the amount due when a device registration is approved.

- **Device type** limits the rule to a type such as bicycle, e-bike, or scooter.
- **Powertrain** distinguishes electric and non-electric devices where applicable.
- **Any** acts as a fallback when a more specific active rule does not match.
- **Amount** is stored and charged in USD.
- **Active** allows the rule to participate in fee matching.

The dashboard prefers the most specific matching active rule. A rule matching both device type and powertrain takes precedence over a general fallback.

### What actions mean

- **Add Rule** creates the rule.
- **Save Changes** updates an existing rule.
- **Edit** loads a rule into the form.
- **Delete** removes/deactivates the rule for future matching. It does not automatically change fees already assigned to registrations.

## Campus Devices

The **Campus Devices** workspace shows registered student devices and their available campus/location information.

Use it to search by student or device, inspect registration and beacon details, open related records, and center available beacon locations on a map.

- **Registered device UUID** is the permanent internal identifier for a student device registration.
- **Beacon MAC** identifies a physical Bluetooth beacon associated with a device.
- **Last seen** is the most recent accepted beacon observation, not guaranteed real-time location.

## Map Overview

The **Map Overview** combines configured campus geography and available live/recent operational data.

It can display:

- POIs and check-in radii;
- school zones and boundaries;
- Juise Packs and parking locations;
- registered-device beacon locations; and
- selected item details.

**Refresh beacon locations** requests the latest available sightings. A mapped point reflects the available observation and accuracy, not continuous GPS tracking.

The **Sightings Map** may appear only in development environments and should not be treated as a standard production customer workflow.

## Parking Reports

A **parking report** is an incident submitted about a parking situation. Report types include:

- **Reserved spot occupied** — someone is using a spot reserved for another customer;
- **Improper parking** — a device is parked incorrectly;
- **Blocking access** — a parked device obstructs access; and
- **Other** — an incident outside the predefined categories.

Reports can include a description, incident photo, QR photo, location, reporter, pack, spot, and reservation.

### Report statuses

- **Submitted** means the report is new and has not been reviewed.
- **Under Review** means an administrator is actively investigating it.
- **Resolved** means the issue was confirmed/handled and no further work is expected.
- **Dismissed** means the report was reviewed and determined not to require action.

Submitted and under-review reports count as open. Changing a report to resolved or dismissed removes it from the open count but preserves it in history.

## Penalty Reports

The **Penalty Reports** workspace brings together active/history parking penalties and detected ride violations.

- **Open** shows parking penalties still requiring action.
- **History** shows closed or resolved parking penalties.
- **Ride** shows tracked no-go and speed-limit events.
- **Payment amount** is the fee associated with a parking penalty when present.
- **Points lost** is the reward-point consequence of a ride violation.
- **Confidence** is the system's detection confidence based on the available evidence; it is not a legal certainty.

Use evidence, location, student, device, and timestamps together before making an enforcement decision.

## Ride Information

The **Ride Information** workspace is the detailed compliance review for speed-limit and no-go events across students.

### Important terms

- **Ride session** is a recorded period of travel.
- **Tracked session** generally started through the normal customer ride flow.
- **Background/untracked session** was detected or processed without the student pressing **Start Ride**. It should receive additional review when evidence is incomplete.
- **Violation event** is a detected occurrence inside a configured zone.
- **Evidence point count** is the number of location samples supporting the event.
- **Confidence percentage** summarizes the strength of the detection evidence.
- **Needs review** means the event has an administrative review record that has not been closed.
- **Snippet** is the selected event's relevant route/time data exported for closer review.

### Review actions

- **Resolved** means the event was reviewed and handled as a valid or completed case.
- **Dismissed** means the reviewer decided the event should not proceed as a penalty.
- **Review notes** record the reason and context for the decision.
- **Download filtered CSV** exports all events matching the active filters.
- **Download selected snippet** exports the selected event's supporting route segment.

Resolving or dismissing a review changes its administrative workflow status. It does not necessarily restore previously deducted points unless a separate process explicitly does so.

## Violation Fees

A **violation fee rule** maps a parking violation type to a monetary amount.

- **Violation type** describes the offense, such as unauthorized parking or blocking access.
- **Device type** optionally limits the rule to a category of device.
- **Powertrain** optionally limits it to electric or non-electric devices.
- **Any/blank** creates a broader fallback.
- **Active** allows the rule to be used for future fee matching.

### What actions mean

- **Save Fee** creates or updates a rule.
- **Clear** resets the form without deleting saved rules.
- **Edit** loads the selected rule into the form.
- **Delete** removes the rule from future matching. Existing penalties retain their recorded amounts unless separately changed.

## Reports / Report Builder

The **Report Builder** produces CSV files for operational analysis and recordkeeping. Available reports can include:

- student summaries and roster information;
- parking violations and penalties;
- ride penalties and route sessions;
- POI visits and POI performance;
- registered-device inventory;
- parking reservations;
- school POIs, zones, terms, and packs; and
- challenge or participation information.

Some reports require loading data for many students and can take time. A downloaded report is a snapshot at the time it was generated.

Treat exports as sensitive school and student data. Store, transmit, and delete exported files according to your organization's privacy and retention policies.

## Glossary

| Term            | Meaning                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| Active          | Eligible to be used for new customer activity or matching.                                 |
| App ID          | Identifier for the Juise application whose records are being managed.                      |
| Beacon          | Bluetooth identifier attached to or associated with a registered device.                   |
| Campus ID       | Identifier for a campus within the school.                                                 |
| Challenge       | Time-limited goal based on distance, points, or configured activity.                       |
| Checkpoint/stop | GPS destination within a scavenger-hunt challenge game.                                    |
| Device UUID     | Internal unique identifier for a registered device.                                        |
| Juise Pack      | School-managed parking location containing individual spots.                               |
| Membership      | The link between a Juise user and a school, including school-specific student information. |
| No-go zone      | Geographic area where riding is prohibited.                                                |
| POI             | Point of Interest; a mapped destination or reward/check-in area.                           |
| Powertrain      | How a device is powered, commonly electric or non-electric.                                |
| Recovery code   | One-time backup code used instead of an authenticator code.                                |
| Reservation     | Student request or approval to use a pack/spot during a term.                              |
| School ID       | Stable identifier used to scope data to a school.                                          |
| Sighting        | A recorded observation of a beacon at a time and location.                                 |
| Spot            | Individual parking space within a Juise Pack.                                              |
| TOTP/2FA        | Rotating authenticator code used as a second sign-in factor.                               |
| Trusted browser | Browser allowed to skip another TOTP challenge for 30 days after successful 2FA.           |
| UUID            | Internal globally unique record identifier used for support and integrations.              |

## Operational safety checklist

Before completing a customer-impacting action:

1. Confirm that the selected school, student, device, term, and record are correct.
2. Refresh the page if the record may have changed since it was opened.
3. Review fees, points, dates, coordinates, and customer-facing notes.
4. Confirm the audience before sending a notification.
5. Export records before deleting a challenge or configuration when history is needed.
6. Do not share access tokens, authenticator secrets, recovery codes, or downloaded student data.
7. Use internal UUIDs when contacting Juise support about a specific record.

## Getting help

When reporting a dashboard issue, provide:

- the school ID;
- the page and action being used;
- the affected student, device, report, reservation, or challenge UUID;
- the approximate time of the issue and your time zone; and
- the displayed error message.

Do not include passwords, authenticator secrets, recovery codes, access tokens, or unredacted secret files in support messages.
