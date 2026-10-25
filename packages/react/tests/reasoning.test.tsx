// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { CaltraChat } from "../src/ui/chat.js";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

function fixture(initialStatus: "streaming" | "completed" = "streaming") {
  const close = vi.fn(async () => undefined);
  let status = initialStatus;
  const client = {
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => undefined); }, close })),
    openSessionReasoningEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => undefined); }, close })),
    getSessionReasoning: vi.fn(async () => ({ message_id: "message", stream_id: "stream", sequence: 1, status,
      parts: [{ position: 0, text: "Separate thinking text", status }] })),
    listSessionMessages: vi.fn(async () => ({ data: [{ id: "message", role: "assistant", text: "Visible answer", status,
      reasoning: { status }, created_at: new Date().toISOString() }], next_cursor: null })),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const runtime = new CaltraSessionRuntime(client as never, "session");
  return { client, runtime, close, complete: async () => { status = "completed"; await runtime.refresh(); } };
}

describe("thinking display modes", () => {
  it("does not fetch in hidden or closed mode, and switches modes without clearing the composer", async () => {
    const f = fixture(); await f.runtime.start();
    let resolveThinking!: (value: Awaited<ReturnType<typeof f.client.getSessionReasoning>>) => void;
    const savedThinking = await f.client.getSessionReasoning();
    f.client.getSessionReasoning.mockClear();
    f.client.getSessionReasoning.mockImplementationOnce(() => new Promise(resolve => { resolveThinking = resolve; }));
    const view = render(<CaltraChat runtime={f.runtime} />);
    expect(screen.queryByRole("button", { name: /Reasoning/ })).toBeNull();
    expect(f.client.openSessionReasoningEvents).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Draft" } });
    view.rerender(<CaltraChat runtime={f.runtime} reasoningDisplay="collapsed" />);
    expect(screen.getByRole("button", { name: /Reasoning/ }).getAttribute("aria-expanded")).toBe("false");
    expect(f.client.getSessionReasoning).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Reasoning/ }));
    const loading = await screen.findByRole("status", { name: "Loading thinking…" });
    expect(loading.querySelector("svg")).toBeTruthy();
    expect(loading.textContent).toBe("");
    await waitFor(() => expect(f.client.getSessionReasoning).toHaveBeenCalledTimes(1));
    await act(async () => resolveThinking(savedThinking));
    await screen.findByText("Separate thinking text");
    expect(screen.queryByRole("status", { name: "Loading thinking…" })).toBeNull();
    await act(f.complete);
    expect(screen.getByRole("button", { name: /Reasoning/ }).getAttribute("aria-expanded")).toBe("true");
    view.rerender(<CaltraChat runtime={f.runtime} reasoningDisplay="expanded" />);
    expect(screen.getByText("Separate thinking text")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Draft");
    view.rerender(<CaltraChat runtime={f.runtime} reasoningDisplay="hidden" />);
    expect(screen.queryByText("Separate thinking text")).toBeNull();
    await waitFor(() => expect(f.close).toHaveBeenCalled());
    expect(f.client.openSessionEvents).toHaveBeenCalledTimes(1);
    await f.runtime.stop();
  });

  it("auto opens during thinking, collapses when thinking completes, and can reopen saved reasoning", async () => {
    const f = fixture(); await f.runtime.start();
    render(<CaltraChat runtime={f.runtime} reasoningDisplay="auto" />);
    await screen.findByText("Separate thinking text");
    expect(screen.getByRole("button", { name: /Reasoning/ }).getAttribute("aria-expanded")).toBe("true");
    await act(f.complete);
    await waitFor(() => expect(screen.getByRole("button", { name: /Reasoning/ }).getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(screen.getByRole("button", { name: /Reasoning/ }));
    await screen.findByText("Separate thinking text");
    expect(f.client.openSessionReasoningEvents).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status", { name: "Loading thinking…" })).toBeNull();
    await f.runtime.stop();
  });

  it("reopens completed cached thinking without a spinner, fetch, or stream", async () => {
    const f = fixture("completed"); await f.runtime.start();
    render(<CaltraChat runtime={f.runtime} reasoningDisplay="collapsed" />);
    const toggle = screen.getByRole("button", { name: /Reasoning/ });
    fireEvent.click(toggle);
    await screen.findByText("Separate thinking text");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText("Separate thinking text")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading thinking…" })).toBeNull();
    expect(f.client.getSessionReasoning).toHaveBeenCalledTimes(1);
    expect(f.client.openSessionReasoningEvents).not.toHaveBeenCalled();
    await f.runtime.stop();
  });

  it("keeps cached streaming text visible without a spinner while reopening catches up", async () => {
    const f = fixture(); await f.runtime.start();
    render(<CaltraChat runtime={f.runtime} reasoningDisplay="collapsed" />);
    const toggle = screen.getByRole("button", { name: /Reasoning/ });
    fireEvent.click(toggle);
    await screen.findByText("Separate thinking text");
    fireEvent.click(toggle);
    let resolveThinking!: (value: Awaited<ReturnType<typeof f.client.getSessionReasoning>>) => void;
    f.client.getSessionReasoning.mockImplementationOnce(() => new Promise(resolve => { resolveThinking = resolve; }));
    fireEvent.click(toggle);
    await waitFor(() => expect(f.client.getSessionReasoning).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Separate thinking text")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading thinking…" })).toBeNull();
    await act(async () => resolveThinking({ message_id: "message", stream_id: "stream", sequence: 2, status: "streaming",
      parts: [{ position: 0, text: "Separate thinking text caught up", status: "streaming" }] }));
    await screen.findByText("Separate thinking text caught up");
    await f.runtime.stop();
  });
});
