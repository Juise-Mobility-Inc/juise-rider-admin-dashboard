import type { ComponentType, Dispatch, SetStateAction } from "react";

import type {
  PackSpotReservation,
  StudentProfileBundle,
  UserSchoolMembership,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  reservationsBusy: boolean;
  reservations: PackSpotReservation[];
  selectedReservationId: string;
  setSelectedReservationId: Dispatch<SetStateAction<string>>;
  selectedReservation: PackSpotReservation | null;
  refreshReservations: () => Promise<void>;
  handleDenySelected: () => Promise<void>;
  handleApproveSelected: () => Promise<void>;
  studentBusy: boolean;
  studentError: string;
  studentProfile: StudentProfileBundle | null;
  studentDevicePhotoUrls: Record<string, string>;
  relevantMemberships: UserSchoolMembership[];
  formatUnixTimestamp: (value?: number) => string;
  formatDateOnly: (value: string) => string;
  DetailRow: ComponentType<{ label: string; value: string }>;
  handleImagePreview: (imageUrl: string, alt: string, label?: string) => void;
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  let cls = "res-status-badge";
  if (normalized === "pending") cls += " res-status-pending";
  else if (normalized === "approved") cls += " res-status-approved";
  else if (normalized === "denied") cls += " res-status-denied";
  else cls += " res-status-other";
  return <span className={cls}>{status}</span>;
}

function AvatarInitials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : (name[0] ?? "?");
  return (
    <div className="res-avatar">
      {initials.toUpperCase()}
    </div>
  );
}

export function ReservationsScreen(props: Props) {
  const {
    activeSchoolId,
    reservationsBusy,
    reservations,
    selectedReservationId,
    setSelectedReservationId,
    selectedReservation,
    refreshReservations,
    handleDenySelected,
    handleApproveSelected,
    studentBusy,
    studentError,
    studentProfile,
    studentDevicePhotoUrls,
    relevantMemberships,
    formatUnixTimestamp,
    formatDateOnly,
    handleImagePreview,
  } = props;

  const studentName = studentProfile
    ? `${studentProfile.user.first_name} ${studentProfile.user.last_name}`.trim()
    : "";

  return (
    <section className="res-layout">
      {/* ── LEFT: Queue panel ─────────────────── */}
      <div className="panel res-queue-panel">
        <div className="res-queue-header">
          <div>
            <p className="eyebrow">Pending Queue</p>
            <h2>
              Requests
              {reservations.length > 0 && (
                <span className="res-queue-count">{reservations.length}</span>
              )}
            </h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshReservations()}
            disabled={reservationsBusy || !activeSchoolId}
          >
            {reservationsBusy ? "Loading…" : "Refresh"}
          </button>
        </div>

        {!activeSchoolId && (
          <p className="empty-state">
            This admin login is not scoped to a school.
          </p>
        )}

        {activeSchoolId && !reservationsBusy && reservations.length === 0 && (
          <div className="res-empty">
            <span className="res-empty-icon">✅</span>
            <p>All caught up</p>
            <p className="muted-text">No pending reservations right now.</p>
          </div>
        )}

        {reservations.length > 0 && (
          <ul className="res-queue-list">
            {reservations.map((r) => {
              const isActive = r.reservation_uuid === selectedReservationId;
              const packLabel = r.pack_name || "Juise Pack";
              const spotLabel =
                r.spot_number != null ? `Spot ${r.spot_number}` : "TBD";
              return (
                <li key={r.reservation_uuid}>
                  <button
                    type="button"
                    className={`res-queue-card${isActive ? " res-queue-card-active" : ""}`}
                    onClick={() =>
                      setSelectedReservationId(r.reservation_uuid)
                    }
                  >
                    <div className="res-queue-card-spot">
                      <span className="res-spot-badge">{spotLabel}</span>
                    </div>
                    <div className="res-queue-card-body">
                      <span className="res-queue-card-pack">{packLabel}</span>
                      <span className="res-queue-card-term">
                        {r.term_name || "No term"}
                      </span>
                      <span className="res-queue-card-time">
                        {formatUnixTimestamp(r.updated)}
                      </span>
                    </div>
                    <StatusBadge status={r.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── RIGHT: Detail panel ───────────────── */}
      <div className="panel res-detail-panel">
        {!selectedReservation ? (
          <div className="res-detail-empty">
            <span className="res-detail-empty-icon">📋</span>
            <p>Select a request</p>
            <p className="muted-text">
              Choose a reservation from the queue to review the student's
              details and approve or deny.
            </p>
          </div>
        ) : (
          <>
            {/* ── Reservation hero header ── */}
            <div className="res-hero">
              <div className="res-hero-info">
                <p className="eyebrow">Reservation Request</p>
                <h2 className="res-hero-title">
                  {selectedReservation.pack_name || "Juise Pack"}
                  {selectedReservation.spot_number != null && (
                    <span className="res-hero-spot">
                      Spot {selectedReservation.spot_number}
                    </span>
                  )}
                </h2>
                <div className="res-hero-meta">
                  <StatusBadge status={selectedReservation.status} />
                  {selectedReservation.term_name && (
                    <span className="res-hero-term">
                      {selectedReservation.term_name}
                    </span>
                  )}
                  {selectedReservation.reservation_kind && (
                    <span className="res-hero-kind">
                      {selectedReservation.reservation_kind}
                    </span>
                  )}
                </div>
              </div>

              {/* Primary actions */}
              <div className="res-actions">
                <button
                  className="res-deny-btn"
                  type="button"
                  onClick={() => void handleDenySelected()}
                  disabled={reservationsBusy}
                >
                  <span>✕</span> Deny
                </button>
                <button
                  className="res-approve-btn"
                  type="button"
                  onClick={() => void handleApproveSelected()}
                  disabled={reservationsBusy}
                >
                  <span>✓</span> Approve
                </button>
              </div>
            </div>

            {/* ── Reservation detail chips ── */}
            <div className="res-info-grid">
              <div className="res-info-cell">
                <span className="res-info-label">Pack</span>
                <span className="res-info-value">
                  {selectedReservation.pack_name || selectedReservation.pack_uuid}
                </span>
              </div>
              <div className="res-info-cell">
                <span className="res-info-label">Spot</span>
                <span className="res-info-value">
                  {selectedReservation.spot_number != null
                    ? `Spot ${selectedReservation.spot_number}`
                    : selectedReservation.spot_uuid}
                </span>
              </div>
              <div className="res-info-cell">
                <span className="res-info-label">Term</span>
                <span className="res-info-value">
                  {selectedReservation.term_name || "Not set"}
                </span>
              </div>
              <div className="res-info-cell">
                <span className="res-info-label">Status</span>
                <span className="res-info-value">{selectedReservation.status}</span>
              </div>
              <div className="res-info-cell">
                <span className="res-info-label">Starts</span>
                <span className="res-info-value">
                  {formatUnixTimestamp(selectedReservation.start_time)}
                </span>
              </div>
              <div className="res-info-cell">
                <span className="res-info-label">Ends</span>
                <span className="res-info-value">
                  {formatUnixTimestamp(selectedReservation.end_time)}
                </span>
              </div>
            </div>

            {/* ── Student profile ── */}
            <div className="res-student-section">
              <div className="res-student-section-header">
                <p className="eyebrow">Student</p>
                <h3>Applicant profile</h3>
                {studentBusy && (
                  <span className="muted-text" style={{ marginLeft: "auto" }}>
                    Loading…
                  </span>
                )}
              </div>

              {studentError && (
                <p className="error-text">{studentError}</p>
              )}

              {studentProfile && (
                <>
                  {/* Student identity card */}
                  <div className="res-student-card">
                    <AvatarInitials name={studentName || "?"} />
                    <div className="res-student-identity">
                      <strong className="res-student-name">
                        {studentName || "Name not available"}
                      </strong>
                      <span>{studentProfile.user.username}</span>
                      <span>{studentProfile.user.email}</span>
                      {studentProfile.user.phone && (
                        <span>{studentProfile.user.phone}</span>
                      )}
                    </div>
                  </div>

                  {/* Memberships */}
                  <div className="data-section">
                    <div className="data-section-header">
                      <h4>School memberships</h4>
                      <span>{relevantMemberships.length}</span>
                    </div>
                    {relevantMemberships.length === 0 ? (
                      <p className="muted-text">
                        No memberships found for this school.
                      </p>
                    ) : (
                      <div className="stack-list">
                        {relevantMemberships.map((m) => (
                          <div className="res-membership-card" key={m.membership_uuid}>
                            <div className="res-membership-top">
                              <span className="res-membership-id">
                                {m.student_id || m.membership_uuid}
                              </span>
                              <span
                                className={`res-membership-status ${m.active ? "res-mem-active" : "res-mem-inactive"}`}
                              >
                                {m.status}
                              </span>
                            </div>
                            <span className="res-membership-meta">
                              {m.school_id}
                              {m.campus_id ? ` · ${m.campus_id}` : ""}
                            </span>
                            {m.terms.length > 0 && (
                              <div className="res-term-chips">
                                {m.terms.map((term) => (
                                  <span
                                    key={term.term_uuid}
                                    className="res-term-chip"
                                  >
                                    {term.name}
                                    <span className="res-term-dates">
                                      {formatDateOnly(term.start_date)} –{" "}
                                      {formatDateOnly(term.end_date)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Devices */}
                  <div className="data-section">
                    <div className="data-section-header">
                      <h4>Registered devices</h4>
                      <span>{studentProfile.devices.length}</span>
                    </div>
                    {studentProfile.devices.length === 0 ? (
                      <p className="muted-text">No registered devices found.</p>
                    ) : (
                      <div className="devices-grid">
                        {studentProfile.devices.map((device) => {
                          const photoUrl =
                            studentDevicePhotoUrls[
                              device.registered_device_uuid
                            ] ?? "";
                          return (
                            <div
                              className="device-card"
                              key={device.registered_device_uuid}
                            >
                              {photoUrl ? (
                                <img
                                  className="device-card-photo"
                                  src={photoUrl}
                                  alt={`${device.nickname || device.device_type} device`}
                                  onClick={() =>
                                    handleImagePreview(
                                      photoUrl,
                                      `${device.nickname || device.device_type} device`,
                                      device.nickname || device.device_type,
                                    )
                                  }
                                />
                              ) : (
                                <div className="device-card-icon">🛴</div>
                              )}
                              <div className="device-card-body">
                                <strong>
                                  {device.nickname || device.device_type}
                                </strong>
                                <span>
                                  {device.make || "Unknown make"} ·{" "}
                                  {device.model || "Unknown model"}
                                </span>
                                <span className="device-card-meta">
                                  Serial: {device.serial_number || "Not set"} ·
                                  Color: {device.color || "Not set"}
                                </span>
                                <span className="device-card-meta">
                                  {device.active ? "Active" : "Inactive"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
