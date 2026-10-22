// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { CaltraChat } from "../src/ui/chat.js";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

it("loads near the top through the native runtime, pauses on error, and retries without losing the draft", async () => {
  const message = (id: string) => ({ id, role: "assistant" as const, text: id, status: "completed" as const, created_at: "2026-10-21T00:00:00Z" });
  let resolvePage!: (value: unknown) => void;
  let rejectPage!: (error: Error) => void;
  const client = {
    openSessionEvents: async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => {}); }, close: async () => {} }),
    getSessionById: async () => ({ id: "history" }),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [message("Latest")], next_cursor: "older" })
      .mockImplementation(() => new Promise((resolve, reject) => { resolvePage = resolve; rejectPage = reject; })),
  };
  const runtime = new CaltraSessionRuntime(client as never, "history");
  await runtime.start();
  const onScroll = vi.fn();
  const view = render(<CaltraChat runtime={runtime} hidden slotProps={{ viewport: { onScroll } }} />);
  const viewport = view.container.querySelector(".caltra-chat__viewport")!;
  fireEvent.change(view.container.querySelector('textarea[aria-label="Message"]')!, { target: { value: "Keep my draft" } });
  fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
  expect(client.listSessionMessages).toHaveBeenCalledTimes(1);
  view.rerender(<CaltraChat runtime={runtime} slotProps={{ viewport: { onScroll } }} />);
  fireEvent.scroll(viewport, { target: { scrollTop: 300 } });
  expect(client.listSessionMessages).toHaveBeenCalledTimes(1);
  fireEvent.scroll(viewport, { target: { scrollTop: 100 } });
  fireEvent.scroll(viewport, { target: { scrollTop: 50 } });
  await screen.findByRole("status", { name: "Loading older messages…" });
  expect(client.listSessionMessages).toHaveBeenCalledTimes(2);
  expect(onScroll).toHaveBeenCalledTimes(4);
  await act(async () => rejectPage(new Error("Do not display raw failure")));
  await screen.findByRole("alert");
  expect(screen.queryByText("Do not display raw failure")).toBeNull();
  fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
  expect(client.listSessionMessages).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(client.listSessionMessages).toHaveBeenCalledTimes(3));
  await act(async () => resolvePage({ data: [message("Earlier")], next_cursor: null }));
  await screen.findByText("Earlier");
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep my draft");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
  fireEvent.scroll(viewport);
  expect(client.listSessionMessages).toHaveBeenCalledTimes(3);
  view.unmount();
  await runtime.stop();
});
