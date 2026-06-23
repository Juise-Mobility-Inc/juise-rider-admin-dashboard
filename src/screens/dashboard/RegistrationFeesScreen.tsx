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

const deviceTypeOptions = [
  { value: "", label: "Any device" },
  { value: "bike", label: "Bike", icon: "🚲" },
  { value: "scooter", label: "Scooter", icon: "🛴" },
  { value: "ebike", label: "E-Bike", icon: "⚡🚲" },
  { value: "escooter", label: "E-Scooter", icon: "⚡🛴" },
  { value: "other", label: "Other", icon: "🚗" },
];

const powertrainOptions = [
  { value: "", label: "Any" },
  { value: "electric", label: "Electric" },
  { value: "non_electric", label: "Non-electric" },
];

function isAlwaysElectric(deviceType: string) {
  return deviceType === "ebike" || deviceType === "escooter";
}

function deviceLabel(type: string | null | undefined) {
  return deviceTypeOptions.find((o) => o.value === (type ?? ""))?.label ?? type ?? "Any";
}

function deviceIcon(type: string | null | undefined) {
  return deviceTypeOptions.find((o) => o.value === (type ?? ""))?.icon ?? "🚗";
}

function powertrainLabel(type: string | null | undefined) {
  return powertrainOptions.find((o) => o.value === (type ?? ""))?.label ?? type ?? "Any";
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
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
  if (amount_cents == null) return null;
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

export function RegistrationFeesScreen({ activeSchoolId, managedAppId }: Props) {
  const [rules, setRules] = useState<RegisteredDeviceFeeRule[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const alwaysElectric = isAlwaysElectric(draft.device_type);
  const isEditing = Boolean(draft.fee_rule_uuid);

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return b.updated_at - a.updated_at;
      }),
    [rules],
  );

  const activeCount = useMemo(() => rules.filter((r) => r.active).length, [rules]);

  async function refreshRules() {
    if (!activeSchoolId || !managedAppId) {
      setRules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setRules(await fetchRegisteredDeviceFeeRules(managedAppId, activeSchoolId));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshRules();
  }, [activeSchoolId, managedAppId]);

  function handleDeviceTypeChange(next: string) {
    setDraft((d) => ({
      ...d,
      device_type: next,
      powertrain_type: isAlwaysElectric(next) ? "electric" : d.powertrain_type,
    }));
  }

  async function handleSave() {
    const input = inputFromDraft(draft);
    if (!input) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const saved = draft.fee_rule_uuid
        ? await updateRegisteredDeviceFeeRule(managedAppId, activeSchoolId, draft.fee_rule_uuid, input)
        : await createRegisteredDeviceFeeRule(managedAppId, activeSchoolId, input);
      setRules((cur) =>
        cur.some((r) => r.fee_rule_uuid === saved.fee_rule_uuid)
          ? cur.map((r) => (r.fee_rule_uuid === saved.fee_rule_uuid ? saved : r))
          : [saved, ...cur],
      );
      setDraft(emptyDraft);
      setSuccess(isEditing ? "Rule updated." : "Rule created.");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rule: RegisteredDeviceFeeRule) {
    if (!window.confirm(`Delete "${rule.label || "this fee rule"}"?`)) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await deleteRegisteredDeviceFeeRule(managedAppId, activeSchoolId, rule.fee_rule_uuid);
      setRules((cur) =>
        cur.map((r) =>
          r.fee_rule_uuid === rule.fee_rule_uuid ? { ...r, active: false } : r,
        ),
      );
      setSuccess("Rule deleted.");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-panel">
      {/* Header */}
      <div className="rf-header">
        <div>
          <p className="eyebrow">Vehicle registration</p>
          <h2 className="rf-title">Registration Fees</h2>
          <p className="rf-subtitle">
            Define fees by device type. Leave a field as "Any" to create a fallback rule for all devices.
          </p>
        </div>
        <button className="rf-refresh-btn" type="button" onClick={() => void refreshRules()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="rf-layout">
        {/* ── Form ── */}
        <div className="rf-form-card">
          <div className="rf-form-heading">
            {isEditing ? (
              <>
                <span className="rf-form-icon">✏️</span>
                <div>
                  <p className="rf-form-title">Editing rule</p>
                  <p className="rf-form-sub">{draft.label || "Untitled rule"}</p>
                </div>
              </>
            ) : (
              <>
                <span className="rf-form-icon">＋</span>
                <div>
                  <p className="rf-form-title">New fee rule</p>
                  <p className="rf-form-sub">Fill in the fields below to add a rule.</p>
                </div>
              </>
            )}
          </div>

          <div className="rf-fields">
            {/* Row: device + amount */}
            <div className="rf-row-2">
              <label className="rf-field">
                <span className="rf-label">Device type</span>
                <select
                  className="rf-select"
                  value={draft.device_type}
                  onChange={(e) => handleDeviceTypeChange(e.target.value)}
                >
                  {deviceTypeOptions.map((o) => (
                    <option key={o.value || "any"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rf-field">
                <span className="rf-label">Amount</span>
                <div className="rf-amount-wrap">
                  <span className="rf-amount-prefix">$</span>
                  <input
                    className="rf-input rf-amount-input"
                    value={draft.amount}
                    onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
              </label>
            </div>

            {/* Powertrain */}
            {alwaysElectric ? (
              <div className="rf-field">
                <span className="rf-label">Powertrain</span>
                <div className="rf-locked-pill">
                  <span className="rf-locked-pill-dot" />
                  ⚡ Electric — auto-assigned
                </div>
              </div>
            ) : (
              <label className="rf-field">
                <span className="rf-label">Powertrain</span>
                <select
                  className="rf-select"
                  value={draft.powertrain_type}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, powertrain_type: e.target.value as Draft["powertrain_type"] }))
                  }
                >
                  {powertrainOptions.map((o) => (
                    <option key={o.value || "any"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Label */}
            <label className="rf-field">
              <span className="rf-label">Label</span>
              <input
                className="rf-input"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Annual e-bike registration"
              />
            </label>

            {/* Active toggle */}
            <label className="rf-toggle-row">
              <div className={`rf-toggle${draft.active ? " rf-toggle-on" : ""}`}>
                <div className="rf-toggle-thumb" />
              </div>
              <input
                type="checkbox"
                className="rf-toggle-input"
                checked={draft.active}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              />
              <span className="rf-toggle-label">Rule is active</span>
            </label>
          </div>

          {error ? <p className="rf-msg rf-msg-error">{error}</p> : null}
          {success ? <p className="rf-msg rf-msg-success">{success}</p> : null}

          <div className="rf-form-actions">
            <button
              className="rf-btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? "Saving…" : isEditing ? "Save changes" : "Add rule"}
            </button>
            {isEditing ? (
              <button
                className="rf-btn-ghost"
                type="button"
                onClick={() => { setDraft(emptyDraft); setError(""); setSuccess(""); }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Rules list ── */}
        <div className="rf-list-card">
          <div className="rf-list-header">
            <h3 className="rf-list-title">Fee rules</h3>
            <div className="rf-list-meta">
              {activeCount > 0 ? (
                <span className="rf-active-badge">{activeCount} active</span>
              ) : null}
              <span className="rf-total-badge">{sortedRules.length} total</span>
            </div>
          </div>

          {loading ? (
            <div className="rf-empty">
              <p className="rf-empty-text">Loading…</p>
            </div>
          ) : sortedRules.length === 0 ? (
            <div className="rf-empty">
              <p className="rf-empty-icon">📋</p>
              <p className="rf-empty-text">No fee rules yet.</p>
              <p className="rf-empty-sub">Add your first rule using the form.</p>
            </div>
          ) : (
            <div className="rf-rule-list">
              {sortedRules.map((rule) => {
                const electric = isAlwaysElectric(rule.device_type ?? "");
                const ptLabel = electric
                  ? "Electric"
                  : powertrainLabel(rule.powertrain_type);
                return (
                  <div
                    key={rule.fee_rule_uuid}
                    className={`rf-rule-row${rule.active ? "" : " rf-rule-row-inactive"}`}
                  >
                    <div className="rf-rule-icon">{deviceIcon(rule.device_type)}</div>
                    <div className="rf-rule-body">
                      <p className="rf-rule-name">{rule.label || "Untitled rule"}</p>
                      <div className="rf-rule-chips">
                        <span className="rf-chip">{deviceLabel(rule.device_type)}</span>
                        <span className={`rf-chip${electric ? " rf-chip-electric" : ""}`}>
                          {electric ? "⚡ " : ""}{ptLabel}
                        </span>
                        {!rule.active && (
                          <span className="rf-chip rf-chip-inactive">Inactive</span>
                        )}
                      </div>
                    </div>
                    <p className="rf-rule-amount">{formatCurrency(rule.amount_cents)}</p>
                    <div className="rf-rule-actions">
                      <button
                        className="rf-action-btn"
                        type="button"
                        onClick={() => { setDraft(draftFromRule(rule)); setError(""); setSuccess(""); }}
                      >
                        Edit
                      </button>
                      <button
                        className="rf-action-btn rf-action-btn-danger"
                        type="button"
                        disabled={busy || !rule.active}
                        onClick={() => void handleDelete(rule)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
