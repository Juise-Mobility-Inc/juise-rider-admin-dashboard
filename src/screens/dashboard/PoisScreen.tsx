import type { Dispatch, SetStateAction } from "react";

import {
  PackLocationPicker,
  PackLocationsMap,
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

type DetailRowComponent = React.ComponentType<{
  label: string;
  value: string;
}>;

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
  DetailRow: DetailRowComponent;
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
    DetailRow,
  } = props;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">School Points of Interest</p>
          <h2>Manage school ride bonus checkpoints</h2>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              setPoiDrafts((current) => [...current, createEmptyPOIDraft()])
            }
            disabled={!activeSchoolId}
          >
            Add POI
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
            onClick={() => void handleSavePOIs()}
            disabled={poiBusy || !activeSchoolId}
          >
            Save POIs
          </button>
        </div>
      </div>

      {poiBusy ? <p className="muted-text">Syncing school POIs…</p> : null}

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {activeSchoolId ? (
        <div className="poi-layout">
          <div className="poi-map-grid">
            <div className="map-card">
              <div className="data-section-header">
                <h3>POI map editor</h3>
                <span>
                  {selectedPoiDraft
                    ? selectedPoiDraft.title.trim() || "Selected POI"
                    : "No POI selected"}
                </span>
              </div>
              {poiDrafts.length === 0 ? (
                <p className="empty-state">
                  Add a point of interest to place it on the map.
                </p>
              ) : (
                <>
                  <PackLocationPicker
                    disabled={!selectedPoiDraft}
                    onChange={handlePoiLocationSelect}
                    value={selectedPoiLocation}
                  />
                  <p className="muted-text">
                    Choose a POI row, then click on the map to place or move
                    its checkpoint pin.
                  </p>
                </>
              )}
            </div>

            <div className="map-card">
              <div className="data-section-header">
                <h3>School POI coverage</h3>
                <span>{poiMapMarkers.length} mapped pins</span>
              </div>
              <PackLocationsMap markers={poiMapMarkers} />
              <div className="detail-grid">
                <DetailRow label="Active POIs" value={String(poiDrafts.length)} />
                <DetailRow
                  label="Mapped Pins"
                  value={String(poiMapMarkers.length)}
                />
                <DetailRow
                  label="Potential Bonus"
                  value={`${totalPOIBonusPoints} pts`}
                />
                <DetailRow
                  label="Unmapped"
                  value={String(poiDrafts.length - poiMapMarkers.length)}
                />
              </div>
            </div>
          </div>

          <div className="poi-list">
            {poiDrafts.length === 0 ? (
              <p className="empty-state">
                No POIs configured yet for this school.
              </p>
            ) : null}
            {poiDrafts.map((poi, index) => (
              <div
                className={`poi-row ${
                  poi.id === activePoiDraftId ? "poi-row-active" : ""
                }`}
                key={poi.id}
              >
                <div className="poi-row-header">
                  <div>
                    <p className="eyebrow">POI {index + 1}</p>
                    <h3>{poi.title.trim() || "Untitled POI"}</h3>
                  </div>
                  <div className="poi-row-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setActivePoiDraftId(poi.id)}
                    >
                      {poi.id === activePoiDraftId
                        ? "Editing on Map"
                        : "Pick on Map"}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() =>
                        setPoiDrafts((current) =>
                          current.filter((item) => item.id !== poi.id),
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
                      value={poi.title}
                      onChange={(event) =>
                        setPoiDrafts((current) =>
                          current.map((item) =>
                            item.id === poi.id
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
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
                      value={poi.bonus_points}
                      onChange={(event) =>
                        setPoiDrafts((current) =>
                          current.map((item) =>
                            item.id === poi.id
                              ? { ...item, bonus_points: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="25"
                    />
                  </label>
                  <label className="field">
                    <span>Latitude</span>
                    <input
                      value={poi.lat}
                      onChange={(event) =>
                        setPoiDrafts((current) =>
                          current.map((item) =>
                            item.id === poi.id
                              ? { ...item, lat: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="30.284900"
                    />
                  </label>
                  <label className="field">
                    <span>Longitude</span>
                    <input
                      value={poi.lng}
                      onChange={(event) =>
                        setPoiDrafts((current) =>
                          current.map((item) =>
                            item.id === poi.id
                              ? { ...item, lng: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="-97.734100"
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Description</span>
                    <textarea
                      value={poi.description}
                      onChange={(event) =>
                        setPoiDrafts((current) =>
                          current.map((item) =>
                            item.id === poi.id
                              ? {
                                  ...item,
                                  description: event.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Give riders a quick reason this checkpoint matters."
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
