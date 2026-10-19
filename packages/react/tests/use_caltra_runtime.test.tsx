// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCaltraRuntime } from "../src/use_caltra_runtime.js";

describe("useCaltraRuntime", () => {
  it("keeps unknown history loading until an empty response is confirmed", async () => {
    let resolveHistory!: (value: { data: []; next_cursor: null }) => void;
    const client = {
      openSessionEvents: vi.fn(async () => ({
        async *[Symbol.asyncIterator]() { await new Promise(() => undefined); },
        close: vi.fn(async () => undefined),
      })),
      listSessionMessages: vi.fn(() => new Promise((resolve) => { resolveHistory = resolve; })),
      getSessionById: vi.fn(async () => ({ id: "session" })),
    };
    const { result, unmount } = renderHook(() => useCaltraRuntime({ client: client as never, sessionId: "session" }));
    await waitFor(() => expect(client.listSessionMessages).toHaveBeenCalledOnce());
    expect(result.current.runtime.thread.getState().isLoading).toBe(true);
    await act(async () => { resolveHistory({ data: [], next_cursor: null }); });
    await waitFor(() => expect(result.current.connection).toBe("connected"));
    expect(result.current.runtime.thread.getState().isLoading).toBe(false);
    unmount();
  });

  it("keeps one branch when a pending message receives its persisted ID and history refreshes", async () => {
    let accept!: (value: { message_id: string; turn_id: string }) => void;
    let history: Array<{ id: string; role: "user"; text: string; status: "completed"; created_at: string }> = [];
    const client = {
      invalidateToken: vi.fn(),
      listSessionMessages: vi.fn(async () => ({ data: history, next_cursor: null })),
      getSessionById: vi.fn(async () => ({ id: "session", title: null })),
      openSessionEvents: vi.fn(async () => ({
        async *[Symbol.asyncIterator]() { await new Promise(() => undefined); },
        close: vi.fn(async () => undefined),
      })),
      sendMessage: vi.fn(() => new Promise<{ message_id: string; turn_id: string }>((resolve) => { accept = resolve; })),
    };
    const { result, unmount } = renderHook(() => useCaltraRuntime({ client: client as never, sessionId: "session" }));
    await waitFor(() => expect(result.current.connection).toBe("connected"));
    act(() => { result.current.runtime.thread.append("Hi"); });
    await waitFor(() => expect(client.sendMessage).toHaveBeenCalledOnce());
    expect(result.current.runtime.thread.getMessageByIndex(0).getState().branchCount).toBe(1);
    await act(async () => { accept({ message_id: "saved-user", turn_id: "turn" }); });
    await waitFor(() => expect(result.current.runtime.thread.getState().messages[0]?.id).toBe("saved-user"));
    expect(result.current.runtime.thread.getMessageByIndex(0).getState().branchCount).toBe(1);
    history = [{ id: "saved-user", role: "user", text: "Hi", status: "completed", created_at: new Date().toISOString() }];
    await act(async () => { await result.current.refresh(); });
    expect(result.current.runtime.thread.getMessageByIndex(0).getState().branchCount).toBe(1);
    history = [];
    await act(async () => { await result.current.refresh(); });
    expect(result.current.runtime.thread.getState().messages).toHaveLength(0);
    unmount();
  });

  it("exposes an assistant-ui runtime after the Caltra stream is established", async () => {
    const connection = {
      async *[Symbol.asyncIterator]() {
        await new Promise(() => undefined);
      },
      close: vi.fn(async () => undefined),
    };
    const client = {
      invalidateToken: vi.fn(),
      listSessionMessages: vi.fn(async () => ({ data: [], next_cursor: null })),
      getSessionById: vi.fn(async () => ({ id: "40000000-0000-4000-8000-000000000001", title: null })),
      openSessionEvents: vi.fn(async () => connection),
      sendMessage: vi.fn(),
    };

    const { result, unmount } = renderHook(() => useCaltraRuntime({
      client: client as never,
      sessionId: "40000000-0000-4000-8000-000000000001",
    }));

    await waitFor(() => expect(result.current.connection).toBe("connected"));
    expect(result.current.runtime).toBeDefined();
    expect(client.openSessionEvents).toHaveBeenCalledBefore(client.listSessionMessages);
    unmount();
  });
});
