// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCaltraRuntime } from "../src/use_caltra_runtime.js";

describe("useCaltraRuntime", () => {
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
