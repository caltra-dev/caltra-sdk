import { afterEach, describe, expect, it, vi } from "vitest";
import { CaltraAttachmentAdapter } from "../src/attachment_adapter.js";

afterEach(() => vi.unstubAllGlobals());
describe("native attachment staging", () => {
  it("stages and uploads only the converted JPEG when photo conversion is enabled", async () => {
    const source = new File(["heic input"], "IMG_0175.HEIC", { type: "image/heic" });
    const jpeg = new Blob(["jpeg output"], { type: "image/jpeg" });
    const terminate = vi.fn();
    const postMessage = vi.fn();
    const nativeDecoder = vi.fn().mockRejectedValue(new Error("Codec unavailable"));
    vi.stubGlobal("createImageBitmap", nativeDecoder);
    vi.stubGlobal("Worker", class {
      onmessage?: (event: MessageEvent<{ jpeg: Blob }>) => void;
      terminate = terminate;
      postMessage(request: unknown) {
        postMessage(request);
        queueMicrotask(() => this.onmessage?.(new MessageEvent("message", { data: { jpeg } })));
      }
    });
    const session = {
      stageAttachment: vi.fn().mockResolvedValue({ attachment: { id: "photo", media_type: "image/jpeg" }, url: "https://storage.test/upload", headers: [] }),
      finalizeAttachment: vi.fn().mockResolvedValue({ id: "photo" }),
    };
    const upload = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", upload);
    const adapter = new CaltraAttachmentAdapter(session as never, 2048);
    const additions = adapter.add({ file: source });
    const pending = (await additions.next()).value!;
    const converted = pending.file!;
    expect(nativeDecoder).toHaveBeenCalledWith(source, { imageOrientation: "from-image" });
    expect(postMessage).toHaveBeenCalledWith({ file: source, maxLongEdge: 2048 });
    expect(terminate).toHaveBeenCalledOnce();
    expect(converted).toMatchObject({ name: "IMG_0175.jpg", type: "image/jpeg", size: jpeg.size });
    expect(session.stageAttachment).toHaveBeenCalledWith(converted);
    expect(pending).toMatchObject({ name: converted.name, contentType: converted.type });
    await additions.next();
    await additions.next();
    expect(upload).toHaveBeenCalledWith("https://storage.test/upload", expect.objectContaining({ body: converted }));
    expect(session.finalizeAttachment).toHaveBeenCalledWith("photo");
  });

  it("blocks send until upload and finalization, and sends only a reference", async () => {
    const file = new File(["secret answer"], "proof.txt", { type: "text/plain" });
    const session = { stageAttachment: vi.fn().mockResolvedValue({ attachment: { id: "file-id", media_type: "text/plain" }, url: "https://storage.test/upload", headers: [{ name: "Content-Type", value: "text/plain" }] }), finalizeAttachment: vi.fn().mockResolvedValue({ id: "file-id" }), removeAttachment: vi.fn() };
    const upload = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", upload);
    const adapter = new CaltraAttachmentAdapter(session as never);
    const additions = adapter.add({ file });
    const pending = (await additions.next()).value!;
    expect(adapter.isSendBlocked()).toBe(true);
    await expect(adapter.send(pending)).rejects.toThrow("Wait for the upload");
    const complete = (await additions.next()).value!;
    await additions.next();
    expect(session.finalizeAttachment).toHaveBeenCalledWith("file-id");
    expect(upload).toHaveBeenCalledWith("https://storage.test/upload", expect.objectContaining({ method: "PUT", body: file }));
    expect(adapter.isSendBlocked()).toBe(false);
    expect(await adapter.send(complete)).toMatchObject({ id: "file-id", content: [], status: { type: "complete" } });
  });
  it("keeps failed uploads unsendable until removed", async () => {
    const session = { stageAttachment: vi.fn().mockResolvedValue({ attachment: { id: "failed", media_type: "text/plain" }, url: "https://storage.test/upload", headers: [] }), finalizeAttachment: vi.fn(), removeAttachment: vi.fn().mockResolvedValue({ id: "failed" }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const adapter = new CaltraAttachmentAdapter(session as never);
    const additions = adapter.add({ file: new File(["a"], "a.txt") });
    const pending = (await additions.next()).value!;
    await expect(additions.next()).rejects.toThrow("Upload failed");
    expect(adapter.isSendBlocked()).toBe(true);
    expect(session.finalizeAttachment).not.toHaveBeenCalled();
    await adapter.remove(pending);
    expect(adapter.isSendBlocked()).toBe(false);
  });
});
