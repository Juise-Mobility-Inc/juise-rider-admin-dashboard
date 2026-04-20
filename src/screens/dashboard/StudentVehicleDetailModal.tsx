import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import type { RegisteredDevice, UserMediaAsset } from "../../lib/api";

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

type QrDescriptor = {
  value: string;
  source: string;
  isGenerated: boolean;
};

const qrMetadataKeys = [
  "qr_code",
  "qr_value",
  "scan_value",
  "qr_payload",
] as const;

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

function resolveDeviceQrDescriptor(device: RegisteredDevice): QrDescriptor {
  const metadata = getMetadataRecord(device.metadata);
  for (const key of qrMetadataKeys) {
    const value = getStringValue(metadata[key]);
    if (value) {
      return {
        value,
        source: titleCase(key),
        isGenerated: false,
      };
    }
  }

  return {
    value: device.registered_device_uuid,
    source: "Registered Device UUID",
    isGenerated: true,
  };
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
  const qrDescriptor = useMemo(() => resolveDeviceQrDescriptor(device), [device]);
  const bikeIndexMetadata = useMemo(() => resolveBikeIndexMetadata(device), [device]);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrBusy, setQrBusy] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function generateQrPreview() {
      if (!qrDescriptor.value) {
        setQrDataUrl("");
        return;
      }

      try {
        setQrBusy(true);
        const nextQrDataUrl = await QRCode.toDataURL(qrDescriptor.value, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 420,
          color: {
            dark: "#0E2219",
            light: "#FFFFFFFF",
          },
        });
        if (!cancelled) {
          setQrDataUrl(nextQrDataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrDataUrl("");
        }
      } finally {
        if (!cancelled) {
          setQrBusy(false);
        }
      }
    }

    void generateQrPreview();

    return () => {
      cancelled = true;
    };
  }, [qrDescriptor.value]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `${(device.nickname || device.registered_device_uuid)
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "device"}-qr.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

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
              <h4>Device QR code</h4>
            </div>
            {qrDataUrl ? (
              <img
                className="vehicle-modal-qr-image"
                src={qrDataUrl}
                alt={`${device.nickname || device.device_type} QR code`}
              />
            ) : (
              <div className="vehicle-modal-qr-placeholder">
                {qrBusy ? "Generating QR…" : "QR preview unavailable"}
              </div>
            )}
            <p className="vehicle-modal-qr-meta">
              {qrDescriptor.isGenerated
                ? `No saved QR payload was found, so this QR was generated from the ${qrDescriptor.source}.`
                : `Using the saved ${qrDescriptor.source} value for this device.`}
            </p>
            <div className="vehicle-modal-action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
              >
                {qrDescriptor.isGenerated ? "Download generated QR" : "Download QR"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void onCopy("device scan value", qrDescriptor.value)}
              >
                Copy scan value
              </button>
            </div>
            <div className="uuid-copy-stack">
              <div className="uuid-copy-card">
                <span className="uuid-copy-label">scan_value</span>
                <div className="uuid-copy-row">
                  <code className="uuid-copy-value" title={qrDescriptor.value}>
                    {qrDescriptor.value}
                  </code>
                  <button
                    className="secondary-button uuid-copy-button"
                    type="button"
                    onClick={() => void onCopy("device scan value", qrDescriptor.value)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
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
