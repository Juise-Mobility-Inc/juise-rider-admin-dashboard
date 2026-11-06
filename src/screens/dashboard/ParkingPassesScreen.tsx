import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deactivateParkingPass,
  fetchSchoolParkingPass,
  fetchSchoolParkingPasses,
  updateParkingPassTags,
  type ParkingPassStatus,
  type SchoolParkingPass,
  type SchoolParkingPassDetail,
} from "../../lib/api";
import { downloadCsv, sanitizeCsvFilename } from "../../lib/csv";
import { parkingPassEventLabels, shortPassId } from "../../lib/parkingPasses";
import { useDetailParamSync } from "../../lib/useDetailParamSync";

type Props = {
  activeSchoolId: string;
  managedAppId: string;
  onOpenVehicle: (membershipUuid: string, registeredDeviceUuid: string) => void;
};

const statusFilters: Array<{ label: string; value: "" | ParkingPassStatus }> = [
  { label: "All", value: "" },
  { label: "Unassigned", value: "unassigned" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const statusLabels: Record<ParkingPassStatus, string> = {
  unassigned: "Unassigned",
  active: "Active",
  inactive: "Inactive",
};

const reasonLabels: Record<string, string> = {
  replaced: "Replaced",
  lost: "Reported lost",
  admin: "Deactivated by admin",
  device_deleted: "Vehicle deleted",
};

function formatTimestamp(seconds?: number | null): string {
  return seconds ? new Date(seconds * 1000).toLocaleString() : "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function ParkingPassesScreen({
  activeSchoolId,
  managedAppId,
  onOpenVehicle,
}: Props) {
  const [passes, setPasses] = useState<SchoolParkingPass[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | ParkingPassStatus>("");
  const [tagFilter, setTagFilter] = useState("");
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [selectedUUID, setSelectedUUID] = useState("");
  const [detail, setDetail] = useState<SchoolParkingPassDetail | null>(null);
  const [deactivateNote, setDeactivateNote] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useDetailParamSync("pass", selectedUUID, setSelectedUUID, hasLoadedOnce);

  const refresh = useCallback(async () => {
    if (!activeSchoolId || !managedAppId) {
      setPasses([]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setPasses(await fetchSchoolParkingPasses(managedAppId, activeSchoolId));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
      setHasLoadedOnce(true);
    }
  }, [activeSchoolId, managedAppId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load the selected pass's history.
  useEffect(() => {
    if (!selectedUUID || !activeSchoolId || !managedAppId) {
      return;
    }
    let cancelled = false;
    fetchSchoolParkingPass(managedAppId, activeSchoolId, selectedUUID)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((nextError) => {
        if (!cancelled) setError(getErrorMessage(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, [activeSchoolId, managedAppId, selectedUUID]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const pass of passes) {
      for (const tag of pass.tags) tags.add(tag);
    }
    return [...tags].sort();
  }, [passes]);

  const counts = useMemo(() => {
    const next = { unassigned: 0, active: 0, inactive: 0 };
    for (const pass of passes) next[pass.status] += 1;
    return next;
  }, [passes]);

  const visiblePasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return passes.filter((pass) => {
      if (statusFilter && pass.status !== statusFilter) return false;
      if (tagFilter && !pass.tags.includes(tagFilter)) return false;
      if (!query) return true;
      return [pass.pass_uuid, pass.student_name, pass.student_email, pass.vehicle_name, ...pass.tags].some(
        (field) => (field ?? "").toLowerCase().includes(query),
      );
    });
  }, [passes, search, statusFilter, tagFilter]);

  const visibleChecked = visiblePasses.filter((pass) => checked.has(pass.pass_uuid));
  const allVisibleChecked = visiblePasses.length > 0 && visibleChecked.length === visiblePasses.length;

  function toggleChecked(passUuid: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(passUuid)) next.delete(passUuid);
      else next.add(passUuid);
      return next;
    });
  }

  function toggleAllVisible() {
    setChecked((current) => {
      const next = new Set(current);
      if (allVisibleChecked) {
        for (const pass of visiblePasses) next.delete(pass.pass_uuid);
      } else {
        for (const pass of visiblePasses) next.add(pass.pass_uuid);
      }
      return next;
    });
  }

  async function applyTags(mode: "add" | "remove") {
    const tags = parseTags(tagInput);
    const passUuids = visibleChecked.map((pass) => pass.pass_uuid);
    if (tags.length === 0 || passUuids.length === 0) return;
    setActionBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await updateParkingPassTags(managedAppId, activeSchoolId, {
        pass_uuids: passUuids,
        add: mode === "add" ? tags : [],
        remove: mode === "remove" ? tags : [],
      });
      setSuccess(
        `${mode === "add" ? "Added" : "Removed"} ${tags.join(", ")} ${mode === "add" ? "to" : "from"} ${result.updated} pass${result.updated === 1 ? "" : "es"}.`,
      );
      setTagInput("");
      await refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv(sanitizeCsvFilename(`${activeSchoolId}-parking-passes`), [
      ["pass_uuid", "status", "tags", "student", "student_email", "vehicle", "activated_at", "deactivated_at", "deactivated_reason"],
      ...visiblePasses.map((pass) => [
        pass.pass_uuid,
        pass.status,
        pass.tags.join("; "),
        pass.student_name,
        pass.student_email,
        pass.vehicle_name,
        pass.activated_at ? new Date(pass.activated_at * 1000).toISOString() : "",
        pass.deactivated_at ? new Date(pass.deactivated_at * 1000).toISOString() : "",
        pass.deactivated_reason ?? "",
      ]),
    ]);
  }

  async function handleDeactivate() {
    if (!detail) return;
    setActionBusy(true);
    setError("");
    setSuccess("");
    try {
      await deactivateParkingPass(managedAppId, activeSchoolId, detail.pass.pass_uuid, deactivateNote.trim());
      setSuccess(`Pass ${shortPassId(detail.pass.pass_uuid)} deactivated.`);
      setConfirmDeactivate(false);
      setDeactivateNote("");
      setDetail(await fetchSchoolParkingPass(managedAppId, activeSchoolId, detail.pass.pass_uuid));
      await refresh();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setActionBusy(false);
    }
  }

  function closeDetail() {
    setSelectedUUID("");
    setDetail(null);
    setConfirmDeactivate(false);
    setDeactivateNote("");
  }

  const shownDetail = detail && detail.pass.pass_uuid === selectedUUID ? detail : null;

  if (selectedUUID) {
    const pass = shownDetail?.pass;
    return (
      <section className="dashboard-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Parking pass</p>
            <h2>{shortPassId(selectedUUID)}</h2>
            <p className="muted-text parking-pass-uuid">{selectedUUID}</p>
          </div>
          <button className="secondary-button" type="button" onClick={closeDetail}>
            Back to passes
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}

        {!pass ? (
          <p className="muted-text">Loading pass...</p>
        ) : (
          <>
            <dl className="parking-pass-details">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`parking-pass-status parking-pass-status-${pass.status}`}>
                    {statusLabels[pass.status]}
                  </span>
                  {pass.deactivated_reason ? ` · ${reasonLabels[pass.deactivated_reason] ?? pass.deactivated_reason}` : ""}
                </dd>
              </div>
              <div>
                <dt>{pass.status === "inactive" ? "Last student" : "Student"}</dt>
                <dd>{pass.student_name || pass.student_email || "—"}</dd>
              </div>
              <div>
                <dt>{pass.status === "inactive" ? "Last vehicle" : "Vehicle"}</dt>
                <dd>{pass.vehicle_name || "—"}</dd>
              </div>
              <div>
                <dt>Activated</dt>
                <dd>{formatTimestamp(pass.activated_at) || "—"}</dd>
              </div>
              <div>
                <dt>Deactivated</dt>
                <dd>{formatTimestamp(pass.deactivated_at) || "—"}</dd>
              </div>
              <div>
                <dt>Tags</dt>
                <dd>{pass.tags.length ? pass.tags.join(", ") : "—"}</dd>
              </div>
              {pass.replaced_by_pass_uuid ? (
                <div>
                  <dt>Replaced by</dt>
                  <dd>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setSelectedUUID(pass.replaced_by_pass_uuid ?? "")}
                    >
                      {shortPassId(pass.replaced_by_pass_uuid)}
                    </button>
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="parking-pass-actions">
              {pass.status === "active" && pass.student_membership_uuid && pass.registered_device_uuid ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onOpenVehicle(pass.student_membership_uuid ?? "", pass.registered_device_uuid ?? "")}
                >
                  Open vehicle
                </button>
              ) : null}
              {pass.status === "active" && !confirmDeactivate ? (
                <button className="danger-button" type="button" onClick={() => setConfirmDeactivate(true)}>
                  Deactivate pass
                </button>
              ) : null}
            </div>

            {confirmDeactivate ? (
              <div className="parking-pass-confirm">
                <p>
                  Deactivate this pass? It stays on record, but enforcement will see it as an inactive
                  pass. The student will need a new pass for this vehicle.
                </p>
                <textarea
                  value={deactivateNote}
                  onChange={(event) => setDeactivateNote(event.target.value)}
                  placeholder="Note (optional)"
                  rows={2}
                />
                <div className="parking-pass-actions">
                  <button className="danger-button" type="button" disabled={actionBusy} onClick={() => void handleDeactivate()}>
                    {actionBusy ? "Deactivating..." : "Deactivate"}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setConfirmDeactivate(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <h3 className="parking-pass-history-title">History</h3>
            <div className="management-table-card">
              <div className="management-table-scroll">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(shownDetail?.events ?? []).map((event) => (
                      <tr key={event.event_uuid}>
                        <td>{formatTimestamp(event.created_at)}</td>
                        <td>{parkingPassEventLabels[event.event_type] ?? event.event_type}</td>
                        <td>{event.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="dashboard-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Vehicles</p>
          <h2>Parking Passes</h2>
          <p className="muted-text">
            Every pre-printed parking pass for this school. Students activate a pass by scanning it in
            the Rider App. Inactive passes stay on record.
          </p>
        </div>
        <div className="parking-pass-actions">
          <button className="secondary-button" type="button" disabled={visiblePasses.length === 0} onClick={exportCsv}>
            Export CSV
          </button>
          <button className="secondary-button" type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="reg-table-tools">
        <div className="segmented-control">
          {statusFilters.map((option) => (
            <button
              key={option.value || "all"}
              className={statusFilter === option.value ? "segment-active" : ""}
              type="button"
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
              {option.value ? ` (${counts[option.value].toLocaleString()})` : ` (${passes.length.toLocaleString()})`}
            </button>
          ))}
        </div>
        <input
          className="reg-table-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search pass, student, vehicle, tag..."
        />
      </div>

      {allTags.length > 0 ? (
        <div className="parking-pass-tag-filters">
          <span className="muted-text">Tags:</span>
          <button
            type="button"
            className={`parking-pass-tag ${tagFilter === "" ? "parking-pass-tag-active" : ""}`}
            onClick={() => setTagFilter("")}
          >
            Any
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`parking-pass-tag ${tagFilter === tag ? "parking-pass-tag-active" : ""}`}
              onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      {visibleChecked.length > 0 ? (
        <div className="parking-pass-bulk">
          <strong>{visibleChecked.length.toLocaleString()} selected</strong>
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="Tags, comma-separated"
          />
          <button
            className="secondary-button"
            type="button"
            disabled={actionBusy || parseTags(tagInput).length === 0}
            onClick={() => void applyTags("add")}
          >
            Add tag
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={actionBusy || parseTags(tagInput).length === 0}
            onClick={() => void applyTags("remove")}
          >
            Remove tag
          </button>
          <button className="link-button" type="button" onClick={() => setChecked(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}
      {busy ? <p className="muted-text">Loading parking passes...</p> : null}

      <div className="management-table-card reg-table-card">
        <div className="reg-table-summary">
          <strong>{visiblePasses.length.toLocaleString()} passes</strong>
          <span>
            {[
              statusFilter ? statusLabels[statusFilter] : "All statuses",
              tagFilter ? `tag "${tagFilter}"` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="management-table-scroll">
          <table className="management-table reg-review-table">
            <thead>
              <tr>
                <th className="parking-pass-check">
                  <input
                    type="checkbox"
                    aria-label="Select all shown passes"
                    checked={allVisibleChecked}
                    onChange={toggleAllVisible}
                  />
                </th>
                <th>Pass</th>
                <th>Status</th>
                <th>Tags</th>
                <th>Student</th>
                <th>Vehicle</th>
                <th>Activated</th>
                <th>Deactivated</th>
              </tr>
            </thead>
            <tbody>
              {visiblePasses.map((pass) => (
                <tr
                  key={pass.pass_uuid}
                  className="reg-review-row"
                  tabIndex={0}
                  onClick={() => setSelectedUUID(pass.pass_uuid)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setSelectedUUID(pass.pass_uuid);
                    }
                  }}
                >
                  <td className="parking-pass-check" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select pass ${shortPassId(pass.pass_uuid)}`}
                      checked={checked.has(pass.pass_uuid)}
                      onChange={() => toggleChecked(pass.pass_uuid)}
                    />
                  </td>
                  <td>
                    <strong>{shortPassId(pass.pass_uuid)}</strong>
                    <span>{pass.pass_uuid}</span>
                  </td>
                  <td>
                    <span className={`parking-pass-status parking-pass-status-${pass.status}`}>
                      {statusLabels[pass.status]}
                    </span>
                  </td>
                  <td>{pass.tags.join(", ") || "—"}</td>
                  <td>
                    <strong>{pass.student_name || "—"}</strong>
                    <span>{pass.student_email}</span>
                  </td>
                  <td>
                    {pass.status === "active" && pass.student_membership_uuid && pass.registered_device_uuid ? (
                      <button
                        className="link-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenVehicle(pass.student_membership_uuid ?? "", pass.registered_device_uuid ?? "");
                        }}
                      >
                        {pass.vehicle_name || "Open vehicle"}
                      </button>
                    ) : (
                      pass.vehicle_name || "—"
                    )}
                  </td>
                  <td>{formatTimestamp(pass.activated_at) || "—"}</td>
                  <td>
                    <strong>{formatTimestamp(pass.deactivated_at) || "—"}</strong>
                    <span>{pass.deactivated_reason ? reasonLabels[pass.deactivated_reason] ?? pass.deactivated_reason : ""}</span>
                  </td>
                </tr>
              ))}
              {visiblePasses.length === 0 && !busy ? (
                <tr>
                  <td colSpan={8}>
                    <span>
                      {passes.length === 0
                        ? "No parking passes have been printed for this school yet."
                        : "No parking passes match these filters."}
                    </span>
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
