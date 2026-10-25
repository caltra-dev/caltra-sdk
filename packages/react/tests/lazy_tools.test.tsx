// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { CaltraChat } from "../src/ui/chat.js";
beforeAll(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollTo = vi.fn(); });
afterEach(cleanup);

it("keeps terminal status collapsed, fetches only on expansion, caches and retries reads", async () => {
  const tool = { id: "call", name: "demo.echo", status: "completed" as const };
  const message = { id: "message", created_at: new Date().toISOString(), role: "assistant", status: "completed", text: "", tool_calls: [tool] };
  let finish!: (value: unknown) => void;
  const client = {
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => undefined); }, close: async () => undefined })),
    listSessionMessages: vi.fn(async () => ({ data: [message], next_cursor: null })),
    getSessionById: vi.fn(async () => ({ id: "session", is_running: false })),
    getSessionToolDetails: vi.fn().mockRejectedValueOnce(new Error("Temporary failure")).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })),
  };
  const runtime = new CaltraSessionRuntime(client as never, "session");
  await runtime.start();
  const view = render(<CaltraChat runtime={runtime} />);
  fireEvent.click(screen.getByRole("button", { name: "1 tool call" }));
  const trigger = screen.getByRole("button", { name: "Used tool: demo.echo" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.querySelector(".lucide-check")).toBeTruthy();
  expect(client.getSessionToolDetails).not.toHaveBeenCalled();
  fireEvent.click(trigger);
  await screen.findByText("Could not load tool details.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(client.getSessionToolDetails).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("status", { name: "Loading tool details…" })).toBeTruthy();
  await act(async () => finish({ ...tool, arguments: { text: "secret args" }, result: { text: "loaded result" } }));
  expect(await screen.findByText(/loaded result/)).toBeTruthy();
  fireEvent.click(trigger); fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByText(/loaded result/)).toBeTruthy());
  expect(client.getSessionToolDetails).toHaveBeenCalledTimes(2);
  view.unmount(); await runtime.stop();
});

it("deduplicates simultaneous opens and invalidates details when running becomes completed", async () => {
  let status: "running" | "completed" = "running";
  const client = {
    listSessionMessages: vi.fn(async () => ({ data: [{ id: "m", text: "", status: "completed", role: "assistant", created_at: new Date().toISOString(), tool_calls: [{ id: "c", name: "demo", status }] }], next_cursor: null })),
    getSessionToolDetails: vi.fn(async () => ({ id: "c", name: "demo", status, arguments: {}, ...(status === "completed" ? { result: "done" } : {}) })),
  };
  const runtime = new CaltraSessionRuntime(client as never, "session");
  await runtime.refresh();
  await Promise.all([runtime.getToolDetails("m", "c"), runtime.getToolDetails("m", "c")]);
  expect(client.getSessionToolDetails).toHaveBeenCalledTimes(1);
  status = "completed"; await runtime.refresh();
  expect((await runtime.getToolDetails("m", "c")).result).toBe("done");
  expect(client.getSessionToolDetails).toHaveBeenCalledTimes(2);
});

it("grows one native group across backend steps and loads details with their source message ID", async () => {
  const timestamp = "2026-10-24T00:00:00Z";
  const step = (number: number) => ({ id: `step-${number}`, role: "assistant", text: "", status: "completed",
    created_at: timestamp, tool_calls: [{ id: `call-${number}`, name: `demo.tool${number}`, status: "completed" }] });
  let messages = [step(1)];
  let running = true;
  const client = {
    openSessionEvents: async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => undefined); }, close: async () => undefined }),
    listSessionMessages: vi.fn(async () => ({ data: messages, next_cursor: null })),
    getSessionById: async () => ({ id: "grouped", is_running: running }),
    getSessionToolDetails: vi.fn(async () => ({ id: "call-2", name: "demo.tool2", status: "completed", arguments: {}, result: "Second result" })),
  };
  const runtime = new CaltraSessionRuntime(client as never, "grouped");
  await runtime.start();
  const view = render(<CaltraChat runtime={runtime} />);
  const group = screen.getByRole("button", { name: "1 tool call" });
  const assistant = view.container.querySelector('[data-slot="aui_assistant-message-root"]');
  messages = [step(1), step(2), step(3)];
  await act(async () => runtime.refresh());
  expect(screen.getByRole("button", { name: "3 tool calls" })).toBe(group);
  expect(view.container.querySelectorAll('[data-slot="tool-group-trigger"]')).toHaveLength(1);
  expect(view.container.querySelector('[data-slot="aui_assistant-message-root"]')).toBe(assistant);
  expect(client.getSessionToolDetails).not.toHaveBeenCalled();
  fireEvent.click(group);
  expect(client.getSessionToolDetails).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Used tool: demo.tool2" }));
  await screen.findByText(/Second result/);
  expect(client.getSessionToolDetails).toHaveBeenCalledExactlyOnceWith("grouped", "step-2", "call-2");
  running = false;
  await act(async () => runtime.refreshMetadata());
  expect(screen.getByRole("button", { name: "3 tool calls" })).toBe(group);
  view.unmount();
  await runtime.stop();
});
