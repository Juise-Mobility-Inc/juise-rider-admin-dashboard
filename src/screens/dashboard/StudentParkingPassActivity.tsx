import { useEffect, useState } from "react";

import {
  fetchStudentParkingPassEvents,
  type ParkingPassEvent,
  type RegisteredDevice,
} from "../../lib/api";
import { downloadCsv, sanitizeCsvFilename } from "../../lib/csv";
import { parkingPassEventLabels, shortPassId } from "../../lib/parkingPasses";

type Props = {
  managedAppId: string;
  schoolId: string;
  userUuid: string;
  adminUserUuid: string;
  devices: RegisteredDevice[];
  studentName: string;
};

function deviceLabel(device: RegisteredDevice | undefined): string {
  if (!device) return "";
  return (
    device.nickname ||
    [device.make, device.model].filter(Boolean).join(" ").trim() ||
    device.device_type ||
    "Vehicle"
  );
}

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

// The student activity tab's Parking pass history: every pass the student
// activated, replaced or reported lost, and passes an admin deactivated or
// that were retired when the vehicle was deleted. Remount (key) per student.
export function StudentParkingPassActivity({
  managedAppId,
  schoolId,
  userUuid,
  adminUserUuid,
  devices,
  studentName,
}: Props) {
  const [events, setEvents] = useState<ParkingPassEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!managedAppId || !schoolId || !userUuid) return;
    let cancelled = false;
    fetchStudentParkingPassEvents(managedAppId, userUuid, schoolId)
      .then((next) => {
        if (!cancelled) setEvents(next);
      })
      .catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Unable to load pass history.");
      });
    return () => {
      cancelled = true;
    };
  }, [managedAppId, schoolId, userUuid]);

  const deviceByUuid = new Map(devices.map((device) => [device.registered_device_uuid, device]));
  const actorLabel = (event: ParkingPassEvent) => {
    if (!event.actor_user_uuid) return "";
    if (event.actor_user_uuid === userUuid) return "Student";
    if (event.actor_user_uuid === adminUserUuid) return "You";
    return "School admin";
  };
  const vehicleLabel = (event: ParkingPassEvent) =>
    deviceLabel(deviceByUuid.get(event.registered_device_uuid ?? "")) ||
    (event.registered_device_uuid ? "Removed vehicle" : "");

  const rows = events ?? [];

  return (
    <div className="data-section">
      <div className="data-section-header">
        <h4>Parking Pass</h4>
        <div className="section-header-actions">
          <span>{rows.length}</span>
          <button
            className="section-dl-btn"
            type="button"
            title="Download parking pass history as CSV"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                sanitizeCsvFilename(`${studentName || "student"}-parking-pass-history`, "student-parking-pass-history"),
                [
                  ["occurred_at", "event", "pass_uuid", "vehicle", "registered_device_uuid", "by", "note"],
                  ...rows.map((event) => [
                    formatTimestamp(event.created_at),
                    parkingPassEventLabels[event.event_type] ?? event.event_type,
                    event.pass_uuid,
                    vehicleLabel(event),
                    event.registered_device_uuid ?? "",
                    actorLabel(event),
                    event.note,
                  ]),
                ],
              )
            }
          >
            ↓ CSV
          </button>
        </div>
      </div>
      {error ? (
        <p className="muted-text">Parking pass history unavailable right now: {error}</p>
      ) : events === null ? (
        <p className="muted-text">Loading parking pass history…</p>
      ) : rows.length === 0 ? (
        <p className="muted-text">This student hasn't activated a parking pass yet.</p>
      ) : (
        <div className="management-table-scroll">
          <table className="management-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Pass</th>
                <th>Vehicle</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.event_uuid}>
                  <td>{formatTimestamp(event.created_at)}</td>
                  <td>
                    {parkingPassEventLabels[event.event_type] ?? event.event_type}
                    {event.note ? <span className="muted-text"> · {event.note}</span> : null}
                  </td>
                  <td title={event.pass_uuid}>{shortPassId(event.pass_uuid)}</td>
                  <td>{vehicleLabel(event) || "—"}</td>
                  <td>{actorLabel(event) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
