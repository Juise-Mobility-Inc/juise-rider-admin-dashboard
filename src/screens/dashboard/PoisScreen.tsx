import type { Dispatch, SetStateAction } from "react";

import {
  PackLocationPicker,
  type PackMapMarker,
  type PackMapPoint,
} from "../../components/PackLocationPicker";

type POIDraft = {
  id: string;
  poi_uuid: string;
  title: string;
  description: string;
  lat: string;
  lng: string;
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
  handleSavePOIs: () => Promise<void>;
  handlePoiLocationSelect: (point: PackMapPoint) => void;
  DetailRow?: React.ComponentType<{ label: string; value: string }>;
};

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
  } = props;

  function addPoi() {
    const draft = createEmptyPOIDraft();
    setPoiDrafts((cur) => [...cur, draft]);
    setActivePoiDraftId(draft.id);
  }

  function patchPoi(id: string, patch: Partial<POIDraft>) {
    setPoiDrafts((cur) =>
      cur.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  const mappedCount = poiMapMarkers.length;

  const otherMarkers: PackMapMarker[] = selectedPoiDraft
    ? poiMapMarkers.filter(
        (m) =>
          m.id !== selectedPoiDraft.poi_uuid &&
          m.id !== selectedPoiDraft.id,
      )
    : poiMapMarkers;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Points of Interest</p>
          <h2>Bonus ride checkpoints</h2>
        </div>
        <div className="form-actions">
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
            onClick={() => void handleSavePOIs()}
            disabled={poiBusy || !activeSchoolId}
          >
            {poiBusy ? "Saving…" : "Save POIs"}
          </button>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : (
        <div className="poi-master-layout">
          {/* ── LEFT: POI list ─────────────────────── */}
          <aside className="poi-sidebar">
            <div className="poi-sidebar-header">
              <span className="poi-sidebar-title">
                POIs
                {poiDrafts.length > 0 && (
                  <span className="poi-sidebar-count">{poiDrafts.length}</span>
                )}
              </span>
              <button
                className="poi-add-btn"
                type="button"
                onClick={addPoi}
                disabled={!activeSchoolId}
              >
                + Add POI
              </button>
            </div>

            {poiDrafts.length === 0 ? (
              <div className="poi-sidebar-empty">
                <p>No POIs yet.</p>
                <p className="muted-text">
                  Add a checkpoint and click the map to place its pin.
                </p>
              </div>
            ) : (
              <ul className="poi-sidebar-list">
                {poiDrafts.map((poi, index) => {
                  const isActive = poi.id === activePoiDraftId;
                  const isMapped =
                    (poi.lat !== "" && poi.lng !== "") ||
                    poiMapMarkers.some(
                      (m) => m.id === poi.poi_uuid || m.id === poi.id,
                    );
                  const pts = poi.bonus_points
                    ? Number(poi.bonus_points)
                    : null;
                  return (
                    <li
                      key={poi.id}
                      className={`poi-list-item${isActive ? " poi-list-item-active" : ""}`}
                      onClick={() => setActivePoiDraftId(poi.id)}
                    >
                      <div className="poi-list-item-top">
                        <span className="poi-index-chip">#{index + 1}</span>
                        {pts !== null && pts > 0 && (
                          <span className="poi-points-chip">+{pts} pts</span>
                        )}
                        <span
                          className={`poi-pin-badge ${isMapped ? "poi-pin-badge-mapped" : "poi-pin-badge-unmapped"}`}
                        >
                          {isMapped ? "Pinned" : "Unplaced"}
                        </span>
                      </div>
                      <p className="poi-list-item-name">
                        {poi.title.trim() || `POI ${index + 1}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="poi-sidebar-stats">
              <div className="poi-stat">
                <span className="poi-stat-value">{poiDrafts.length}</span>
                <span className="poi-stat-label">Total</span>
              </div>
              <div className="poi-stat">
                <span className="poi-stat-value">{mappedCount}</span>
                <span className="poi-stat-label">Pinned</span>
              </div>
              <div className="poi-stat">
                <span className="poi-stat-value">{totalPOIBonusPoints}</span>
                <span className="poi-stat-label">Bonus pts</span>
              </div>
            </div>
          </aside>

          {/* ── RIGHT: map + selected POI form ──────── */}
          <div className="poi-detail-panel">
            {poiDrafts.length === 0 ? (
              <div className="poi-detail-empty">
                <span className="poi-detail-empty-icon">📍</span>
                <p>No checkpoints to display</p>
                <p className="muted-text">
                  Add a POI with the button on the left, then click on the map
                  to drop its pin.
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={addPoi}
                  style={{ marginTop: 8 }}
                >
                  + Add POI
                </button>
              </div>
            ) : (
              <>
                {/* Map — always shows all pins; active pin is the gold one */}
                <div className="poi-map-card">
                  <div className="poi-map-header">
                    <div>
                      <p className="eyebrow">Pin editor</p>
                      <h3>
                        {selectedPoiDraft
                          ? selectedPoiDraft.title.trim() ||
                            "Placing selected POI"
                          : "Select a POI to place its pin"}
                      </h3>
                    </div>
                    <div className="poi-map-legend">
                      <span className="poi-legend-dot poi-legend-dot-active" />
                      <span className="poi-legend-label">Selected</span>
                      <span className="poi-legend-dot poi-legend-dot-other" />
                      <span className="poi-legend-label">Others</span>
                    </div>
                  </div>

                  <PackLocationPicker
                    disabled={!selectedPoiDraft}
                    onChange={handlePoiLocationSelect}
                    value={selectedPoiLocation}
                    otherMarkers={otherMarkers}
                  />
                </div>

                {/* Selected POI form */}
                {selectedPoiDraft ? (
                  <div className="poi-form-card">
                    <div className="poi-form-header">
                      <div>
                        <p className="eyebrow">Checkpoint details</p>
                        <h3>
                          {selectedPoiDraft.title.trim() || "Untitled POI"}
                        </h3>
                      </div>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() =>
                          setPoiDrafts((cur) =>
                            cur.filter((p) => p.id !== selectedPoiDraft.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Title</span>
                        <input
                          value={selectedPoiDraft.title}
                          onChange={(e) =>
                            patchPoi(selectedPoiDraft.id, {
                              title: e.target.value,
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
                          onChange={(e) =>
                            patchPoi(selectedPoiDraft.id, {
                              bonus_points: e.target.value,
                            })
                          }
                          placeholder="25"
                        />
                      </label>

                      <label className="field">
                        <span>Latitude</span>
                        <input
                          value={selectedPoiDraft.lat}
                          onChange={(e) =>
                            patchPoi(selectedPoiDraft.id, {
                              lat: e.target.value,
                            })
                          }
                          placeholder="30.284900"
                        />
                      </label>

                      <label className="field">
                        <span>Longitude</span>
                        <input
                          value={selectedPoiDraft.lng}
                          onChange={(e) =>
                            patchPoi(selectedPoiDraft.id, {
                              lng: e.target.value,
                            })
                          }
                          placeholder="-97.734100"
                        />
                      </label>

                      <label className="field field-span-2">
                        <span>Description</span>
                        <textarea
                          value={selectedPoiDraft.description}
                          onChange={(e) =>
                            patchPoi(selectedPoiDraft.id, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Give riders a quick reason this checkpoint matters."
                          rows={3}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="poi-select-prompt">
                    <p>
                      ← Select a checkpoint from the list to edit its details
                      and place its map pin above.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
