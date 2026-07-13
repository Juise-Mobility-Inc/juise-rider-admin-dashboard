import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LatLngBounds } from "leaflet";
import QRCode from "qrcode";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { juisePackIcon } from "../../lib/mapIcons";
import {
  fetchSchoolBeaconLocations,
  fetchSchoolParkingViolations,
  fetchSchoolRegisteredDevices,
  getRegisteredDeviceBeaconInfo,
  signSchoolMedia,
  type SchoolRegisteredDeviceBeaconLocation,
  type RegisteredDevice,
  type RegisteredDeviceReviewEntry,
  type StudentParkingViolation,
} from "../../lib/api";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

type Props = {
  activeSchoolId: string;
  managedAppId: string;
  onOpenStudent?: (membershipUUID: string) => void;
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

type DeviceQrDescriptor = {
  value: string;
  source: string;
  isGenerated: boolean;
};

const DEVICE_QR_METADATA_KEYS = [
  "qr_code",
  "qr_value",
  "scan_value",
  "qr_payload",
] as const;

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

function getStudentMembershipUUID(entry: RegisteredDeviceReviewEntry) {
  return entry.student.membership?.membership_uuid?.trim() ?? "";
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
    case "Declined":
      return "reg-status reg-status-declined";
    case "Pending":
      return "reg-status reg-status-pending";
    case "Inactive":
      return "reg-status reg-status-inactive";
    default:
      return "reg-status reg-status-approved";
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

function timeAgo(unix: number): string {
  const ms = unix < 1e11 ? unix * 1000 : unix;
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatBeaconAccuracy(meters?: number | null): string {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) {
    return "Accuracy unavailable";
  }
  const feet = meters * 3.28084;
  if (feet < 5280) {
    return `+/- ${Math.round(feet).toLocaleString()} ft`;
  }
  const miles = feet / 5280;
  return `+/- ${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString()} mi`;
}

function isValidBeaconAccuracy(meters?: number | null): meters is number {
  return typeof meters === "number" && Number.isFinite(meters) && meters > 0;
}

function beaconAccuracyBounds(
  position: [number, number],
  radiusMeters?: number | null,
): LatLngBounds | null {
  if (!isValidBeaconAccuracy(radiusMeters)) return null;
  const [lat, lng] = position;
  const latDelta = radiusMeters / 111_320;
  const lngDelta =
    radiusMeters / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return new LatLngBounds([
    [lat - latDelta, lng - lngDelta],
    [lat + latDelta, lng + lngDelta],
  ]);
}

function googleMapsUrl(position: [number, number]): string {
  const [lat, lng] = position;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function capitalize(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

function titleCase(str: string) {
  return str
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function resolveDeviceQrDescriptor(
  device: RegisteredDevice,
): DeviceQrDescriptor {
  const metadata = getMetadataRecord(device.metadata);
  for (const key of DEVICE_QR_METADATA_KEYS) {
    const value = getStringValue(metadata[key]);
    if (value) {
      return {
        value,
        source: titleCase(key),
        isGenerated: false,
      };
    }
  }

  return {
    value: device.registered_device_uuid,
    source: "Registered Device UUID",
    isGenerated: true,
  };
}

function deviceQrFilename(entry: RegisteredDeviceReviewEntry) {
  const base =
    formatDevice(entry) ||
    entry.device.nickname ||
    entry.device.registered_device_uuid ||
    "device";
  return `${
    base
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "device"
  }-qr.png`;
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
    return Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
      ? [lat, lng]
      : null;
  };
  const metaPosition =
    tryPos("lat", "lng") ??
    tryPos("latitude", "longitude") ??
    tryPos("beacon_lat", "beacon_lng") ??
    tryPos("last_lat", "last_lng") ??
    tryPos("last_latitude", "last_longitude") ??
    null;

  if (
    !uuid &&
    !hubUUID &&
    major == null &&
    minor == null &&
    lastSeen == null &&
    rssi == null &&
    !metaPosition
  ) {
    return null;
  }

  return {
    uuid,
    hubUUID,
    major,
    minor,
    lastSeen,
    rssi,
    position: metaPosition,
  };
}

function violationPositions(
  violations: StudentParkingViolation[],
): { pos: [number, number]; label: string }[] {
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
  beaconAccuracyMeters,
  vPositions,
}: {
  beaconPos: [number, number] | null;
  beaconAccuracyMeters?: number | null;
  vPositions: { pos: [number, number] }[];
}) {
  const map = useMap();

  useEffect(() => {
    const accuracyBounds = beaconPos
      ? beaconAccuracyBounds(beaconPos, beaconAccuracyMeters)
      : null;
    const all: [number, number][] = [
      ...(beaconPos ? [beaconPos] : []),
      ...vPositions.map((v) => v.pos),
    ];
    if (all.length === 0) return;
    if (accuracyBounds) {
      const bounds = new LatLngBounds(all);
      bounds.extend(accuracyBounds.getSouthWest());
      bounds.extend(accuracyBounds.getNorthEast());
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25), { padding: [28, 28], animate: false });
      }
    } else if (all.length === 1) {
      map.setView(all[0], 16, { animate: false });
    } else {
      const bounds = new LatLngBounds(all);
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25), { padding: [28, 28], animate: false });
      }
    }
  }, [map, beaconPos, beaconAccuracyMeters, vPositions]);

  return null;
}

function DeviceMapCenterButton({
  beaconPos,
}: {
  beaconPos: [number, number] | null;
}) {
  const map = useMap();
  if (!beaconPos) return null;

  return (
    <button
      type="button"
      className="cd-map-center-btn"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        map.setView(beaconPos, Math.max(map.getZoom(), 16), { animate: true });
      }}
      aria-label="Center on beacon location"
      title="Center on beacon"
    >
      Center on beacon
    </button>
  );
}

function DeviceMap({
  beaconPos,
  beaconAccuracyMeters,
  violations,
  beaconLabel,
}: {
  beaconPos: [number, number] | null;
  beaconAccuracyMeters?: number | null;
  violations: StudentParkingViolation[];
  beaconLabel?: string;
}) {
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
      scrollWheelZoom={true}
      zoomControl={true}
      doubleClickZoom={true}
      className="cd-device-map"
      attributionControl={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
      <DeviceMapFitter
        beaconPos={beaconPos}
        beaconAccuracyMeters={beaconAccuracyMeters}
        vPositions={vPos}
      />
      <DeviceMapCenterButton beaconPos={beaconPos} />
      {beaconPos && isValidBeaconAccuracy(beaconAccuracyMeters) && (
        <Circle
          center={beaconPos}
          radius={beaconAccuracyMeters}
          color="#27CC5E"
          fillColor="#27CC5E"
          fillOpacity={0.12}
          opacity={0.8}
          weight={2}
        >
          <Tooltip sticky>
            Accuracy radius: {formatBeaconAccuracy(beaconAccuracyMeters)}
          </Tooltip>
        </Circle>
      )}
      {beaconPos && (
        <Marker position={beaconPos} icon={juisePackIcon}>
          <Tooltip permanent direction="top" offset={[0, -22]}>
            {beaconLabel ?? "Last known location"}
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

// ── Status tabs ────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "declined", label: "Declined" },
  { key: "inactive", label: "Inactive" },
];

// ── Main screen ────────────────────────────────────────────────────────────────

export function CampusDevicesScreen({
  activeSchoolId,
  managedAppId,
  onOpenStudent,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<View>(() => {
    const deepLinked =
      searchParams.get("device")?.trim() ||
      searchParams.get("registered_device_uuid")?.trim();
    return deepLinked ? "detail" : "table";
  });

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [entries, setEntries] = useState<RegisteredDeviceReviewEntry[]>([]);
  const [violations, setViolations] = useState<StudentParkingViolation[]>([]);
  const [beaconLocations, setBeaconLocations] = useState<
    SchoolRegisteredDeviceBeaconLocation[]
  >([]);
  const [studentPhotoUrls, setStudentPhotoUrls] = useState<
    Record<string, string>
  >({});
  const [devicePhotoUrls, setDevicePhotoUrls] = useState<
    Record<string, string>
  >({});
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrStatusMessage, setQrStatusMessage] = useState("");
  const [selectedUUID, setSelectedUUID] = useState<string | null>(
    searchParams.get("device")?.trim() ||
      searchParams.get("registered_device_uuid")?.trim() ||
      null,
  );
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
      setBeaconLocations([]);
      setStudentPhotoUrls({});
      setDevicePhotoUrls({});

      try {
        const [allEntries, allViolations, allBeaconLocations] =
          await Promise.all([
            fetchSchoolRegisteredDevices(
              managedAppId,
              activeSchoolId,
              "",
            ).catch(() => [] as RegisteredDeviceReviewEntry[]),
            fetchSchoolParkingViolations(managedAppId, activeSchoolId, {
              includeInactive: true,
            }).catch(() => [] as StudentParkingViolation[]),
            fetchSchoolBeaconLocations(managedAppId, activeSchoolId, {
              maxAgeSeconds: 3600,
              staleAfterSeconds: 300,
              limit: 500,
            }).catch(() => [] as SchoolRegisteredDeviceBeaconLocation[]),
          ]);

        if (cancelled) return;
        setEntries(allEntries);
        setViolations(allViolations);
        setBeaconLocations(allBeaconLocations);
        setLoadState("ready");

        const studentKeyMap: Record<string, string> = {};
        const deviceKeyMap: Record<string, string> = {};
        for (const entry of allEntries) {
          const profileKey = entry.student.profile_image_object_key?.trim();
          if (profileKey) studentKeyMap[entry.device.user_uuid] = profileKey;
          const asset = entry.device_media.find(
            (m) => m.active && m.object_key?.trim(),
          );
          if (asset?.object_key) {
            deviceKeyMap[entry.device.registered_device_uuid] =
              asset.object_key;
          }
        }

        const allKeys = [
          ...new Set([
            ...Object.values(studentKeyMap),
            ...Object.values(deviceKeyMap),
          ]),
        ];
        if (allKeys.length > 0 && !cancelled) {
          const signed: Record<string, string> = await signSchoolMedia(
            activeSchoolId,
            allKeys,
          ).catch(() => ({}));
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

  const beaconLocationByDevice = useMemo(() => {
    const map = new Map<string, SchoolRegisteredDeviceBeaconLocation>();
    for (const loc of beaconLocations) {
      map.set(loc.registered_device_uuid, loc);
    }
    return map;
  }, [beaconLocations]);

  const violationsByDevice = useMemo(() => {
    const map = new Map<string, StudentParkingViolation[]>();
    for (const v of violations) {
      if (!v.registered_device_uuid) continue;
      if (!map.has(v.registered_device_uuid))
        map.set(v.registered_device_uuid, []);
      map.get(v.registered_device_uuid)!.push(v);
    }
    return map;
  }, [violations]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((entry) => {
        const statusLabel = getDeviceStatusLabel(entry).toLowerCase();
        if (statusFilter !== "all" && statusLabel !== statusFilter)
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
        const aActive = (
          violationsByDevice.get(a.device.registered_device_uuid) ?? []
        ).filter((v) => v.active).length;
        const bActive = (
          violationsByDevice.get(b.device.registered_device_uuid) ?? []
        ).filter((v) => v.active).length;
        if (bActive !== aActive) return bActive - aActive;
        return formatName(a).localeCompare(formatName(b));
      });
  }, [entries, violationsByDevice, search, statusFilter]);

  const selectedEntry = useMemo(
    () =>
      entries.find((e) => e.device.registered_device_uuid === selectedUUID) ??
      null,
    [entries, selectedUUID],
  );

  const selectedViolations = useMemo(
    () =>
      selectedEntry
        ? (
            violationsByDevice.get(
              selectedEntry.device.registered_device_uuid,
            ) ?? []
          )
            .slice()
            .sort((a, b) => b.created_at - a.created_at)
        : [],
    [selectedEntry, violationsByDevice],
  );
  const selectedQrDescriptor = useMemo(
    () =>
      selectedEntry ? resolveDeviceQrDescriptor(selectedEntry.device) : null,
    [selectedEntry],
  );

  useEffect(() => {
    let cancelled = false;
    setQrStatusMessage("");

    async function generateQrPreview() {
      if (!selectedQrDescriptor?.value) {
        setQrDataUrl("");
        return;
      }

      try {
        setQrBusy(true);
        const nextQrDataUrl = await QRCode.toDataURL(
          selectedQrDescriptor.value,
          {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 420,
            color: {
              dark: "#0E2219",
              light: "#FFFFFFFF",
            },
          },
        );
        if (!cancelled) {
          setQrDataUrl(nextQrDataUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setQrDataUrl("");
          setQrStatusMessage(getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setQrBusy(false);
        }
      }
    }

    void generateQrPreview();

    return () => {
      cancelled = true;
    };
  }, [selectedQrDescriptor]);

  function downloadSelectedDeviceQr() {
    if (!selectedEntry || !qrDataUrl) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = deviceQrFilename(selectedEntry);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setQrStatusMessage("QR code downloaded.");
  }

  async function copySelectedDeviceQrValue() {
    if (!selectedQrDescriptor?.value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedQrDescriptor.value);
      setQrStatusMessage("Device scan value copied.");
    } catch (error) {
      setQrStatusMessage(getErrorMessage(error));
    }
  }

  function openDetail(uuid: string) {
    setSelectedUUID(uuid);
    setSearchParams({ device: uuid });
    setView("detail");
  }

  function backToTable() {
    setView("table");
    setSearchParams({});
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === "detail" && selectedEntry) {
    const devUUID = selectedEntry.device.registered_device_uuid;
    const beaconInfo = getRegisteredDeviceBeaconInfo(selectedEntry.device);
    const beaconMeta = getBeaconMeta(selectedEntry.device);
    const liveLocation = beaconLocationByDevice.get(devUUID);

    const beaconPos: [number, number] | null =
      liveLocation &&
      Number.isFinite(liveLocation.latitude) &&
      Number.isFinite(liveLocation.longitude) &&
      liveLocation.latitude !== 0
        ? [liveLocation.latitude!, liveLocation.longitude!]
        : (beaconMeta?.position ?? null);

    const beaconMapLabel = liveLocation
      ? `${beaconInfo?.beacon_mac ?? "Beacon"} - ${liveLocation.stale ? "stale" : "live"}${liveLocation.observed_at != null ? ` - ${timeAgo(liveLocation.observed_at)}` : ""}`
      : beaconInfo?.beacon_mac
        ? `${beaconInfo.beacon_mac} (metadata)`
        : "Last known location";

    const statusLabel = getDeviceStatusLabel(selectedEntry);
    const devicePhoto = devicePhotoUrls[devUUID];
    const studentPhoto = studentPhotoUrls[selectedEntry.device.user_uuid];
    const studentMembershipUUID = getStudentMembershipUUID(selectedEntry);
    const canOpenStudent = Boolean(onOpenStudent && studentMembershipUUID);

    function openSelectedStudent() {
      if (!onOpenStudent || !studentMembershipUUID) {
        return;
      }
      onOpenStudent(studentMembershipUUID);
    }

    const hasMap =
      beaconPos !== null ||
      selectedViolations.some(
        (v) =>
          Number.isFinite(v.violation_latitude) &&
          Number.isFinite(v.violation_longitude) &&
          v.violation_latitude !== 0,
      );

    return (
      <div className="cd-root">
        <div className="cd-detail-view">
          <div className="cd-detail-back-bar">
            <button
              type="button"
              className="cd-detail-back-btn"
              onClick={backToTable}
            >
              ← All Devices
            </button>
            <span className="cd-detail-back-label">
              {filteredEntries.length.toLocaleString()} device
              {filteredEntries.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="cd-detail-body">
            {hasMap && (
              <div className="cd-device-map-wrap">
                <DeviceMap
                  beaconPos={beaconPos}
                  beaconAccuracyMeters={liveLocation?.radius_meters ?? null}
                  violations={selectedViolations}
                  beaconLabel={beaconMapLabel}
                />
                <div className="cd-device-map-legend">
                  {beaconPos && (
                    <span className="cd-map-legend-item cd-map-legend-beacon">
                      <span
                        className="cd-map-legend-dot"
                        style={{ background: "#27CC5E" }}
                      />
                      {liveLocation
                        ? liveLocation.stale
                          ? "Beacon (stale)"
                          : "Beacon (live)"
                        : "Beacon location"}
                    </span>
                  )}
                  {selectedViolations.some(
                    (v) =>
                      Number.isFinite(v.violation_latitude) &&
                      v.violation_latitude !== 0,
                  ) && (
                    <span className="cd-map-legend-item">
                      <span
                        className="cd-map-legend-dot"
                        style={{ background: "#dc3545" }}
                      />
                      Violations
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="cd-detail-header">
              <div className="cd-detail-device-thumb">
                {devicePhoto ? (
                  <img
                    src={devicePhoto}
                    alt={formatDevice(selectedEntry)}
                    className="cd-device-photo"
                  />
                ) : (
                  <div className="cd-device-photo-placeholder">🚲</div>
                )}
              </div>
              <div className="cd-detail-header-info">
                <h3 className="cd-detail-device-name">
                  {formatDevice(selectedEntry)}
                </h3>
                {canOpenStudent ? (
                  <button
                    type="button"
                    className="cd-detail-student-link"
                    onClick={openSelectedStudent}
                  >
                    {formatName(selectedEntry)}
                  </button>
                ) : (
                  <p className="cd-detail-student-name">
                    {formatName(selectedEntry)}
                  </p>
                )}
                <div className="cd-detail-badges">
                  <span className={getDeviceStatusClass(statusLabel)}>
                    {statusLabel}
                  </span>
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
                  {beaconInfo && (
                    <span className="cd-tag cd-tag-beacon">
                      📡 {beaconInfo.beacon_mac}
                    </span>
                  )}
                  {!beaconInfo && beaconMeta && (
                    <span className="cd-tag cd-tag-beacon">📡 Beacon</span>
                  )}
                </div>
              </div>
            </div>

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
                  {selectedViolations
                    .filter((v) => v.active)
                    .length.toLocaleString()}
                </strong>
              </div>
              <div className="cd-stat">
                <span>Last violation</span>
                <strong>
                  {selectedViolations.length > 0
                    ? formatTimestamp(selectedViolations[0].created_at)
                    : "-"}
                </strong>
              </div>
              <div className="cd-stat">
                <span>Registered</span>
                <strong>
                  {formatTimestamp(selectedEntry.device.created_at)}
                </strong>
              </div>
            </div>

            <div className="cd-detail-columns">
              <div className="cd-detail-col">
                <section className="cd-section">
                  <h4 className="cd-section-title">Device Details</h4>
                  <div className="cd-info-grid">
                    {selectedEntry.device.device_type && (
                      <div className="cd-info-row">
                        <span>Type</span>
                        <strong>
                          {capitalize(selectedEntry.device.device_type)}
                        </strong>
                      </div>
                    )}
                    {(selectedEntry.device.make ||
                      selectedEntry.device.model) && (
                      <div className="cd-info-row">
                        <span>Make / Model</span>
                        <strong>
                          {[
                            selectedEntry.device.make,
                            selectedEntry.device.model,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        </strong>
                      </div>
                    )}
                    {selectedEntry.device.color && (
                      <div className="cd-info-row">
                        <span>Color</span>
                        <strong>
                          {capitalize(selectedEntry.device.color)}
                        </strong>
                      </div>
                    )}
                    {selectedEntry.device.serial_number && (
                      <div className="cd-info-row">
                        <span>Serial number</span>
                        <strong className="cd-mono">
                          {selectedEntry.device.serial_number}
                        </strong>
                      </div>
                    )}
                    {selectedEntry.device.powertrain_type && (
                      <div className="cd-info-row">
                        <span>Powertrain</span>
                        <strong>
                          {capitalize(selectedEntry.device.powertrain_type)}
                        </strong>
                      </div>
                    )}
                    {selectedEntry.device.registration_status && (
                      <div className="cd-info-row">
                        <span>Registration</span>
                        <strong>
                          {capitalize(selectedEntry.device.registration_status)}
                        </strong>
                      </div>
                    )}
                  </div>
                </section>

                <section className="cd-section cd-device-qr-section">
                  <div className="cd-section-heading-row">
                    <h4 className="cd-section-title">Device QR Code</h4>
                    <span className="cd-tag">
                      {selectedQrDescriptor?.isGenerated
                        ? "Generated"
                        : "Saved payload"}
                    </span>
                  </div>
                  <div className="cd-device-qr-layout">
                    {qrDataUrl ? (
                      <img
                        className="cd-device-qr-image"
                        src={qrDataUrl}
                        alt={`${formatDevice(selectedEntry)} QR code`}
                      />
                    ) : (
                      <div className="cd-device-qr-placeholder">
                        {qrBusy ? "Generating QR..." : "QR preview unavailable"}
                      </div>
                    )}
                    <div className="cd-device-qr-copy">
                      <p>
                        {selectedQrDescriptor?.isGenerated
                          ? `No saved QR payload was found, so this QR uses the ${selectedQrDescriptor.source}.`
                          : `Using the saved ${selectedQrDescriptor?.source ?? "QR payload"} for this device.`}
                      </p>
                      <div className="cd-device-qr-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={downloadSelectedDeviceQr}
                          disabled={!qrDataUrl}
                        >
                          Download QR
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void copySelectedDeviceQrValue()}
                          disabled={!selectedQrDescriptor?.value}
                        >
                          Copy scan value
                        </button>
                      </div>
                      {qrStatusMessage ? (
                        <span className="cd-device-qr-status">
                          {qrStatusMessage}
                        </span>
                      ) : null}
                      <div className="cd-info-row cd-device-qr-value">
                        <span>Scan value</span>
                        <strong className="cd-mono">
                          {selectedQrDescriptor?.value ?? "-"}
                        </strong>
                      </div>
                    </div>
                  </div>
                </section>

                {(beaconInfo || beaconMeta || liveLocation) && (
                  <section className="cd-section">
                    <h4 className="cd-section-title">📡 Beacon</h4>
                    <div className="cd-info-grid">
                      {beaconInfo && (
                        <div className="cd-info-row">
                          <span>MAC address</span>
                          <strong className="cd-mono">
                            {beaconInfo.beacon_mac}
                          </strong>
                        </div>
                      )}
                      {liveLocation && (
                        <>
                          <div className="cd-info-row">
                            <span>Status</span>
                            <strong>
                              {liveLocation.stale ? "Stale" : "Live"}
                              {liveLocation.observed_at != null && (
                                <span className="cd-ping-age">
                                  {" · "}
                                  {timeAgo(liveLocation.observed_at)}
                                </span>
                              )}
                            </strong>
                          </div>
                          {liveLocation.observed_at != null && (
                            <div className="cd-info-row">
                              <span>Last observed</span>
                              <strong>
                                {formatTimestampFull(liveLocation.observed_at)}
                              </strong>
                            </div>
                          )}
                          {liveLocation.sighting_count > 0 && (
                            <div className="cd-info-row">
                              <span>Sightings</span>
                              <strong>
                                {liveLocation.sighting_count.toLocaleString()}
                              </strong>
                            </div>
                          )}
                          {liveLocation.rssi != null && (
                            <div className="cd-info-row">
                              <span>Signal (RSSI)</span>
                              <strong>{liveLocation.rssi} dBm</strong>
                            </div>
                          )}
                          {liveLocation.radius_meters != null && (
                            <div className="cd-info-row">
                              <span>Accuracy</span>
                              <strong>
                                {formatBeaconAccuracy(
                                  liveLocation.radius_meters,
                                )}
                              </strong>
                            </div>
                          )}
                          {liveLocation.estimate_method && (
                            <div className="cd-info-row">
                              <span>Method</span>
                              <strong>
                                {capitalize(liveLocation.estimate_method)}
                              </strong>
                            </div>
                          )}
                          {beaconPos && (
                            <div className="cd-info-row">
                              <span>Coordinates</span>
                              <strong className="cd-coordinate-value">
                                <code className="cd-coordinate-text">
                                  {beaconPos[0].toFixed(5)},{" "}
                                  {beaconPos[1].toFixed(5)}
                                </code>
                                <a
                                  className="cd-google-maps-link"
                                  href={googleMapsUrl(beaconPos)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open in Google Maps
                                </a>
                              </strong>
                            </div>
                          )}
                        </>
                      )}
                      {!liveLocation && beaconMeta && (
                        <>
                          {beaconMeta.uuid && (
                            <div className="cd-info-row">
                              <span>Beacon UUID</span>
                              <strong className="cd-mono cd-mono-sm">
                                {beaconMeta.uuid}
                              </strong>
                            </div>
                          )}
                          {beaconMeta.hubUUID && (
                            <div className="cd-info-row">
                              <span>Hub UUID</span>
                              <strong className="cd-mono cd-mono-sm">
                                {beaconMeta.hubUUID}
                              </strong>
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
                              <strong>
                                {formatTimestampFull(beaconMeta.lastSeen)}
                                <span className="cd-ping-age">
                                  {" · "}
                                  {timeAgo(beaconMeta.lastSeen)}
                                </span>
                              </strong>
                            </div>
                          )}
                          {beaconMeta.position && (
                            <div className="cd-info-row">
                              <span>Coordinates</span>
                              <strong className="cd-mono cd-mono-sm">
                                {beaconMeta.position[0].toFixed(5)},{" "}
                                {beaconMeta.position[1].toFixed(5)}
                              </strong>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </section>
                )}

                <section className="cd-section">
                  <h4 className="cd-section-title">Student</h4>
                  <button
                    type="button"
                    className="cd-student-card cd-student-card-button"
                    onClick={openSelectedStudent}
                    disabled={!canOpenStudent}
                    aria-label={`Open ${formatName(selectedEntry)} student profile`}
                  >
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
                        <p className="cd-student-sub">
                          ID: {formatStudentId(selectedEntry)}
                        </p>
                      )}
                      {(selectedEntry.student.user.email ||
                        selectedEntry.student.user.username) && (
                        <p className="cd-student-sub">
                          {selectedEntry.student.user.email ||
                            selectedEntry.student.user.username}
                        </p>
                      )}
                    </div>
                    {canOpenStudent && (
                      <span className="cd-student-card-open">Open student</span>
                    )}
                  </button>
                </section>
              </div>

              <div className="cd-detail-col">
                <section className="cd-section">
                  <h4 className="cd-section-title">
                    Enforcement Violations
                    {selectedViolations.length > 0 && (
                      <span className="cd-section-count">
                        {selectedViolations.length}
                      </span>
                    )}
                  </h4>
                  {selectedViolations.length === 0 ? (
                    <p className="cd-empty-inline">
                      No violations reported for this device.
                    </p>
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
                                  <span
                                    className={`cd-violation-fee${feePaid ? " cd-violation-fee-paid" : ""}`}
                                  >
                                    {fee}
                                    {feePaid ? " paid" : ""}
                                  </span>
                                )}
                                {hasCoords && (
                                  <span
                                    className="cd-violation-has-location"
                                    title="Location on map"
                                  >
                                    📍
                                  </span>
                                )}
                              </div>
                            </div>
                            {v.description && (
                              <p className="cd-violation-desc">
                                {v.description}
                              </p>
                            )}
                            {v.admin_notes && (
                              <p className="cd-violation-notes">
                                <em>Note:</em> {v.admin_notes}
                              </p>
                            )}
                            <p className="cd-violation-date">
                              {formatTimestamp(v.created_at)}
                            </p>
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

  // ── Table view (default) ───────────────────────────────────────────────────
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
                    ? "Loading..."
                    : ""}
              </span>
            </div>
          </div>
          <div className="reg-table-tools">
            <div className="segmented-control">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={statusFilter === tab.key ? "segment-active" : ""}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              className="reg-table-search"
              placeholder="Search by student, device, serial..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loadState === "error" ? (
          <p className="cd-empty">{errorMsg}</p>
        ) : loadState === "loading" ? (
          <p className="cd-empty">Loading devices...</p>
        ) : (
          <div className="management-table-card reg-table-card">
            <div className="reg-table-summary">
              <strong>{filteredEntries.length.toLocaleString()} devices</strong>
              <span>
                {statusFilter !== "all"
                  ? `${STATUS_TABS.find((tab) => tab.key === statusFilter)?.label ?? "Filtered"} filter`
                  : "All statuses"}
              </span>
            </div>
            {filteredEntries.length === 0 ? (
              <p className="cd-empty">No devices match this filter.</p>
            ) : (
              <div className="management-table-scroll">
                <table className="management-table reg-review-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Student</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Violations</th>
                      <th>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const rowUUID = entry.device.registered_device_uuid;
                      const name = formatName(entry);
                      const deviceLabel = formatDevice(entry);
                      const statusLabel = getDeviceStatusLabel(entry);
                      const studentPhotoUrl =
                        studentPhotoUrls[entry.device.user_uuid];
                      const devicePhotoUrl = devicePhotoUrls[rowUUID];
                      const deviceViolations =
                        violationsByDevice.get(rowUUID) ?? [];
                      const activeV = deviceViolations.filter(
                        (v) => v.active,
                      ).length;
                      const totalV = deviceViolations.length;
                      const lastViolation = deviceViolations
                        .slice()
                        .sort((a, b) => b.created_at - a.created_at)[0];
                      const sid = formatStudentId(entry);
                      const beaconInfo = getRegisteredDeviceBeaconInfo(
                        entry.device,
                      );
                      const hasBeacon =
                        beaconInfo !== null ||
                        getBeaconMeta(entry.device) !== null;
                      const liveBeacon = beaconLocationByDevice.get(rowUUID);

                      return (
                        <tr
                          key={rowUUID}
                          className="reg-review-row"
                          tabIndex={0}
                          onClick={() => openDetail(rowUUID)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDetail(rowUUID);
                            }
                          }}
                        >
                          <td>
                            <div className="reg-table-identity">
                              {devicePhotoUrl ? (
                                <img
                                  src={devicePhotoUrl}
                                  alt={deviceLabel}
                                  className="reg-table-photo"
                                />
                              ) : (
                                <div className="reg-table-avatar">🚲</div>
                              )}
                              <div>
                                <strong>
                                  {deviceLabel}
                                  {hasBeacon && (
                                    <span
                                      className={`cd-table-beacon-dot${liveBeacon && !liveBeacon.stale ? " cd-table-beacon-live" : ""}`}
                                      title={
                                        liveBeacon
                                          ? `${liveBeacon.stale ? "Beacon stale" : "Beacon live"}${liveBeacon.observed_at != null ? ` · ${timeAgo(liveBeacon.observed_at)}` : ""}`
                                          : "Has beacon"
                                      }
                                    >
                                      📡
                                    </span>
                                  )}
                                </strong>
                                <span>{rowUUID}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="reg-table-identity">
                              {studentPhotoUrl ? (
                                <img
                                  src={studentPhotoUrl}
                                  alt={name}
                                  className="reg-table-photo"
                                />
                              ) : (
                                <div className="reg-table-avatar">
                                  {getInitials(name)}
                                </div>
                              )}
                              <div>
                                <strong>{name}</strong>
                                <span>{sid || "-"}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>
                              {capitalize(entry.device.device_type) || "-"}
                            </strong>
                            <span>{capitalize(entry.device.color) || "-"}</span>
                          </td>
                          <td>
                            <span className={getDeviceStatusClass(statusLabel)}>
                              {statusLabel}
                            </span>
                          </td>
                          <td>
                            <strong>
                              {activeV > 0 ? (
                                <span className="cd-table-active-v">
                                  {activeV} active
                                </span>
                              ) : (
                                `${totalV} total`
                              )}
                            </strong>
                            <span>
                              {lastViolation
                                ? `Last ${formatTimestamp(lastViolation.created_at)}`
                                : "None reported"}
                            </span>
                          </td>
                          <td>
                            <strong>
                              {formatTimestamp(entry.device.created_at)}
                            </strong>
                            <span>Open details</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
