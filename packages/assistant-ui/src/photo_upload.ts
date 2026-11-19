import { encodePhoto, type PhotoConversionRequest, type PhotoConversionResult } from "./photo_codec.js";

export interface CaltraPhotoUploadOptions {
  /** Longest edge after resizing, in pixels. Defaults to 2048. */
  maxLongEdge?: number;
}

export const defaultPhotoLongEdge = 2048;
const conversionError = "Could not prepare this photo. Try attaching a JPEG export.";

export function photoKind(file: File): "heic" | "jpeg" | undefined {
  if (/^image\/(?:heic|heif)(?:-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) return "heic";
  if (file.type === "image/jpeg" || (!file.type && /\.jpe?g$/i.test(file.name))) return "jpeg";
}

export async function normalizePhoto(file: File, kind: "heic" | "jpeg", maxLongEdge: number): Promise<File> {
  if (!Number.isSafeInteger(maxLongEdge) || maxLongEdge <= 0) throw new Error("The photo long-edge cap must be a positive integer.");
  try {
    const jpeg = await prepareJpeg(file, kind, maxLongEdge);
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([jpeg], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    throw new Error(conversionError);
  }
}

async function prepareJpeg(file: File, kind: "heic" | "jpeg", maxLongEdge: number): Promise<Blob> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    if (kind !== "heic") throw error;
    const jpeg = await convertInWorker({ file, maxLongEdge });
    if (jpeg) return jpeg;
    image = await (await import("heic-to/csp")).heicTo({ blob: file, type: "bitmap" });
  }
  return encodePhoto(image, maxLongEdge, (width, height) => Object.assign(document.createElement("canvas"), { width, height }));
}

function convertInWorker(request: PhotoConversionRequest): Promise<Blob | undefined> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./photo_worker.js", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(undefined);
  }
  return new Promise<Blob | undefined>((resolve, reject) => {
    const cleanup = () => { clearTimeout(deadline); worker.terminate(); };
    const deadline = setTimeout(() => { cleanup(); reject(new Error(conversionError)); }, 30_000);
    worker.onmessage = (event: MessageEvent<PhotoConversionResult>) => {
      cleanup();
      if ("error" in event.data) reject(new Error(conversionError));
      else resolve("jpeg" in event.data ? event.data.jpeg : undefined);
    };
    worker.onerror = () => { cleanup(); resolve(undefined); };
    try {
      worker.postMessage(request);
    } catch {
      cleanup();
      resolve(undefined);
    }
  });
}
