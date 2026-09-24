import { describe, expect, it, vi } from "vitest";
import type { CaltraSessionEvent } from "@caltra/client";
import { CaltraSessionStore } from "../src/session_store.js";

const sessionId = "40000000-0000-4000-8000-000000000001";
const userMessageId = "50000000-0000-4000-8000-000000000001";
const assistantMessageId = "50000000-0000-4000-8000-000000000002";
const turnId = "60000000-0000-4000-8000-000000000001";

/** Provides a finite event sequence while remaining open until the store closes it. */
class StubEventConnection implements AsyncIterable<CaltraSessionEvent> {
  private release?: () => void;

  constructor(private readonly events: CaltraSessionEvent[]) {}

  async *[Symbol.asyncIterator](): AsyncIterator<CaltraSessionEvent> {
    for (const event of this.events) yield event;
    await new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  async close(): Promise<void> {
    this.release?.();
  }
}

describe("CaltraSessionStore", () => {
  it("restarts after a development Strict Mode start-stop-start cycle", async () => {
    const connection = new StubEventConnection([]);
    let attempts = 0;
    const client = {
      invalidateToken: vi.fn(),
      listSessionMessages: vi.fn(async () => ({ data: [], next_cursor: null })),
      getSessionById: vi.fn(async () => ({ id: sessionId, title: null })),
      openSessionEvents: vi.fn(async (_sessionId: string, options: { signal?: AbortSignal }) => {
        attempts += 1;
        if (attempts > 1) return connection;
        return await new Promise<StubEventConnection>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }),
      sendMessage: vi.fn(),
    };
    const store = new CaltraSessionStore(client as never, sessionId);

    const firstStart = store.start();
    await vi.waitFor(() => expect(client.openSessionEvents).toHaveBeenCalledTimes(1));
    await store.stop();
    await expect(firstStart).rejects.toThrow("stopped");
    await expect(store.start()).resolves.toBeUndefined();

    expect(client.openSessionEvents).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().connection).toBe("connected");
    await store.stop();
  });

  it("connects before history and sending, then reconciles streamed completion", async () => {
    const calls: string[] = [];
    let historyLoads = 0;
    let metadataLoads = 0;
    const connection = new StubEventConnection([
      {
        data: { message_id: assistantMessageId, session_id: sessionId, turn_id: turnId },
        event: "message.started",
        id: "stream:started",
      },
      {
        data: {
          delta: "Hello",
          message_id: assistantMessageId,
          session_id: sessionId,
          turn_id: turnId,
        },
        event: "message.delta",
        id: "stream:0",
      },
      {
        data: { message_id: assistantMessageId, session_id: sessionId, turn_id: turnId },
        event: "message.completed",
        id: "stream:completed",
      },
      { data: { session_id: sessionId }, event: "session.updated", id: "metadata:1" },
    ]);
    const client = {
      invalidateToken: vi.fn(),
      openSessionEvents: vi.fn(async () => {
        calls.push("open");
        return connection;
      }),
      listSessionMessages: vi.fn(async () => {
        calls.push("history");
        historyLoads += 1;
        return {
          data: historyLoads === 1 ? [] : [{
            created_at: "2026-08-26T16:01:00.000Z",
            id: assistantMessageId,
            role: "assistant",
            status: "completed",
            text: "Hello durable",
          }],
          next_cursor: null,
        };
      }),
      getSessionById: vi.fn(async () => ({
        id: sessionId,
        title: ++metadataLoads === 1 ? null : "Hello durable",
      })),
      sendMessage: vi.fn(async () => {
        calls.push("send");
        return { message_id: userMessageId, turn_id: turnId };
      }),
    };
    const store = new CaltraSessionStore(client as never, sessionId, {
      retryDelay: async () => undefined,
    });

    await store.start();
    await store.send("Hi");
    await vi.waitFor(() => {
      expect(store.getSnapshot().messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: assistantMessageId, text: "Hello durable" }),
      ]));
    });
    await vi.waitFor(() => expect(store.getSnapshot().session?.title).toBe("Hello durable"));

    expect(calls.slice(0, 3)).toEqual(["open", "history", "send"]);
    expect(store.getSnapshot()).toMatchObject({ connection: "connected", isRunning: false });
    await store.stop();
  });
});
