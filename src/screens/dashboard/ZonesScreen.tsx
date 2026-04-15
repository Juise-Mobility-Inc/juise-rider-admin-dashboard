import type { Dispatch, SetStateAction } from "react";

import {
  SchoolZoneMapEditor,
  type SchoolZoneMapPolygon,
} from "../../components/SchoolZoneMapEditor";
import type { PackMapPoint } from "../../components/PackLocationPicker";

type ZoneDraft = {
  id: string;
  zone_uuid: string;
  title: string;
  description: string;
  zone_type: "no_go" | "speed_limit";
  speed_limit_mph: string;
  polygon: PackMapPoint[];
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
  handleSaveZones: () => Promise<void>;
  handleZonePointAdd: (point: PackMapPoint) => void;
  handleZonePointInsert: (index: number, point: PackMapPoint) => void;
  handleZonePointMove: (index: number, point: PackMapPoint) => void;
  DetailRow?: React.ComponentType<{ label: string; value: string }>;
};

const ZONE_TYPE_LABELS: Record<ZoneDraft["zone_type"], string> = {
  no_go: "No-Go",
  speed_limit: "Speed",
};

export function ZonesScreen(props: Props) {
  const {
    activeSchoolId,
    zoneBusy,
    zoneDrafts,
    setZoneDrafts,
    activeZoneDraftId,
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

  function addZone(type: ZoneDraft["zone_type"]) {
    const draft = createEmptyZoneDraft(type);
    setZoneDrafts((cur) => [...cur, draft]);
    setActiveZoneDraftId(draft.id);
  }

  function patchZone(id: string, patch: Partial<ZoneDraft>) {
    setZoneDrafts((cur) =>
      cur.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">School Zones</p>
          <h2>No-go and speed limit zones</h2>
        </div>
        <div className="form-actions">
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
            onClick={() => void handleSaveZones()}
            disabled={zoneBusy || !activeSchoolId}
          >
            {zoneBusy ? "Saving…" : "Save Zones"}
          </button>
        </div>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : (
        <div className="zone-master-layout">
          {/* ── LEFT: zone list ───────────────────── */}
          <aside className="zone-sidebar">
            <div className="zone-sidebar-header">
              <span className="zone-sidebar-title">
                Zones
                {zoneDrafts.length > 0 && (
                  <span className="zone-sidebar-count">{zoneDrafts.length}</span>
                )}
              </span>
              <div className="zone-add-actions">
                <button
                  className="zone-add-btn"
                  type="button"
                  onClick={() => addZone("no_go")}
                  title="Add No-Go Zone"
                >
                  + No-Go
                </button>
                <button
                  className="zone-add-btn"
                  type="button"
                  onClick={() => addZone("speed_limit")}
                  title="Add Speed Limit Zone"
                >
                  + Speed
                </button>
              </div>
            </div>

            {zoneDrafts.length === 0 ? (
              <div className="zone-sidebar-empty">
                <p>No zones yet.</p>
                <p className="muted-text">
                  Add a no-go or speed limit zone to start drawing polygons on
                  the map.
                </p>
              </div>
            ) : (
              <ul className="zone-sidebar-list">
                {zoneDrafts.map((zone, index) => {
                  const isActive = zone.id === activeZoneDraftId;
                  const isMapped = zone.polygon.length >= 3;
                  return (
                    <li
                      key={zone.id}
                      className={`zone-list-item${isActive ? " zone-list-item-active" : ""}`}
                      onClick={() => setActiveZoneDraftId(zone.id)}
                    >
                      <div className="zone-list-item-top">
                        <span
                          className={`zone-type-badge zone-type-badge-${zone.zone_type}`}
                        >
                          {ZONE_TYPE_LABELS[zone.zone_type]}
                        </span>
                        <span className="zone-vertex-chip">
                          {zone.polygon.length} pts
                        </span>
                        {isMapped && (
                          <span className="zone-mapped-chip">Mapped</span>
                        )}
                      </div>
                      <p className="zone-list-item-name">
                        {zone.title.trim() || `Zone ${index + 1}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="zone-sidebar-stats">
              <div className="zone-stat">
                <span className="zone-stat-value">{zoneDrafts.length}</span>
                <span className="zone-stat-label">Total</span>
              </div>
              <div className="zone-stat">
                <span className="zone-stat-value">{mappedZoneCount}</span>
                <span className="zone-stat-label">Mapped</span>
              </div>
              <div className="zone-stat">
                <span className="zone-stat-value">
                  {zoneDrafts.filter((z) => z.zone_type === "no_go").length}
                </span>
                <span className="zone-stat-label">No-Go</span>
              </div>
              <div className="zone-stat">
                <span className="zone-stat-value">
                  {
                    zoneDrafts.filter((z) => z.zone_type === "speed_limit")
                      .length
                  }
                </span>
                <span className="zone-stat-label">Speed</span>
              </div>
            </div>
          </aside>

          {/* ── RIGHT: map + selected zone form ───── */}
          <div className="zone-detail-panel">
            {zoneDrafts.length === 0 ? (
              <div className="zone-detail-empty">
                <span className="zone-detail-empty-icon">🗺️</span>
                <p>No zones to display</p>
                <p className="muted-text">
                  Add a zone using the buttons on the left and then click on the
                  map to draw its boundary polygon.
                </p>
                <div className="form-actions" style={{ justifyContent: "center" }}>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => addZone("no_go")}
                  >
                    + Add No-Go Zone
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => addZone("speed_limit")}
                  >
                    + Add Speed Zone
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Map always shows ALL zones */}
                <div className="zone-map-card">
                  <div className="zone-map-header">
                    <div>
                      <p className="eyebrow">Polygon editor</p>
                      <h3>
                        {selectedZoneDraft
                          ? selectedZoneDraft.title.trim() ||
                            "Editing selected zone"
                          : "Select a zone from the list to edit it"}
                      </h3>
                    </div>
                    {selectedZoneDraft && (
                      <div className="form-actions">
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
                    )}
                  </div>

                  <SchoolZoneMapEditor
                    disabled={!selectedZoneDraft}
                    onAddPoint={handleZonePointAdd}
                    onInsertPoint={handleZonePointInsert}
                    onMovePoint={handleZonePointMove}
                    polygons={zoneMapPolygons}
                    selectedPolygon={
                      selectedZoneDraft
                        ? (zoneMapPolygons.find(
                            (p) =>
                              p.id ===
                              (selectedZoneDraft.zone_uuid ||
                                selectedZoneDraft.id),
                          ) ?? null)
                        : null
                    }
                  />

                  <p className="muted-text" style={{ marginTop: 8 }}>
                    {selectedZoneDraft
                      ? "Click to add vertices. Drag existing points to reshape. Tap midpoint handles to insert a new point."
                      : "All existing zones are shown above. Select one from the list on the left to start editing."}
                  </p>
                </div>

                {/* Selected zone form */}
                {selectedZoneDraft ? (
                  <div className="zone-form-card">
                    <div className="zone-form-header">
                      <div>
                        <p className="eyebrow">Zone details</p>
                        <h3>
                          {selectedZoneDraft.title.trim() || "Untitled zone"}
                        </h3>
                      </div>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() =>
                          setZoneDrafts((cur) =>
                            cur.filter((z) => z.id !== selectedZoneDraft.id),
                          )
                        }
                      >
                        Remove Zone
                      </button>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Title</span>
                        <input
                          value={selectedZoneDraft.title}
                          onChange={(e) =>
                            patchZone(selectedZoneDraft.id, {
                              title: e.target.value,
                            })
                          }
                          placeholder="North Mall No-Go Zone"
                        />
                      </label>

                      <label className="field">
                        <span>Zone Type</span>
                        <select
                          value={selectedZoneDraft.zone_type}
                          onChange={(e) =>
                            patchZone(selectedZoneDraft.id, {
                              zone_type: e.target.value as ZoneDraft["zone_type"],
                              speed_limit_mph:
                                e.target.value === "speed_limit"
                                  ? selectedZoneDraft.speed_limit_mph || "15"
                                  : "",
                            })
                          }
                        >
                          <option value="no_go">No-go zone</option>
                          <option value="speed_limit">Speed limit zone</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Speed Limit (mph)</span>
                        <input
                          disabled={
                            selectedZoneDraft.zone_type !== "speed_limit"
                          }
                          min={1}
                          step={1}
                          type="number"
                          value={selectedZoneDraft.speed_limit_mph}
                          onChange={(e) =>
                            patchZone(selectedZoneDraft.id, {
                              speed_limit_mph: e.target.value,
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
                          onChange={(e) =>
                            patchZone(selectedZoneDraft.id, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Explain why riders lose points or slow down here."
                          rows={3}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="zone-select-prompt">
                    <p>
                      ← Select a zone from the list to edit its details and draw
                      its boundary on the map above.
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
