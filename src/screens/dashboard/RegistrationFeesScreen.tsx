import { useEffect, useMemo, useState } from "react";

import {
  createRegisteredDeviceFeeRule,
  deleteRegisteredDeviceFeeRule,
  fetchRegisteredDeviceFeeRules,
  updateRegisteredDeviceFeeRule,
  type RegisteredDeviceFeeRule,
  type RegisteredDeviceFeeRuleInput,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type Draft = {
  fee_rule_uuid: string;
  device_type: string;
  powertrain_type: "" | "electric" | "non_electric";
  amount: string;
  label: string;
  active: boolean;
};

const emptyDraft: Draft = {
  fee_rule_uuid: "",
  device_type: "",
  powertrain_type: "",
  amount: "",
  label: "",
  active: true,
};

const deviceTypes = ["", "bike", "scooter", "ebike", "escooter", "other"];
const powertrainTypes = ["", "electric", "non_electric"] as const;

const deviceTypeLabels: Record<string, string> = {
  "": "Any device",
  bike: "Bike",
  scooter: "Scooter",
  ebike: "E-Bike",
  escooter: "E-Scooter",
  other: "Other",
};

const powertrainLabels: Record<string, string> = {
  "": "Any",
  electric: "Electric",
  non_electric: "Non-electric",
};

function isAlwaysElectric(deviceType: string) {
  return deviceType === "ebike" || deviceType === "escooter";
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatValue(value?: string | null) {
  return value?.trim() || "Any";
}

function amountToCents(value: string) {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function inputFromDraft(draft: Draft): RegisteredDeviceFeeRuleInput | null {
  const amount_cents = amountToCents(draft.amount);
  if (amount_cents == null) {
    return null;
  }
  return {
    device_type: draft.device_type.trim() || null,
    powertrain_type: draft.powertrain_type || null,
    amount_cents,
    label: draft.label.trim(),
    active: draft.active,
  };
}

function draftFromRule(rule: RegisteredDeviceFeeRule): Draft {
  return {
    fee_rule_uuid: rule.fee_rule_uuid,
    device_type: rule.device_type ?? "",
    powertrain_type:
      rule.powertrain_type === "electric" || rule.powertrain_type === "non_electric"
        ? rule.powertrain_type
        : "",
    amount: (rule.amount_cents / 100).toFixed(2),
    label: rule.label ?? "",
    active: rule.active,
  };
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "ebike" || type === "bike") return <span>🚲</span>;
  if (type === "escooter" || type === "scooter") return <span>🛴</span>;
  return <span>🚗</span>;
}

export function RegistrationFeesScreen({ activeSchoolId, managedAppId }: Props) {
  const [rules, setRules] = useState<RegisteredDeviceFeeRule[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const alwaysElectric = isAlwaysElectric(draft.device_type);

  const sortedRules = useMemo(
    () =>
      [...rules].sort((left, right) => {
        if (left.active !== right.active) {
          return left.active ? -1 : 1;
        }
        return right.updated_at - left.updated_at;
      }),
    [rules],
  );

  const activeCount = useMemo(() => rules.filter((r) => r.active).length, [rules]);

  async function refreshRules() {
    if (!activeSchoolId || !managedAppId) {
      setRules([]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setRules(await fetchRegisteredDeviceFeeRules(managedAppId, activeSchoolId));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshRules();
  }, [activeSchoolId, managedAppId]);

  function handleDeviceTypeChange(nextDeviceType: string) {
    setDraft((current) => ({
      ...current,
      device_type: nextDeviceType,
      powertrain_type: isAlwaysElectric(nextDeviceType) ? "electric" : current.powertrain_type,
    }));
  }

  async function handleSave() {
    const input = inputFromDraft(draft);
    if (!input) {
      setError("Amount is required.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const saved = draft.fee_rule_uuid
        ? await updateRegisteredDeviceFeeRule(
            managedAppId,
            activeSchoolId,
            draft.fee_rule_uuid,
            input,
          )
        : await createRegisteredDeviceFeeRule(managedAppId, activeSchoolId, input);
      setRules((current) =>
        current.some((rule) => rule.fee_rule_uuid === saved.fee_rule_uuid)
          ? current.map((rule) =>
              rule.fee_rule_uuid === saved.fee_rule_uuid ? saved : rule,
            )
          : [saved, ...current],
      );
      setDraft(emptyDraft);
      setSuccess("Registration fee rule saved.");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rule: RegisteredDeviceFeeRule) {
    if (!window.confirm(`Delete ${rule.label || "this registration fee"}?`)) {
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await deleteRegisteredDeviceFeeRule(managedAppId, activeSchoolId, rule.fee_rule_uuid);
      setRules((current) =>
        current.map((candidate) =>
          candidate.fee_rule_uuid === rule.fee_rule_uuid
            ? { ...candidate, active: false }
            : candidate,
        ),
      );
      setSuccess("Registration fee rule deleted.");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Vehicle registration</p>
          <h2>Registration Fees</h2>
          <p className="muted-text">
            Match fees by device type. Leave a field as "Any" for a school-wide fallback.
            E-bikes and e-scooters are always electric.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshRules()}>
          Refresh
        </button>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <h3>{draft.fee_rule_uuid ? "Edit fee rule" : "New fee rule"}</h3>

          <label className="field">
            <span>Device type</span>
            <select
              value={draft.device_type}
              onChange={(event) => handleDeviceTypeChange(event.target.value)}
            >
              {deviceTypes.map((type) => (
                <option key={type || "any"} value={type}>
                  {deviceTypeLabels[type] ?? type}
                </option>
              ))}
            </select>
          </label>

          {alwaysElectric ? (
            <div className="reg-powertrain-auto">
              <span className="reg-powertrain-auto-icon">⚡</span>
              <span>Powertrain — <strong>Electric</strong> (auto-assigned for {deviceTypeLabels[draft.device_type]})</span>
            </div>
          ) : (
            <label className="field">
              <span>Powertrain</span>
              <select
                value={draft.powertrain_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    powertrain_type: event.target.value as Draft["powertrain_type"],
                  }))
                }
              >
                {powertrainTypes.map((type) => (
                  <option key={type || "any"} value={type}>
                    {powertrainLabels[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>Amount</span>
            <input
              value={draft.amount}
              onChange={(event) =>
                setDraft((current) => ({ ...current, amount: event.target.value }))
              }
              placeholder="$25.00"
            />
          </label>
          <label className="field">
            <span>Label</span>
            <input
              value={draft.label}
              onChange={(event) =>
                setDraft((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="Annual bike registration"
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                setDraft((current) => ({ ...current, active: event.target.checked }))
              }
            />
            Active
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}
          <div className="modal-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? "Saving…" : "Save rule"}
            </button>
            {draft.fee_rule_uuid ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDraft(emptyDraft)}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>

        <div className="settings-card">
          <div className="settings-card-header-row">
            <h3>Fee rules</h3>
            {activeCount > 0 ? (
              <span className="fee-rule-active-badge">{activeCount} active</span>
            ) : null}
          </div>
          <div className="fee-rule-list">
            {sortedRules.map((rule) => {
              const deviceLabel = rule.device_type
                ? (deviceTypeLabels[rule.device_type] ?? rule.device_type)
                : "Any device";
              const ruleIsAlwaysElectric = isAlwaysElectric(rule.device_type ?? "");
              const powertrainLabel = ruleIsAlwaysElectric
                ? "Electric"
                : rule.powertrain_type
                  ? (powertrainLabels[rule.powertrain_type] ?? formatValue(rule.powertrain_type))
                  : "Any powertrain";
              return (
                <article
                  className={`fee-rule-card${rule.active ? "" : " fee-rule-card-inactive"}`}
                  key={rule.fee_rule_uuid}
                >
                  <div className="fee-rule-card-top">
                    <div className="fee-rule-card-info">
                      <div className="fee-rule-card-title-row">
                        <DeviceIcon type={rule.device_type ?? ""} />
                        <strong>{rule.label || "Registration fee"}</strong>
                      </div>
                      <div className="fee-rule-chips">
                        <span className="reg-chip">{deviceLabel}</span>
                        <span className={`reg-chip${ruleIsAlwaysElectric ? " reg-chip-electric" : ""}`}>
                          {ruleIsAlwaysElectric ? "⚡ " : ""}{powertrainLabel}
                        </span>
                        {!rule.active ? (
                          <span className="reg-chip reg-chip-muted">Inactive</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="fee-rule-amount">{formatCurrency(rule.amount_cents)}</span>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setDraft(draftFromRule(rule))}
                    >
                      Edit
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busy || !rule.active}
                      onClick={() => void handleDelete(rule)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
            {sortedRules.length === 0 ? (
              <p className="muted-text">No registration fee rules yet.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
