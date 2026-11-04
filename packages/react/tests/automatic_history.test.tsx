// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { CaltraChat } from "../src/ui/chat.js";

/** Models queued visibility notifications, including ones delivered after disconnect. */
class VisibilityObserver {
  static instances: VisibilityObserver[] = [];
  target?: Element;
  disconnected = false;
  constructor(readonly callback: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {
    VisibilityObserver.instances.push(this);
  }
  observe(target: Element) { this.target = target; }
  disconnect() { this.disconnected = true; }
  notify(visible = true) { this.callback([{ isIntersecting: visible, target: this.target } as IntersectionObserverEntry], this as never); }
}

const message = (id: string) => ({ id, role: "user", text: id, status: "completed", created_at: "2026-11-03T00:00:00Z" });
const runtimes: CaltraSessionRuntime[] = [];
async function setup(id = "history") {
  const pending: Array<{ resolve(value: unknown): void; reject(error: Error): void }> = [];
  const client = {
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => undefined); }, close: vi.fn(async () => undefined) })),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [message("Recent question")], next_cursor: "page-2" })
      .mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject }))),
    getSessionById: vi.fn(async () => ({ id, is_running: false })),
  };
  const runtime = new CaltraSessionRuntime(client as never, id);
  runtimes.push(runtime);
  await runtime.start();
  const view = render(<CaltraChat runtime={runtime} />);
  await waitFor(() => expect(VisibilityObserver.instances.some(observer => observer.target && !observer.disconnected)).toBe(true));
  return { client, runtime, view, pending };
}
const observer = () => VisibilityObserver.instances.filter(value => !value.disconnected).at(-1)!;

beforeEach(() => {
  VisibilityObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", VisibilityObserver);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(async () => {
  cleanup();
  await Promise.all(runtimes.splice(0).map(runtime => runtime.stop()));
  vi.unstubAllGlobals();
});

describe("automatic earlier history", () => {
  it("loads only near the owning viewport, deduplicates notifications, and preserves message nodes", async () => {
    const f = await setup();
    const recent = screen.getByText("Recent question");
    const trigger = observer();
    expect(trigger.options.root).toBe(f.view.container.querySelector('[data-slot="aui_thread-viewport"]'));
    expect(screen.queryByRole("button", { name: /Load.*messages/ })).toBeNull();
    await act(async () => trigger.notify(false));
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(1);
    await act(async () => { trigger.notify(); trigger.notify(); });
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(2);
    expect(f.client.listSessionMessages.mock.calls[1]?.[1]).toMatchObject({ cursor: "page-2" });
    expect(f.view.container.querySelector('[data-slot="caltra-earlier-history"]')?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Recent question")).toBe(recent);
    await act(async () => f.pending.shift()!.resolve({ data: [message("Older question")], next_cursor: "page-3" }));
    expect(screen.getByText("Recent question")).toBe(recent);
    expect(screen.getByText("Older question").compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => observer().notify());
    expect(f.client.listSessionMessages.mock.calls[2]?.[1]).toMatchObject({ cursor: "page-3" });
    await act(async () => f.pending.shift()!.resolve({ data: [message("First question")], next_cursor: null }));
    expect(f.view.container.querySelector('[data-slot="caltra-earlier-history"]')).toBeNull();
    await act(async () => trigger.notify());
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(3);
  });

  it("pauses on failure until explicit retry, then resumes pagination", async () => {
    const f = await setup();
    const trigger = observer();
    await act(async () => trigger.notify());
    await act(async () => f.pending.shift()!.reject(new Error("offline")));
    expect(screen.getByRole("alert")).toBeTruthy();
    await act(async () => trigger.notify());
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(f.client.listSessionMessages).toHaveBeenCalledTimes(3));
    await act(async () => f.pending.shift()!.resolve({ data: [message("Recovered question")], next_cursor: "page-3" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => observer().notify());
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(4);
    await act(async () => f.pending.shift()!.resolve({ data: [], next_cursor: null }));
  });

  it("disconnects on unmount and ignores queued callbacks from the previous chat", async () => {
    const f = await setup();
    const trigger = observer();
    f.view.unmount();
    expect(trigger.disconnected).toBe(true);
    await setup("another-chat");
    await act(async () => trigger.notify());
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(1);
  });
});
