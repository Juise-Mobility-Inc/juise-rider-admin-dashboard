import { useCallback, useState } from "react";

import { IMAGE_ASPECT, type ImageAspect } from "../lib/imageCrop";
import { ImageCropModal } from "./ImageCropModal";

const RATIO_LABEL: Record<ImageAspect, string> = {
  [IMAGE_ASPECT.square]: "square (1:1)",
  [IMAGE_ASPECT.wide]: "wide (16:9)",
  [IMAGE_ASPECT.tall]: "tall (9:16)",
};

interface PendingCrop {
  file: File;
  aspect: ImageAspect;
  title: string;
  onCropped: (croppedFile: File) => void;
}

/**
 * Drop-in "crop before upload" for a plain <input type="file">. Call
 * `beginCrop(file, aspect, title, onCropped)` from the input's onChange and
 * render `cropModal` somewhere in the tree. `onCropped` receives the cropped
 * File, already at the requested aspect ratio — pass it straight to the
 * existing upload function.
 */
export function useImageCropper() {
  const [pending, setPending] = useState<PendingCrop | null>(null);

  const beginCrop = useCallback(
    (
      file: File,
      aspect: ImageAspect,
      title: string,
      onCropped: (croppedFile: File) => void,
    ) => {
      setPending({ file, aspect, title, onCropped });
    },
    [],
  );

  const cropModal = pending ? (
    <ImageCropModal
      file={pending.file}
      aspect={pending.aspect}
      title={pending.title}
      ratioLabel={RATIO_LABEL[pending.aspect]}
      onCancel={() => setPending(null)}
      onComplete={(croppedFile) => {
        const callback = pending.onCropped;
        setPending(null);
        callback(croppedFile);
      }}
    />
  ) : null;

  return { beginCrop, cropModal, cropInProgress: pending !== null };
}
