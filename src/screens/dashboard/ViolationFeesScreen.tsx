import { useEffect, useMemo, useState } from "react";

import {
  createParkingViolationFeeRule,
  deleteParkingViolationFeeRule,
  fetchParkingViolationFeeRules,
  updateParkingViolationFeeRule,
  type ParkingViolationFeeRule,
  type ParkingViolationFeeRuleInput,
} from "../../lib/api";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
};

type FeeRuleDraft = {
  fee_rule_uuid: string;
  description: string;
  violation_type: string;
  device_type: string;
  powertrain_type: "" | "electric" | "non_electric";
  amount: string;
  active: boolean;
};

const emptyDraft: FeeRuleDraft = {
  fee_rule_uuid: "",
  description: "",
  violation_type: "",
  device_type: "",
  powertrain_type: "",
  amount: "",
  active: true,
};

const customViolationTypeValue = "__custom_violation_type__";
const customDeviceTypeValue = "__custom_device_type__";

const fallbackViolationTypes = [
  "no_permit",
  "wrong_spot",
  "expired_reservation",
  "blocking_access",
  "unauthorized_parking",
  "other",
];

const fallbackDeviceTypes = [
  "ebike",
  "escooter",
  "bicycle",
  "car",
  "motorcycle",
  "other",
];

function formatCurrencyFromCents(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}

function formatRuleValue(value?: string | null): string {
  return value?.trim() || "Any";
}

function normalizeToken(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatViolationType(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function amountToCents(value: string): number | null {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
}

function draftFromRule(rule: ParkingViolationFeeRule): FeeRuleDraft {
  return {
    fee_rule_uuid: rule.fee_rule_uuid,
    description: rule.label ?? "",
    violation_type: rule.violation_type ?? "",
    device_type: rule.device_type ?? "",
    powertrain_type:
      rule.powertrain_type === "electric" || rule.powertrain_type === "non_electric"
        ? rule.powertrain_type
        : "",
    amount: (rule.amount_cents / 100).toFixed(2),
    active: rule.active,
  };
}

function inputFromDraft(draft: FeeRuleDraft): ParkingViolationFeeRuleInput | null {
  const amount_cents = amountToCents(draft.amount);
  if (!draft.violation_type.trim() || amount_cents == null) {
    return null;
  }
  return {
    label: draft.description.trim(),
    violation_type: normalizeToken(draft.violation_type),
    campus_id: null,
    device_type: normalizeToken(draft.device_type) || null,
    powertrain_type: draft.powertrain_type || null,
    amount_cents,
    active: draft.active,
  };
}

function buildUniqueOptions(...groups: Array<Array<string | null | undefined>>) {
  const options: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      const normalized = normalizeToken(value);
      if (
        normalized &&
        !options.some((option) => normalizeToken(option) === normalized)
      ) {
        options.push(normalized);
      }
    }
  }
  return options.sort((left, right) => left.localeCompare(right));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function ViolationFeesScreen({ activeSchoolId, managedAppId }: Props) {
  const [rules, setRules] = useState<ParkingViolationFeeRule[]>([]);
  const [draft, setDraft] = useState<FeeRuleDraft>(emptyDraft);
  const [isDeviceTypeCustom, setIsDeviceTypeCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const sortedRules = useMemo(
    () =>
      [...rules].sort((left, right) => {
        if (left.active !== right.active) {
          return left.active ? -1 : 1;
        }
        const leftType = left.violation_type.trim().toLowerCase();
        const rightType = right.violation_type.trim().toLowerCase();
        if (leftType !== rightType) {
          return leftType.localeCompare(rightType);
        }
        return right.updated_at - left.updated_at;
      }),
    [rules],
  );
  const violationTypeOptions = useMemo(
    () =>
      buildUniqueOptions(
        rules.map((rule) => rule.violation_type),
        fallbackViolationTypes,
      ),
    [rules],
  );
  const deviceTypeOptions = useMemo(
    () =>
      buildUniqueOptions(
        rules.map((rule) => rule.device_type),
        fallbackDeviceTypes,
      ),
    [rules],
  );
  const selectedViolationTypeOption =
    violationTypeOptions.find(
      (option) => normalizeToken(option) === normalizeToken(draft.violation_type),
    ) ?? customViolationTypeValue;
  const selectedDeviceTypeOption = draft.device_type.trim()
    ? deviceTypeOptions.find(
        (option) => normalizeToken(option) === normalizeToken(draft.device_type),
      ) ?? customDeviceTypeValue
    : isDeviceTypeCustom
      ? customDeviceTypeValue
      : "";

  async function refreshRules() {
    if (!activeSchoolId || !managedAppId) {
      setRules([]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setRules(await fetchParkingViolationFeeRules(managedAppId, activeSchoolId));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshRules();
  }, [activeSchoolId, managedAppId]);

  async function handleSave() {
    const input = inputFromDraft(draft);
    if (!input) {
      setError("Violation type and amount are required.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const saved = draft.fee_rule_uuid
        ? await updateParkingViolationFeeRule(
            managedAppId,
            activeSchoolId,
            draft.fee_rule_uuid,
            input,
          )
        : await createParkingViolationFeeRule(managedAppId, activeSchoolId, input);
      setRules((current) => {
        const existing = current.some(
          (rule) => rule.fee_rule_uuid === saved.fee_rule_uuid,
        );
        return existing
          ? current.map((rule) =>
              rule.fee_rule_uuid === saved.fee_rule_uuid ? saved : rule,
            )
          : [saved, ...current];
      });
      setDraft(emptyDraft);
      setIsDeviceTypeCustom(false);
      setSuccess("Fee rule saved.");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rule: ParkingViolationFeeRule) {
    const shouldDelete = window.confirm(
      `Delete the ${formatViolationType(rule.violation_type)} fee?`,
    );
    if (!shouldDelete) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await deleteParkingViolationFeeRule(
        managedAppId,
        activeSchoolId,
        rule.fee_rule_uuid,
      );
      setRules((current) =>
        current.filter(
          (candidate) => candidate.fee_rule_uuid !== rule.fee_rule_uuid,
        ),
      );
      if (draft.fee_rule_uuid === rule.fee_rule_uuid) {
        setDraft(emptyDraft);
        setIsDeviceTypeCustom(false);
      }
      setSuccess("Fee rule deleted.");
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="violation-fees-screen">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Parking violations</p>
          <h2>Violation fees</h2>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void refreshRules()}>
          Refresh
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}

      <div className="violation-fees-layout">
        <section className="panel violation-fees-form">
          <div className="panel-header">
            <div>
              <h3>
                {draft.violation_type
                  ? formatViolationType(draft.violation_type)
                  : draft.fee_rule_uuid
                    ? "Edit fee"
                    : "New fee"}
              </h3>
              <span>{activeSchoolId || "No school selected"}</span>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Violation type</span>
              <select
                value={selectedViolationTypeOption}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    violation_type:
                      event.target.value === customViolationTypeValue
                        ? ""
                        : event.target.value,
                  }))
                }>
                <option value={customViolationTypeValue}>
                  New violation type...
                </option>
                {violationTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {formatViolationType(type)}
                  </option>
                ))}
              </select>
              {selectedViolationTypeOption === customViolationTypeValue ? (
                <input
                  value={draft.violation_type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      violation_type: event.target.value,
                    }))
                  }
                  placeholder="no_permit"
                />
              ) : null}
            </label>
            <label className="field field-span-2">
              <span>Description</span>
              <textarea
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Describe when this fee should be used."
              />
            </label>
            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.amount}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, amount: event.target.value }))
                }
                placeholder="40.00"
              />
            </label>
            <label className="field">
              <span>Device type</span>
              <select
                value={selectedDeviceTypeOption}
                onChange={(event) => {
                  setIsDeviceTypeCustom(
                    event.target.value === customDeviceTypeValue,
                  );
                  setDraft((current) => ({
                    ...current,
                    device_type:
                      event.target.value === customDeviceTypeValue
                        ? ""
                        : event.target.value,
                  }));
                }}>
                <option value="">Any device</option>
                <option value={customDeviceTypeValue}>New device type...</option>
                {deviceTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {formatViolationType(type)}
                  </option>
                ))}
              </select>
              {selectedDeviceTypeOption === customDeviceTypeValue ? (
                <input
                  value={draft.device_type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      device_type: event.target.value,
                    }))
                  }
                  placeholder="escooter"
                />
              ) : null}
            </label>
            <label className="field">
              <span>Powertrain</span>
              <select
                value={draft.powertrain_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    powertrain_type: event.target.value as FeeRuleDraft["powertrain_type"],
                  }))
                }>
                <option value="">Any</option>
                <option value="electric">Electric</option>
                <option value="non_electric">Non-electric</option>
              </select>
            </label>
            <label className="field violation-fees-checkbox">
              <span>Active</span>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, active: event.target.checked }))
                }
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy || !activeSchoolId || !managedAppId}
              onClick={() => void handleSave()}>
              {busy ? "Saving..." : "Save Fee"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setDraft(emptyDraft);
                setIsDeviceTypeCustom(false);
              }}>
              Clear
            </button>
          </div>
        </section>

        <section className="panel violation-fees-list">
          <div className="panel-header">
            <div>
              <h3>Configured fees</h3>
              <span>{sortedRules.length.toLocaleString()} rules</span>
            </div>
          </div>
          {sortedRules.length === 0 ? (
            <p className="empty-state">No violation fee rules configured.</p>
          ) : (
            <div className="violation-fees-table">
              {sortedRules.map((rule) => (
                <div className="violation-fees-row" key={rule.fee_rule_uuid}>
                  <div>
                    <strong>{formatViolationType(rule.violation_type)}</strong>
                    {rule.label.trim() ? <p>{rule.label.trim()}</p> : null}
                    <span>
                      {formatRuleValue(rule.device_type)} device ·{" "}
                      {formatRuleValue(rule.powertrain_type)}
                    </span>
                  </div>
                  <strong>{formatCurrencyFromCents(rule.amount_cents)}</strong>
                  <span>{rule.active ? "Active" : "Inactive"}</span>
                  <div className="violation-fees-row-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setDraft(draftFromRule(rule));
                        setIsDeviceTypeCustom(false);
                      }}>
                      Edit
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(rule)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
