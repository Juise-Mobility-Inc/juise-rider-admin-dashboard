import { useEffect, useMemo, useState } from "react";
import {
  fetchSchoolParkingViolations,
  fetchSchoolRegisteredDevices,
  signSchoolMedia,
  type RegisteredDeviceReviewEntry,
  type StudentParkingViolation,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type LoadState = "idle" | "loading" | "error" | "ready";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function formatName(entry: RegisteredDeviceReviewEntry) {
  const u = entry.student.user;
  return (
    [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
    u.email ||
    u.username ||
    "Student"
  );
}

function formatDevice(entry: RegisteredDeviceReviewEntry) {
  const d = entry.device;
  return (
    d.nickname ||
    [d.make, d.model].filter(Boolean).join(" ").trim() ||
    d.device_type ||
    "Registered Device"
  );
}

function formatStudentId(entry: RegisteredDeviceReviewEntry) {
  return entry.student.membership?.student_id ?? "";
}

function getDeviceStatusLabel(entry: RegisteredDeviceReviewEntry) {
  const d = entry.device;
  if (!d.active) return "Inactive";
  if (d.registration_status === "declined") return "Declined";
  if (d.registration_status === "pending") return "Pending";
  return "Active";
}

function getDeviceStatusClass(label: string) {
  switch (label) {
    case "Declined": return "cd-status cd-status-declined";
    case "Pending": return "cd-status cd-status-pending";
    case "Inactive": return "cd-status cd-status-inactive";
    default: return "cd-status cd-status-approved";
  }
}

function formatViolationStatus(v: StudentParkingViolation) {
  if (!v.active) return "Closed";
  const s = (v.status || "").toLowerCase();
  if (s === "appealed") return "Appealed";
  if (s === "resolved") return "Resolved";
  return "Active";
}

function formatCurrency(cents?: number | null) {
  if (!cents || cents <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatTimestamp(unix: number) {
  const ms = unix < 1e11 ? unix * 1000 : unix;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function capitalize(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "declined", label: "Declined" },
  { key: "inactive", label: "Inactive" },
];

export function CampusDevicesScreen({ activeSchoolId, managedAppId }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [entries, setEntries] = useState<RegisteredDeviceReviewEntry[]>([]);
  const [violations, setViolations] = useState<StudentParkingViolation[]>([]);
  const [studentPhotoUrls, setStudentPhotoUrls] = useState<Record<string, string>>({});
  const [devicePhotoUrls, setDevicePhotoUrls] = useState<Record<string, string>>({});
  const [selectedUUID, setSelectedUUID] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeSchoolId || !managedAppId) {
        setLoadState("error");
        setErrorMsg("A school-scoped admin session is required.");
        return;
      }
      setLoadState("loading");
      setErrorMsg("");
      setEntries([]);
      setViolations([]);
      setStudentPhotoUrls({});
      setDevicePhotoUrls({});
      setSelectedUUID(null);

      try {
        const [allEntries, allViolations] = await Promise.all([
          fetchSchoolRegisteredDevices(managedAppId, activeSchoolId, "").catch(
            () => [] as RegisteredDeviceReviewEntry[],
          ),
          fetchSchoolParkingViolations(managedAppId, activeSchoolId, {
            includeInactive: true,
          }).catch(() => [] as StudentParkingViolation[]),
        ]);

        if (cancelled) return;
        setEntries(allEntries);
        setViolations(allViolations);
        setLoadState("ready");

        const studentKeyMap: Record<string, string> = {};
        const deviceKeyMap: Record<string, string> = {};
        for (const entry of allEntries) {
          const profileKey = entry.student.profile_image_object_key?.trim();
          if (profileKey) studentKeyMap[entry.device.user_uuid] = profileKey;
          const asset = entry.device_media.find((m) => m.active && m.object_key?.trim());
          if (asset?.object_key) {
            deviceKeyMap[entry.device.registered_device_uuid] = asset.object_key;
          }
        }

        const allKeys = [
          ...new Set([
            ...Object.values(studentKeyMap),
            ...Object.values(deviceKeyMap),
          ]),
        ];
        if (allKeys.length > 0 && !cancelled) {
          const signed: Record<string, string> = await signSchoolMedia(activeSchoolId, allKeys).catch(() => ({}));
          if (cancelled) return;

          const sPhotos: Record<string, string> = {};
          for (const [uuid, key] of Object.entries(studentKeyMap)) {
            if (signed[key]) sPhotos[uuid] = signed[key];
          }
          const dPhotos: Record<string, string> = {};
          for (const [uuid, key] of Object.entries(deviceKeyMap)) {
            if (signed[key]) dPhotos[uuid] = signed[key];
          }
          setStudentPhotoUrls(sPhotos);
          setDevicePhotoUrls(dPhotos);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadState("error");
          setErrorMsg(getErrorMessage(err));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, managedAppId]);

  const violationsByDevice = useMemo(() => {
    const map = new Map<string, StudentParkingViolation[]>();
    for (const v of violations) {
      if (!v.registered_device_uuid) continue;
      if (!map.has(v.registered_device_uuid)) map.set(v.registered_device_uuid, []);
      map.get(v.registered_device_uuid)!.push(v);
    }
    return map;
  }, [violations]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((entry) => {
        const statusLabel = getDeviceStatusLabel(entry).toLowerCase();
        if (statusFilter !== "all" && statusLabel.toLowerCase() !== statusFilter)
          return false;
        if (!q) return true;
        const name = formatName(entry).toLowerCase();
        const device = formatDevice(entry).toLowerCase();
        const sid = formatStudentId(entry).toLowerCase();
        const serial = (entry.device.serial_number ?? "").toLowerCase();
        return (
          name.includes(q) ||
          device.includes(q) ||
          sid.includes(q) ||
          serial.includes(q)
        );
      })
      .sort((a, b) => {
        const aActive = (violationsByDevice.get(a.device.registered_device_uuid) ?? []).filter(
          (v) => v.active,
        ).length;
        const bActive = (violationsByDevice.get(b.device.registered_device_uuid) ?? []).filter(
          (v) => v.active,
        ).length;
        if (bActive !== aActive) return bActive - aActive;
        return formatName(a).localeCompare(formatName(b));
      });
  }, [entries, violationsByDevice, search, statusFilter]);

  useEffect(() => {
    if (
      selectedUUID &&
      filteredEntries.some((e) => e.device.registered_device_uuid === selectedUUID)
    )
      return;
    setSelectedUUID(filteredEntries[0]?.device.registered_device_uuid ?? null);
  }, [filteredEntries, selectedUUID]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.device.registered_device_uuid === selectedUUID) ?? null,
    [entries, selectedUUID],
  );

  const selectedViolations = useMemo(
    () =>
      selectedEntry
        ? (violationsByDevice.get(selectedEntry.device.registered_device_uuid) ?? []).slice().sort(
            (a, b) => b.created_at - a.created_at,
          )
        : [],
    [selectedEntry, violationsByDevice],
  );

  return (
    <div className="cd-root">
      {/* ── Left sidebar ── */}
      <aside className="cd-sidebar">
        <div className="cd-sidebar-head">
          <div className="cd-sidebar-top-row">
            <h2 className="cd-sidebar-title">Campus Devices</h2>
            <span className="cd-sidebar-count">
              {loadState === "ready"
                ? `${entries.length.toLocaleString()} registered`
                : loadState === "loading"
                  ? "Loading…"
                  : ""}
            </span>
          </div>
          <button
            type="button"
            className="cd-table-btn"
            disabled={loadState !== "ready" || entries.length === 0}
            onClick={() => setShowTable(true)}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1z"/>
            </svg>
            View all as table
          </button>
          <input
            type="search"
            className="cd-search"
            placeholder="Search by student, device, serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cd-status-tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`cd-status-tab${statusFilter === tab.key ? " cd-status-tab-active" : ""}`}
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadState === "error" ? (
          <p className="cd-empty">{errorMsg}</p>
        ) : loadState === "loading" ? (
          <p className="cd-empty">Loading devices…</p>
        ) : filteredEntries.length === 0 ? (
          <p className="cd-empty">No devices match this filter.</p>
        ) : (
          <div className="cd-device-list">
            {filteredEntries.map((entry) => {
              const uuid = entry.device.registered_device_uuid;
              const name = formatName(entry);
              const deviceLabel = formatDevice(entry);
              const statusLabel = getDeviceStatusLabel(entry);
              const activeViolations = (violationsByDevice.get(uuid) ?? []).filter(
                (v) => v.active,
              ).length;
              const totalViolations = (violationsByDevice.get(uuid) ?? []).length;
              const photoUrl = studentPhotoUrls[entry.device.user_uuid];
              const isSelected = uuid === selectedUUID;

              return (
                <button
                  key={uuid}
                  type="button"
                  className={`cd-device-row${isSelected ? " cd-device-row-active" : ""}`}
                  onClick={() => setSelectedUUID(uuid)}
                >
                  <div className="cd-device-row-avatar">
                    {photoUrl ? (
                      <img src={photoUrl} alt={name} className="cd-avatar-img" />
                    ) : (
                      <div className="cd-avatar-initials">{getInitials(name)}</div>
                    )}
                  </div>
                  <div className="cd-device-row-body">
                    <div className="cd-device-row-top">
                      <strong className="cd-device-row-name">{name}</strong>
                      {activeViolations > 0 && (
                        <span className="cd-violation-dot">
                          {activeViolations}
                        </span>
                      )}
                    </div>
                    <div className="cd-device-row-meta">
                      <span className="cd-device-row-label">{deviceLabel}</span>
                      <span className={getDeviceStatusClass(statusLabel)}>
                        {statusLabel}
                      </span>
                    </div>
                    {totalViolations > 0 && activeViolations === 0 && (
                      <span className="cd-device-row-closed">
                        {totalViolations} past violation{totalViolations !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* ── Right detail panel ── */}
      {selectedEntry ? (
        <main className="cd-detail">
          {/* Header */}
          <div className="cd-detail-header">
            <div className="cd-detail-device-thumb">
              {devicePhotoUrls[selectedEntry.device.registered_device_uuid] ? (
                <img
                  src={devicePhotoUrls[selectedEntry.device.registered_device_uuid]}
                  alt={formatDevice(selectedEntry)}
                  className="cd-device-photo"
                />
              ) : (
                <div className="cd-device-photo-placeholder">🚲</div>
              )}
            </div>
            <div className="cd-detail-header-info">
              <h3 className="cd-detail-device-name">{formatDevice(selectedEntry)}</h3>
              <p className="cd-detail-student-name">{formatName(selectedEntry)}</p>
              <div className="cd-detail-badges">
                {(() => {
                  const label = getDeviceStatusLabel(selectedEntry);
                  return <span className={getDeviceStatusClass(label)}>{label}</span>;
                })()}
                {selectedEntry.device.powertrain_type && (
                  <span className="cd-tag">
                    {capitalize(selectedEntry.device.powertrain_type)}
                  </span>
                )}
                {selectedEntry.device.device_type && (
                  <span className="cd-tag">
                    {capitalize(selectedEntry.device.device_type)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="cd-stats-row">
            <div className="cd-stat">
              <span>Total violations</span>
              <strong>{selectedViolations.length.toLocaleString()}</strong>
            </div>
            <div className="cd-stat">
              <span>Active</span>
              <strong
                className={
                  selectedViolations.filter((v) => v.active).length > 0
                    ? "cd-stat-danger"
                    : ""
                }
              >
                {selectedViolations.filter((v) => v.active).length.toLocaleString()}
              </strong>
            </div>
            <div className="cd-stat">
              <span>Last violation</span>
              <strong>
                {selectedViolations.length > 0
                  ? formatTimestamp(selectedViolations[0].created_at)
                  : "—"}
              </strong>
            </div>
            <div className="cd-stat">
              <span>Registered</span>
              <strong>{formatTimestamp(selectedEntry.device.created_at)}</strong>
            </div>
          </div>

          {/* Device details */}
          <section className="cd-section">
            <h4 className="cd-section-title">Device Details</h4>
            <div className="cd-info-grid">
              {selectedEntry.device.device_type && (
                <div className="cd-info-row">
                  <span>Type</span>
                  <strong>{capitalize(selectedEntry.device.device_type)}</strong>
                </div>
              )}
              {(selectedEntry.device.make || selectedEntry.device.model) && (
                <div className="cd-info-row">
                  <span>Make / Model</span>
                  <strong>
                    {[selectedEntry.device.make, selectedEntry.device.model]
                      .filter(Boolean)
                      .join(" ")}
                  </strong>
                </div>
              )}
              {selectedEntry.device.color && (
                <div className="cd-info-row">
                  <span>Color</span>
                  <strong>{capitalize(selectedEntry.device.color)}</strong>
                </div>
              )}
              {selectedEntry.device.serial_number && (
                <div className="cd-info-row">
                  <span>Serial number</span>
                  <strong className="cd-mono">{selectedEntry.device.serial_number}</strong>
                </div>
              )}
              {selectedEntry.device.powertrain_type && (
                <div className="cd-info-row">
                  <span>Powertrain</span>
                  <strong>{capitalize(selectedEntry.device.powertrain_type)}</strong>
                </div>
              )}
            </div>
          </section>

          {/* Student info */}
          <section className="cd-section">
            <h4 className="cd-section-title">Student</h4>
            <div className="cd-student-card">
              <div className="cd-student-card-avatar">
                {studentPhotoUrls[selectedEntry.device.user_uuid] ? (
                  <img
                    src={studentPhotoUrls[selectedEntry.device.user_uuid]}
                    alt={formatName(selectedEntry)}
                    className="cd-avatar-img cd-avatar-img-lg"
                  />
                ) : (
                  <div className="cd-avatar-initials cd-avatar-initials-lg">
                    {getInitials(formatName(selectedEntry))}
                  </div>
                )}
              </div>
              <div className="cd-student-card-info">
                <strong>{formatName(selectedEntry)}</strong>
                {formatStudentId(selectedEntry) && (
                  <p className="cd-student-sub">
                    ID: {formatStudentId(selectedEntry)}
                  </p>
                )}
                {(selectedEntry.student.user.email || selectedEntry.student.user.username) && (
                  <p className="cd-student-sub">
                    {selectedEntry.student.user.email || selectedEntry.student.user.username}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Enforcement violations */}
          <section className="cd-section">
            <h4 className="cd-section-title">
              Enforcement Violations
              {selectedViolations.length > 0 && (
                <span className="cd-section-count">{selectedViolations.length}</span>
              )}
            </h4>
            {selectedViolations.length === 0 ? (
              <p className="cd-empty-inline">No violations reported for this device.</p>
            ) : (
              <div className="cd-violation-list">
                {selectedViolations.map((v) => {
                  const statusLabel = formatViolationStatus(v);
                  const fee = formatCurrency(v.payment_amount_cents);
                  const feePaid = !!v.payment_collected_at;
                  return (
                    <div
                      key={v.violation_uuid}
                      className={`cd-violation-card${v.active ? " cd-violation-card-active" : ""}`}
                    >
                      <div className="cd-violation-card-header">
                        <strong className="cd-violation-type">
                          {capitalize(v.violation_type) || "Violation"}
                        </strong>
                        <div className="cd-violation-badges">
                          <span
                            className={`cd-violation-status cd-violation-status-${statusLabel.toLowerCase()}`}
                          >
                            {statusLabel}
                          </span>
                          {fee && (
                            <span
                              className={`cd-violation-fee${feePaid ? " cd-violation-fee-paid" : ""}`}
                            >
                              {fee}
                              {feePaid ? " paid" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      {v.description && (
                        <p className="cd-violation-desc">{v.description}</p>
                      )}
                      {v.admin_notes && (
                        <p className="cd-violation-notes">
                          <em>Note:</em> {v.admin_notes}
                        </p>
                      )}
                      <p className="cd-violation-date">{formatTimestamp(v.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="cd-detail cd-detail-empty">
          <p>
            {loadState === "loading"
              ? "Loading devices…"
              : "Select a device from the list to view details."}
          </p>
        </main>
      )}

      {/* ── Table overlay ── */}
      {showTable && (
        <div className="cd-table-overlay" onClick={() => setShowTable(false)}>
          <div className="cd-table-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd-table-modal-head">
              <div>
                <h3 className="cd-table-modal-title">All Registered Devices</h3>
                <p className="cd-table-modal-sub">
                  {entries.length.toLocaleString()} device{entries.length !== 1 ? "s" : ""} · click a row to inspect
                </p>
              </div>
              <button
                type="button"
                className="cd-table-modal-close"
                onClick={() => setShowTable(false)}
              >
                ✕
              </button>
            </div>

            <div className="cd-table-scroll">
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Device</th>
                    <th>Type</th>
                    <th>Color</th>
                    <th>Status</th>
                    <th>Active violations</th>
                    <th>Total violations</th>
                    <th>Last violation</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {entries
                    .slice()
                    .sort((a, b) => {
                      const aA = (violationsByDevice.get(a.device.registered_device_uuid) ?? []).filter((v) => v.active).length;
                      const bA = (violationsByDevice.get(b.device.registered_device_uuid) ?? []).filter((v) => v.active).length;
                      if (bA !== aA) return bA - aA;
                      return formatName(a).localeCompare(formatName(b));
                    })
                    .map((entry) => {
                      const uuid = entry.device.registered_device_uuid;
                      const name = formatName(entry);
                      const deviceLabel = formatDevice(entry);
                      const statusLabel = getDeviceStatusLabel(entry);
                      const photoUrl = studentPhotoUrls[entry.device.user_uuid];
                      const deviceViolations = violationsByDevice.get(uuid) ?? [];
                      const activeV = deviceViolations.filter((v) => v.active).length;
                      const totalV = deviceViolations.length;
                      const lastViolation = deviceViolations
                        .slice()
                        .sort((a, b) => b.created_at - a.created_at)[0];
                      const sid = formatStudentId(entry);

                      return (
                        <tr
                          key={uuid}
                          className={`cd-table-row${uuid === selectedUUID ? " cd-table-row-selected" : ""}`}
                          onClick={() => {
                            setSelectedUUID(uuid);
                            setShowTable(false);
                          }}
                        >
                          <td>
                            <div className="cd-table-student-cell">
                              {photoUrl ? (
                                <img src={photoUrl} alt={name} className="cd-table-avatar" />
                              ) : (
                                <div className="cd-table-avatar-initials">{getInitials(name)}</div>
                              )}
                              <div>
                                <div className="cd-table-name">{name}</div>
                                {sid && <div className="cd-table-sid">{sid}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="cd-table-device">{deviceLabel}</td>
                          <td>{capitalize(entry.device.device_type) || "—"}</td>
                          <td>{capitalize(entry.device.color) || "—"}</td>
                          <td>
                            <span className={getDeviceStatusClass(statusLabel)}>
                              {statusLabel}
                            </span>
                          </td>
                          <td>
                            {activeV > 0 ? (
                              <span className="cd-table-active-v">{activeV}</span>
                            ) : (
                              <span className="cd-table-zero">0</span>
                            )}
                          </td>
                          <td>{totalV > 0 ? totalV : <span className="cd-table-zero">0</span>}</td>
                          <td className="cd-table-date">
                            {lastViolation
                              ? formatTimestamp(lastViolation.created_at)
                              : <span className="cd-table-zero">—</span>}
                          </td>
                          <td className="cd-table-date">{formatTimestamp(entry.device.created_at)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
