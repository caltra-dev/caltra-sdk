// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "@caltra/client";
import { useAssistantUiRuntime } from "../src/index.js";

function fixture() {
  const close = vi.fn(async () => {});
  const client = {
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() { await new Promise(() => {}); }, close })),
    listSessionMessages: vi.fn(async () => ({ data: [], next_cursor: null })),
    getSessionById: vi.fn(async () => ({ id: "session" })),
    sendMessage: vi.fn(async () => ({ message_id: "saved", turn_id: "turn" })),
    cancelSession: vi.fn(async () => ({ turn_id: "turn" })),
  };
  return { client, close, session: new CaltraSessionRuntime(client as never, "session") };
}

describe("useAssistantUiRuntime", () => {
  it("exposes native earlier history and joins concurrent page requests", async () => {
    const f = fixture();
    let release!: (value: unknown) => void;
    const message = (id: string) => ({ id, role: "assistant", text: id, status: "completed", created_at: "2026-10-21T00:00:00Z" });
    f.client.listSessionMessages.mockResolvedValueOnce({ data: [message("latest")], next_cursor: "older" } as never)
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve as never; }));
    const hook = renderHook(() => useAssistantUiRuntime(f.session));
    await act(() => f.session.start());
    expect(hook.result.current.thread.getState().hasEarlier).toBe(true);
    let first!: Promise<void>; let second!: Promise<void>;
    act(() => {
      first = hook.result.current.thread.loadEarlier();
      second = hook.result.current.thread.loadEarlier();
    });
    expect(hook.result.current.thread.getState().isLoadingEarlier).toBe(true);
    await waitFor(() => expect(f.client.listSessionMessages).toHaveBeenCalledTimes(2));
    await act(async () => {
      release({ data: [message("earliest")], next_cursor: null });
      await Promise.all([first, second]);
    });
    expect(hook.result.current.thread.getState().messages.map(message => message.id)).toEqual(["earliest", "latest"]);
    expect(hook.result.current.thread.getState().hasEarlier).toBe(false);
    expect(hook.result.current.thread.getState().isLoadingEarlier).toBe(false);
    await act(() => hook.result.current.thread.loadEarlier());
    expect(f.client.listSessionMessages).toHaveBeenCalledTimes(2);
    hook.unmount(); await f.session.stop();
  });
  it("shares canonical messages and one connection without owning the caller's lifecycle", async () => {
    const f = fixture();
    const first = renderHook(() => useAssistantUiRuntime(f.session));
    const second = renderHook(() => useAssistantUiRuntime(f.session));
    expect(f.client.openSessionEvents).not.toHaveBeenCalled();
    await act(() => f.session.start());
    act(() => { first.result.current.thread.append("Hello"); });
    await waitFor(() => expect(second.result.current.thread.getState().messages[0]?.id).toBe("saved"));
    expect(second.result.current.thread.getState().messages[0]?.content).toEqual([{ type: "text", text: "Hello" }]);
    expect(f.client.openSessionEvents).toHaveBeenCalledOnce();
    expect(f.client.sendMessage).toHaveBeenCalledOnce();
    first.unmount(); second.unmount();
    expect(f.close).not.toHaveBeenCalled();
    await f.session.stop();
    expect(f.close).toHaveBeenCalledOnce();
  });
});
