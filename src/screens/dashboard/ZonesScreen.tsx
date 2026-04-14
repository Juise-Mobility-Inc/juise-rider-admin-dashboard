import type { Dispatch, SetStateAction } from "react";

import {
  SchoolZoneMapEditor,
  SchoolZonesMap,
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

type DetailRowComponent = React.ComponentType<{
  label: string;
  value: string;
}>;

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
  DetailRow: DetailRowComponent;
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
    DetailRow,
  } = props;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">School Zones</p>
          <h2>Manage no-go and speed limit polygons</h2>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setZoneDrafts((current) => [
                ...current,
                createEmptyZoneDraft("no_go"),
              ])
            }
            disabled={!activeSchoolId}
          >
            Add No-Go Zone
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setZoneDrafts((current) => [
                ...current,
                createEmptyZoneDraft("speed_limit"),
              ])
            }
            disabled={!activeSchoolId}
          >
            Add Speed Zone
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
            onClick={() => void handleSaveZones()}
            disabled={zoneBusy || !activeSchoolId}
          >
            Save Zones
          </button>
        </div>
      </div>

      {zoneBusy ? <p className="muted-text">Syncing school zones…</p> : null}

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {activeSchoolId ? (
        <div className="zone-layout">
          <div className="zone-map-grid">
            <div className="map-card">
              <div className="data-section-header">
                <h3>Zone polygon editor</h3>
                <span>
                  {selectedZoneDraft
                    ? selectedZoneDraft.title.trim() || "Selected zone"
                    : "No zone selected"}
                </span>
              </div>
              {zoneDrafts.length === 0 ? (
                <p className="empty-state">
                  Add a no-go or speed limit zone to begin drawing a polygon.
                </p>
              ) : (
                <>
                  <SchoolZoneMapEditor
                    disabled={!selectedZoneDraft}
                    onAddPoint={handleZonePointAdd}
                    onInsertPoint={handleZonePointInsert}
                    onMovePoint={handleZonePointMove}
                    polygons={zoneMapPolygons}
                    selectedPolygon={
                      selectedZoneDraft
                        ? zoneMapPolygons.find(
                            (polygon) =>
                              polygon.id ===
                              (selectedZoneDraft.zone_uuid || selectedZoneDraft.id),
                          ) ?? null
                        : null
                    }
                  />
                  <p className="muted-text">
                    Choose a zone row, then click to add vertices, drag any
                    existing point to reshape the outline, and tap midpoint
                    handles to insert a new point without redrawing the whole
                    zone.
                  </p>
                </>
              )}
            </div>

            <div className="map-card">
              <div className="data-section-header">
                <h3>School zone coverage</h3>
                <span>{mappedZoneCount} mapped polygons</span>
              </div>
              <SchoolZonesMap polygons={zoneMapPolygons} />
              <div className="detail-grid">
                <DetailRow label="Active Zones" value={String(zoneDrafts.length)} />
                <DetailRow
                  label="Mapped Polygons"
                  value={String(mappedZoneCount)}
                />
                <DetailRow
                  label="No-Go Zones"
                  value={String(
                    zoneDrafts.filter((zone) => zone.zone_type === "no_go").length,
                  )}
                />
                <DetailRow
                  label="Speed Zones"
                  value={String(
                    zoneDrafts.filter((zone) => zone.zone_type === "speed_limit")
                      .length,
                  )}
                />
              </div>
            </div>
          </div>

          <div className="zone-list">
            {zoneDrafts.length === 0 ? (
              <p className="empty-state">
                No school zones configured yet for this school.
              </p>
            ) : null}
            {zoneDrafts.map((zone, index) => (
              <div
                className={`zone-row ${
                  zone.id === activeZoneDraftId ? "zone-row-active" : ""
                }`}
                key={zone.id}
              >
                <div className="zone-row-header">
                  <div>
                    <p className="eyebrow">Zone {index + 1}</p>
                    <h3>{zone.title.trim() || "Untitled zone"}</h3>
                  </div>
                  <div className="zone-row-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setActiveZoneDraftId(zone.id)}
                    >
                      {zone.id === activeZoneDraftId
                        ? "Editing on Map"
                        : "Pick on Map"}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        setZoneDrafts((current) =>
                          current.map((item) =>
                            item.id === zone.id
                              ? { ...item, polygon: item.polygon.slice(0, -1) }
                              : item,
                          ),
                        )
                      }
                      disabled={zone.polygon.length === 0}
                    >
                      Undo Point
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        setZoneDrafts((current) =>
                          current.map((item) =>
                            item.id === zone.id ? { ...item, polygon: [] } : item,
                          ),
                        )
                      }
                      disabled={zone.polygon.length === 0}
                    >
                      Clear Shape
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() =>
                        setZoneDrafts((current) =>
                          current.filter((item) => item.id !== zone.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={zone.title}
                      onChange={(event) =>
                        setZoneDrafts((current) =>
                          current.map((item) =>
                            item.id === zone.id
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="North Mall No-Go Zone"
                    />
                  </label>
                  <label className="field">
                    <span>Zone Type</span>
                    <select
                      value={zone.zone_type}
                      onChange={(event) =>
                        setZoneDrafts((current) =>
                          current.map((item) =>
                            item.id === zone.id
                              ? {
                                  ...item,
                                  zone_type: event.target.value as ZoneDraft["zone_type"],
                                  speed_limit_mph:
                                    event.target.value === "speed_limit"
                                      ? item.speed_limit_mph || "15"
                                      : "",
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="no_go">No-go zone</option>
                      <option value="speed_limit">Speed limit zone</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Speed Limit (mph)</span>
                    <input
                      disabled={zone.zone_type !== "speed_limit"}
                      min={1}
                      step={1}
                      type="number"
                      value={zone.speed_limit_mph}
                      onChange={(event) =>
                        setZoneDrafts((current) =>
                          current.map((item) =>
                            item.id === zone.id
                              ? {
                                  ...item,
                                  speed_limit_mph: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="15"
                    />
                  </label>
                  <label className="field">
                    <span>Vertices</span>
                    <input disabled value={String(zone.polygon.length)} placeholder="0" />
                  </label>
                  <label className="field field-span-2">
                    <span>Description</span>
                    <textarea
                      value={zone.description}
                      onChange={(event) =>
                        setZoneDrafts((current) =>
                          current.map((item) =>
                            item.id === zone.id
                              ? {
                                  ...item,
                                  description: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Explain why riders lose points here."
                      rows={4}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
