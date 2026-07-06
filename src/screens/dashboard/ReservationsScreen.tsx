import { useMemo, useState } from "react";
import type {
  ComponentType,
  CSSProperties,
  Dispatch,
  SetStateAction,
} from "react";

import type {
  PackSpotReservation,
  SchoolColorScheme,
  StudentProfileBundle,
  UserSchoolMembership,
} from "../../lib/api";
import {
  defaultSchoolColorScheme,
  getReadableTextColor,
  hexToRgba,
  juiseColors,
  mixHexColors,
} from "../../lib/colors";

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
  resolvedSchoolColors: SchoolColorScheme;
  DetailRow: ComponentType<{ label: string; value: string }>;
  handleImagePreview: (imageUrl: string, alt: string, label?: string) => void;
};

function getReadableSurfaceStyle(
  surfaceColor: string,
  options: {
    preferredTextColor?: string;
    borderColor?: string;
  } = {},
): CSSProperties {
  return {
    background: surfaceColor,
    color: getReadableTextColor(surfaceColor, {
      preferred: options.preferredTextColor,
      light: defaultSchoolColorScheme.text,
      dark: juiseColors.darkGrey,
      minimumContrast: 4.5,
    }),
    ...(options.borderColor ? { borderColor: options.borderColor } : {}),
  };
}

function getReservationStatusBaseColor(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "pending") {
    return "#f6ae2d";
  }
  if (normalized === "approved") {
    return "#27a05c";
  }
  if (normalized === "denied") {
    return "#b33a3a";
  }
  return defaultSchoolColorScheme.secondary;
}

function StatusBadge({
  status,
  backgroundColor,
  preferredTextColor,
}: {
  status: string;
  backgroundColor: string;
  preferredTextColor?: string;
}) {
  const normalized = status.toLowerCase();
  const baseColor = getReservationStatusBaseColor(status);
  const surfaceColor = mixHexColors(
    backgroundColor,
    baseColor,
    normalized === "pending" ? 0.34 : 0.26,
  );
  const borderColor = hexToRgba(
    mixHexColors(backgroundColor, baseColor, 0.52),
    0.96,
  );

  return (
    <span
      className="res-status-badge"
      style={getReadableSurfaceStyle(surfaceColor, {
        preferredTextColor,
        borderColor,
      })}
    >
      {status}
    </span>
  );
}

function AvatarInitials({
  name,
  style,
}: {
  name: string;
  style?: CSSProperties;
}) {
  const parts = name.trim().split(" ");
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : (name[0] ?? "?");
  return <div className="res-avatar" style={style}>{initials.toUpperCase()}</div>;
}

export function ReservationsScreen(props: Props) {
  const {
    activeSchoolId,
    reservationsBusy,
    reservations,
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
    resolvedSchoolColors,
    handleImagePreview,
  } = props;

  const [search, setSearch] = useState("");

  const primaryColor =
    resolvedSchoolColors.primary ?? defaultSchoolColorScheme.primary;
  const secondaryColor =
    resolvedSchoolColors.secondary ?? defaultSchoolColorScheme.secondary;
  const accentColor =
    resolvedSchoolColors.accent ?? defaultSchoolColorScheme.accent;
  const backgroundColor =
    resolvedSchoolColors.background ?? defaultSchoolColorScheme.background;
  const preferredTextColor =
    resolvedSchoolColors.text ?? defaultSchoolColorScheme.text;
  const spotBadgeStyle = getReadableSurfaceStyle(primaryColor, {
    preferredTextColor,
  });
  const heroChipSurface = mixHexColors(backgroundColor, secondaryColor, 0.42);
  const heroChipStyle = getReadableSurfaceStyle(heroChipSurface, {
    preferredTextColor,
  });
  const approveButtonStyle = getReadableSurfaceStyle(primaryColor, {
    preferredTextColor,
    borderColor: hexToRgba(mixHexColors(backgroundColor, primaryColor, 0.62), 0.96),
  });
  const denyBaseColor = "#b33a3a";
  const denyButtonStyle = getReadableSurfaceStyle(denyBaseColor, {
    preferredTextColor,
    borderColor: hexToRgba(mixHexColors(backgroundColor, denyBaseColor, 0.64), 0.96),
  });
  const avatarSurface = mixHexColors(primaryColor, secondaryColor, 0.34);
  const avatarStyle = getReadableSurfaceStyle(avatarSurface, {
    preferredTextColor,
  });
  const membershipActiveSurface = mixHexColors(backgroundColor, "#27a05c", 0.28);
  const membershipInactiveSurface = mixHexColors(
    backgroundColor,
    secondaryColor,
    0.26,
  );
  const termChipSurface = mixHexColors(backgroundColor, secondaryColor, 0.34);
  const termChipTextColor = getReadableTextColor(termChipSurface, {
    preferred: preferredTextColor,
    light: defaultSchoolColorScheme.text,
    dark: juiseColors.darkGrey,
    minimumContrast: 4.5,
  });
  const termChipStyle = getReadableSurfaceStyle(termChipSurface, {
    preferredTextColor,
  });
  const termDatesStyle: CSSProperties = {
    color: mixHexColors(termChipSurface, termChipTextColor, 0.64),
  };
  const studentName = studentProfile
    ? `${studentProfile.user.first_name} ${studentProfile.user.last_name}`.trim()
    : "";

  const filteredReservations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reservations;
    return reservations.filter((r) => {
      const haystack = [
        r.pack_name,
        r.term_name,
        r.status,
        r.reservation_kind,
        r.spot_number != null ? `spot ${r.spot_number}` : "",
        r.reservation_uuid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [reservations, search]);

  const openReservation = (uuid: string) => {
    setSelectedReservationId(uuid);
  };

  const closeDetail = () => {
    setSelectedReservationId("");
  };

  // ── DETAIL VIEW ──────────────────────────────────────────────────
  if (selectedReservation) {
    return (
      <div className="res-root">
        <div className="panel res-detail-panel res-detail-panel-full">
          <button
            type="button"
            className="secondary-button res-back-button"
            onClick={closeDetail}
          >
            ← Back to requests
          </button>

          {/* ── Reservation hero header ── */}
          <div className="res-hero">
            <div className="res-hero-info">
              <p className="eyebrow">Reservation Request</p>
              <h2 className="res-hero-title">
                {selectedReservation.pack_name || "Juise Pack"}
                {selectedReservation.spot_number != null && (
                  <span className="res-hero-spot" style={spotBadgeStyle}>
                    Spot {selectedReservation.spot_number}
                  </span>
                )}
              </h2>
              <div className="res-hero-meta">
                <StatusBadge
                  status={selectedReservation.status}
                  backgroundColor={backgroundColor}
                  preferredTextColor={preferredTextColor}
                />
                {selectedReservation.term_name && (
                  <span className="res-hero-term" style={heroChipStyle}>
                    {selectedReservation.term_name}
                  </span>
                )}
                {selectedReservation.reservation_kind && (
                  <span className="res-hero-kind" style={heroChipStyle}>
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
                style={denyButtonStyle}
                onClick={() => void handleDenySelected()}
                disabled={reservationsBusy}
              >
                <span>✕</span> Deny
              </button>
              <button
                className="res-approve-btn"
                type="button"
                style={approveButtonStyle}
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

            {studentError && <p className="error-text">{studentError}</p>}

            {studentProfile && (
              <>
                {/* Student identity card */}
                <div className="res-student-card">
                  <AvatarInitials name={studentName || "?"} style={avatarStyle} />
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
                              style={getReadableSurfaceStyle(
                                m.active
                                  ? membershipActiveSurface
                                  : membershipInactiveSurface,
                                {
                                  preferredTextColor,
                                },
                              )}
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
                                  style={termChipStyle}
                                >
                                  {term.name}
                                  <span
                                    className="res-term-dates"
                                    style={termDatesStyle}
                                  >
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
        </div>
      </div>
    );
  }

  // ── TABLE VIEW (default) ────────────────────────────────────────
  return (
    <div className="res-root">
      <div className="res-table-view">
        <div className="res-table-view-header">
          <div className="res-table-view-header-row">
            <div className="res-table-view-title-group">
              <p className="eyebrow">Pending Queue</p>
              <h2 className="res-sidebar-title">
                Requests
                {reservations.length > 0 && (
                  <span
                    className="res-queue-count"
                    style={getReadableSurfaceStyle(accentColor, {
                      preferredTextColor,
                    })}
                  >
                    {reservations.length}
                  </span>
                )}
              </h2>
            </div>
            <div className="res-table-view-actions">
              <input
                type="search"
                className="res-table-search"
                placeholder="Search by pack, spot, term, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() => void refreshReservations()}
                disabled={reservationsBusy || !activeSchoolId}
              >
                {reservationsBusy ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        {!activeSchoolId ? (
          <p className="empty-state">
            This admin login is not scoped to a school.
          </p>
        ) : !reservationsBusy && reservations.length === 0 ? (
          <div className="res-empty">
            <span className="res-empty-icon">✅</span>
            <p>All caught up</p>
            <p className="muted-text">No pending reservations right now.</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <p className="res-empty-text">No requests match this search.</p>
        ) : (
          <div className="res-table-scroll">
            <table className="res-table">
              <thead>
                <tr>
                  <th>Pack</th>
                  <th>Spot</th>
                  <th>Term</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map((r) => {
                  const packLabel = r.pack_name || "Juise Pack";
                  const spotLabel =
                    r.spot_number != null ? `Spot ${r.spot_number}` : "TBD";
                  return (
                    <tr
                      key={r.reservation_uuid}
                      className="res-table-row"
                      onClick={() => openReservation(r.reservation_uuid)}
                    >
                      <td className="res-table-pack">{packLabel}</td>
                      <td>
                        <span className="res-spot-badge" style={spotBadgeStyle}>
                          {spotLabel}
                        </span>
                      </td>
                      <td>{r.term_name || "No term"}</td>
                      <td>{r.reservation_kind || "—"}</td>
                      <td>
                        <StatusBadge
                          status={r.status}
                          backgroundColor={backgroundColor}
                          preferredTextColor={preferredTextColor}
                        />
                      </td>
                      <td className="res-table-date">
                        {formatUnixTimestamp(r.updated)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
