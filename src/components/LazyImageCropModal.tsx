import { lazyScreen } from "../lib/lazyScreen";

// The cropper (react-easy-crop) is only needed once someone picks an image,
// so it's loaded on demand instead of with the app.
export const LazyImageCropModal = lazyScreen(() =>
  import("./ImageCropModal").then((m) => m.ImageCropModal),
);
