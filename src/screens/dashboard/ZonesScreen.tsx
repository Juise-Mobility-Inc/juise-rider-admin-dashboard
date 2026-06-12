import { useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";

import {
  SchoolZoneMapEditor,
  SchoolZonesMap,
  type SchoolZoneMapPolygon,
} from "../../components/SchoolZoneMapEditor";
import type { PackMapPoint } from "../../components/PackLocationPicker";
import {
  csvRowsToObjects,
  downloadCsv,
  parseCsvRows,
  sanitizeCsvFilename,
  type CsvCell,
} from "../../lib/csv";
import type {
  SchoolZonePunishmentPolicy,
  SchoolZonePunishmentRule,
} from "../../lib/api";

type ZoneDraft = {
  id: string;
  zone_uuid: string;
  title: string;
  description: string;
  zone_type: "no_go" | "speed_limit";
  speed_limit_mph: string;
  polygon: PackMapPoint[];
  punishment_policy: SchoolZonePunishmentPolicy;
};

type Props = {
  activeSchoolId: string;
  zoneBusy: boolean;
  zoneDrafts: ZoneDraft[];
  setZoneDrafts: Dispatch<SetStateAction<ZoneDraft[]>>;
  activeZoneDraftId: string;
  setActiveZoneDraftId: Dispatch<SetStateAction<string>>;
  selectedZoneDraft: ZoneDraft | null;
  zoneMapPolygons: SchoolZoneMapPolygon[];
  mappedZoneCount: number;
  createEmptyZoneDraft: (zoneType?: ZoneDraft["zone_type"]) => ZoneDraft;
  refreshSchoolZones: () => Promise<void>;
  handleSaveZones: (nextZoneDrafts?: ZoneDraft[]) => Promise<boolean>;
  handleZonePointAdd: (point: PackMapPoint) => void;
  handleZonePointInsert: (index: number, point: PackMapPoint) => void;
  handleZonePointMove: (index: number, point: PackMapPoint) => void;
  DetailRow?: React.ComponentType<{ label: string; value: string }>;
};

const zoneCsvColumns = [
  "zone_uuid",
  "title",
  "description",
  "zone_type",
  "speed_limit_mph",
  "polygon",
  "punishment_policy",
] as const;

const ZONE_TYPE_LABELS: Record<ZoneDraft["zone_type"], string> = {
  no_go: "No-go",
  speed_limit: "Speed limit",
};

const PUNISHMENT_ACTION_LABELS: Record<string, string> = {
  warning: "Warning",
  points: "Points",
  admin_review: "Admin review",
};

function createDefaultPunishmentPolicy(): SchoolZonePunishmentPolicy {
  return {
    rules: [
      {
        min_count: 1,
        max_count: 1,
        points_lost: 0,
        notify_student: true,
        dashboard_review_required: false,
        punishment_action: "warning",
      },
      {
        min_count: 2,
        max_count: 2,
        points_lost: 5,
        notify_student: true,
        dashboard_review_required: false,
        punishment_action: "points",
      },
      {
        min_count: 3,
        max_count: null,
        points_lost: 5,
        notify_student: true,
        dashboard_review_required: true,
        punishment_action: "admin_review",
      },
    ],
  };
}

function normalizePunishmentRule(
  value: unknown,
  index: number,
): SchoolZonePunishmentRule {
  const fallback = createDefaultPunishmentPolicy().rules[
    Math.min(index, createDefaultPunishmentPolicy().rules.length - 1)
  ];
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const record = value as Partial<SchoolZonePunishmentRule> & {
    max_count?: number | string | null;
  };
  const minCount = Number(record.min_count);
  const rawMaxCount = record.max_count as number | string | null | undefined;
  const maxCount =
    rawMaxCount == null || rawMaxCount === ""
      ? null
      : Number(rawMaxCount);
  const pointsLost = Number(record.points_lost);

  return {
    min_count: Number.isFinite(minCount) && minCount > 0 ? Math.floor(minCount) : fallback.min_count,
    max_count:
      maxCount == null
        ? null
        : Number.isFinite(maxCount) && maxCount > 0
          ? Math.floor(maxCount)
          : fallback.max_count,
    points_lost:
      Number.isFinite(pointsLost) && pointsLost >= 0
        ? Math.floor(pointsLost)
        : fallback.points_lost,
    notify_student:
      typeof record.notify_student === "boolean"
        ? record.notify_student
        : fallback.notify_student,
    dashboard_review_required:
      typeof record.dashboard_review_required === "boolean"
        ? record.dashboard_review_required
        : fallback.dashboard_review_required,
    punishment_action:
      typeof record.punishment_action === "string" && record.punishment_action.trim()
        ? record.punishment_action.trim()
        : fallback.punishment_action,
  };
}

function normalizePunishmentPolicy(value: unknown): SchoolZonePunishmentPolicy {
  if (typeof value === "string" && value.trim()) {
    try {
      return normalizePunishmentPolicy(JSON.parse(value) as unknown);
    } catch {
      return createDefaultPunishmentPolicy();
    }
  }
  if (!value || typeof value !== "object") {
    return createDefaultPunishmentPolicy();
  }
  const rules = (value as Partial<SchoolZonePunishmentPolicy>).rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    return createDefaultPunishmentPolicy();
  }
  return {
    rules: rules.map(normalizePunishmentRule).sort((a, b) => a.min_count - b.min_count),
  };
}

function normalizeZoneType(value: string): ZoneDraft["zone_type"] {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "speed_limit" ? "speed_limit" : "no_go";
}

function parsePolygonValue(value: string): PackMapPoint[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.flatMap((point) => {
        if (!point || typeof point !== "object") {
          return [];
        }
        const candidate = point as Partial<PackMapPoint>;
        const lat = Number(candidate.lat);
        const lng = Number(candidate.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
      });
    }
  } catch {
    // Fall back to semicolon-separated coordinate pairs.
  }

  return trimmed.split(";").flatMap((pair) => {
    const [latValue, lngValue] = pair
      .split(/[|\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const lat = Number(latValue);
    const lng = Number(lngValue);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [];
  });
}

export function ZonesScreen(props: Props) {
  const {
    activeSchoolId,
    zoneBusy,
    zoneDrafts,
    setZoneDrafts,
    setActiveZoneDraftId,
    selectedZoneDraft,
    zoneMapPolygons,
    mappedZoneCount,
    createEmptyZoneDraft,
    refreshSchoolZones,
    handleSaveZones,
    handleZonePointAdd,
    handleZonePointInsert,
    handleZonePointMove,
  } = props;
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingImportedZones, setPendingImportedZones] = useState<ZoneDraft[]>([]);
  const [importMessage, setImportMessage] = useState("");

  function openZoneModal(zoneId: string) {
    setActiveZoneDraftId(zoneId);
    setIsZoneModalOpen(true);
  }

  function addZone() {
    const draft = createEmptyZoneDraft("no_go");
    setZoneDrafts((current) => [...current, draft]);
    openZoneModal(draft.id);
  }

  function patchZone(id: string, patch: Partial<ZoneDraft>) {
    setZoneDrafts((current) =>
      current.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
    );
  }

  function patchPunishmentRule(
    zone: ZoneDraft,
    index: number,
    patch: Partial<SchoolZonePunishmentRule>,
  ) {
    const policy = normalizePunishmentPolicy(zone.punishment_policy);
    patchZone(zone.id, {
      punishment_policy: {
        rules: policy.rules.map((rule, ruleIndex) =>
          ruleIndex === index ? normalizePunishmentRule({ ...rule, ...patch }, ruleIndex) : rule,
        ),
      },
    });
  }

  function addPunishmentRule(zone: ZoneDraft) {
    const policy = normalizePunishmentPolicy(zone.punishment_policy);
    const lastRule = policy.rules[policy.rules.length - 1];
    const nextMin = Math.max(
      1,
      (lastRule?.max_count ?? lastRule?.min_count ?? policy.rules.length) + 1,
    );
    patchZone(zone.id, {
      punishment_policy: {
        rules: [
          ...policy.rules,
          {
            min_count: nextMin,
            max_count: null,
            points_lost: lastRule?.points_lost ?? 5,
            notify_student: true,
            dashboard_review_required: false,
            punishment_action: "points",
          },
        ],
      },
    });
  }

  function removePunishmentRule(zone: ZoneDraft, index: number) {
    const policy = normalizePunishmentPolicy(zone.punishment_policy);
    if (policy.rules.length <= 1) {
      return;
    }
    patchZone(zone.id, {
      punishment_policy: {
        rules: policy.rules.filter((_, ruleIndex) => ruleIndex !== index),
      },
    });
  }

  async function saveModalZone() {
    const didSave = await handleSaveZones(zoneDrafts);
    if (didSave) {
      setIsZoneModalOpen(false);
    }
  }

  async function removeModalZone(targetZone: ZoneDraft) {
    const nextZoneDrafts = zoneDrafts.filter((zone) => zone.id !== targetZone.id);
    const didSave = await handleSaveZones(nextZoneDrafts);
    if (didSave) {
      setIsZoneModalOpen(false);
    }
  }

  function downloadZonesCsv() {
    const rows = zoneDrafts.map(
      (zone) =>
        [
          zone.zone_uuid,
          zone.title,
          zone.description,
          zone.zone_type,
          zone.speed_limit_mph,
          JSON.stringify(zone.polygon),
          JSON.stringify(normalizePunishmentPolicy(zone.punishment_policy)),
        ] satisfies CsvCell[],
    );

    downloadCsv(
      sanitizeCsvFilename(`${activeSchoolId || "school"}-zones`, "zones"),
      [zoneCsvColumns, ...rows],
    );
  }

  function openImportModal() {
    setPendingImportedZones([]);
    setImportMessage("");
    setIsImportModalOpen(true);
  }

  async function handleZoneCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const rows = csvRowsToObjects(parseCsvRows(await file.text()));
    const imported = rows
      .map((row) => {
        const zoneType = normalizeZoneType(row.zone_type ?? row.type ?? "");
        return {
          ...createEmptyZoneDraft(zoneType),
          title: row.title ?? row.name ?? "",
          description: row.description ?? "",
          zone_type: zoneType,
          speed_limit_mph:
            zoneType === "speed_limit"
              ? row.speed_limit_mph ?? row.speed_limit ?? "15"
              : "",
          polygon: parsePolygonValue(row.polygon ?? row.points ?? ""),
          punishment_policy: normalizePunishmentPolicy(
            row.punishment_policy ?? row.policy ?? "",
          ),
        };
      })
      .filter(
        (zone) =>
          zone.title.trim() ||
          zone.description.trim() ||
          zone.polygon.length > 0,
      );

    if (imported.length === 0) {
      setImportMessage("No zone rows were found in that CSV.");
      setPendingImportedZones([]);
      return;
    }

    setPendingImportedZones(imported);
    setImportMessage(
      `Loaded ${imported.length} zone${imported.length === 1 ? "" : "s"} from the CSV.`,
    );
  }

  async function applyZoneImport() {
    if (pendingImportedZones.length === 0) {
      setImportMessage("Choose a CSV with at least one valid zone row first.");
      return;
    }

    const didSave = await handleSaveZones([...zoneDrafts, ...pendingImportedZones]);
    if (didSave) {
      setIsImportModalOpen(false);
      setPendingImportedZones([]);
      setImportMessage("");
    }
  }

  const noGoZoneCount = zoneDrafts.filter(
    (zone) => zone.zone_type === "no_go",
  ).length;
  const speedZoneCount = zoneDrafts.filter(
    (zone) => zone.zone_type === "speed_limit",
  ).length;
  const selectedPolygon = selectedZoneDraft
    ? (zoneMapPolygons.find(
        (polygon) =>
          polygon.id === (selectedZoneDraft.zone_uuid || selectedZoneDraft.id),
      ) ?? null)
    : null;
  const selectedPunishmentRules = selectedZoneDraft
    ? normalizePunishmentPolicy(selectedZoneDraft.punishment_policy).rules
    : [];

  return (
    <section className="panel management-page">
      <div className="panel-header">
        <div>
          <p className="eyebrow">School Zones</p>
          <h2>No-go and speed limit zones</h2>
        </div>
        <div className="management-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={downloadZonesCsv}
            disabled={zoneDrafts.length === 0}
          >
            Download CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={openImportModal}
            disabled={!activeSchoolId || zoneBusy}
          >
            Upload CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSchoolZones()}
            disabled={zoneBusy || !activeSchoolId}
          >
            Reload
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={addZone}
            disabled={!activeSchoolId}
            aria-label="Add zone"
          >
            +
          </button>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {importMessage ? <p className="empty-state">{importMessage}</p> : null}

      {activeSchoolId ? (
        <>
          <div className="management-summary-grid">
            <div className="reports-kpi">
              <span>Total Zones</span>
              <strong>{zoneDrafts.length}</strong>
            </div>
            <div className="reports-kpi">
              <span>Mapped</span>
              <strong>{mappedZoneCount}</strong>
            </div>
            <div className="reports-kpi">
              <span>No-go</span>
              <strong>{noGoZoneCount}</strong>
            </div>
            <div className="reports-kpi">
              <span>Speed</span>
              <strong>{speedZoneCount}</strong>
            </div>
          </div>

          <div className="management-map-card">
            <div className="data-section-header">
              <div>
                <h3>Zone map</h3>
                <p className="muted-text">
                  Polygons show configured no-go and speed-limit areas.
                </p>
              </div>
              <span>{mappedZoneCount} mapped</span>
            </div>
            <SchoolZonesMap polygons={zoneMapPolygons} />
          </div>

          <div className="management-table-card">
            <div className="data-section-header">
              <div>
                <h3>Created zones</h3>
                <p className="muted-text">
                  Open a row to edit its rule, speed limit, or polygon.
                </p>
              </div>
            </div>

            {zoneDrafts.length === 0 ? (
              <p className="empty-state">No zones have been created yet.</p>
            ) : (
              <div className="management-table-scroll">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Speed</th>
                      <th>Vertices</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneDrafts.map((zone, index) => {
                      const isMapped = zone.polygon.length >= 3;

                      return (
                        <tr key={zone.id}>
                          <td>
                            <strong>
                              {zone.title.trim() || `Zone ${index + 1}`}
                            </strong>
                            <span>{zone.description.trim() || "No description"}</span>
                          </td>
                          <td>{ZONE_TYPE_LABELS[zone.zone_type]}</td>
                          <td>
                            {zone.zone_type === "speed_limit"
                              ? `${zone.speed_limit_mph || "15"} mph`
                              : "-"}
                          </td>
                          <td>{zone.polygon.length}</td>
                          <td>
                            <span
                              className={`student-badge ${
                                isMapped
                                  ? "student-badge-highlight"
                                  : "student-badge-muted"
                              }`}
                            >
                              {isMapped ? "Mapped" : "Needs shape"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => openZoneModal(zone.id)}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {isImportModalOpen ? (
        <div
          className="management-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Upload zones CSV"
          onClick={() => setIsImportModalOpen(false)}
        >
          <div
            className="management-modal-sheet management-import-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="management-modal-header">
              <div>
                <p className="eyebrow">CSV upload</p>
                <h3>Import zones</h3>
              </div>
              <button
                className="text-button management-modal-close"
                type="button"
                onClick={() => setIsImportModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="management-import-body">
              <div className="management-import-instructions">
                <h4>Required CSV headers</h4>
                <code>title,description,zone_type,speed_limit_mph,polygon</code>
                <p className="muted-text">
                  Use <code>no_go</code> or <code>speed_limit</code> for zone
                  type. Polygon can be JSON like{" "}
                  <code>[{"{\"lat\":42,\"lng\":-83}"}]</code> or
                  semicolon-separated coordinate pairs.
                </p>
              </div>

              <label className="secondary-button challenge-upload-button management-import-upload">
                <input
                  className="challenge-upload-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handleZoneCsvUpload(event)}
                  disabled={zoneBusy}
                />
                Choose CSV
              </label>

              {importMessage ? <p className="empty-state">{importMessage}</p> : null}

              {pendingImportedZones.length > 0 ? (
                <div className="management-table-scroll">
                  <table className="management-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Speed</th>
                        <th>Vertices</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingImportedZones.slice(0, 8).map((zone) => (
                        <tr key={zone.id}>
                          <td>
                            <strong>{zone.title || "Untitled zone"}</strong>
                            <span>{zone.description || "No description"}</span>
                          </td>
                          <td>{ZONE_TYPE_LABELS[zone.zone_type]}</td>
                          <td>
                            {zone.zone_type === "speed_limit"
                              ? `${zone.speed_limit_mph || "15"} mph`
                              : "-"}
                          </td>
                          <td>{zone.polygon.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={zoneBusy}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void applyZoneImport()}
                  disabled={zoneBusy || pendingImportedZones.length === 0}
                >
                  {zoneBusy ? "Saving..." : "Done"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isZoneModalOpen && selectedZoneDraft ? (
        <div
          className="management-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit zone"
          onClick={() => setIsZoneModalOpen(false)}
        >
          <div
            className="management-modal-sheet zone-editor-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="management-modal-header">
              <div>
                <p className="eyebrow">Zone editor</p>
                <h3>{selectedZoneDraft.title.trim() || "New zone"}</h3>
              </div>
              <button
                className="text-button management-modal-close"
                type="button"
                onClick={() => setIsZoneModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="management-modal-grid">
              <div className="management-modal-map">
                <div className="form-actions management-map-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      patchZone(selectedZoneDraft.id, {
                        polygon: selectedZoneDraft.polygon.slice(0, -1),
                      })
                    }
                    disabled={selectedZoneDraft.polygon.length === 0}
                  >
                    Undo Point
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      patchZone(selectedZoneDraft.id, { polygon: [] })
                    }
                    disabled={selectedZoneDraft.polygon.length === 0}
                  >
                    Clear Shape
                  </button>
                </div>
                <SchoolZoneMapEditor
                  disabled={false}
                  onAddPoint={handleZonePointAdd}
                  onInsertPoint={handleZonePointInsert}
                  onMovePoint={handleZonePointMove}
                  polygons={zoneMapPolygons}
                  selectedPolygon={selectedPolygon}
                />
              </div>

              <div className="data-section">
                <div className="form-grid">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={selectedZoneDraft.title}
                      onChange={(event) =>
                        patchZone(selectedZoneDraft.id, {
                          title: event.target.value,
                        })
                      }
                      placeholder="North Mall No-go Zone"
                    />
                  </label>
                  <label className="field">
                    <span>Zone Type</span>
                    <select
                      value={selectedZoneDraft.zone_type}
                      onChange={(event) => {
                        const zoneType = event.target
                          .value as ZoneDraft["zone_type"];
                        patchZone(selectedZoneDraft.id, {
                          zone_type: zoneType,
                          speed_limit_mph:
                            zoneType === "speed_limit"
                              ? selectedZoneDraft.speed_limit_mph || "15"
                              : "",
                        });
                      }}
                    >
                      <option value="no_go">No-go zone</option>
                      <option value="speed_limit">Speed limit zone</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Speed Limit (mph)</span>
                    <input
                      disabled={selectedZoneDraft.zone_type !== "speed_limit"}
                      min={1}
                      step={1}
                      type="number"
                      value={selectedZoneDraft.speed_limit_mph}
                      onChange={(event) =>
                        patchZone(selectedZoneDraft.id, {
                          speed_limit_mph: event.target.value,
                        })
                      }
                      placeholder="15"
                    />
                  </label>
                  <label className="field">
                    <span>Vertices</span>
                    <input
                      disabled
                      value={String(selectedZoneDraft.polygon.length)}
                      placeholder="0"
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Description</span>
                    <textarea
                      value={selectedZoneDraft.description}
                      onChange={(event) =>
                        patchZone(selectedZoneDraft.id, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Explain why riders lose points or slow down here."
                      rows={3}
                    />
                  </label>
                  <div className="field field-span-2">
                    <span>Punishment rules</span>
                    <div className="management-table-scroll">
                      <table className="management-table">
                        <thead>
                          <tr>
                            <th>From</th>
                            <th>Through</th>
                            <th>Action</th>
                            <th>Points</th>
                            <th>Notify</th>
                            <th>Review</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPunishmentRules.map((rule, index) => (
                            <tr key={`${rule.min_count}-${index}`}>
                              <td>
                                <input
                                  min={1}
                                  step={1}
                                  type="number"
                                  value={rule.min_count}
                                  onChange={(event) =>
                                    patchPunishmentRule(selectedZoneDraft, index, {
                                      min_count: Number(event.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  min={1}
                                  step={1}
                                  type="number"
                                  value={rule.max_count ?? ""}
                                  placeholder="No limit"
                                  onChange={(event) =>
                                    patchPunishmentRule(selectedZoneDraft, index, {
                                      max_count: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={rule.punishment_action}
                                  onChange={(event) =>
                                    patchPunishmentRule(selectedZoneDraft, index, {
                                      punishment_action: event.target.value,
                                    })
                                  }
                                >
                                  {Object.entries(PUNISHMENT_ACTION_LABELS).map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </td>
                              <td>
                                <input
                                  min={0}
                                  step={1}
                                  type="number"
                                  value={rule.points_lost}
                                  onChange={(event) =>
                                    patchPunishmentRule(selectedZoneDraft, index, {
                                      points_lost: Number(event.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={rule.notify_student}
                                  onChange={(event) =>
                                    patchPunishmentRule(selectedZoneDraft, index, {
                                      notify_student: event.target.checked,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={rule.dashboard_review_required}
                                  onChange={(event) =>
                                    patchPunishmentRule(selectedZoneDraft, index, {
                                      dashboard_review_required: event.target.checked,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() =>
                                    removePunishmentRule(selectedZoneDraft, index)
                                  }
                                  disabled={selectedPunishmentRules.length <= 1}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="form-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => addPunishmentRule(selectedZoneDraft)}
                      >
                        Add rule
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          patchZone(selectedZoneDraft.id, {
                            punishment_policy: createDefaultPunishmentPolicy(),
                          })
                        }
                      >
                        Reset template
                      </button>
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void removeModalZone(selectedZoneDraft)}
                    disabled={zoneBusy}
                  >
                    Remove
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void saveModalZone()}
                    disabled={zoneBusy || !activeSchoolId}
                  >
                    {zoneBusy ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
