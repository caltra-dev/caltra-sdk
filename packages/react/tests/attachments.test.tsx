// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { CaltraChat } from "../src/ui/chat.js";
import { AttachmentSession, useAttachmentContent } from "../src/ui/attachment_content.js";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollTo = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(mediaType: string, name: string) {
  return {
    getAttachmentSettings: vi.fn(async () => ({ enabled: true })),
    getSessionById: vi.fn(async () => ({ id: "session" })),
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => undefined); }, close: vi.fn(async () => undefined) })),
    listSessionMessages: vi.fn(async () => ({ data: [{ id: "sent", role: "user", text: "Read this", status: "completed", created_at: "2026-11-07T00:00:00Z",
      attachments: [{ id: "attachment", name, media_type: mediaType, size_bytes: 12 }] }], next_cursor: null })),
    downloadAttachment: vi.fn(async () => ({ url: "https://storage.test/initial" })),
  };
}

describe("sent attachment access", () => {
  it("hides uploading until enabled and after disabling, preserving sent file downloads", async () => {
    const client = fixture("text/plain", "saved.txt");
    client.getAttachmentSettings.mockResolvedValue({ enabled: false });
    const session = new CaltraSessionRuntime(client as never, "session");
    render(<CaltraChat runtime={session} />);
    expect(session.getSnapshot().attachmentsEnabled).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Add Attachment" })).toBeNull();
    await act(async () => { await session.refresh(); await session.refreshMetadata(); });
    expect(session.getSnapshot().attachmentsEnabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Add Attachment" })).toBeNull();
    expect(await screen.findByRole("link", { name: "Download saved.txt" })).toBeTruthy();
    client.getAttachmentSettings.mockResolvedValue({ enabled: true });
    await act(() => session.refreshMetadata());
    expect(await screen.findByRole("button", { name: "Add Attachment" })).toBeTruthy();
    client.getAttachmentSettings.mockResolvedValue({ enabled: false });
    await act(() => session.refreshMetadata());
    expect(screen.queryByRole("button", { name: "Add Attachment" })).toBeNull();
    expect(screen.getByRole("link", { name: "Download saved.txt" })).toBeTruthy();
  });

  it("restores native image preview from a reference and releases its object URL", async () => {
    const client = fixture("image/png", "diagram.png");
    client.getAttachmentSettings.mockResolvedValue({ enabled: false });
    const fetchImage = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["pixels"]) }));
    vi.stubGlobal("fetch", fetchImage);
    const view = render(<CaltraChat client={client as never} sessionId="session" />);
    const preview = await screen.findByRole("button", { name: "Preview diagram.png" });
    expect(screen.queryByRole("button", { name: "Add Attachment" })).toBeNull();
    expect(client.downloadAttachment).toHaveBeenCalledWith("session", "attachment");
    expect(fetchImage).toHaveBeenCalledWith("https://storage.test/initial", expect.objectContaining({ credentials: "omit", cache: "no-store" }));
    fireEvent.click(preview);
    expect(await screen.findByRole("dialog", { name: "Preview diagram.png" })).toBeTruthy();
    expect(screen.getByAltText("Preview of diagram.png").getAttribute("src")).toBe("blob:preview");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("uses the native file downloader, reauthorizes clicks and recovers from revoked access", async () => {
    const client = fixture("application/pdf", "report.pdf");
    render(<CaltraChat client={client as never} sessionId="session" />);
    const link = await screen.findByRole("link", { name: "Download report.pdf" });
    expect(link.getAttribute("data-slot")).toBe("file-download");
    const downloads: { href: string; name: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { downloads.push({ href: this.href, name: this.download }); });
    client.downloadAttachment.mockResolvedValueOnce({ url: "https://storage.test/fresh" });
    fireEvent.click(link);
    await waitFor(() => expect(downloads).toEqual([{ href: "https://storage.test/fresh", name: "report.pdf" }]));
    client.downloadAttachment.mockRejectedValueOnce(new Error("Revoked"));
    fireEvent.click(link);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(downloads).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Download report.pdf" })).toBeTruthy();
  });

  it("waits for publication and discards image responses after identity changes", async () => {
    let release!: (value: { url: string }) => void;
    const session = { downloadAttachment: vi.fn(() => new Promise<{ url: string }>(resolve => { release = resolve; })) } as unknown as CaltraSessionRuntime;
    const fetchImage = vi.fn(); vi.stubGlobal("fetch", fetchImage);
    const wrapper = ({ children }: { children: React.ReactNode }) => <AttachmentSession.Provider value={session}>{children}</AttachmentSession.Provider>;
    const hook = renderHook(({ pending }) => useAttachmentContent("id", "image/png", pending), { wrapper, initialProps: { pending: true } });
    expect(session.downloadAttachment).not.toHaveBeenCalled();
    hook.rerender({ pending: false });
    await waitFor(() => expect(session.downloadAttachment).toHaveBeenCalledOnce());
    hook.unmount();
    await act(async () => release({ url: "https://storage.test/late" }));
    expect(fetchImage).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not preview active file formats or download after the chat is closed", async () => {
    let release!: (value: { url: string }) => void;
    const session = { downloadAttachment: vi.fn().mockResolvedValueOnce({ url: "https://storage.test/svg" }).mockImplementationOnce(() => new Promise(resolve => { release = resolve; })) } as unknown as CaltraSessionRuntime;
    const fetchImage = vi.fn(); vi.stubGlobal("fetch", fetchImage);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: React.ReactNode }) => <AttachmentSession.Provider value={session}>{children}</AttachmentSession.Provider>;
    const hook = renderHook(() => useAttachmentContent("id", "image/svg+xml"), { wrapper });
    await waitFor(() => expect(hook.result.current.url).toBe("https://storage.test/svg"));
    expect(fetchImage).not.toHaveBeenCalled();
    let download!: Promise<void>;
    act(() => { download = hook.result.current.download("drawing.svg"); });
    hook.unmount();
    await act(async () => { release({ url: "https://storage.test/new" }); await download; });
    expect(click).not.toHaveBeenCalled();
  });
});
