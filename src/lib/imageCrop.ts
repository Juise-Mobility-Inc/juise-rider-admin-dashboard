import type { Area } from "react-easy-crop";

/**
 * Fixed aspect ratios every image upload in the dashboard is cropped to.
 * Keep these in sync with the customer app (`src/lib/image-crop.ts` there).
 */
export const IMAGE_ASPECT = {
  /** Profile photos, challenge photos, challenge-game (stop) photos,
   *  school logo, notification image. */
  square: 1,
  /** Student ID photos, pack photos, POI photos. */
  wide: 16 / 9,
  /** Student parking-report photos. */
  tall: 9 / 16,
} as const;

export type ImageAspect = (typeof IMAGE_ASPECT)[keyof typeof IMAGE_ASPECT];

/** Longest edge we keep after a crop — keeps uploads small without visibly
 *  hurting quality for the sizes these images render at. */
const MAX_OUTPUT_EDGE = 2048;
/** Shortest edge a crop must still have, so a from-thumbnail crop can't
 *  produce a 60px blob. */
const MIN_OUTPUT_EDGE = 240;

export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = src;
  });
}

export class CropTooSmallError extends Error {
  constructor() {
    super(
      `The selected area is too small — zoom out or pick a larger image (at least ${MIN_OUTPUT_EDGE}px on the short side).`,
    );
    this.name = "CropTooSmallError";
  }
}

/**
 * Renders `croppedAreaPixels` of `file` to a canvas and returns a new File.
 * The output is exactly the requested aspect ratio (that's what the canvas
 * is sized to), capped at MAX_OUTPUT_EDGE and rejected below MIN_OUTPUT_EDGE.
 * PNGs stay PNG (logos with transparency); everything else becomes JPEG.
 */
export async function cropImageToFile(
  file: File,
  croppedAreaPixels: Area,
): Promise<File> {
  const shortSide = Math.min(croppedAreaPixels.width, croppedAreaPixels.height);
  if (shortSide < MIN_OUTPUT_EDGE) {
    throw new CropTooSmallError();
  }

  const url = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  const scale =
    Math.max(croppedAreaPixels.width, croppedAreaPixels.height) > MAX_OUTPUT_EDGE
      ? MAX_OUTPUT_EDGE / Math.max(croppedAreaPixels.width, croppedAreaPixels.height)
      : 1;

  const outWidth = Math.round(croppedAreaPixels.width * scale);
  const outHeight = Math.round(croppedAreaPixels.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not process the image in this browser.");
  }

  const isPng = file.type === "image/png";
  if (!isPng) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outWidth, outHeight);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    outWidth,
    outHeight,
  );

  const outType = isPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, isPng ? undefined : 0.9),
  );
  if (!blob) {
    throw new Error("Could not export the cropped image.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  const ext = isPng ? "png" : "jpg";
  return new File([blob], `${baseName}-cropped.${ext}`, {
    type: outType,
    lastModified: Date.now(),
  });
}
