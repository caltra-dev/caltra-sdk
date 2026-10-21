import { describe, expect, it, vi } from "vitest";
import type { CaltraSessionEvent, CaltraSessionMessage } from "../src/types.js";
import { CaltraSessionRuntime } from "../src/session_runtime.js";

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

describe("CaltraSessionRuntime", () => {
  it("refreshes thinking status during answer streaming without overwriting newer metadata events", async () => {
    const message: CaltraSessionMessage = { id: assistantMessageId, role: "assistant", status: "streaming", text: "Partial answer",
      reasoning: { status: "streaming" }, created_at: "2026-10-21T00:00:00Z" };
    let emit!: () => void;
    const gate = new Promise<void>(resolve => { emit = resolve; });
    let finish!: (value: { data: CaltraSessionMessage[] }) => void;
    const client = {
      openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() {
        await gate;
        yield { event: "reasoning.updated", id: "resumed", data: { message_id: assistantMessageId, session_id: sessionId, turn_id: turnId, status: "streaming" } };
        await new Promise(() => undefined);
      }, close: async () => {} })),
      getSessionById: vi.fn(async () => ({ id: sessionId })),
      listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [message] })
        .mockResolvedValueOnce({ data: [{ ...message, text: "", reasoning: { status: "completed" } }] })
        .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })),
    };
    const runtime = new CaltraSessionRuntime(client as never, sessionId);
    await runtime.start();
    await runtime.refresh();
    expect(runtime.getSnapshot().messages[0]).toMatchObject({ text: "Partial answer", status: "streaming", reasoning: { status: "completed" } });
    const pending = runtime.refresh();
    emit();
    await vi.waitFor(() => expect(runtime.getSnapshot().messages[0]?.reasoning?.status).toBe("streaming"));
    finish({ data: [{ ...message, reasoning: { status: "completed" } }] });
    await pending;
    expect(runtime.getSnapshot().messages[0]?.reasoning?.status).toBe("streaming");
    await runtime.stop();
  });

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
    const store = new CaltraSessionRuntime(client as never, sessionId);

    const firstStart = store.start();
    await vi.waitFor(() => expect(client.openSessionEvents).toHaveBeenCalledTimes(1));
    await store.stop();
    await expect(firstStart).rejects.toThrow("stopped");
    await expect(store.start()).resolves.toBeUndefined();

    expect(client.openSessionEvents).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().connection).toBe("connected");
    await store.stop();
  });

  it("retains loaded history throughout a reconnect and ignores an obsolete history response", async () => {
    const message = { created_at: "2026-10-19T12:00:00Z", id: assistantMessageId,
      role: "assistant", status: "completed", text: "Saved transcript" };
    let finishOldRefresh!: (page: { data: never[] }) => void;
    let finishReconnect!: (page: { data: typeof message[] }) => void;
    const client = {
      openSessionEvents: vi.fn(async () => new StubEventConnection([])),
      listSessionMessages: vi.fn()
        .mockResolvedValueOnce({ data: [message] })
        .mockImplementationOnce(() => new Promise((resolve) => { finishOldRefresh = resolve; }))
        .mockImplementationOnce(() => new Promise((resolve) => { finishReconnect = resolve; })),
      getSessionById: vi.fn(async () => ({ id: sessionId, title: null })),
    };
    const store = new CaltraSessionRuntime(client as never, sessionId);
    await store.start();
    const oldRefresh = store.refresh();
    const reconnect = store.reconnect();
    await vi.waitFor(() => expect(client.listSessionMessages).toHaveBeenCalledTimes(3));
    expect(store.getSnapshot()).toMatchObject({ historyLoaded: true, messages: [message] });
    finishOldRefresh({ data: [] });
    await oldRefresh;
    expect(store.getSnapshot().messages).toEqual([message]);
    finishReconnect({ data: [message] });
    await reconnect;
    expect(store.getSnapshot()).toMatchObject({ connection: "connected", historyLoaded: true, messages: [message] });
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
    const store = new CaltraSessionRuntime(client as never, sessionId, {
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


it("keeps a live tool identity until durable completion replaces it with its result", async () => {
  const message = { id: assistantMessageId, role: "assistant", status: "completed", text: "", created_at: "2026-10-19T12:00:00Z" };
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const ids = { message_id: assistantMessageId, session_id: sessionId, turn_id: turnId };
  const client = {
    getSessionById: vi.fn(async () => ({ id: sessionId })),
    openSessionEvents: vi.fn(async () => ({ async *[Symbol.asyncIterator]() {
      yield { event: "message.started", id: "start", data: ids };
      yield { event: "tool.started", id: "tool", data: { ...ids, tool_call_id: "call-1", tool_name: "demo.echo" } };
      await gate;
      yield { event: "message.completed", id: "end", data: ids };
      await new Promise(() => undefined);
    }, close: async () => {} })),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [] }).mockResolvedValue({ data: [{ ...message, tool_calls: [{ id: "call-1", name: "demo.echo", arguments: { text: "hello" }, status: "completed", result: { text: "hello" } }] }] }),
  };
  const store = new CaltraSessionRuntime(client as never, sessionId); await store.start();
  await vi.waitFor(() => expect(store.getSnapshot().messages[0]?.tool_calls?.[0]?.status).toBe("running"));
  finish();
  await vi.waitFor(() => expect(store.getSnapshot().messages[0]?.tool_calls?.[0]).toMatchObject({ status: "completed", result: { text: "hello" } }));
  expect(store.getSnapshot().messages).toHaveLength(1); await store.stop();
});

it("uses repaired completed history after reconnect without changing the running-state rule", async () => {
  const stale = { id: assistantMessageId, role: "assistant", status: "streaming", text: "Saved answer", created_at: "2026-10-19T12:00:00Z" };
  const client = {
    openSessionEvents: vi.fn(async () => new StubEventConnection([])),
    getSessionById: vi.fn(async () => ({ id: sessionId })),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [stale] })
      .mockResolvedValue({ data: [{ ...stale, status: "completed" }] }),
  };
  const store = new CaltraSessionRuntime(client as never, sessionId);
  await store.start();
  expect(store.getSnapshot().isRunning).toBe(true);
  await store.reconnect();
  expect(store.getSnapshot()).toMatchObject({ isRunning: false, messages: [{ ...stale, status: "completed" }] });
  await store.stop();
});

it("cancels over HTTP while SSE recovers and trusts the refreshed persisted status", async () => {
  const message = { id: assistantMessageId, role: "assistant", status: "streaming", text: "Partial", created_at: "2026-10-19T12:00:00Z" };
  const client = {
    openSessionEvents: vi.fn().mockResolvedValueOnce(new StubEventConnection([])).mockImplementation(() => new Promise(() => undefined)),
    getSessionById: vi.fn(async () => ({ id: sessionId })),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [message] })
      .mockResolvedValue({ data: [{ ...message, status: "cancelled" }] }),
    cancelSession: vi.fn(async () => ({ turn_id: turnId })),
  };
  const store = new CaltraSessionRuntime(client as never, sessionId);
  await store.start();
  const reconnect = store.reconnect().catch(() => undefined);
  await vi.waitFor(() => expect(client.openSessionEvents).toHaveBeenCalledTimes(2));
  await store.cancel();
  expect(client.cancelSession).toHaveBeenCalledWith(sessionId);
  expect(store.getSnapshot()).toMatchObject({ isRunning: false, messages: [{ ...message, status: "cancelled" }] });
  await store.stop(); await reconnect;
});

it("keeps a running turn and partial text on cancellation failure, then supports retry", async () => {
  const message = { id: assistantMessageId, role: "assistant", status: "streaming", text: "Partial", created_at: "2026-10-19T12:00:00Z" };
  const failure = new Error("Cancellation failed");
  const client = {
    openSessionEvents: vi.fn(async () => new StubEventConnection([])),
    getSessionById: vi.fn(async () => ({ id: sessionId })),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [message] }).mockResolvedValue({ data: [{ ...message, status: "cancelled" }] }),
    cancelSession: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ turn_id: turnId }),
  };
  const store = new CaltraSessionRuntime(client as never, sessionId);
  await store.start();
  await expect(store.cancel()).rejects.toBe(failure);
  expect(store.getSnapshot()).toMatchObject({ error: failure, isRunning: true, messages: [message] });
  expect(client.listSessionMessages).toHaveBeenCalledOnce();
  await store.cancel();
  expect(store.getSnapshot()).toMatchObject({ error: null, isRunning: false });
  await store.stop();
});

it("creates a framework-neutral runtime without opening a connection", async () => {
  const { CaltraClient } = await import("../src/client.js");
  const fetch = vi.fn();
  const client = new CaltraClient({ fetch, authorizationCodeProvider: async () => "unused" });
  const runtime = client.createSessionRuntime({ sessionId });
  expect(runtime).toBeInstanceOf(CaltraSessionRuntime);
  expect(runtime.sessionId).toBe(sessionId);
  expect(runtime.getSnapshot()).toMatchObject({ historyLoaded: false, messages: [] });
  expect(fetch).not.toHaveBeenCalled();
});

it("ignores a send result from a stopped connection after reconciling a new connection", async () => {
  let finish!: (value: { message_id: string; turn_id: string }) => void;
  const client = {
    openSessionEvents: vi.fn(async () => new StubEventConnection([])),
    getSessionById: vi.fn(async () => ({ id: sessionId })),
    listSessionMessages: vi.fn(async () => ({ data: [] })),
    sendMessage: vi.fn(() => new Promise(resolve => { finish = resolve; })),
  };
  const runtime = new CaltraSessionRuntime(client as never, sessionId);
  const send = runtime.send("Old request");
  await vi.waitFor(() => expect(client.sendMessage).toHaveBeenCalledOnce());
  await runtime.stop(); await runtime.start();
  finish({ message_id: userMessageId, turn_id: turnId }); await send;
  expect(runtime.getSnapshot().messages).toEqual([]);
  await runtime.stop();
});
