import { describe, expect, it, vi } from "vitest";
import { encodePhoto, fitPhoto } from "../src/photo_codec.js";
import { photoKind } from "../src/photo_upload.js";

describe("browser photo conversion", () => {
  it("caps the long edge without cropping or upscaling", () => {
    expect(fitPhoto(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitPhoto(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(fitPhoto(900, 1200, 2048)).toEqual({ width: 900, height: 1200 });
    expect(fitPhoto(4032, 3024, 1920)).toEqual({ width: 1920, height: 1440 });
  });

  it("identifies HEIF photos even when the browser supplies a generic type", () => {
    expect(photoKind(new File([], "IMG_0175.HEIC", { type: "application/octet-stream" }))).toBe("heic");
    expect(photoKind(new File([], "upload", { type: "image/heif" }))).toBe("heic");
    expect(photoKind(new File([], "photo.JPG"))).toBe("jpeg");
    expect(photoKind(new File([], "diagram.png", { type: "image/png" }))).toBeUndefined();
    expect(photoKind(new File([], "animation.gif", { type: "image/gif" }))).toBeUndefined();
  });

  it("encodes a resized JPEG and releases the decoded image", async () => {
    const bitmap = { width: 3024, height: 4032, close: vi.fn() } as unknown as ImageBitmap;
    const jpeg = new Blob(["encoded"], { type: "image/jpeg" });
    const drawImage = vi.fn();
    const convertToBlob = vi.fn().mockResolvedValue(jpeg);
    const canvas = vi.fn(() => ({ getContext: () => ({ drawImage }), convertToBlob }) as unknown as OffscreenCanvas);

    await expect(encodePhoto(bitmap, 2048, canvas)).resolves.toBe(jpeg);
    expect(canvas).toHaveBeenCalledWith(1536, 2048);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1536, 2048);
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/jpeg", quality: 0.9 });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
