import {
  useEffect,
  useState,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  PackLocationPicker,
  PackLocationsMap,
  type PackMapMarker,
  type PackMapPoint,
} from "../../components/PackLocationPicker";
import { visitedPoiIcon } from "../../lib/mapIcons";
import {
  csvRowsToObjects,
  downloadCsv,
  parseCsvRows,
  sanitizeCsvFilename,
  type CsvCell,
} from "../../lib/csv";

type POIDraft = {
  id: string;
  poi_uuid: string;
  title: string;
  description: string;
  lat: string;
  lng: string;
  radius_feet: string;
  bonus_points: string;
};

type Props = {
  activeSchoolId: string;
  poiBusy: boolean;
  poiDrafts: POIDraft[];
  setPoiDrafts: Dispatch<SetStateAction<POIDraft[]>>;
  activePoiDraftId: string;
  setActivePoiDraftId: Dispatch<SetStateAction<string>>;
  selectedPoiDraft: POIDraft | null;
  selectedPoiLocation: PackMapPoint | null;
  poiMapMarkers: PackMapMarker[];
  totalPOIBonusPoints: number;
  createEmptyPOIDraft: () => POIDraft;
  refreshSchoolPOIs: () => Promise<void>;
  handleSavePOIs: (nextPoiDrafts?: POIDraft[]) => Promise<boolean>;
  handlePoiLocationSelect: (point: PackMapPoint) => void;
  poiEditRequestId?: string;
  onPoiEditRequestHandled?: () => void;
  DetailRow?: React.ComponentType<{ label: string; value: string }>;
};

const poiCsvColumns = [
  "poi_uuid",
  "title",
  "description",
  "latitude",
  "longitude",
  "radius_feet",
  "bonus_points",
] as const;

const POI_RADIUS_MIN_FEET = 25;
const POI_RADIUS_MAX_FEET = 16400;

function resolvePoiNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPoiRadiusFeet(value: string) {
  const parsed = resolvePoiNumber(value);
  return parsed === null ? "250 ft" : `${Math.round(parsed).toLocaleString()} ft`;
}

function resolveImportedRadiusFeet(row: Record<string, string>) {
  if (row.radius_feet || row.radius_ft || row.radius) {
    return row.radius_feet ?? row.radius_ft ?? row.radius ?? "250";
  }

  const radiusMeters = Number(row.radius_meters ?? "");
  return Number.isFinite(radiusMeters)
    ? String(Math.round(radiusMeters * 3.28084))
    : "250";
}

export function PoisScreen(props: Props) {
  const {
    activeSchoolId,
    poiBusy,
    poiDrafts,
    setPoiDrafts,
    activePoiDraftId,
    setActivePoiDraftId,
    selectedPoiDraft,
    selectedPoiLocation,
    poiMapMarkers,
    totalPOIBonusPoints,
    createEmptyPOIDraft,
    refreshSchoolPOIs,
    handleSavePOIs,
    handlePoiLocationSelect,
    poiEditRequestId,
    onPoiEditRequestHandled,
  } = props;
  const [isPoiModalOpen, setIsPoiModalOpen] = useState(false);
  const [poiSnapshot, setPoiSnapshot] = useState<POIDraft | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pendingImportedPois, setPendingImportedPois] = useState<POIDraft[]>([]);
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    if (!poiEditRequestId) {
      return;
    }
    const requestedPoi = poiDrafts.find((poi) => poi.id === poiEditRequestId);
    if (requestedPoi) {
      setIsPoiModalOpen(true);
      setPoiSnapshot(requestedPoi);
    }
    onPoiEditRequestHandled?.();
  }, [poiEditRequestId, poiDrafts, onPoiEditRequestHandled]);

  function openPoiModal(poiId: string, snapshot?: POIDraft) {
    setActivePoiDraftId(poiId);
    setIsPoiModalOpen(true);
    setPoiSnapshot(snapshot ?? poiDrafts.find((poi) => poi.id === poiId) ?? null);
  }

  function addPoi() {
    const draft = createEmptyPOIDraft();
    setPoiDrafts((current) => [...current, draft]);
    openPoiModal(draft.id, draft);
  }

  function closePoiModal() {
    setIsPoiModalOpen(false);
  }

  function discardPoiChanges() {
    if (poiSnapshot) {
      patchPoi(poiSnapshot.id, poiSnapshot);
    }
  }

  function patchPoi(id: string, patch: Partial<POIDraft>) {
    setPoiDrafts((current) =>
      current.map((poi) => (poi.id === id ? { ...poi, ...patch } : poi)),
    );
  }

  async function saveModalPoi() {
    const didSave = await handleSavePOIs(poiDrafts);
    if (didSave) {
      setIsPoiModalOpen(false);
    }
  }

  async function removeModalPoi(targetPoi: POIDraft) {
    const nextPoiDrafts = poiDrafts.filter((poi) => poi.id !== targetPoi.id);
    const didSave = await handleSavePOIs(nextPoiDrafts);
    if (didSave) {
      setIsPoiModalOpen(false);
    }
  }

  function downloadPoisCsv() {
    const rows = poiDrafts.map(
      (poi) =>
        [
          poi.poi_uuid,
          poi.title,
          poi.description,
          poi.lat,
          poi.lng,
          poi.radius_feet,
          poi.bonus_points,
        ] satisfies CsvCell[],
    );

    downloadCsv(
      sanitizeCsvFilename(`${activeSchoolId || "school"}-pois`, "pois"),
      [poiCsvColumns, ...rows],
    );
  }

  function openImportModal() {
    setPendingImportedPois([]);
    setImportMessage("");
    setIsImportModalOpen(true);
  }

  async function handlePoiCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const rows = csvRowsToObjects(parseCsvRows(await file.text()));
    const imported = rows
      .map((row) => ({
        ...createEmptyPOIDraft(),
        title: row.title ?? row.name ?? "",
        description: row.description ?? "",
        lat: row.latitude ?? row.lat ?? "",
        lng: row.longitude ?? row.lng ?? "",
        radius_feet: resolveImportedRadiusFeet(row),
        bonus_points: row.bonus_points ?? row.points ?? "0",
      }))
      .filter(
        (poi) =>
          poi.title.trim() ||
          poi.description.trim() ||
          poi.lat.trim() ||
          poi.lng.trim(),
      );

    if (imported.length === 0) {
      setImportMessage("No POI rows were found in that CSV.");
      setPendingImportedPois([]);
      return;
    }

    setPendingImportedPois(imported);
    setImportMessage(
      `Loaded ${imported.length} POI${imported.length === 1 ? "" : "s"} from the CSV.`,
    );
  }

  async function applyPoiImport() {
    if (pendingImportedPois.length === 0) {
      setImportMessage("Choose a CSV with at least one valid POI row first.");
      return;
    }

    const didSave = await handleSavePOIs([...poiDrafts, ...pendingImportedPois]);
    if (didSave) {
      setIsImportModalOpen(false);
      setPendingImportedPois([]);
      setImportMessage("");
    }
  }

  const isPoiDirty =
    !!selectedPoiDraft &&
    !!poiSnapshot &&
    JSON.stringify(selectedPoiDraft) !== JSON.stringify(poiSnapshot);
  const mappedCount = poiMapMarkers.length;
  const otherMarkers: PackMapMarker[] = selectedPoiDraft
    ? poiMapMarkers.filter(
        (marker) =>
          marker.id !== selectedPoiDraft.poi_uuid &&
          marker.id !== selectedPoiDraft.id,
      )
    : poiMapMarkers;

  return (
    <section className="panel management-page">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Points of Interest</p>
          <h2>Bonus ride checkpoints</h2>
        </div>
        <div className="management-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={downloadPoisCsv}
            disabled={poiDrafts.length === 0}
          >
            Download CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={openImportModal}
            disabled={!activeSchoolId || poiBusy}
          >
            Upload CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshSchoolPOIs()}
            disabled={poiBusy || !activeSchoolId}
          >
            Reload
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={addPoi}
            disabled={!activeSchoolId}
            aria-label="Add POI"
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
              <span>Total POIs</span>
              <strong>{poiDrafts.length}</strong>
            </div>
            <div className="reports-kpi">
              <span>Pinned</span>
              <strong>{mappedCount}</strong>
            </div>
            <div className="reports-kpi">
              <span>Bonus Points</span>
              <strong>{totalPOIBonusPoints}</strong>
            </div>
          </div>

          <div className="management-map-card">
            <div className="data-section-header">
              <div>
                <h3>POI map</h3>
                <p className="muted-text">
                  Markers show saved and staged POI locations for this school.
                </p>
              </div>
              <span>{mappedCount} markers</span>
            </div>
            <PackLocationsMap
              markers={poiMapMarkers}
              markerIcon={visitedPoiIcon}
              onEditMarker={(poiId) => openPoiModal(poiId)}
            />
          </div>

          <div className="management-table-card">
            <div className="data-section-header">
              <div>
                <h3>Created POIs</h3>
                <p className="muted-text">
                  Open a row to edit details, move the marker, or remove it.
                </p>
              </div>
            </div>

            {poiDrafts.length === 0 ? (
              <p className="empty-state">No POIs have been created yet.</p>
            ) : (
              <div className="management-table-scroll">
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Bonus</th>
                      <th>Entry radius</th>
                      <th>Latitude</th>
                      <th>Longitude</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poiDrafts.map((poi, index) => {
                      const lat = resolvePoiNumber(poi.lat);
                      const lng = resolvePoiNumber(poi.lng);
                      const isMapped = lat !== null && lng !== null;

                      return (
                        <tr key={poi.id}>
                          <td>
                            <strong>{poi.title.trim() || `POI ${index + 1}`}</strong>
                            <span>{poi.description.trim() || "No description"}</span>
                          </td>
                          <td>{poi.bonus_points || "0"}</td>
                          <td>{formatPoiRadiusFeet(poi.radius_feet)}</td>
                          <td>{lat === null ? "-" : lat.toFixed(6)}</td>
                          <td>{lng === null ? "-" : lng.toFixed(6)}</td>
                          <td>
                            <span
                              className={`student-badge ${
                                isMapped
                                  ? "student-badge-highlight"
                                  : "student-badge-muted"
                              }`}
                            >
                              {isMapped ? "Pinned" : "Unplaced"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => openPoiModal(poi.id)}
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
          aria-label="Upload POIs CSV"
          onClick={() => setIsImportModalOpen(false)}
        >
          <div
            className="management-modal-sheet management-import-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="management-modal-header">
              <div>
                <p className="eyebrow">CSV upload</p>
                <h3>Import POIs</h3>
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
                <code>title,description,latitude,longitude,radius_feet,bonus_points</code>
                <p className="muted-text">
                  Latitude and longitude must be decimal coordinates. Radius is
                  the entry distance in feet, and bonus points should be a whole
                  number greater than or equal to 0.
                </p>
              </div>

              <label className="secondary-button challenge-upload-button management-import-upload">
                <input
                  className="challenge-upload-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => void handlePoiCsvUpload(event)}
                  disabled={poiBusy}
                />
                Choose CSV
              </label>

              {importMessage ? <p className="empty-state">{importMessage}</p> : null}

              {pendingImportedPois.length > 0 ? (
                <div className="management-table-scroll">
                  <table className="management-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Bonus</th>
                        <th>Entry radius</th>
                        <th>Latitude</th>
                        <th>Longitude</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingImportedPois.slice(0, 8).map((poi) => (
                        <tr key={poi.id}>
                          <td>
                            <strong>{poi.title || "Untitled POI"}</strong>
                            <span>{poi.description || "No description"}</span>
                          </td>
                          <td>{poi.bonus_points || "0"}</td>
                          <td>{poi.radius_feet || "250"}</td>
                          <td>{poi.lat || "-"}</td>
                          <td>{poi.lng || "-"}</td>
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
                  disabled={poiBusy}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void applyPoiImport()}
                  disabled={poiBusy || pendingImportedPois.length === 0}
                >
                  {poiBusy ? "Saving..." : "Done"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isPoiModalOpen && selectedPoiDraft ? (
        <div
          className="management-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit POI"
          onClick={closePoiModal}
        >
          <div
            className="management-modal-sheet poi-editor-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="management-modal-header">
              <div>
                <p className="eyebrow">POI editor</p>
                <h3>{selectedPoiDraft.title.trim() || "New POI"}</h3>
              </div>
              <button
                className="text-button management-modal-close"
                type="button"
                onClick={closePoiModal}
              >
                Close
              </button>
            </div>

            <div className="management-modal-grid">
              <div className="management-modal-map">
                <PackLocationPicker
                  disabled={false}
                  onChange={handlePoiLocationSelect}
                  onPlaceSelect={(point, label, detail) => {
                    handlePoiLocationSelect(point);
                    patchPoi(selectedPoiDraft.id, {
                      title: selectedPoiDraft.title.trim()
                        ? selectedPoiDraft.title
                        : label,
                      description: selectedPoiDraft.description.trim()
                        ? selectedPoiDraft.description
                        : (detail ?? selectedPoiDraft.description),
                    });
                  }}
                  value={selectedPoiLocation}
                  radiusMeters={
                    Number.isFinite(Number(selectedPoiDraft.radius_feet))
                      ? Number(selectedPoiDraft.radius_feet) / 3.28084
                      : undefined
                  }
                  otherMarkers={otherMarkers}
                  markerIcon={visitedPoiIcon}
                />
              </div>

              <div className="data-section">
                <div className="form-grid">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={selectedPoiDraft.title}
                      onChange={(event) =>
                        patchPoi(selectedPoiDraft.id, {
                          title: event.target.value,
                        })
                      }
                      placeholder="Main Tower"
                    />
                  </label>
                  <label className="field">
                    <span>Bonus Points</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={selectedPoiDraft.bonus_points}
                      onChange={(event) =>
                        patchPoi(selectedPoiDraft.id, {
                          bonus_points: event.target.value,
                        })
                      }
                      placeholder="25"
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Entry radius</span>
                    <div className="poi-radius-control">
                      <input
                        type="range"
                        min={POI_RADIUS_MIN_FEET}
                        max={POI_RADIUS_MAX_FEET}
                        step={25}
                        value={selectedPoiDraft.radius_feet || "250"}
                        onChange={(event) =>
                          patchPoi(selectedPoiDraft.id, {
                            radius_feet: event.target.value,
                          })
                        }
                      />
                      <input
                        type="number"
                        min={POI_RADIUS_MIN_FEET}
                        max={POI_RADIUS_MAX_FEET}
                        step={25}
                        value={selectedPoiDraft.radius_feet}
                        onChange={(event) =>
                          patchPoi(selectedPoiDraft.id, {
                            radius_feet: event.target.value,
                          })
                        }
                        placeholder="250"
                      />
                      <span>ft</span>
                    </div>
                    <small>
                      Riders earn this POI when their route comes within this
                      distance of the marker.
                    </small>
                  </label>
                  <label className="field">
                    <span>Latitude</span>
                    <input
                      value={selectedPoiDraft.lat}
                      onChange={(event) =>
                        patchPoi(selectedPoiDraft.id, {
                          lat: event.target.value,
                        })
                      }
                      placeholder="30.284900"
                    />
                  </label>
                  <label className="field">
                    <span>Longitude</span>
                    <input
                      value={selectedPoiDraft.lng}
                      onChange={(event) =>
                        patchPoi(selectedPoiDraft.id, {
                          lng: event.target.value,
                        })
                      }
                      placeholder="-97.734100"
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Description</span>
                    <textarea
                      value={selectedPoiDraft.description}
                      onChange={(event) =>
                        patchPoi(selectedPoiDraft.id, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Give riders a quick reason this checkpoint matters."
                      rows={3}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void removeModalPoi(selectedPoiDraft)}
                    disabled={poiBusy}
                  >
                    Remove
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={discardPoiChanges}
                    disabled={poiBusy || !isPoiDirty}
                    title="Discard unsaved changes"
                  >
                    ✕ Discard changes
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void saveModalPoi()}
                    disabled={poiBusy || !activeSchoolId || !isPoiDirty}
                  >
                    {poiBusy ? "Saving..." : "Save"}
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
