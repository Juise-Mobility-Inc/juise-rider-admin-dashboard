import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
// react-easy-crop v6 ships its layout CSS as a separate file and does not
// inject it — without this the crop container collapses and its dimming
// box-shadow blacks out the whole stage.
import "react-easy-crop/react-easy-crop.css";

import {
  CropTooSmallError,
  cropImageToFile,
  type ImageAspect,
} from "../lib/imageCrop";

interface ImageCropModalProps {
  file: File;
  aspect: ImageAspect;
  /** e.g. "Crop challenge photo" */
  title?: string;
  /** Short hint under the title, e.g. "square (1:1)". */
  ratioLabel?: string;
  onCancel: () => void;
  onComplete: (croppedFile: File) => void;
}

export function ImageCropModal({
  file,
  aspect,
  title = "Crop image",
  ratioLabel,
  onCancel,
  onComplete,
}: ImageCropModalProps) {
  // Create AND revoke the object URL in one effect keyed on `file`. Doing
  // the revoke in a separate effect (or splitting create into a useMemo)
  // means StrictMode's mount→unmount→remount revokes the URL that the
  // still-memoised value points at, and the <img> loads a dead blob —
  // which rendered as a solid black cropper.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const croppedAreaPixelsRef = useRef<Area | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    croppedAreaPixelsRef.current = areaPixels;
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixelsRef.current) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const cropped = await cropImageToFile(file, croppedAreaPixelsRef.current);
      onComplete(cropped);
    } catch (nextError) {
      setError(
        nextError instanceof CropTooSmallError || nextError instanceof Error
          ? nextError.message
          : "Could not crop that image.",
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="management-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="management-modal-sheet image-crop-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="management-modal-header">
          <div>
            <p className="eyebrow">Crop &amp; upload</p>
            <h3>{title}</h3>
          </div>
          <button
            className="text-button management-modal-close"
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>

        {ratioLabel ? (
          <p className="muted-text image-crop-ratio-label">
            Drag to reposition, scroll or pinch to zoom. Saved as {ratioLabel}.
          </p>
        ) : null}

        <div className="image-crop-stage">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              minZoom={1}
              maxZoom={5}
              zoomSpeed={0.2}
              restrictPosition
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : null}
        </div>

        <div className="image-crop-zoom-row">
          <label htmlFor="image-crop-zoom">Zoom</label>
          <input
            id="image-crop-zoom"
            type="range"
            min={1}
            max={5}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            disabled={busy}
          />
        </div>

        {error ? <p className="form-error image-crop-error">{error}</p> : null}

        <div className="form-actions image-crop-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? "Cropping…" : "Crop & upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
