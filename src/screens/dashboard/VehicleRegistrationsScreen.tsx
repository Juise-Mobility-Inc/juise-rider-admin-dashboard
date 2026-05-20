import { useEffect, useMemo, useState } from "react";

import {
  approveSchoolRegisteredDevice,
  declineSchoolRegisteredDevice,
  fetchRegisteredDeviceFeeRules,
  fetchSchoolRegisteredDevices,
  type RegisteredDevice,
  type RegisteredDeviceFeeRule,
  type RegisteredDeviceReviewEntry,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

const filters = [
  { label: "Pending", value: "pending" },
  { label: "Payment Due", value: "payment_due" },
  { label: "Approved", value: "approved" },
  { label: "Declined", value: "declined" },
  { label: "All", value: "" },
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

function formatStatus(device: RegisteredDevice) {
  if (device.registration_status === "declined") {
    return "Declined";
  }
  if (device.registration_status === "pending") {
    return "Pending";
  }
  if (device.payment_status === "awaiting_payment") {
    return "Payment due";
  }
  if (device.qr_unlocked_at) {
    return "QR ready";
  }
  return "Approved";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function findMatchedRule(
  device: RegisteredDevice,
  rules: RegisteredDeviceFeeRule[],
) {
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
      const rightScore =
        (right.device_type ? 2 : 0) + (right.powertrain_type ? 1 : 0);
      return rightScore - leftScore;
    })[0];
}

export function VehicleRegistrationsScreen({ activeSchoolId, managedAppId }: Props) {
  const [entries, setEntries] = useState<RegisteredDeviceReviewEntry[]>([]);
  const [rules, setRules] = useState<RegisteredDeviceFeeRule[]>([]);
  const [filter, setFilter] = useState("pending");
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

  async function refresh() {
    if (!activeSchoolId || !managedAppId) {
      setEntries([]);
      setRules([]);
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
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [activeSchoolId, managedAppId, filter]);

  async function approve(entry: RegisteredDeviceReviewEntry, mode: "matched" | "manual" | "waive") {
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
      await approveSchoolRegisteredDevice(managedAppId, activeSchoolId, deviceUUID, {
        fee_mode: mode,
        amount_cents,
        note: notes[deviceUUID] ?? "",
      });
      setSuccess("Vehicle registration updated.");
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
      await declineSchoolRegisteredDevice(
        managedAppId,
        activeSchoolId,
        deviceUUID,
        note,
      );
      setSuccess("Vehicle registration declined.");
      await refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="dashboard-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Vehicle registration</p>
          <h2>Review Queue</h2>
          <p className="muted-text">
            Approve pending devices, decline with a student-facing note, or
            approve with a matched, manual, or waived registration fee.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      <div className="segmented-control">
        {filters.map((option) => (
          <button
            key={option.value || "all"}
            className={filter === option.value ? "segment-active" : ""}
            type="button"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}
      {busy ? <p className="muted-text">Loading registrations...</p> : null}

      <div className="fee-rule-list">
        {sortedEntries.map((entry) => {
          const device = entry.device;
          const deviceUUID = device.registered_device_uuid;
          const matchedRule = findMatchedRule(device, rules);
          const isBusy = busyId.startsWith(deviceUUID);
          return (
            <article className="fee-rule-card" key={deviceUUID}>
              <div>
                <strong>{formatDevice(device)}</strong>
                <p className="muted-text">
                  {formatName(entry)} · {device.device_type || "device"} ·{" "}
                  {device.powertrain_type || "non_electric"}
                </p>
                <p className="muted-text">
                  Serial {device.serial_number || "not set"} · Color{" "}
                  {device.color || "not set"} · {formatStatus(device)}
                </p>
                {device.review_note ? (
                  <p className="muted-text">Review note: {device.review_note}</p>
                ) : null}
                {device.registration_fee_amount_cents ? (
                  <p className="muted-text">
                    Fee snapshot: {formatCurrency(device.registration_fee_amount_cents)}
                  </p>
                ) : null}
              </div>
              <div className="form-stack">
                <label className="form-field">
                  Review note
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
                <label className="form-field">
                  Manual fee
                  <input
                    value={manualAmounts[deviceUUID] ?? ""}
                    onChange={(event) =>
                      setManualAmounts((current) => ({
                        ...current,
                        [deviceUUID]: event.target.value,
                      }))
                    }
                    placeholder="25.00"
                  />
                </label>
                <p className="muted-text">
                  Matched fee:{" "}
                  {matchedRule
                    ? `${matchedRule.label || "Registration fee"} (${formatCurrency(
                        matchedRule.amount_cents,
                      )})`
                    : "No active match"}
                </p>
                <div className="inline-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void approve(entry, "matched")}
                  >
                    Matched fee
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void approve(entry, "manual")}
                  >
                    Manual fee
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void approve(entry, "waive")}
                  >
                    Waive
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={isBusy}
                    onClick={() => void decline(entry)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {sortedEntries.length === 0 && !busy ? (
          <p className="muted-text">No vehicle registrations match this filter.</p>
        ) : null}
      </div>
    </section>
  );
}
