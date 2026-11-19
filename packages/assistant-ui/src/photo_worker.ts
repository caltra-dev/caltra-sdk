import { heicTo } from "heic-to/next";
import { encodePhoto, type PhotoConversionRequest, type PhotoConversionResult } from "./photo_codec.js";

self.addEventListener("message", (event: MessageEvent<PhotoConversionRequest>) => {
  const reply = (result: PhotoConversionResult) => self.postMessage(result);
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
    reply({ unavailable: true });
    return;
  }
  const { file, maxLongEdge } = event.data;
  void heicTo({ blob: file, type: "bitmap" })
    .then(image => encodePhoto(image, maxLongEdge, (width, height) => new OffscreenCanvas(width, height)))
    .then(jpeg => reply({ jpeg }), () => reply({ error: true }));
});
