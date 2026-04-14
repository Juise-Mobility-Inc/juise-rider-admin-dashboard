import type { ComponentType, Dispatch, SetStateAction } from "react";

import type {
  PackSpotReservation,
  StudentProfileBundle,
  UserSchoolMembership,
} from "../../lib/api";

type DetailRowComponent = ComponentType<{
  label: string;
  value: string;
}>;

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
  DetailRow: DetailRowComponent;
  handleImagePreview: (
    imageUrl: string,
    alt: string,
    label?: string,
  ) => void;
};

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
    DetailRow,
    handleImagePreview,
  } = props;

  return (
    <section className="reservation-layout">
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Pending Queue</p>
            <h2>Reservation requests</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshReservations()}
            disabled={reservationsBusy || !activeSchoolId}
          >
            Refresh
          </button>
        </div>

        {!activeSchoolId ? (
          <p className="empty-state">
            This admin login is not scoped to a school.
          </p>
        ) : null}
        {activeSchoolId && reservationsBusy ? (
          <p className="muted-text">Loading pending reservations…</p>
        ) : null}
        {activeSchoolId && !reservationsBusy && reservations.length === 0 ? (
          <p className="empty-state">
            No pending term reservations for this school.
          </p>
        ) : null}

        <div className="reservation-list">
          {reservations.map((reservation) => (
            <button
              key={reservation.reservation_uuid}
              type="button"
              className={`reservation-card ${
                reservation.reservation_uuid === selectedReservationId
                  ? "reservation-card-active"
                  : ""
              }`}
              onClick={() => setSelectedReservationId(reservation.reservation_uuid)}
            >
              <div>
                <strong>{reservation.pack_name || "Juise Pack"}</strong>
                <span>Spot {reservation.spot_number ?? "TBD"}</span>
              </div>
              <div>
                <span>{reservation.term_name || "Term request"}</span>
                <span>{reservation.user_uuid}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Reservation Detail</p>
            <h2>
              {selectedReservation?.reservation_uuid || "Select a reservation"}
            </h2>
          </div>
          <div className="form-actions">
            <button
              className="danger-button"
              type="button"
              onClick={() => void handleDenySelected()}
              disabled={!selectedReservation || reservationsBusy}
            >
              Deny
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleApproveSelected()}
              disabled={!selectedReservation || reservationsBusy}
            >
              Approve
            </button>
          </div>
        </div>

        {!selectedReservation ? (
          <p className="empty-state">
            Select a request from the left to review it.
          </p>
        ) : null}

        {selectedReservation ? (
          <>
            <div className="detail-grid">
              <DetailRow
                label="Pack"
                value={selectedReservation.pack_name || selectedReservation.pack_uuid}
              />
              <DetailRow
                label="Spot"
                value={
                  selectedReservation.spot_number
                    ? `Spot ${selectedReservation.spot_number}`
                    : selectedReservation.spot_uuid
                }
              />
              <DetailRow label="Status" value={selectedReservation.status} />
              <DetailRow
                label="Term"
                value={selectedReservation.term_name || "Not set"}
              />
              <DetailRow
                label="Start"
                value={formatUnixTimestamp(selectedReservation.start_time)}
              />
              <DetailRow
                label="End"
                value={formatUnixTimestamp(selectedReservation.end_time)}
              />
              <DetailRow
                label="Student UUID"
                value={selectedReservation.user_uuid}
              />
              <DetailRow
                label="Membership UUID"
                value={selectedReservation.membership_uuid || "Not set"}
              />
            </div>

            <div className="student-panel">
              <div className="student-panel-header">
                <div>
                  <p className="eyebrow">Student</p>
                  <h3>Registered information</h3>
                </div>
                {studentBusy ? <span className="muted-text">Loading…</span> : null}
              </div>

              {studentError ? <p className="error-text">{studentError}</p> : null}

              {studentProfile ? (
                <>
                  <div className="detail-grid">
                    <DetailRow
                      label="Name"
                      value={`${studentProfile.user.first_name} ${studentProfile.user.last_name}`.trim()}
                    />
                    <DetailRow
                      label="Username"
                      value={studentProfile.user.username}
                    />
                    <DetailRow label="Email" value={studentProfile.user.email} />
                    <DetailRow
                      label="Phone"
                      value={studentProfile.user.phone || "Not set"}
                    />
                  </div>

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
                        {relevantMemberships.map((membership) => (
                          <div className="data-card" key={membership.membership_uuid}>
                            <strong>
                              {membership.student_id || membership.membership_uuid}
                            </strong>
                            <span>
                              {membership.school_id} · {membership.campus_id} ·{" "}
                              {membership.status}
                            </span>
                            <span>
                              {membership.terms.length > 0
                                ? membership.terms
                                    .map(
                                      (term) =>
                                        `${term.name} (${formatDateOnly(term.start_date)} - ${formatDateOnly(term.end_date)})`,
                                    )
                                    .join(", ")
                                : "No membership term records"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

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
                          const devicePhotoUrl =
                            studentDevicePhotoUrls[
                              device.registered_device_uuid
                            ] ?? "";

                          return (
                            <div
                              className="device-card"
                              key={device.registered_device_uuid}
                            >
                              {devicePhotoUrl ? (
                                <img
                                  className="device-card-photo"
                                  src={devicePhotoUrl}
                                  alt={`${device.nickname || device.device_type} device`}
                                  onClick={() =>
                                    handleImagePreview(
                                      devicePhotoUrl,
                                      `${device.nickname || device.device_type} device`,
                                      device.nickname || device.device_type,
                                    )
                                  }
                                />
                              ) : (
                                <div className="device-card-icon">🛴</div>
                              )}
                              <div className="device-card-body">
                                <strong>{device.nickname || device.device_type}</strong>
                                <span>
                                  {device.make || "Unknown make"} ·{" "}
                                  {device.model || "Unknown model"}
                                </span>
                                <span className="device-card-meta">
                                  Serial: {device.serial_number || "Not set"} ·
                                  {" "}Color: {device.color || "Not set"}
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
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
