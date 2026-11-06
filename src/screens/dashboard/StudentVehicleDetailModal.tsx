import { useMemo } from "react";

import {
  getRegisteredDeviceBeaconInfo,
  type RegisteredDevice,
  type UserMediaAsset,
} from "../../lib/api";
import { shortPassId } from "../../lib/parkingPasses";

type Props = {
  device: RegisteredDevice;
  studentName: string;
  primaryPhotoUrl: string;
  mediaAssets: UserMediaAsset[];
  signedMediaUrls: Record<string, string>;
  onClose: () => void;
  onCopy: (label: string, value: string) => void | Promise<void>;
  onPreviewImage: (imageUrl: string, alt: string, label?: string) => void;
  formatUnixTimestamp: (value?: number) => string;
};

const mediaSlotPriority: Record<string, number> = {
  photo: 0,
  overview: 1,
  logo: 2,
};

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveBikeIndexMetadata(
  device: RegisteredDevice,
): Record<string, unknown> {
  const metadata = getMetadataRecord(device.metadata);
  return getMetadataRecord(metadata.bike_index);
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim() || "—";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => formatMetadataValue(item)).join(", ") : "—";
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return "—";
}

export function StudentVehicleDetailModal({
  device,
  studentName,
  primaryPhotoUrl,
  mediaAssets,
  signedMediaUrls,
  onClose,
  onCopy,
  onPreviewImage,
  formatUnixTimestamp,
}: Props) {
  const parkingPass = device.parking_pass ?? null;
  const bikeIndexMetadata = useMemo(() => resolveBikeIndexMetadata(device), [device]);
  const beaconInfo = useMemo(() => getRegisteredDeviceBeaconInfo(device), [device]);

  const bikeIndexUrl =
    getStringValue(bikeIndexMetadata.bike_url) ||
    getStringValue(bikeIndexMetadata.claim_url);
  const bikeIndexClaimUrl = getStringValue(bikeIndexMetadata.claim_url);

  const mediaItems = useMemo(
    () =>
      [...mediaAssets]
        .filter((asset) => getStringValue(asset.object_key))
        .sort((left, right) => {
          const leftRank = mediaSlotPriority[left.slot?.trim() ?? ""] ?? 99;
          const rightRank = mediaSlotPriority[right.slot?.trim() ?? ""] ?? 99;
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }
          if (left.updated_at !== right.updated_at) {
            return right.updated_at - left.updated_at;
          }
          return right.created_at - left.created_at;
        })
        .map((asset) => ({
          asset,
          url: signedMediaUrls[getStringValue(asset.object_key)] ?? "",
        }))
        .filter((item) => item.url),
    [mediaAssets, signedMediaUrls],
  );

  return (
    <div
      className="vehicle-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${device.nickname || device.device_type} details`}
      onClick={onClose}
    >
      <div
        className="vehicle-modal-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="vehicle-modal-header">
          <div className="vehicle-modal-header-copy">
            <p className="eyebrow">Student vehicle</p>
            <h3>{device.nickname || `${device.make} ${device.model}`.trim() || "Registered device"}</h3>
            <p>
              Assigned to {studentName} · {device.device_type || "device"}
            </p>
          </div>
          <button
            className="image-lightbox-close vehicle-modal-close"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="vehicle-modal-top-grid">
          <div className="vehicle-modal-hero-card">
            {primaryPhotoUrl ? (
              <img
                className="vehicle-modal-hero-image"
                src={primaryPhotoUrl}
                alt={`${device.nickname || device.device_type} primary`}
                onClick={() =>
                  onPreviewImage(
                    primaryPhotoUrl,
                    `${device.nickname || device.device_type} primary`,
                    device.nickname || device.device_type,
                  )
                }
              />
            ) : (
              <div className="vehicle-modal-hero-fallback">
                {device.device_type?.slice(0, 1).toUpperCase() || "D"}
              </div>
            )}
            <div className="vehicle-modal-badges">
              <span className="student-badge">
                {device.active ? "Active" : "Inactive"}
              </span>
              <span className="student-badge student-badge-muted">
                {device.color || "Color not set"}
              </span>
              <span className="student-badge student-badge-muted">
                {device.app_id}
              </span>
            </div>
          </div>

          <div className="vehicle-modal-qr-card">
            <div className="data-section-header">
              <h4>Parking pass</h4>
            </div>
            {parkingPass ? (
              <>
                <div className="vehicle-modal-qr-placeholder">
                  <strong>{shortPassId(parkingPass.pass_uuid)}</strong>
                </div>
                <p className="vehicle-modal-qr-meta">
                  Active
                  {parkingPass.activated_at
                    ? ` since ${formatUnixTimestamp(parkingPass.activated_at)}`
                    : ""}
                  . The student activated this pre-printed pass in the Rider App.
                </p>
                <div className="uuid-copy-stack">
                  <div className="uuid-copy-card">
                    <span className="uuid-copy-label">pass_uuid</span>
                    <div className="uuid-copy-row">
                      <code className="uuid-copy-value" title={parkingPass.pass_uuid}>
                        {parkingPass.pass_uuid}
                      </code>
                      <button
                        className="secondary-button uuid-copy-button"
                        type="button"
                        onClick={() => void onCopy("parking pass", parkingPass.pass_uuid)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="vehicle-modal-qr-placeholder">No active pass</div>
                <p className="vehicle-modal-qr-meta">
                  This vehicle has no active parking pass. Enforcement can't match it until the
                  student scans a pre-printed pass in the Rider App.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="data-section">
          <div className="data-section-header">
            <h4>Vehicle details</h4>
          </div>
          <div className="detail-grid">
            <div className="detail-row">
              <span>Nickname</span>
              <strong>{device.nickname || "Not set"}</strong>
            </div>
            <div className="detail-row">
              <span>Type</span>
              <strong>{device.device_type || "Not set"}</strong>
            </div>
            <div className="detail-row">
              <span>Powertrain</span>
              <strong>{device.powertrain_type || "non_electric"}</strong>
            </div>
            <div className="detail-row">
              <span>Registration</span>
              <strong>{device.registration_status || "approved"}</strong>
            </div>
            <div className="detail-row">
              <span>Payment</span>
              <strong>{device.payment_status || "not_required"}</strong>
            </div>
            <div className="detail-row">
              <span>Parking pass</span>
              <strong>{parkingPass ? shortPassId(parkingPass.pass_uuid) : "None"}</strong>
            </div>
            <div className="detail-row">
              <span>Make &amp; model</span>
              <strong>{[device.make, device.model].filter(Boolean).join(" ") || "Not set"}</strong>
            </div>
            <div className="detail-row">
              <span>Serial number</span>
              <strong>{device.serial_number || "Not set"}</strong>
            </div>
            <div className="detail-row">
              <span>Membership</span>
              <strong>{device.membership_uuid || "Not linked"}</strong>
            </div>
            <div className="detail-row">
              <span>Created</span>
              <strong>{formatUnixTimestamp(device.created_at)}</strong>
            </div>
            <div className="detail-row">
              <span>Updated</span>
              <strong>{formatUnixTimestamp(device.updated_at)}</strong>
            </div>
          </div>
          <div className="uuid-copy-stack">
            <div className="uuid-copy-card">
              <span className="uuid-copy-label">registered_device_uuid</span>
              <div className="uuid-copy-row">
                <code className="uuid-copy-value" title={device.registered_device_uuid}>
                  {device.registered_device_uuid}
                </code>
                <button
                  className="secondary-button uuid-copy-button"
                  type="button"
                  onClick={() =>
                    void onCopy("registered_device_uuid", device.registered_device_uuid)
                  }
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="data-section">
          <div className="data-section-header">
            <h4>Beacon</h4>
          </div>
          {beaconInfo ? (
            <>
              <div className="detail-grid">
                <div className="detail-row">
                  <span>MAC address</span>
                  <strong>{beaconInfo.beacon_mac}</strong>
                </div>
                <div className="detail-row">
                  <span>Normalized MAC</span>
                  <strong>{beaconInfo.beacon_mac_normalized}</strong>
                </div>
                <div className="detail-row">
                  <span>Frame types</span>
                  <strong>
                    {beaconInfo.frame_types.length
                      ? beaconInfo.frame_types.join(", ")
                      : "Not recorded"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Verification</span>
                  <strong>{beaconInfo.verification_source || "Not recorded"}</strong>
                </div>
                <div className="detail-row">
                  <span>Observed device</span>
                  <strong>
                    {beaconInfo.observed_name ||
                      beaconInfo.observed_device_id ||
                      "Not recorded"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Observed RSSI</span>
                  <strong>{formatMetadataValue(beaconInfo.observed_rssi)}</strong>
                </div>
                <div className="detail-row">
                  <span>Observed</span>
                  <strong>{formatUnixTimestamp(beaconInfo.observed_at ?? undefined)}</strong>
                </div>
              </div>
              <div className="vehicle-modal-action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void onCopy("beacon MAC", beaconInfo.beacon_mac)}
                >
                  Copy MAC
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    void onCopy("normalized beacon MAC", beaconInfo.beacon_mac_normalized)
                  }
                >
                  Copy normalized MAC
                </button>
              </div>
            </>
          ) : (
            <p className="muted-text">No beacon registered.</p>
          )}
        </div>

        <div className="data-section">
          <div className="data-section-header">
            <h4>Bike Index</h4>
          </div>
          <div className="detail-grid">
            <div className="detail-row">
              <span>Status</span>
              <strong>
                {getStringValue(bikeIndexMetadata.registration_status) || "Not available"}
              </strong>
            </div>
            <div className="detail-row">
              <span>Bike ID</span>
              <strong>{formatMetadataValue(bikeIndexMetadata.bike_id)}</strong>
            </div>
            <div className="detail-row">
              <span>Organization</span>
              <strong>
                {getStringValue(bikeIndexMetadata.organization_slug) || "Not set"}
              </strong>
            </div>
            <div className="detail-row">
              <span>Can report stolen</span>
              <strong>{formatMetadataValue(bikeIndexMetadata.can_report_stolen)}</strong>
            </div>
          </div>
          <div className="vehicle-modal-action-row">
            {bikeIndexUrl ? (
              <a
                className="secondary-button vehicle-modal-link-button"
                href={bikeIndexUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Bike Index
              </a>
            ) : (
              <span className="muted-text">
                No Bike Index URL is available for this device yet.
              </span>
            )}
            {bikeIndexClaimUrl && bikeIndexClaimUrl !== bikeIndexUrl ? (
              <a
                className="secondary-button vehicle-modal-link-button"
                href={bikeIndexClaimUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open claim link
              </a>
            ) : null}
          </div>
        </div>

        <div className="data-section">
          <div className="data-section-header">
            <h4>Device photos &amp; media</h4>
            <span>{mediaItems.length}</span>
          </div>
          {mediaItems.length === 0 ? (
            <p className="muted-text">No signed media is available for this device.</p>
          ) : (
            <div className="vehicle-modal-media-grid">
              {mediaItems.map(({ asset, url }) => (
                <button
                  key={asset.media_uuid}
                  className="vehicle-modal-media-card"
                  type="button"
                  onClick={() =>
                    onPreviewImage(
                      url,
                      `${device.nickname || device.device_type} ${asset.slot || "photo"}`,
                      `${device.nickname || device.device_type} · ${titleCase(asset.slot || "photo")}`,
                    )
                  }
                >
                  <img
                    className="vehicle-modal-media-image"
                    src={url}
                    alt={`${device.nickname || device.device_type} ${asset.slot || "photo"}`}
                  />
                  <span>{titleCase(asset.slot || "Photo")}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="data-section">
          <div className="data-section-header">
            <h4>Metadata</h4>
          </div>
          <pre className="vehicle-modal-metadata">
            {JSON.stringify(device.metadata ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
