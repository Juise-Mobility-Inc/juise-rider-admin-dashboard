import { useEffect, useMemo, useState } from "react";

import {
  createRegisteredDeviceFeeRule,
  deleteRegisteredDeviceFeeRule,
  fetchRegisteredDeviceFeeRules,
  updateRegisteredDeviceFeeRule,
  type RegisteredDeviceFeeRule,
  type RegisteredDeviceFeeRuleInput,
} from "../../lib/api";
import { confirmAction } from "../../lib/confirm";
import {
  DataRow,
  DataTable,
  StatusBadge,
  TableCard,
  TableMessageRow,
} from "../../components/table/DataTable";

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
    if (
      !(await confirmAction({
        title: "Delete fee rule?",
        message: `Delete "${rule.label || "this fee rule"}"?`,
        confirmLabel: "Delete",
      }))
    )
      return;
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
        <TableCard
          className="rf-rule-table"
          title="Fee rules"
          meta={`${activeCount} active · ${sortedRules.length} total`}
        >
          <DataTable minWidth={520} aria-label="Registration fee rules">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Applies to</th>
                <th>Fee</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule) => {
                const electric = isAlwaysElectric(rule.device_type ?? "");
                const ptLabel = electric
                  ? "Electric"
                  : powertrainLabel(rule.powertrain_type);
                return (
                  <DataRow
                    key={rule.fee_rule_uuid}
                    className={rule.active ? undefined : "dt-row-inactive"}
                  >
                    <td>
                      <strong>
                        <span className="rf-rule-icon-inline" aria-hidden="true">
                          {deviceIcon(rule.device_type)}
                        </span>{" "}
                        {rule.label || "Untitled rule"}
                      </strong>
                    </td>
                    <td>
                      <StatusBadge tone="neutral">{deviceLabel(rule.device_type)}</StatusBadge>
                      <StatusBadge tone={electric ? "info" : "neutral"}>
                        {electric ? "⚡ " : ""}
                        {ptLabel}
                      </StatusBadge>
                      {!rule.active ? <StatusBadge tone="danger">Inactive</StatusBadge> : null}
                    </td>
                    <td>
                      <strong>{formatCurrency(rule.amount_cents)}</strong>
                    </td>
                    <td className="dt-actions-cell">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => { setDraft(draftFromRule(rule)); setError(""); setSuccess(""); }}
                      >
                        Edit
                      </button>{" "}
                      <button
                        className="danger-button"
                        type="button"
                        disabled={busy || !rule.active}
                        onClick={() => void handleDelete(rule)}
                      >
                        Delete
                      </button>
                    </td>
                  </DataRow>
                );
              })}
              {loading && sortedRules.length === 0 ? (
                <TableMessageRow colSpan={4} tone="loading">
                  Loading fee rules…
                </TableMessageRow>
              ) : null}
              {!loading && sortedRules.length === 0 ? (
                <TableMessageRow colSpan={4}>
                  No fee rules yet. Add your first rule using the form.
                </TableMessageRow>
              ) : null}
            </tbody>
          </DataTable>
        </TableCard>
      </div>
    </section>
  );
}
