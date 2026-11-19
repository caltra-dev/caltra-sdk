const imageReadLimit = 5 * 1024 * 1024;

export type PhotoConversionRequest = { file: File; maxLongEdge: number };
export type PhotoConversionResult = { jpeg: Blob } | { error: true } | { unavailable: true };

export function fitPhoto(width: number, height: number, maxLongEdge: number) {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function encodePhoto(
  image: ImageBitmap,
  maxLongEdge: number,
  createCanvas: (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  try {
    const { width, height } = fitPhoto(image.width, image.height, maxLongEdge);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo canvas is unavailable.");
    context.drawImage(image, 0, 0, width, height);
    for (const quality of [0.9, 0.8, 0.7]) {
      const jpeg = "convertToBlob" in canvas
        ? await canvas.convertToBlob({ type: "image/jpeg", quality })
        : await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (jpeg?.type === "image/jpeg" && jpeg.size > 0 && jpeg.size <= imageReadLimit) return jpeg;
    }
    throw new Error("Photo exceeds the JPEG size limit.");
  } finally {
    image.close();
  }
}
