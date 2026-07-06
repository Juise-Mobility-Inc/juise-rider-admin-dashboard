import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  approveSchoolRegisteredDevice,
  declineSchoolRegisteredDevice,
  fetchRegisteredDeviceFeeRules,
  fetchSchoolRegisteredDevices,
  getRegisteredDeviceBeaconInfo,
  signSchoolMedia,
  type RegisteredDevice,
  type RegisteredDeviceFeeRule,
  type RegisteredDeviceReviewEntry,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type ApprovalMode = "matched" | "manual" | "waive";

const filters = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Payment Due", value: "payment_due" },
  { label: "Accepted", value: "approved" },
  { label: "Declined", value: "declined" },
];

function formatCurrency(cents?: number | null) {
  return cents && cents > 0
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
      }).format(cents / 100)
    : "No fee";
}

function formatName(entry: RegisteredDeviceReviewEntry) {
  const user = entry.student.user;
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    user.username ||
    user.k_guid ||
    "Student"
  );
}

function formatDevice(device: RegisteredDevice) {
  return (
    device.nickname ||
    [device.make, device.model].filter(Boolean).join(" ").trim() ||
    device.device_type ||
    "Registered device"
  );
}

function getStatusLabel(device: RegisteredDevice) {
  if (device.registration_status === "declined") return "Declined";
  if (device.registration_status === "pending") return "Pending";
  if (device.payment_status === "awaiting_payment") return "Payment due";
  if (device.registration_fee_source === "waived") return "Accepted - fee waived";
  return "Accepted";
}

function getStatusClass(device: RegisteredDevice) {
  if (device.registration_status === "declined") return "reg-status reg-status-declined";
  if (device.registration_status === "pending") return "reg-status reg-status-pending";
  if (device.payment_status === "awaiting_payment") return "reg-status reg-status-payment";
  return "reg-status reg-status-approved";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function findMatchedRule(device: RegisteredDevice, rules: RegisteredDeviceFeeRule[]) {
  const deviceType = device.device_type.trim().toLowerCase();
  const powertrainType = (device.powertrain_type || "non_electric").trim();
  return [...rules]
    .filter(
      (rule) =>
        rule.active &&
        (!rule.device_type || rule.device_type.trim().toLowerCase() === deviceType) &&
        (!rule.powertrain_type || rule.powertrain_type.trim() === powertrainType),
    )
    .sort((left, right) => {
      const leftScore = (left.device_type ? 2 : 0) + (left.powertrain_type ? 1 : 0);
      const rightScore = (right.device_type ? 2 : 0) + (right.powertrain_type ? 1 : 0);
      return rightScore - leftScore;
    })[0];
}

function getApprovalActionCopy(
  mode: ApprovalMode,
  matchedRule?: RegisteredDeviceFeeRule,
) {
  switch (mode) {
    case "manual":
      return {
        title: "Approve + request manual fee",
        subtitle: "Uses the manual fee entered above.",
      };
    case "waive":
      return {
        title: "Waive fee + approve",
        subtitle: "Accepts registration with no payment due.",
      };
    case "matched":
    default:
      if (matchedRule && matchedRule.amount_cents > 0) {
        return {
          title: "Approve + request matched fee",
          subtitle: `${formatCurrency(matchedRule.amount_cents)} due before QR unlock.`,
        };
      }
      return {
        title: "Approve - no fee due",
        subtitle: "No matching fee rule was found.",
      };
  }
}

function getApprovalSuccessMessage(mode: ApprovalMode, device: RegisteredDevice) {
  if (mode === "waive") {
    return "Registration approved. The fee was waived and no payment is due.";
  }
  if (device.payment_status === "awaiting_payment") {
    return "Registration approved. The student must pay before QR access unlocks.";
  }
  return "Registration approved. No payment is due.";
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

function formatTimestamp(timestamp?: number | null) {
  if (!timestamp) return "-";
  const millis = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(millis));
}

function capitalize(value?: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "-";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, " ");
}

function getRegistrationFeeSummary(
  device: RegisteredDevice,
  matchedRule?: RegisteredDeviceFeeRule,
) {
  if (device.payment_status === "awaiting_payment") {
    return formatCurrency(device.registration_fee_amount_cents);
  }
  if (device.registration_fee_source === "waived") {
    return "Waived";
  }
  if (device.registration_fee_amount_cents && device.registration_fee_amount_cents > 0) {
    return `Paid ${formatCurrency(device.registration_fee_amount_cents)}`;
  }
  if (
    device.registration_status === "pending" &&
    matchedRule &&
    matchedRule.amount_cents > 0
  ) {
    return `Matched ${formatCurrency(matchedRule.amount_cents)}`;
  }
  return "No fee";
}

function RegistrationDetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="reg-detail-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export function VehicleRegistrationsScreen({ activeSchoolId, managedAppId }: Props) {
  const [entries, setEntries] = useState<RegisteredDeviceReviewEntry[]>([]);
  const [rules, setRules] = useState<RegisteredDeviceFeeRule[]>([]);
  const [devicePhotoUrls, setDevicePhotoUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUUID, setSelectedUUID] = useState("");
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (left, right) => right.device.updated_at - left.device.updated_at,
      ),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedEntries;
    return sortedEntries.filter((entry) => {
      const device = entry.device;
      const fields = [
        formatName(entry),
        formatDevice(device),
        device.registered_device_uuid,
        device.device_type,
        device.powertrain_type,
        device.make,
        device.model,
        device.nickname,
        device.serial_number,
        device.color,
        entry.student.user.email,
        entry.student.user.username,
        entry.student.membership?.student_id,
        entry.student.membership?.membership_uuid,
      ];
      return fields.some((field) => (field ?? "").toLowerCase().includes(query));
    });
  }, [search, sortedEntries]);

  const selectedEntry = useMemo(
    () =>
      selectedUUID
        ? (sortedEntries.find(
            (entry) => entry.device.registered_device_uuid === selectedUUID,
          ) ?? null)
        : null,
    [selectedUUID, sortedEntries],
  );

  const refresh = useCallback(async () => {
    if (!activeSchoolId || !managedAppId) {
      setEntries([]);
      setRules([]);
      setDevicePhotoUrls({});
      return;
    }
    setBusy(true);
    setError("");
    try {
      const [nextEntries, nextRules] = await Promise.all([
        fetchSchoolRegisteredDevices(managedAppId, activeSchoolId, filter),
        fetchRegisteredDeviceFeeRules(managedAppId, activeSchoolId),
      ]);
      setEntries(nextEntries);
      setRules(nextRules);

      // Collect one object_key per device (first active media asset)
      const deviceKeyMap: Record<string, string> = {};
      for (const entry of nextEntries) {
        const asset = entry.device_media.find((m) => m.active && m.object_key?.trim());
        if (asset) {
          deviceKeyMap[entry.device.registered_device_uuid] = asset.object_key;
        }
      }
      const uniqueKeys = Object.values(deviceKeyMap);
      if (uniqueKeys.length > 0) {
        const signed: Record<string, string> = await signSchoolMedia(activeSchoolId, uniqueKeys).catch(() => ({}));
        const photoUrls: Record<string, string> = {};
        for (const [deviceUUID, objectKey] of Object.entries(deviceKeyMap)) {
          if (signed[objectKey]) {
            photoUrls[deviceUUID] = signed[objectKey];
          }
        }
        setDevicePhotoUrls(photoUrls);
      } else {
        setDevicePhotoUrls({});
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }, [activeSchoolId, filter, managedAppId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedUUID) return;
    if (
      !sortedEntries.some(
        (entry) => entry.device.registered_device_uuid === selectedUUID,
      )
    ) {
      setSelectedUUID("");
    }
  }, [selectedUUID, sortedEntries]);

  async function approve(entry: RegisteredDeviceReviewEntry, mode: ApprovalMode) {
    const deviceUUID = entry.device.registered_device_uuid;
    let amount_cents: number | null | undefined;
    if (mode === "manual") {
      const amount = Number((manualAmounts[deviceUUID] ?? "").replace(/[$,\s]/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Manual fee amount is required.");
        return;
      }
      amount_cents = Math.round(amount * 100);
    }
    setBusyId(`${deviceUUID}:${mode}`);
    setError("");
    setSuccess("");
    try {
      const updatedDevice = await approveSchoolRegisteredDevice(managedAppId, activeSchoolId, deviceUUID, {
        fee_mode: mode,
        amount_cents,
        note: notes[deviceUUID] ?? "",
      });
      setSuccess(getApprovalSuccessMessage(mode, updatedDevice));
      await refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusyId("");
    }
  }

  async function decline(entry: RegisteredDeviceReviewEntry) {
    const deviceUUID = entry.device.registered_device_uuid;
    const note = (notes[deviceUUID] ?? "").trim();
    if (!note) {
      setError("A decline message is required.");
      return;
    }
    setBusyId(`${deviceUUID}:decline`);
    setError("");
    setSuccess("");
    try {
      await declineSchoolRegisteredDevice(managedAppId, activeSchoolId, deviceUUID, note);
      setSuccess("Vehicle registration declined.");
      await refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusyId("");
    }
  }

  function renderReviewControls(
    entry: RegisteredDeviceReviewEntry,
    matchedRule?: RegisteredDeviceFeeRule,
  ) {
    const deviceUUID = entry.device.registered_device_uuid;
    const isBusy = busyId.startsWith(deviceUUID);

    return (
      <div className="reg-card-actions reg-detail-actions">
        <div className="reg-card-fields">
          <label className="field">
            <span>Review note</span>
            <input
              value={notes[deviceUUID] ?? ""}
              onChange={(event) =>
                setNotes((current) => ({
                  ...current,
                  [deviceUUID]: event.target.value,
                }))
              }
              placeholder="Optional approval note, required to decline"
            />
          </label>
          <label className="field">
            <span>Manual fee</span>
            <input
              value={manualAmounts[deviceUUID] ?? ""}
              onChange={(event) =>
                setManualAmounts((current) => ({
                  ...current,
                  [deviceUUID]: event.target.value,
                }))
              }
              placeholder="$25.00"
            />
          </label>
        </div>
        <div className="inline-actions">
          {(["matched", "manual", "waive"] as const).map((mode) => {
            const copy = getApprovalActionCopy(mode, matchedRule);
            return (
              <button
                key={mode}
                className={
                  mode === "matched"
                    ? "primary-button reg-action-button"
                    : "secondary-button reg-action-button"
                }
                type="button"
                disabled={isBusy}
                onClick={() => void approve(entry, mode)}
              >
                <span className="reg-action-title">
                  {busyId === `${deviceUUID}:${mode}` ? "Working..." : copy.title}
                </span>
                <span className="reg-action-subtitle">{copy.subtitle}</span>
              </button>
            );
          })}
          <button
            className="danger-button reg-action-button"
            type="button"
            disabled={isBusy}
            onClick={() => void decline(entry)}
          >
            <span className="reg-action-title">
              {busyId === `${deviceUUID}:decline` ? "Working..." : "Decline registration"}
            </span>
            <span className="reg-action-subtitle">
              Requires a student-facing review note.
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (selectedEntry) {
    const device = selectedEntry.device;
    const deviceUUID = device.registered_device_uuid;
    const matchedRule = findMatchedRule(device, rules);
    const studentName = formatName(selectedEntry);
    const deviceLabel = formatDevice(device);
    const photoUrl = devicePhotoUrls[deviceUUID];
    const beaconInfo = getRegisteredDeviceBeaconInfo(device);
    const statusLabel = getStatusLabel(device);
    const statusClass = getStatusClass(device);
    const membership = selectedEntry.student.membership;

    return (
      <section className="dashboard-panel">
        <div className="reg-detail-toolbar">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setSelectedUUID("")}
          >
            Back to registrations
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}

        <div className="reg-detail-panel">
          <header className="reg-detail-header">
            {photoUrl ? (
              <img className="reg-detail-photo" src={photoUrl} alt={deviceLabel} />
            ) : (
              <div className="reg-detail-avatar">{getInitials(studentName) || "?"}</div>
            )}
            <div className="reg-detail-heading">
              <p className="eyebrow">Vehicle registration</p>
              <h2>{deviceLabel}</h2>
              <div className="reg-detail-meta">
                <span className={statusClass}>{statusLabel}</span>
                <span>{studentName}</span>
                <span>{formatTimestamp(device.updated_at)}</span>
              </div>
            </div>
          </header>

          <div className="reg-detail-grid">
            <section className="reg-detail-section">
              <h3>Student</h3>
              <RegistrationDetailRow label="Name">{studentName}</RegistrationDetailRow>
              <RegistrationDetailRow label="Student ID">
                {membership?.student_id || "-"}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Email">
                {selectedEntry.student.user.email || "-"}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Membership">
                {membership?.membership_uuid || "-"}
              </RegistrationDetailRow>
            </section>

            <section className="reg-detail-section">
              <h3>Device</h3>
              <RegistrationDetailRow label="Type">
                {capitalize(device.device_type)}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Powertrain">
                {capitalize(device.powertrain_type)}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Make / model">
                {[device.make, device.model].filter(Boolean).join(" ") || "-"}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Serial number">
                {device.serial_number || "-"}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Color">
                {capitalize(device.color)}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Device UUID">{deviceUUID}</RegistrationDetailRow>
            </section>

            <section className="reg-detail-section">
              <h3>Review</h3>
              <RegistrationDetailRow label="Status">{statusLabel}</RegistrationDetailRow>
              <RegistrationDetailRow label="Fee">
                {getRegistrationFeeSummary(device, matchedRule)}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Payment">
                {capitalize(device.payment_status)}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Reviewed">
                {formatTimestamp(device.reviewed_at)}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="QR access">
                {device.qr_unlocked_at ? formatTimestamp(device.qr_unlocked_at) : "Locked"}
              </RegistrationDetailRow>
              <RegistrationDetailRow label="Beacon">
                {beaconInfo?.beacon_mac || "-"}
              </RegistrationDetailRow>
              {device.review_note ? (
                <p className="reg-detail-note">{device.review_note}</p>
              ) : null}
            </section>
          </div>

          {renderReviewControls(selectedEntry, matchedRule)}
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Vehicle registration</p>
          <h2>Review Queue</h2>
          <p className="muted-text">
            Review every submitted device in a table, then open one registration
            to accept it, waive fees, request payment, or decline it.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      <div className="reg-table-tools">
        <div className="segmented-control">
          {filters.map((option) => (
            <button
              key={option.value || "all"}
              className={filter === option.value ? "segment-active" : ""}
              type="button"
              onClick={() => {
                setFilter(option.value);
                setSelectedUUID("");
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          className="reg-table-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search student, device, serial, UUID..."
        />
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}
      {busy ? <p className="muted-text">Loading registrations...</p> : null}

      <div className="management-table-card reg-table-card">
        <div className="reg-table-summary">
          <strong>{visibleEntries.length.toLocaleString()} registrations</strong>
          <span>
            {filter
              ? `${filters.find((option) => option.value === filter)?.label ?? "Filtered"} filter`
              : "All statuses"}
          </span>
        </div>
        <div className="management-table-scroll">
          <table className="management-table reg-review-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Student</th>
                <th>Status</th>
                <th>Fee</th>
                <th>Beacon</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => {
                const device = entry.device;
                const deviceUUID = device.registered_device_uuid;
                const matchedRule = findMatchedRule(device, rules);
                const studentName = formatName(entry);
                const deviceLabel = formatDevice(device);
                const photoUrl = devicePhotoUrls[deviceUUID];
                const beaconInfo = getRegisteredDeviceBeaconInfo(device);
                const statusLabel = getStatusLabel(device);
                const statusClass = getStatusClass(device);
                const studentId = entry.student.membership?.student_id ?? "";

                return (
                  <tr
                    key={deviceUUID}
                    className="reg-review-row"
                    tabIndex={0}
                    onClick={() => setSelectedUUID(deviceUUID)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedUUID(deviceUUID);
                      }
                    }}
                  >
                    <td>
                      <div className="reg-table-identity">
                        {photoUrl ? (
                          <img
                            className="reg-table-photo"
                            src={photoUrl}
                            alt={deviceLabel}
                          />
                        ) : (
                          <div className="reg-table-avatar">
                            {getInitials(studentName) || "?"}
                          </div>
                        )}
                        <div>
                          <strong>{deviceLabel}</strong>
                          <span>{deviceUUID}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{studentName}</strong>
                      <span>{studentId || entry.student.user.email || "-"}</span>
                    </td>
                    <td>
                      <span className={statusClass}>{statusLabel}</span>
                    </td>
                    <td>
                      <strong>{getRegistrationFeeSummary(device, matchedRule)}</strong>
                      <span>{capitalize(device.registration_fee_source)}</span>
                    </td>
                    <td>
                      <strong>{beaconInfo ? "Registered" : "None"}</strong>
                      <span>{beaconInfo?.beacon_mac ?? "-"}</span>
                    </td>
                    <td>
                      <strong>{formatTimestamp(device.updated_at)}</strong>
                      <span>Open details</span>
                    </td>
                  </tr>
                );
              })}
              {visibleEntries.length === 0 && !busy ? (
                <tr>
                  <td colSpan={6}>
                    <span>No vehicle registrations match this filter.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
