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
import { useDetailParamSync } from "../../lib/useDetailParamSync";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

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

type FeeChoice = "none" | "rule" | "custom";

// Stripe can't charge a card less than $0.50, so a fee is $0 or at least that.
const MINIMUM_FEE_CENTS = 50;

function parseDollarsToCents(value: string) {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

function isFeePaid(device: RegisteredDevice) {
  return Boolean(device.registration_payment_collected_at) || device.payment_status === "paid";
}

// The fee choice that describes the vehicle as it stands, used to preselect
// the decision panel and to tell whether the admin changed anything.
function currentFeeChoice(
  device: RegisteredDevice,
  matchedRule?: RegisteredDeviceFeeRule,
): { choice: FeeChoice; customCents: number } {
  const due =
    device.payment_status === "awaiting_payment" || device.payment_status === "failed"
      ? device.registration_fee_amount_cents ?? 0
      : 0;
  if (device.registration_status === "pending" || device.registration_status === "declined") {
    return matchedRule && matchedRule.amount_cents > 0
      ? { choice: "rule", customCents: 0 }
      : { choice: "none", customCents: 0 };
  }
  if (due > 0) {
    return device.registration_fee_source === "fee_rule" &&
      matchedRule?.amount_cents === due
      ? { choice: "rule", customCents: 0 }
      : { choice: "custom", customCents: due };
  }
  return { choice: "none", customCents: 0 };
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

function RegStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="reg-stat-card">
      <strong>{children}</strong>
      <span>{label}</span>
    </div>
  );
}

function RegInlineField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="reg-inline-field">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard access may be unavailable; ignore silently.
  }
}

export function VehicleRegistrationsScreen({ activeSchoolId, managedAppId }: Props) {
  const [entries, setEntries] = useState<RegisteredDeviceReviewEntry[]>([]);
  const [rules, setRules] = useState<RegisteredDeviceFeeRule[]>([]);
  const [devicePhotoUrls, setDevicePhotoUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [selectedUUID, setSelectedUUID] = useState("");
  // Gates the URL<->selection sync until the first fetch lands, so the
  // "clear a selection that isn't in the (still-empty) list" effect below
  // can't wipe a valid ?registration= deep link before its data arrives.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // The status filter the current entries were fetched with, and a
  // ?registration= deep link not yet found in them. A link (e.g. from the
  // Audit Log) can name a vehicle of any status, so one that isn't in the
  // filtered list switches the list to All before giving up on it.
  const [loadedFilter, setLoadedFilter] = useState<string | null>(null);
  const [linkedUUID, setLinkedUUID] = useState("");

  useDetailParamSync(
    "registration",
    selectedUUID,
    (value) => {
      setSelectedUUID(value);
      setLinkedUUID(value);
    },
    hasLoadedOnce,
  );
  const [feeChoices, setFeeChoices] = useState<Record<string, FeeChoice>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
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
      setLoadedFilter(filter);
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
      setHasLoadedOnce(true);
    }
  }, [activeSchoolId, filter, managedAppId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedUUID || busy) return;
    if (
      sortedEntries.some(
        (entry) => entry.device.registered_device_uuid === selectedUUID,
      )
    ) {
      if (linkedUUID) setLinkedUUID("");
      return;
    }
    if (linkedUUID === selectedUUID && loadedFilter !== "") {
      setFilter("");
      return;
    }
    setSelectedUUID("");
    setLinkedUUID("");
  }, [busy, linkedUUID, loadedFilter, selectedUUID, sortedEntries]);

  async function applyDecision(
    entry: RegisteredDeviceReviewEntry,
    choice: FeeChoice,
    amountCents: number,
    successMessage: string,
  ) {
    const deviceUUID = entry.device.registered_device_uuid;
    setBusyId(`${deviceUUID}:approve`);
    setError("");
    setSuccess("");
    try {
      await approveSchoolRegisteredDevice(managedAppId, activeSchoolId, deviceUUID, {
        fee_mode: choice === "none" ? "waive" : choice === "rule" ? "matched" : "manual",
        amount_cents: choice === "custom" ? amountCents : undefined,
        note: notes[deviceUUID] ?? "",
      });
      setSuccess(successMessage);
      setFeeChoices((current) => {
        const next = { ...current };
        delete next[deviceUUID];
        return next;
      });
      setCustomAmounts((current) => {
        const next = { ...current };
        delete next[deviceUUID];
        return next;
      });
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
    const device = entry.device;
    const deviceUUID = device.registered_device_uuid;
    const isBusy = busyId.startsWith(deviceUUID);
    const isPending = device.registration_status === "pending";
    const isDeclined = device.registration_status === "declined";
    // Only an approved registration can hold a paid fee; a pending or declined
    // one always offers approval, so a decline can be reversed here.
    const paid = !isPending && !isDeclined && isFeePaid(device);
    const ruleCents = matchedRule && matchedRule.amount_cents > 0 ? matchedRule.amount_cents : 0;

    const current = currentFeeChoice(device, matchedRule);
    const choice = feeChoices[deviceUUID] ?? current.choice;
    const customText =
      customAmounts[deviceUUID] ??
      (current.customCents > 0 ? (current.customCents / 100).toFixed(2) : "");
    const customCents = parseDollarsToCents(customText);
    const amountCents = choice === "rule" ? ruleCents : choice === "custom" ? customCents : 0;

    const feeError =
      choice === "custom" && (!Number.isFinite(customCents) || customCents < MINIMUM_FEE_CENTS)
        ? "Enter an amount of at least $0.50."
        : "";

    const unchanged =
      !isPending &&
      !isDeclined &&
      choice === current.choice &&
      (choice !== "custom" || customCents === current.customCents);

    let actionLabel: string;
    let successMessage: string;
    if (isPending || isDeclined) {
      actionLabel =
        amountCents > 0 ? `Approve with ${formatCurrency(amountCents)} fee` : "Approve with no fee";
      successMessage =
        amountCents > 0
          ? "Approved. The student pays the fee in the app before their tag is valid."
          : "Approved with no fee. The vehicle is ready to use.";
    } else if (amountCents > 0) {
      actionLabel =
        current.choice === "none"
          ? `Charge ${formatCurrency(amountCents)} fee`
          : `Change fee to ${formatCurrency(amountCents)}`;
      successMessage = "Fee updated. The student pays it in the app before their tag is valid.";
    } else {
      actionLabel = "Waive fee";
      successMessage = "Fee waived. Nothing is due.";
    }

    const setChoice = (next: FeeChoice) =>
      setFeeChoices((existing) => ({ ...existing, [deviceUUID]: next }));

    return (
      <div className="reg-card-actions reg-detail-actions reg-decision">
        <h3>{isPending ? "Review registration" : isDeclined ? "Declined" : "Registration fee"}</h3>

        {paid ? (
          <p className="muted-text">
            Paid {formatCurrency(device.registration_fee_amount_cents)}. Nothing more is due.
          </p>
        ) : (
          <>
            <div
              className="segmented-control reg-fee-choice"
              role="radiogroup"
              aria-label="Registration fee"
            >
              <button
                type="button"
                role="radio"
                aria-checked={choice === "none"}
                className={choice === "none" ? "segment-active" : ""}
                onClick={() => setChoice("none")}
              >
                No fee
              </button>
              {ruleCents > 0 ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === "rule"}
                  className={choice === "rule" ? "segment-active" : ""}
                  title={matchedRule?.label || "Matching registration fee rule"}
                  onClick={() => setChoice("rule")}
                >
                  Fee rule · {formatCurrency(ruleCents)}
                </button>
              ) : null}
              <button
                type="button"
                role="radio"
                aria-checked={choice === "custom"}
                className={choice === "custom" ? "segment-active" : ""}
                onClick={() => setChoice("custom")}
              >
                Custom amount
              </button>
            </div>
            {choice === "custom" ? (
              <label className="field reg-fee-amount">
                <span>Amount (USD)</span>
                <input
                  inputMode="decimal"
                  value={customText}
                  onChange={(event) =>
                    setCustomAmounts((existing) => ({
                      ...existing,
                      [deviceUUID]: event.target.value,
                    }))
                  }
                  placeholder="25.00"
                />
              </label>
            ) : null}
            {feeError && customText ? <p className="error-text">{feeError}</p> : null}
          </>
        )}

        <label className="field">
          <span>
            Note to student{" "}
            {isPending || isDeclined ? "(optional; required to decline)" : "(required to decline)"}
          </span>
          <input
            value={notes[deviceUUID] ?? ""}
            onChange={(event) =>
              setNotes((existing) => ({
                ...existing,
                [deviceUUID]: event.target.value,
              }))
            }
            placeholder={
              isPending
                ? "e.g. Welcome! Your bike is registered."
                : "e.g. The serial number doesn't match the photo."
            }
          />
        </label>

        <div className="reg-decision-buttons">
          {!paid ? (
            <button
              className="primary-button reg-action-button"
              type="button"
              disabled={isBusy || unchanged || Boolean(feeError)}
              onClick={() => void applyDecision(entry, choice, amountCents, successMessage)}
            >
              {busyId === `${deviceUUID}:approve` ? "Saving..." : actionLabel}
            </button>
          ) : null}
          {!isDeclined ? (
            <button
              className="text-button reg-decline-button"
              type="button"
              disabled={isBusy}
              onClick={() => {
                if (
                  paid &&
                  !window.confirm(
                    `This vehicle's ${formatCurrency(device.registration_fee_amount_cents)} fee was paid. Declining clears the payment record and doesn't refund it. If you approve it again with a fee, the student is asked to pay again. Decline anyway?`,
                  )
                ) {
                  return;
                }
                void decline(entry);
              }}
            >
              {busyId === `${deviceUUID}:decline` ? "Declining..." : "Decline registration"}
            </button>
          ) : null}
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
              <img loading="lazy" decoding="async" className="reg-detail-photo" src={photoUrl} alt={deviceLabel} />
            ) : (
              <div className="reg-detail-avatar">{getInitials(studentName) || "?"}</div>
            )}
            <div className="reg-detail-heading">
              <h2>{deviceLabel}</h2>
              <div className="reg-detail-meta">
                <span className={statusClass}>{statusLabel}</span>
                <span>{studentName}</span>
                <span>{formatTimestamp(device.updated_at)}</span>
              </div>
            </div>
          </header>

          <div className="reg-stat-strip">
            <RegStat label="Fee">{getRegistrationFeeSummary(device, matchedRule)}</RegStat>
            <RegStat label="Payment">{capitalize(device.payment_status)}</RegStat>
            <RegStat label="QR access">
              {device.qr_unlocked_at ? "Unlocked" : "Locked"}
            </RegStat>
            <RegStat label="Reviewed">{formatTimestamp(device.reviewed_at)}</RegStat>
          </div>

          <div className="reg-detail-columns">
            <section className="reg-detail-card">
              <h3>Student</h3>
              <RegInlineField label="Name">{studentName}</RegInlineField>
              <RegInlineField label="Student ID">
                {membership?.student_id || "-"}
              </RegInlineField>
              <RegInlineField label="Email">
                {selectedEntry.student.user.email || "-"}
              </RegInlineField>
            </section>

            <section className="reg-detail-card">
              <h3>Device</h3>
              <RegInlineField label="Type">
                {[capitalize(device.device_type), capitalize(device.powertrain_type)]
                  .filter((part) => part && part !== "-")
                  .join(" · ") || "-"}
              </RegInlineField>
              <RegInlineField label="Make / model">
                {[device.make, device.model].filter(Boolean).join(" ") || "-"}
              </RegInlineField>
              <RegInlineField label="Serial / color">
                {[device.serial_number, capitalize(device.color)]
                  .filter((part) => part && part !== "-")
                  .join(" · ") || "-"}
              </RegInlineField>
              {beaconInfo?.beacon_mac ? (
                <RegInlineField label="Beacon">{beaconInfo.beacon_mac}</RegInlineField>
              ) : null}
            </section>
          </div>

          {device.review_note ? (
            <p className="reg-detail-note">{device.review_note}</p>
          ) : null}

          <div className="reg-detail-ids">
            <button
              type="button"
              className="reg-id-chip"
              title={`Device UUID: ${deviceUUID}`}
              onClick={() => void copyToClipboard(deviceUUID)}
            >
              Device ID · Copy
            </button>
            {membership?.membership_uuid ? (
              <button
                type="button"
                className="reg-id-chip"
                title={`Membership UUID: ${membership.membership_uuid}`}
                onClick={() => void copyToClipboard(membership.membership_uuid ?? "")}
              >
                Membership ID · Copy
              </button>
            ) : null}
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
            New vehicles are approved automatically. Open one to add, change
            or waive its registration fee, or to decline it.
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
                            loading="lazy"
                            decoding="async"
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
