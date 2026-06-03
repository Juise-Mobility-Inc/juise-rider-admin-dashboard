import { useEffect, useMemo, useState } from "react";
import { LatLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { juisePackIcon } from "../../lib/mapIcons";
import {
  fetchSchoolParkingViolations,
  fetchSchoolRegisteredDevices,
  signSchoolMedia,
  type RegisteredDevice,
  type RegisteredDeviceReviewEntry,
  type StudentParkingViolation,
} from "../../lib/api";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type LoadState = "idle" | "loading" | "error" | "ready";
type View = "table" | "detail";

type BeaconMeta = {
  uuid?: string;
  hubUUID?: string;
  major?: number;
  minor?: number;
  lastSeen?: number;
  rssi?: number;
  position: [number, number] | null;
};

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

function formatTimestampFull(unix: number) {
  const ms = unix < 1e11 ? unix * 1000 : unix;
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function getBeaconMeta(device: RegisteredDevice): BeaconMeta | null {
  const meta = device.metadata as Record<string, unknown> | undefined;
  if (!meta) return null;

  const str = (key: string) => {
    const v = meta[key];
    return v != null ? String(v).trim() : undefined;
  };
  const num = (...keys: string[]) => {
    for (const k of keys) {
      const v = Number(meta[k]);
      if (Number.isFinite(v)) return v;
    }
    return undefined;
  };

  const uuid =
    str("beacon_uuid") ?? str("beacon_id") ?? str("hub_key") ?? undefined;
  const hubUUID = str("hub_uuid") ?? undefined;
  const major = num("major", "beacon_major");
  const minor = num("minor", "beacon_minor");
  const lastSeen = num("last_seen_at", "last_seen", "seen_at");
  const rssi = num("rssi", "signal_strength");

  const tryPos = (lk: string, lgk: string): [number, number] | null => {
    const lat = Number(meta[lk]);
    const lng = Number(meta[lgk]);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
      ? [lat, lng]
      : null;
  };
  const position =
    tryPos("lat", "lng") ??
    tryPos("latitude", "longitude") ??
    tryPos("beacon_lat", "beacon_lng") ??
    tryPos("last_lat", "last_lng") ??
    tryPos("last_latitude", "last_longitude") ??
    null;

  if (!uuid && !hubUUID && major == null && minor == null && lastSeen == null && rssi == null && !position) {
    return null;
  }

  return { uuid, hubUUID, major, minor, lastSeen, rssi, position };
}

function violationPositions(violations: StudentParkingViolation[]): { pos: [number, number]; label: string }[] {
  return violations
    .filter(
      (v) =>
        Number.isFinite(v.violation_latitude) &&
        Number.isFinite(v.violation_longitude) &&
        v.violation_latitude !== 0 &&
        v.violation_longitude !== 0,
    )
    .map((v) => ({
      pos: [v.violation_latitude!, v.violation_longitude!] as [number, number],
      label: capitalize(v.violation_type) || "Violation",
    }));
}

// ── Map components ─────────────────────────────────────────────────────────────

function DeviceMapFitter({
  beaconPos,
  vPositions,
}: {
  beaconPos: [number, number] | null;
  vPositions: { pos: [number, number] }[];
}) {
  const map = useMap();

  useEffect(() => {
    const all: [number, number][] = [
      ...(beaconPos ? [beaconPos] : []),
      ...vPositions.map((v) => v.pos),
    ];
    if (all.length === 0) return;
    if (all.length === 1) {
      map.setView(all[0], 16, { animate: false });
    } else {
      const bounds = new LatLngBounds(all);
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25), { padding: [28, 28], animate: false });
      }
    }
  }, [map, beaconPos, vPositions]);

  return null;
}

function DeviceMap({
  beaconMeta,
  violations,
}: {
  beaconMeta: BeaconMeta | null;
  violations: StudentParkingViolation[];
}) {
  const beaconPos = beaconMeta?.position ?? null;
  const vPos = violationPositions(violations);
  const allPoints: [number, number][] = [
    ...(beaconPos ? [beaconPos] : []),
    ...vPos.map((v) => v.pos),
  ];

  if (allPoints.length === 0) return null;

  return (
    <MapContainer
      center={allPoints[0]}
      zoom={15}
      scrollWheelZoom={false}
      className="cd-device-map"
      attributionControl={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
      <DeviceMapFitter beaconPos={beaconPos} vPositions={vPos} />
      {beaconPos && (
        <Marker position={beaconPos} icon={juisePackIcon}>
          <Tooltip permanent direction="top" offset={[0, -22]}>
            Last known location
          </Tooltip>
        </Marker>
      )}
      {vPos.map(({ pos, label }, i) => (
        <CircleMarker
          key={i}
          center={pos}
          radius={9}
          color="#dc3545"
          fillColor="#dc3545"
          fillOpacity={0.75}
          weight={2}
        >
          <Tooltip>{label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

// ── Status tabs ─────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "declined", label: "Declined" },
  { key: "inactive", label: "Inactive" },
];

// ── Main screen ─────────────────────────────────────────────────────────────────

export function CampusDevicesScreen({ activeSchoolId, managedAppId }: Props) {
  const [view, setView] = useState<View>("table");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [entries, setEntries] = useState<RegisteredDeviceReviewEntry[]>([]);
  const [violations, setViolations] = useState<StudentParkingViolation[]>([]);
  const [studentPhotoUrls, setStudentPhotoUrls] = useState<Record<string, string>>({});
  const [devicePhotoUrls, setDevicePhotoUrls] = useState<Record<string, string>>({});
  const [selectedUUID, setSelectedUUID] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
    return () => { cancelled = true; };
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
        if (statusFilter !== "all" && statusLabel !== statusFilter) return false;
        if (!q) return true;
        const name = formatName(entry).toLowerCase();
        const device = formatDevice(entry).toLowerCase();
        const sid = formatStudentId(entry).toLowerCase();
        const serial = (entry.device.serial_number ?? "").toLowerCase();
        return name.includes(q) || device.includes(q) || sid.includes(q) || serial.includes(q);
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

  const selectedEntry = useMemo(
    () => entries.find((e) => e.device.registered_device_uuid === selectedUUID) ?? null,
    [entries, selectedUUID],
  );

  const selectedViolations = useMemo(
    () =>
      selectedEntry
        ? (violationsByDevice.get(selectedEntry.device.registered_device_uuid) ?? [])
            .slice()
            .sort((a, b) => b.created_at - a.created_at)
        : [],
    [selectedEntry, violationsByDevice],
  );

  function openDetail(uuid: string) {
    setSelectedUUID(uuid);
    setView("detail");
  }

  function backToTable() {
    setView("table");
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === "detail" && selectedEntry) {
    const beaconMeta = getBeaconMeta(selectedEntry.device);
    const statusLabel = getDeviceStatusLabel(selectedEntry);
    const devicePhoto = devicePhotoUrls[selectedEntry.device.registered_device_uuid];
    const studentPhoto = studentPhotoUrls[selectedEntry.device.user_uuid];
    const hasMap =
      beaconMeta?.position != null ||
      selectedViolations.some(
        (v) =>
          Number.isFinite(v.violation_latitude) &&
          Number.isFinite(v.violation_longitude) &&
          v.violation_latitude !== 0,
      );

    return (
      <div className="cd-root">
        <div className="cd-detail-view">
          {/* Back bar */}
          <div className="cd-detail-back-bar">
            <button type="button" className="cd-detail-back-btn" onClick={backToTable}>
              ← All Devices
            </button>
            <span className="cd-detail-back-label">
              {filteredEntries.length.toLocaleString()} device{filteredEntries.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="cd-detail-body">
            {/* Full-width map */}
            {hasMap && (
              <div className="cd-device-map-wrap">
                <DeviceMap beaconMeta={beaconMeta} violations={selectedViolations} />
                <div className="cd-device-map-legend">
                  {beaconMeta?.position && (
                    <span className="cd-map-legend-item cd-map-legend-beacon">
                      <span className="cd-map-legend-dot" style={{ background: "#27CC5E" }} />
                      Beacon location
                    </span>
                  )}
                  {selectedViolations.some((v) => Number.isFinite(v.violation_latitude) && v.violation_latitude !== 0) && (
                    <span className="cd-map-legend-item">
                      <span className="cd-map-legend-dot" style={{ background: "#dc3545" }} />
                      Violations
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Header */}
            <div className="cd-detail-header">
              <div className="cd-detail-device-thumb">
                {devicePhoto ? (
                  <img src={devicePhoto} alt={formatDevice(selectedEntry)} className="cd-device-photo" />
                ) : (
                  <div className="cd-device-photo-placeholder">🚲</div>
                )}
              </div>
              <div className="cd-detail-header-info">
                <h3 className="cd-detail-device-name">{formatDevice(selectedEntry)}</h3>
                <p className="cd-detail-student-name">{formatName(selectedEntry)}</p>
                <div className="cd-detail-badges">
                  <span className={getDeviceStatusClass(statusLabel)}>{statusLabel}</span>
                  {selectedEntry.device.powertrain_type && (
                    <span className="cd-tag">{capitalize(selectedEntry.device.powertrain_type)}</span>
                  )}
                  {selectedEntry.device.device_type && (
                    <span className="cd-tag">{capitalize(selectedEntry.device.device_type)}</span>
                  )}
                  {beaconMeta && (
                    <span className="cd-tag cd-tag-beacon">📡 Beacon</span>
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
                <strong className={selectedViolations.filter((v) => v.active).length > 0 ? "cd-stat-danger" : ""}>
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

            <div className="cd-detail-columns">
              {/* Left column */}
              <div className="cd-detail-col">
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
                          {[selectedEntry.device.make, selectedEntry.device.model].filter(Boolean).join(" ")}
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
                    {selectedEntry.device.registration_status && (
                      <div className="cd-info-row">
                        <span>Registration</span>
                        <strong>{capitalize(selectedEntry.device.registration_status)}</strong>
                      </div>
                    )}
                  </div>
                </section>

                {/* Beacon info */}
                {beaconMeta && (
                  <section className="cd-section">
                    <h4 className="cd-section-title">📡 Beacon</h4>
                    <div className="cd-info-grid">
                      {beaconMeta.uuid && (
                        <div className="cd-info-row">
                          <span>Beacon UUID</span>
                          <strong className="cd-mono cd-mono-sm">{beaconMeta.uuid}</strong>
                        </div>
                      )}
                      {beaconMeta.hubUUID && (
                        <div className="cd-info-row">
                          <span>Hub UUID</span>
                          <strong className="cd-mono cd-mono-sm">{beaconMeta.hubUUID}</strong>
                        </div>
                      )}
                      {beaconMeta.major != null && (
                        <div className="cd-info-row">
                          <span>Major</span>
                          <strong>{beaconMeta.major}</strong>
                        </div>
                      )}
                      {beaconMeta.minor != null && (
                        <div className="cd-info-row">
                          <span>Minor</span>
                          <strong>{beaconMeta.minor}</strong>
                        </div>
                      )}
                      {beaconMeta.rssi != null && (
                        <div className="cd-info-row">
                          <span>Signal (RSSI)</span>
                          <strong>{beaconMeta.rssi} dBm</strong>
                        </div>
                      )}
                      {beaconMeta.lastSeen != null && (
                        <div className="cd-info-row">
                          <span>Last seen</span>
                          <strong>{formatTimestampFull(beaconMeta.lastSeen)}</strong>
                        </div>
                      )}
                      {beaconMeta.position && (
                        <div className="cd-info-row">
                          <span>Coordinates</span>
                          <strong className="cd-mono cd-mono-sm">
                            {beaconMeta.position[0].toFixed(5)}, {beaconMeta.position[1].toFixed(5)}
                          </strong>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Student */}
                <section className="cd-section">
                  <h4 className="cd-section-title">Student</h4>
                  <div className="cd-student-card">
                    <div className="cd-student-card-avatar">
                      {studentPhoto ? (
                        <img
                          src={studentPhoto}
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
                        <p className="cd-student-sub">ID: {formatStudentId(selectedEntry)}</p>
                      )}
                      {(selectedEntry.student.user.email || selectedEntry.student.user.username) && (
                        <p className="cd-student-sub">
                          {selectedEntry.student.user.email || selectedEntry.student.user.username}
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* Right column — violations */}
              <div className="cd-detail-col">
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
                        const vStatus = formatViolationStatus(v);
                        const fee = formatCurrency(v.payment_amount_cents);
                        const feePaid = !!v.payment_collected_at;
                        const hasCoords =
                          Number.isFinite(v.violation_latitude) &&
                          Number.isFinite(v.violation_longitude) &&
                          v.violation_latitude !== 0;
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
                                  className={`cd-violation-status cd-violation-status-${vStatus.toLowerCase()}`}
                                >
                                  {vStatus}
                                </span>
                                {fee && (
                                  <span className={`cd-violation-fee${feePaid ? " cd-violation-fee-paid" : ""}`}>
                                    {fee}{feePaid ? " paid" : ""}
                                  </span>
                                )}
                                {hasCoords && (
                                  <span className="cd-violation-has-location" title="Location on map">📍</span>
                                )}
                              </div>
                            </div>
                            {v.description && (
                              <p className="cd-violation-desc">{v.description}</p>
                            )}
                            {v.admin_notes && (
                              <p className="cd-violation-notes"><em>Note:</em> {v.admin_notes}</p>
                            )}
                            <p className="cd-violation-date">{formatTimestamp(v.created_at)}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Table view (default) ─────────────────────────────────────────────────────
  return (
    <div className="cd-root">
      <div className="cd-table-view">
        <div className="cd-table-view-header">
          <div className="cd-table-view-header-row">
            <div className="cd-table-view-title-group">
              <h2 className="cd-sidebar-title">Campus Devices</h2>
              <span className="cd-sidebar-count">
                {loadState === "ready"
                  ? `${filteredEntries.length.toLocaleString()} of ${entries.length.toLocaleString()} devices`
                  : loadState === "loading"
                    ? "Loading…"
                    : ""}
              </span>
            </div>
            <input
              type="search"
              className="cd-table-search"
              placeholder="Search by student, device, serial…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
          <div className="cd-table-scroll">
            <table className="cd-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Student</th>
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
                {filteredEntries.map((entry) => {
                  const uuid = entry.device.registered_device_uuid;
                  const name = formatName(entry);
                  const deviceLabel = formatDevice(entry);
                  const statusLabel = getDeviceStatusLabel(entry);
                  const studentPhotoUrl = studentPhotoUrls[entry.device.user_uuid];
                  const devicePhotoUrl = devicePhotoUrls[entry.device.registered_device_uuid];
                  const deviceViolations = violationsByDevice.get(uuid) ?? [];
                  const activeV = deviceViolations.filter((v) => v.active).length;
                  const totalV = deviceViolations.length;
                  const lastViolation = deviceViolations
                    .slice()
                    .sort((a, b) => b.created_at - a.created_at)[0];
                  const sid = formatStudentId(entry);
                  const hasBeacon = getBeaconMeta(entry.device) !== null;

                  return (
                    <tr key={uuid} className="cd-table-row" onClick={() => openDetail(uuid)}>
                      <td>
                        <div className="cd-table-student-cell">
                          {devicePhotoUrl ? (
                            <img
                              src={devicePhotoUrl}
                              alt={deviceLabel}
                              className="cd-table-avatar cd-table-avatar-device"
                            />
                          ) : (
                            <div className="cd-table-avatar-initials cd-table-avatar-device-placeholder">🚲</div>
                          )}
                          <div>
                            <div className="cd-table-name">
                              {deviceLabel}
                              {hasBeacon && <span className="cd-table-beacon-dot" title="Has beacon">📡</span>}
                            </div>
                            <div className="cd-table-sid cd-table-uuid">{uuid}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="cd-table-student-cell">
                          {studentPhotoUrl ? (
                            <img src={studentPhotoUrl} alt={name} className="cd-table-avatar" />
                          ) : (
                            <div className="cd-table-avatar-initials">{getInitials(name)}</div>
                          )}
                          <div>
                            <div className="cd-table-name">{name}</div>
                            {sid && <div className="cd-table-sid">{sid}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{capitalize(entry.device.device_type) || "—"}</td>
                      <td>{capitalize(entry.device.color) || "—"}</td>
                      <td>
                        <span className={getDeviceStatusClass(statusLabel)}>{statusLabel}</span>
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
                        {lastViolation ? formatTimestamp(lastViolation.created_at) : "—"}
                      </td>
                      <td className="cd-table-date">{formatTimestamp(entry.device.created_at)}</td>
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
