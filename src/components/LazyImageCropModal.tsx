import { lazy } from "react";

// The cropper (react-easy-crop) is only needed once someone picks an image,
// so it's loaded on demand instead of with the app.
export const LazyImageCropModal = lazy(() =>
  import("./ImageCropModal").then((m) => ({ default: m.ImageCropModal })),
);
