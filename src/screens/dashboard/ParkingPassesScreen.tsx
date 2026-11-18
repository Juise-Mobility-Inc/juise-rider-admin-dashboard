import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deactivateParkingPass,
  fetchSchoolParkingPass,
  fetchSchoolParkingPasses,
  fetchSchoolRegisteredDevices,
  signSchoolMedia,
  updateParkingPassTags,
  type ParkingPassStatus,
  type RegisteredDeviceReviewEntry,
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
  onOpenStudent: (membershipUuid: string) => void;
};

function capitalize(value?: string | null): string {
  const text = (value ?? "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ") : "";
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function vehicleTitle(entry: RegisteredDeviceReviewEntry | undefined, fallback: string): string {
  if (!entry) return fallback;
  const d = entry.device;
  return [d.make, d.model].filter(Boolean).join(" ").trim() || d.nickname || capitalize(d.device_type) || fallback;
}

function vehicleSubtitle(entry: RegisteredDeviceReviewEntry | undefined): string {
  if (!entry) return "";
  const d = entry.device;
  const title = [d.make, d.model].filter(Boolean).join(" ").trim();
  return [title && d.nickname ? `"${d.nickname}"` : "", capitalize(d.device_type), capitalize(d.color)]
    .filter(Boolean)
    .join(" · ");
}

function registrationLabel(entry: RegisteredDeviceReviewEntry | undefined): string {
  if (!entry) return "";
  const d = entry.device;
  if (!d.active) return "Vehicle inactive";
  if (d.registration_status === "declined") return "Registration declined";
  if (d.registration_status === "pending") return "Registration pending";
  if (d.payment_status === "pending" || d.payment_status === "failed") return "Fee unpaid";
  return "Registered";
}

function studentName(entry: RegisteredDeviceReviewEntry | undefined, pass: SchoolParkingPass): string {
  const user = entry?.student.user;
  const fromUser = user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() : "";
  return pass.student_name || fromUser || user?.username || pass.student_email || "";
}

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

function visiblePassTags(pass: SchoolParkingPass, schoolId: string): string[] {
  const normalizedSchoolId = schoolId.trim().toLowerCase();
  return pass.tags.filter(
    (tag) => tag.trim().toLowerCase() !== normalizedSchoolId,
  );
}

function passActivity(pass: SchoolParkingPass): string {
  if (pass.status === "active" && pass.activated_at) {
    return `Activated · ${formatTimestamp(pass.activated_at)}`;
  }
  if (pass.deactivated_at) {
    const reason = pass.deactivated_reason
      ? reasonLabels[pass.deactivated_reason] ?? pass.deactivated_reason
      : "Deactivated";
    return `${reason} · ${formatTimestamp(pass.deactivated_at)}`;
  }
  if (pass.activated_at) {
    return `Last activated · ${formatTimestamp(pass.activated_at)}`;
  }
  return "No activity yet";
}

export function ParkingPassesScreen({
  activeSchoolId,
  managedAppId,
  onOpenVehicle,
  onOpenStudent,
}: Props) {
  const [passes, setPasses] = useState<SchoolParkingPass[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, RegisteredDeviceReviewEntry>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
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
      // Vehicles fill in student and vehicle details; the list still works
      // with just the names on each tag if they fail to load.
      const [nextPasses, entries] = await Promise.all([
        fetchSchoolParkingPasses(managedAppId, activeSchoolId),
        fetchSchoolRegisteredDevices(managedAppId, activeSchoolId, "").catch(
          () => [] as RegisteredDeviceReviewEntry[],
        ),
      ]);
      setPasses(nextPasses);
      const byDevice: Record<string, RegisteredDeviceReviewEntry> = {};
      for (const entry of entries) byDevice[entry.device.registered_device_uuid] = entry;
      setVehicles(byDevice);

      const linked = new Set(nextPasses.map((pass) => pass.registered_device_uuid).filter(Boolean));
      const keys: string[] = [];
      for (const entry of entries) {
        if (!linked.has(entry.device.registered_device_uuid)) continue;
        const profileKey = entry.student.profile_image_object_key?.trim();
        if (profileKey) keys.push(profileKey);
        const photo = entry.device_media.find((media) => media.active && media.object_key?.trim());
        if (photo?.object_key) keys.push(photo.object_key);
      }
      if (keys.length > 0) {
        setPhotoUrls(await signSchoolMedia(activeSchoolId, keys).catch(() => ({})));
      }
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
      for (const tag of visiblePassTags(pass, activeSchoolId)) tags.add(tag);
    }
    return [...tags].sort();
  }, [activeSchoolId, passes]);

  // A tag filter for a tag no pass has any more (e.g. after removing it from
  // every pass) would hide every pass along with the tag buttons, so drop it.
  useEffect(() => {
    if (tagFilter && !allTags.includes(tagFilter)) setTagFilter("");
  }, [allTags, tagFilter]);

  function vehicleFor(pass: SchoolParkingPass): RegisteredDeviceReviewEntry | undefined {
    return pass.registered_device_uuid ? vehicles[pass.registered_device_uuid] : undefined;
  }

  function studentPhoto(entry: RegisteredDeviceReviewEntry | undefined): string {
    const key = entry?.student.profile_image_object_key?.trim();
    return key ? photoUrls[key] ?? "" : "";
  }

  function vehiclePhoto(entry: RegisteredDeviceReviewEntry | undefined): string {
    const key = entry?.device_media.find((media) => media.active && media.object_key?.trim())?.object_key;
    return key ? photoUrls[key] ?? "" : "";
  }

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
      const entry = pass.registered_device_uuid ? vehicles[pass.registered_device_uuid] : undefined;
      return [
        pass.pass_uuid,
        pass.student_name,
        pass.student_email,
        pass.vehicle_name,
        entry?.student.membership?.student_id,
        entry?.device.make,
        entry?.device.model,
        entry?.device.nickname,
        entry?.device.serial_number,
        ...visiblePassTags(pass, activeSchoolId),
      ].some(
        (field) => (field ?? "").toLowerCase().includes(query),
      );
    });
  }, [activeSchoolId, passes, search, statusFilter, tagFilter, vehicles]);

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
        `${mode === "add" ? "Added" : "Removed"} ${tags.join(", ")} ${mode === "add" ? "to" : "from"} ${result.updated} tag${result.updated === 1 ? "" : "s"}.`,
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
    downloadCsv(sanitizeCsvFilename(`${activeSchoolId}-device-identification-tags`), [
      ["tag_id", "status", "labels", "student", "student_email", "vehicle", "activated_at", "deactivated_at", "deactivated_reason"],
      ...visiblePasses.map((pass) => [
        pass.pass_uuid,
        pass.status,
        visiblePassTags(pass, activeSchoolId).join("; "),
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
      <section className="dashboard-panel parking-pass-screen parking-pass-detail-screen">
        <div className="section-header parking-pass-detail-header">
          <button className="secondary-button" type="button" onClick={closeDetail}>
            Back to tags
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}

        {!pass ? (
          <p className="muted-text">Loading tag...</p>
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
                <dt>Activated</dt>
                <dd>{formatTimestamp(pass.activated_at) || "—"}</dd>
              </div>
              <div>
                <dt>Deactivated</dt>
                <dd>{formatTimestamp(pass.deactivated_at) || "—"}</dd>
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

            {pass.user_uuid || pass.registered_device_uuid ? (
              <ParkingPassPairing
                pass={pass}
                entry={vehicleFor(pass)}
                studentPhotoUrl={studentPhoto(vehicleFor(pass))}
                vehiclePhotoUrl={vehiclePhoto(vehicleFor(pass))}
                onOpenStudent={onOpenStudent}
                onOpenVehicle={onOpenVehicle}
              />
            ) : (
              <p className="muted-text parking-pass-unpaired">
                No student has activated this tag yet.
              </p>
            )}

            <div className="parking-pass-actions">
              {pass.status === "active" && !confirmDeactivate ? (
                <button className="danger-button" type="button" onClick={() => setConfirmDeactivate(true)}>
                  Deactivate tag
                </button>
              ) : null}
            </div>

            {confirmDeactivate ? (
              <div className="parking-pass-confirm">
                <p>
                  Deactivate this tag? It stays on record, but enforcement will see it as an inactive
                  tag. The student will need a new tag for this vehicle.
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

            <div className="parking-pass-history">
              <div className="parking-pass-history-heading">
                <div>
                  <p className="eyebrow">Activity log</p>
                  <h3 className="parking-pass-history-title">History</h3>
                </div>
                <span>{shownDetail?.events.length ?? 0} events</span>
              </div>
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
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="dashboard-panel parking-pass-screen parking-pass-list-screen">
      <div className="section-header parking-pass-list-header">
        <div>
          <p className="eyebrow">Vehicles</p>
          <h2>Device Identification Tags</h2>
          <p className="muted-text">
            Every pre-printed device identification tag for this school. Students activate a tag by
            scanning it in the Rider App. Inactive tags stay on record.
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

      <div className="reg-table-tools parking-pass-table-tools">
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
          placeholder="Search tag, student, vehicle, label..."
        />
      </div>

      {allTags.length > 0 ? (
        <div className="parking-pass-tag-filters">
          <span className="muted-text">Labels:</span>
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
            placeholder="Labels, comma-separated"
          />
          <button
            className="secondary-button"
            type="button"
            disabled={actionBusy || parseTags(tagInput).length === 0}
            onClick={() => void applyTags("add")}
          >
            Add label
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={actionBusy || parseTags(tagInput).length === 0}
            onClick={() => void applyTags("remove")}
          >
            Remove label
          </button>
          <button className="link-button" type="button" onClick={() => setChecked(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}
      {busy ? <p className="muted-text">Loading parking passes...</p> : null}

      <div className="management-table-card reg-table-card parking-pass-table-card">
        <div className="reg-table-summary">
          <strong>{visiblePasses.length.toLocaleString()} tags</strong>
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
                    aria-label="Select all shown tags"
                    checked={allVisibleChecked}
                    onChange={toggleAllVisible}
                  />
                </th>
                <th>Tag</th>
                <th>Status</th>
                <th>Student</th>
                <th>Vehicle</th>
                <th>Recent activity</th>
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
                  <td className="parking-pass-tag-cell">
                    <strong>{shortPassId(pass.pass_uuid)}</strong>
                  </td>
                  <td>
                    <span className={`parking-pass-status parking-pass-status-${pass.status}`}>
                      {statusLabels[pass.status]}
                    </span>
                  </td>
                  <td>
                    {pass.user_uuid ? (
                      <div className="reg-table-identity">
                        {studentPhoto(vehicleFor(pass)) ? (
                          <img loading="lazy" decoding="async" src={studentPhoto(vehicleFor(pass))} alt="" className="reg-table-photo" />
                        ) : (
                          <div className="reg-table-avatar">{initials(studentName(vehicleFor(pass), pass))}</div>
                        )}
                        <div>
                          <strong>{studentName(vehicleFor(pass), pass) || "—"}</strong>
                          <span>
                            {[vehicleFor(pass)?.student.membership?.student_id, pass.student_email]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {pass.registered_device_uuid ? (
                      <div className="reg-table-identity">
                        {vehiclePhoto(vehicleFor(pass)) ? (
                          <img loading="lazy" decoding="async" src={vehiclePhoto(vehicleFor(pass))} alt="" className="reg-table-photo" />
                        ) : (
                          <div className="reg-table-avatar">🚲</div>
                        )}
                        <div>
                          {pass.status === "active" ? (
                            <button
                              className="link-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenVehicle(pass.student_membership_uuid ?? "", pass.registered_device_uuid ?? "");
                              }}
                            >
                              {vehicleTitle(vehicleFor(pass), pass.vehicle_name || "Open vehicle")}
                            </button>
                          ) : (
                            <strong>{vehicleTitle(vehicleFor(pass), pass.vehicle_name || "—")}</strong>
                          )}
                          <span>
                            {[vehicleSubtitle(vehicleFor(pass)), pass.status === "active" ? registrationLabel(vehicleFor(pass)) : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="parking-pass-activity-cell">
                    <span>{passActivity(pass)}</span>
                  </td>
                </tr>
              ))}
              {visiblePasses.length === 0 && !busy ? (
                <tr>
                  <td colSpan={6}>
                    <span>
                      {passes.length === 0
                        ? "No device identification tags have been printed for this school yet."
                        : "No device identification tags match these filters."}
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

type PairingProps = {
  pass: SchoolParkingPass;
  entry: RegisteredDeviceReviewEntry | undefined;
  studentPhotoUrl: string;
  vehiclePhotoUrl: string;
  onOpenStudent: (membershipUuid: string) => void;
  onOpenVehicle: (membershipUuid: string, registeredDeviceUuid: string) => void;
};

// The student and vehicle the tag is (or was last) paired with, so admins
// don't have to open either to see who and what it is.
function ParkingPassPairing({
  pass,
  entry,
  studentPhotoUrl,
  vehiclePhotoUrl,
  onOpenStudent,
  onOpenVehicle,
}: PairingProps) {
  const inactive = pass.status !== "active";
  const name = studentName(entry, pass);
  const membershipUuid = pass.student_membership_uuid ?? entry?.student.membership?.membership_uuid ?? "";
  const device = entry?.device;
  const rows = (items: Array<[string, string | null | undefined]>) =>
    items
      .filter(([, value]) => Boolean(value && String(value).trim()))
      .map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ));

  return (
    <div className="parking-pass-pairing">
      <article className="parking-pass-card">
        <p className="eyebrow">{inactive ? "Last student" : "Student"}</p>
        <div className="parking-pass-card-head">
          {studentPhotoUrl ? (
            <img loading="lazy" decoding="async" src={studentPhotoUrl} alt="" className="parking-pass-card-photo" />
          ) : (
            <div className="parking-pass-card-photo parking-pass-card-initials">{initials(name)}</div>
          )}
          <div>
            <strong>{name || "Unknown student"}</strong>
            <span>{entry?.student.membership?.student_id || pass.student_email}</span>
          </div>
        </div>
        <dl className="parking-pass-card-rows">
          {rows([
            ["Email", pass.student_email || entry?.student.user.email],
            ["Username", entry?.student.user.username ? `@${entry.student.user.username}` : ""],
            ["Phone", entry?.student.user.phone],
            ["Membership", capitalize(entry?.student.membership?.status)],
          ])}
        </dl>
        {membershipUuid ? (
          <button className="secondary-button" type="button" onClick={() => onOpenStudent(membershipUuid)}>
            Open student
          </button>
        ) : null}
      </article>

      <article className="parking-pass-card">
        <p className="eyebrow">{inactive ? "Last vehicle" : "Vehicle"}</p>
        <div className="parking-pass-card-head">
          {vehiclePhotoUrl ? (
            <img loading="lazy" decoding="async" src={vehiclePhotoUrl} alt="" className="parking-pass-card-photo" />
          ) : (
            <div className="parking-pass-card-photo parking-pass-card-initials">🚲</div>
          )}
          <div>
            <strong>{vehicleTitle(entry, pass.vehicle_name || "Unknown vehicle")}</strong>
            <span>{vehicleSubtitle(entry)}</span>
          </div>
        </div>
        {device ? (
          <dl className="parking-pass-card-rows">
            {rows([
              ["Powertrain", capitalize(device.powertrain_type)],
              ["Serial", device.serial_number],
              ["Registration", registrationLabel(entry)],
              ["Fee", capitalize(device.payment_status)],
            ])}
          </dl>
        ) : (
          <p className="muted-text">
            {inactive ? "This vehicle is no longer registered at the school." : "Vehicle details unavailable."}
          </p>
        )}
        {device && pass.registered_device_uuid ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => onOpenVehicle(membershipUuid, pass.registered_device_uuid ?? "")}
          >
            Open in Campus Devices
          </button>
        ) : null}
      </article>
    </div>
  );
}
