import { PackLocationPicker, PackLocationsMap } from "../../components/PackLocationPicker";

type Props = any;

export function PacksScreen(props: Props) {
  const {
    activeSchoolId,
    packBusy,
    packsLoading,
    activePackTab,
    setActivePackTab,
    refreshSchoolPacks,
    schoolPacks,
    existingPackMapMarkers,
    packsWithoutLocationsCount,
    handleCreatePack,
    packDraft,
    setPackDraft,
    schoolDraft,
    packPhotoPreviewUrl,
    EntityImagePreview,
    packPhotoFile,
    handlePackPhotoFileChange,
    setPackPhotoFile,
    setPackPhotoPreviewUrl,
    resetPackCreateForm,
    selectedPackLocation,
    handlePackLocationSelect,
    editingPackId,
    packEditDraft,
    getPackPhotoUrl,
    packEditPhotoPreviewUrl,
    handleCancelPackEdit,
    handleStartEditingPack,
    packEditBusy,
    handleDownloadPackQrCode,
    qrActionTarget,
    handleGeneratePackQrCode,
    handleDownloadPackSpotQrCode,
    handleGeneratePackSpotQrCode,
    handleSavePackEdit,
    setPackEditDraft,
    packEditPhotoFile,
    handlePackEditPhotoFileChange,
    setPackEditPhotoFile,
    setPackEditPhotoPreviewUrl,
    UuidCopyField,
    handleCopyUuid,
  } = props;

  return (
    <section className="panel pack-tabs-panel">
      <div className="panel-header pack-tabs-header">
        <div>
          <p className="eyebrow">Juise Packs</p>
          <h2>School-owned parking packs</h2>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {packBusy ? (
            <span className="muted-text">Creating…</span>
          ) : packsLoading ? (
            <span className="muted-text">Refreshing…</span>
          ) : null}
          {activePackTab === "existing" ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => setActivePackTab("create")}
            >
              + New Pack
            </button>
          ) : null}
          {activePackTab === "existing" ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void refreshSchoolPacks()}
              disabled={packsLoading || !activeSchoolId}
            >
              Refresh
            </button>
          ) : null}
        </div>
      </div>

      <div className="pack-tabs" role="tablist" aria-label="Juise pack sections">
        <button
          className={`pack-tab-button ${
            activePackTab === "existing" ? "pack-tab-button-active" : ""
          }`}
          type="button"
          role="tab"
          id="pack-tab-existing"
          aria-selected={activePackTab === "existing"}
          aria-controls="pack-tab-panel-existing"
          onClick={() => setActivePackTab("existing")}
        >
          Existing Packs
        </button>
        <button
          className={`pack-tab-button ${
            activePackTab === "create" ? "pack-tab-button-active" : ""
          }`}
          type="button"
          role="tab"
          id="pack-tab-create"
          aria-selected={activePackTab === "create"}
          aria-controls="pack-tab-panel-create"
          onClick={() => setActivePackTab("create")}
        >
          Create New Pack
        </button>
      </div>

      {!activeSchoolId ? (
        <p className="empty-state">
          This admin login is not scoped to a school.
        </p>
      ) : null}

      {activePackTab === "create" ? (
        <div
          className="pack-tab-panel pack-builder"
          role="tabpanel"
          id="pack-tab-panel-create"
          aria-labelledby="pack-tab-create"
        >
          <form className="pack-form-layout" onSubmit={handleCreatePack}>
            <div className="pack-form-fields">
              <div className="map-card">
                <div className="pack-step-header">
                  <span className="pack-step-number">1</span>
                  <div>
                    <h3>Pack details</h3>
                    <p>Name, capacity, and description</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>School ID</span>
                    <input value={activeSchoolId} disabled />
                  </label>
                  <label className="field">
                    <span>Campus ID</span>
                    <input
                      value={packDraft.campus_id}
                      onChange={(event: any) =>
                        setPackDraft((current: any) => ({
                          ...current,
                          campus_id: event.target.value,
                        }))
                      }
                      placeholder={schoolDraft.default_campus_id || "main"}
                      disabled={!activeSchoolId}
                    />
                  </label>
                  <label className="field">
                    <span>Pack Name</span>
                    <input
                      value={packDraft.name}
                      onChange={(event: any) =>
                        setPackDraft((current: any) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="North Garage Pack"
                      disabled={!activeSchoolId}
                    />
                  </label>
                  <label className="field">
                    <span>Number of Spots</span>
                    <input
                      type="number"
                      min={1}
                      value={packDraft.number_of_spots}
                      onChange={(event: any) =>
                        setPackDraft((current: any) => ({
                          ...current,
                          number_of_spots: event.target.value,
                        }))
                      }
                      disabled={!activeSchoolId}
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>Description</span>
                    <textarea
                      value={packDraft.description}
                      onChange={(event: any) =>
                        setPackDraft((current: any) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Covered student parking near the library entrance."
                      rows={4}
                      disabled={!activeSchoolId}
                    />
                  </label>
                </div>
              </div>

              <div className="map-card">
                <div className="pack-step-header">
                  <span className="pack-step-number">2</span>
                  <div>
                    <h3>Cover photo</h3>
                    <p>Optional image for the pack</p>
                  </div>
                </div>
                <div className="challenge-image-field">
                  <EntityImagePreview
                    imageUrl={packPhotoPreviewUrl}
                    label={packDraft.name || "Juise Pack"}
                    altSuffix="pack photo"
                    fallbackLabel="Pack photo"
                  />
                  <div className="challenge-image-field-controls">
                    <p className="muted-text">
                      Upload a cover image for this Juise Pack.
                    </p>
                    <div className="challenge-image-upload-row">
                      <label className="secondary-button challenge-upload-button">
                        <input
                          className="challenge-upload-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={handlePackPhotoFileChange}
                          disabled={packBusy || !activeSchoolId}
                        />
                        {packPhotoFile ? "Replace Photo" : "Upload Photo"}
                      </label>
                      {packPhotoFile ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setPackPhotoFile(null);
                            setPackPhotoPreviewUrl("");
                          }}
                          disabled={packBusy}
                        >
                          Clear Photo
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={packBusy || !activeSchoolId}
                >
                  {packBusy ? "Creating Pack…" : "Create Juise Pack"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={packBusy}
                  onClick={() =>
                    resetPackCreateForm(schoolDraft.default_campus_id ?? "")
                  }
                >
                  Reset Form
                </button>
              </div>
            </div>

            <div className="pack-form-map">
              <div className="map-card">
                <div className="pack-step-header">
                  <span className="pack-step-number">3</span>
                  <div>
                    <h3>Pack location</h3>
                    <p>
                      {selectedPackLocation
                        ? "Pin placed — adjust if needed"
                        : "Click the map to drop a pin"}
                    </p>
                  </div>
                </div>
                <PackLocationPicker
                  disabled={!activeSchoolId}
                  onChange={handlePackLocationSelect}
                  value={selectedPackLocation}
                />
              </div>

              <div className="map-card">
                <div className="data-section-header">
                  <h3>Coordinates</h3>
                  <span>Fine tune manually</span>
                </div>
                <div className="coordinate-grid">
                  <label className="field">
                    <span>Latitude</span>
                    <input
                      value={packDraft.lat}
                      onChange={(event: any) =>
                        setPackDraft((current: any) => ({
                          ...current,
                          lat: event.target.value,
                        }))
                      }
                      placeholder="42.678000"
                      disabled={!activeSchoolId}
                    />
                  </label>
                  <label className="field">
                    <span>Longitude</span>
                    <input
                      value={packDraft.lng}
                      onChange={(event: any) =>
                        setPackDraft((current: any) => ({
                          ...current,
                          lng: event.target.value,
                        }))
                      }
                      placeholder="-83.195000"
                      disabled={!activeSchoolId}
                    />
                  </label>
                </div>
                <p className="muted-text">
                  This pack will be assigned to{" "}
                  <code>{activeSchoolId || "school-scope"}</code>.
                </p>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div
          className="pack-tab-panel pack-preview-panel"
          role="tabpanel"
          id="pack-tab-panel-existing"
          aria-labelledby="pack-tab-existing"
        >
          {activeSchoolId && packsLoading && schoolPacks.length === 0 ? (
            <p className="muted-text">Loading school packs…</p>
          ) : null}

          {activeSchoolId && !packsLoading && schoolPacks.length === 0 ? (
            <p className="empty-state">
              No school-owned Juise packs have been created for this school yet.
            </p>
          ) : null}

          {activeSchoolId && schoolPacks.length > 0 ? (
            <div className="pack-inventory-layout">
              <div className="map-card pack-map-card">
                <div className="data-section-header">
                  <div>
                    <h3>Pack pins</h3>
                    <p className="muted-text">
                      All saved Juise Pack locations for this school.
                    </p>
                  </div>
                  <span>{existingPackMapMarkers.length} pins</span>
                </div>
                <PackLocationsMap markers={existingPackMapMarkers} />
                {packsWithoutLocationsCount > 0 ? (
                  <p className="muted-text">
                    {packsWithoutLocationsCount} pack
                    {packsWithoutLocationsCount === 1 ? "" : "s"} do not have
                    saved coordinates yet.
                  </p>
                ) : null}
              </div>

              <div className="stack-list">
                {schoolPacks.map((pack: any) => {
                  const isEditingPack =
                    editingPackId === pack.pack_uuid && packEditDraft !== null;
                  const currentPackEditDraft = isEditingPack ? packEditDraft : null;
                  const packPhotoUrl = getPackPhotoUrl(pack);
                  const displayedPackPhoto = isEditingPack
                    ? packEditPhotoPreviewUrl || packPhotoUrl
                    : packPhotoUrl;
                  const spotsWithQr = pack.spots.filter((s: any) => s.qr_code).length;

                  return (
                    <article className="data-card pack-record-card" key={pack.pack_uuid}>
                      <div className="pack-record-header">
                        <div className="pack-record-thumb">
                          <EntityImagePreview
                            imageUrl={displayedPackPhoto}
                            label={pack.name || "Juise Pack"}
                            altSuffix="pack photo"
                            fallbackLabel="📦"
                          />
                        </div>

                        <div className="pack-record-info">
                          <strong>{pack.name || "Juise Pack"}</strong>
                          <p>{pack.description || "No description set."}</p>
                          <div className="pack-record-badges">
                            <span
                              className={`pack-record-badge ${
                                pack.active
                                  ? "pack-record-badge-active"
                                  : "pack-record-badge-inactive"
                              }`}
                            >
                              {pack.active ? "✓ Active" : "Inactive"}
                            </span>
                            <span className="pack-record-badge">
                              {pack.spot_count} {pack.spot_count === 1 ? "spot" : "spots"}
                            </span>
                            {pack.school_owner?.campus_id ? (
                              <span className="pack-record-badge pack-record-badge-location">
                                {pack.school_owner.campus_id}
                              </span>
                            ) : null}
                            {pack.location ? (
                              <span className="pack-record-badge pack-record-badge-location">
                                📍 Located
                              </span>
                            ) : (
                              <span className="pack-record-badge pack-record-badge-inactive">
                                No location
                              </span>
                            )}
                            {pack.qr_code ? (
                              <span className="pack-record-badge pack-record-badge-active">
                                Pack QR ready
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="pack-record-menu">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              isEditingPack
                                ? handleCancelPackEdit()
                                : handleStartEditingPack(pack)
                            }
                            disabled={packEditBusy}
                          >
                            {isEditingPack ? "Cancel" : "Edit"}
                          </button>
                          {pack.qr_code ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleDownloadPackQrCode(pack)}
                            >
                              QR
                            </button>
                          ) : (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => void handleGeneratePackQrCode(pack)}
                              disabled={qrActionTarget === `pack:${pack.pack_uuid}`}
                            >
                              {qrActionTarget === `pack:${pack.pack_uuid}` ? "…" : "Gen QR"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="pack-record-body">
                        {pack.spots.length > 0 ? (
                          <div>
                            <div className="pack-spots-section-header">
                              <h4>
                                Spots — {pack.spots.length} total, {spotsWithQr} with QR
                              </h4>
                            </div>
                            <div className="pack-spots-chips" style={{ marginTop: 10 }}>
                              {pack.spots.map((spot: any) => (
                                <div className="pack-spot-chip" key={spot.spot_uuid}>
                                  <span className="pack-spot-chip-num">
                                    #{spot.spot_number}
                                  </span>
                                  {spot.qr_code ? (
                                    <button
                                      className="pack-spot-qr-button pack-spot-chip-qr pack-spot-chip-qr-ready"
                                      type="button"
                                      onClick={() => handleDownloadPackSpotQrCode(spot)}
                                      title="Download QR for this spot"
                                    >
                                      ↓ QR
                                    </button>
                                  ) : (
                                    <button
                                      className="pack-spot-qr-button pack-spot-chip-qr"
                                      type="button"
                                      onClick={() =>
                                        void handleGeneratePackSpotQrCode(spot)
                                      }
                                      disabled={qrActionTarget === `spot:${spot.spot_uuid}`}
                                      title="Generate QR for this spot"
                                    >
                                      {qrActionTarget === `spot:${spot.spot_uuid}` ? "…" : "+ QR"}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="pack-record-actions-row">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              isEditingPack
                                ? handleCancelPackEdit()
                                : handleStartEditingPack(pack)
                            }
                            disabled={packEditBusy}
                          >
                            {isEditingPack ? "Cancel Edit" : "Edit Details"}
                          </button>
                          {pack.qr_code ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => handleDownloadPackQrCode(pack)}
                            >
                              Download Pack QR
                            </button>
                          ) : (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => void handleGeneratePackQrCode(pack)}
                              disabled={qrActionTarget === `pack:${pack.pack_uuid}`}
                            >
                              {qrActionTarget === `pack:${pack.pack_uuid}`
                                ? "Generating Pack QR…"
                                : "Generate Pack QR"}
                            </button>
                          )}
                        </div>

                        {currentPackEditDraft ? (
                          <form
                            className="data-section pack-edit-form"
                            onSubmit={(event) => void handleSavePackEdit(event, pack)}
                          >
                            <div className="data-section-header">
                              <div>
                                <h4>Edit pack details</h4>
                                <p className="muted-text">
                                  Update name, description, location, and photo.
                                </p>
                              </div>
                            </div>

                            <div className="form-grid">
                              <label className="field">
                                <span>Pack Name</span>
                                <input
                                  value={currentPackEditDraft.name}
                                  onChange={(event: any) =>
                                    setPackEditDraft((current: any) =>
                                      current
                                        ? { ...current, name: event.target.value }
                                        : current,
                                    )
                                  }
                                  placeholder="North Garage Pack"
                                  disabled={packEditBusy}
                                />
                              </label>
                              <label className="field">
                                <span>Latitude</span>
                                <input
                                  value={currentPackEditDraft.lat}
                                  onChange={(event: any) =>
                                    setPackEditDraft((current: any) =>
                                      current
                                        ? { ...current, lat: event.target.value }
                                        : current,
                                    )
                                  }
                                  placeholder="42.678000"
                                  disabled={packEditBusy}
                                />
                              </label>
                              <label className="field">
                                <span>Longitude</span>
                                <input
                                  value={currentPackEditDraft.lng}
                                  onChange={(event: any) =>
                                    setPackEditDraft((current: any) =>
                                      current
                                        ? { ...current, lng: event.target.value }
                                        : current,
                                    )
                                  }
                                  placeholder="-83.195000"
                                  disabled={packEditBusy}
                                />
                              </label>
                              <label className="field field-span-2">
                                <span>Description</span>
                                <textarea
                                  value={currentPackEditDraft.description}
                                  onChange={(event: any) =>
                                    setPackEditDraft((current: any) =>
                                      current
                                        ? {
                                            ...current,
                                            description: event.target.value,
                                          }
                                        : current,
                                    )
                                  }
                                  placeholder="Covered student parking near the library entrance."
                                  rows={4}
                                  disabled={packEditBusy}
                                />
                              </label>
                              <div className="field field-span-2">
                                <span>Pack Photo</span>
                                <div className="challenge-image-field">
                                  <EntityImagePreview
                                    imageUrl={displayedPackPhoto}
                                    label={pack.name || "Juise Pack"}
                                    altSuffix="pack photo"
                                    fallbackLabel="Pack photo preview"
                                  />
                                  <div className="challenge-image-field-controls">
                                    <p className="muted-text">
                                      Upload a new pack photo to replace the current image.
                                    </p>
                                    <div className="challenge-image-upload-row">
                                      <label className="secondary-button challenge-upload-button">
                                        <input
                                          className="challenge-upload-input"
                                          type="file"
                                          accept="image/png,image/jpeg,image/webp,image/gif"
                                          onChange={handlePackEditPhotoFileChange}
                                          disabled={packEditBusy}
                                        />
                                        {packEditPhotoFile ? "Replace Photo" : "Upload Photo"}
                                      </label>
                                      {packEditPhotoFile ? (
                                        <button
                                          className="secondary-button"
                                          type="button"
                                          onClick={() => {
                                            setPackEditPhotoFile(null);
                                            setPackEditPhotoPreviewUrl("");
                                          }}
                                          disabled={packEditBusy}
                                        >
                                          Use Current Photo
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="form-actions pack-edit-actions">
                              <button
                                className="primary-button"
                                type="submit"
                                disabled={packEditBusy}
                              >
                                {packEditBusy ? "Saving Changes…" : "Save Changes"}
                              </button>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={handleCancelPackEdit}
                                disabled={packEditBusy}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}

                        <div className="uuid-copy-stack">
                          <UuidCopyField
                            label="pack_uuid"
                            value={pack.pack_uuid}
                            onCopy={handleCopyUuid}
                          />
                        </div>

                        {pack.spots.length > 0 ? (
                          <details>
                            <summary
                              style={{
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                color: "var(--muted)",
                                fontWeight: 600,
                                userSelect: "none",
                              }}
                            >
                              Spot UUIDs ({pack.spots.length})
                            </summary>
                            <div className="uuid-copy-stack" style={{ marginTop: 10 }}>
                              {pack.spots.map((spot: any) => (
                                <UuidCopyField
                                  key={spot.spot_uuid}
                                  label={`spot_${spot.spot_number}`}
                                  value={spot.spot_uuid}
                                  onCopy={handleCopyUuid}
                                />
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
