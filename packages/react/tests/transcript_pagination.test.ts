import { expect, it, vi } from "vitest";
import type { CaltraSessionEvent, CaltraSessionMessage } from "@caltra/client";
import { CaltraSessionStore } from "../src/session_store.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function message(id: string, text = id): CaltraSessionMessage {
  return { id, text, role: "assistant", status: "completed", created_at: "2026-10-21T12:00:00Z" };
}

function connection(events: CaltraSessionEvent[] = []) {
  const closed = deferred<void>();
  return {
    async *[Symbol.asyncIterator]() { for (const event of events) yield event; await closed.promise; },
    async close() { closed.resolve(); },
  };
}

it("subscribes before the bounded history snapshot to close the startup gap", async () => {
  const stream = deferred<ReturnType<typeof connection>>();
  const client = {
    openSessionEvents: vi.fn(() => stream.promise),
    listSessionMessages: vi.fn(async () => ({ data: [message("latest")], next_cursor: "older" })),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const store = new CaltraSessionStore(client as never, "session");
  const started = store.start();
  expect(client.listSessionMessages).not.toHaveBeenCalled();
  stream.resolve(connection());
  await started;
  expect(client.openSessionEvents).toHaveBeenCalledBefore(client.listSessionMessages);
  expect(client.listSessionMessages).toHaveBeenCalledExactlyOnceWith("session", { limit: 20 });
  expect(store.getSnapshot().messages.map(item => item.id)).toEqual(["latest"]);
  expect(store.getSnapshot().hasOlderMessages).toBe(true);
  await store.stop();
});

it("deduplicates a streamed message against history without losing live text", async () => {
  const history = deferred<{ data: CaltraSessionMessage[]; next_cursor: string | null }>();
  const data = { message_id: "live", session_id: "session", turn_id: "turn" };
  const delta = { event: "message.delta" as const, id: "stream:1", data: { ...data, delta: "Hello" } };
  const client = {
    openSessionEvents: vi.fn(async () => connection([
      { event: "message.started", id: "stream:started", data }, delta, delta,
    ])),
    listSessionMessages: vi.fn(() => history.promise),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const store = new CaltraSessionStore(client as never, "session");
  const started = store.start();
  await vi.waitFor(() => expect(store.getSnapshot().messages[0]?.text).toBe("Hello"));
  history.resolve({ data: [message("old"), { ...message("live", ""), status: "streaming" }], next_cursor: "older" });
  await started;
  expect(store.getSnapshot().messages.map(item => item.id)).toEqual(["old", "live"]);
  expect(store.getSnapshot().messages[1]?.text).toBe("Hello");
  await store.stop();
});

it("loads older pages only on demand and retains them during recent-history refresh", async () => {
  const client = {
    openSessionEvents: vi.fn(async () => connection()),
    listSessionMessages: vi.fn(async (_session: string, input: { cursor?: string }) => input.cursor
      ? { data: [message("oldest"), message("recent")], next_cursor: null }
      : { data: [message("recent")], next_cursor: "older" }),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const store = new CaltraSessionStore(client as never, "session");
  await store.start();
  expect(client.listSessionMessages.mock.calls.every(([, input]) => !input.cursor)).toBe(true);
  await Promise.all([store.loadOlder(), store.loadOlder()]);
  expect(client.listSessionMessages.mock.calls.filter(([, input]) => input.cursor)).toHaveLength(1);
  expect(client.listSessionMessages).toHaveBeenCalledWith("session", { limit: 20, cursor: "older" });
  await store.refresh();
  expect(store.getSnapshot().messages.map(item => item.id)).toEqual(["oldest", "recent"]);
  expect(store.getSnapshot().hasOlderMessages).toBe(false);
  await store.stop();
});

it("uses completed canonical text once even when buffered deltas overlap it", async () => {
  const release = deferred<void>();
  const data = { message_id: "complete", session_id: "session", turn_id: "turn" };
  const client = {
    openSessionEvents: vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        await release.promise;
        yield { event: "message.delta", id: "stream:2", data: { ...data, delta: "answer" } };
        await new Promise(() => undefined);
      }, close: async () => undefined,
    })),
    listSessionMessages: vi.fn(async () => ({ data: [message("complete", "Complete answer")], next_cursor: null })),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const store = new CaltraSessionStore(client as never, "session");
  await store.start();
  release.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getSnapshot().messages).toEqual([message("complete", "Complete answer")]);
  expect(store.getSnapshot().isRunning).toBe(false);
  await store.stop();
});

it("retains the cursor and visible messages when older-page loading fails, then retries", async () => {
  let failed = false;
  const client = {
    openSessionEvents: vi.fn(async () => connection()),
    listSessionMessages: vi.fn(async (_session: string, input: { cursor?: string }) => {
      if (!input.cursor) return { data: [message("recent")], next_cursor: "older" };
      if (!failed) { failed = true; throw new Error("Unavailable"); }
      return { data: [message("old")], next_cursor: null };
    }),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const store = new CaltraSessionStore(client as never, "session");
  await store.start();
  await expect(store.loadOlder()).rejects.toThrow("Unavailable");
  expect(store.getSnapshot()).toMatchObject({ loadingOlder: false, hasOlderMessages: true, messages: [message("recent")] });
  await store.loadOlder();
  expect(store.getSnapshot()).toMatchObject({ olderError: null, hasOlderMessages: false });
  expect(store.getSnapshot().messages.map(item => item.id)).toEqual(["old", "recent"]);
  await store.stop();
});

it("keeps consuming new messages during a slow completion refresh", async () => {
  const completion = deferred<{ data: CaltraSessionMessage[]; next_cursor: null }>();
  const release = deferred<void>();
  const data = { message_id: "first", session_id: "session", turn_id: "turn" };
  const client = {
    openSessionEvents: vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        await release.promise;
        yield { event: "message.completed", id: "a:completed", data };
        yield { event: "message.delta", id: "b:1", data: { ...data, message_id: "second", delta: "Live" } };
        await new Promise(() => undefined);
      }, close: async () => undefined,
    })),
    listSessionMessages: vi.fn().mockResolvedValueOnce({ data: [], next_cursor: null }).mockImplementation(() => completion.promise),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const store = new CaltraSessionStore(client as never, "session");
  await store.start();
  release.resolve();
  await vi.waitFor(() => expect(store.getSnapshot().messages.some(item => item.id === "second" && item.text === "Live")).toBe(true));
  completion.resolve({ data: [message("first")], next_cursor: null });
  await vi.waitFor(() => expect(store.getSnapshot().messages.map(item => item.id)).toEqual(["first", "second"]));
  await store.stop();
});

it("keeps earlier history before a disjoint new page and preserves its new gap cursor", async () => {
  const older = deferred<{ data: CaltraSessionMessage[]; next_cursor: null }>();
  let latest = false;
  const client = {
    openSessionEvents: vi.fn(async () => connection()),
    listSessionMessages: vi.fn(async (_id: string, input: { cursor?: string }) => {
      if (input.cursor === "old-cursor") return older.promise;
      if (input.cursor === "new-gap") return { data: [message("between")], next_cursor: "old-cursor" };
      return latest ? { data: [message("new")], next_cursor: "new-gap" } : { data: [message("old")], next_cursor: "old-cursor" };
    }),
    getSessionById: vi.fn(async () => ({ id: "session" })),
  };
  const runtime = new CaltraSessionStore(client as never, "session");
  await runtime.start();
  const loading = runtime.loadOlder();
  latest = true; await runtime.refresh();
  expect(runtime.getSnapshot().messages.map(item => item.id)).toEqual(["old", "new"]);
  older.resolve({ data: [message("oldest")], next_cursor: null }); await loading;
  expect(runtime.getSnapshot().hasOlderMessages).toBe(true);
  await runtime.loadOlder();
  expect(client.listSessionMessages).toHaveBeenLastCalledWith("session", { limit: 20, cursor: "new-gap" });
  expect(runtime.getSnapshot().messages.map(item => item.id)).toEqual(["oldest", "old", "between", "new"]);
  await runtime.stop();
});
