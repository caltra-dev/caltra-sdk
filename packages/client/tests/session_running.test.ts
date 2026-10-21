import { describe, expect, it, vi } from "vitest";
import { CaltraSessionRuntime } from "../src/session_runtime.js";
import type { CaltraSessionEvent } from "../src/types.js";

const sessionId = "40000000-0000-4000-8000-000000000001";
const ids = { session_id: sessionId, turn_id: "60000000-0000-4000-8000-000000000001", message_id: "50000000-0000-4000-8000-000000000001" };

class Events implements AsyncIterable<CaltraSessionEvent> {
  private queued: CaltraSessionEvent[] = [];
  private wake?: () => void;
  private closed = false;
  push(event: CaltraSessionEvent) { this.queued.push(event); this.wake?.(); }
  async close() { this.closed = true; this.wake?.(); }
  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      if (this.queued.length) yield this.queued.shift()!;
      else await new Promise<void>(resolve => { this.wake = resolve; });
    }
  }
}

function fixture(initiallyRunning = true) {
  let running = initiallyRunning;
  const events = new Events();
  const client = {
    openSessionEvents: vi.fn(async () => events),
    getSessionById: vi.fn(async () => ({ id: sessionId, is_running: running })),
    listSessionMessages: vi.fn(async () => ({ data: [{ id: ids.message_id, role: "assistant", status: "completed", text: "Tool request", created_at: "2026-10-21T12:00:00Z" }], next_cursor: null })),
    sendMessage: vi.fn(async () => ({ message_id: ids.message_id, turn_id: ids.turn_id })),
    cancelSession: vi.fn(async () => { running = false; return { turn_id: ids.turn_id }; }),
  };
  const runtime = new CaltraSessionRuntime(client as never, sessionId);
  return { client, events, runtime, finish: () => { running = false; events.push({ event: "session.updated", id: "state", data: { session_id: sessionId } }); } };
}

describe("authoritative turn lifecycle", () => {
  it("loads a running turn between messages and stays running through message completion and refresh", async () => {
    const { runtime, events, client, finish } = fixture();
    await runtime.start();
    expect(runtime.getSnapshot().isRunning).toBe(true);
    const transitions: boolean[] = [];
    const unsubscribe = runtime.subscribe(() => transitions.push(runtime.getSnapshot().isRunning));
    events.push({ event: "message.completed", id: "message-end", data: ids });
    await vi.waitFor(() => expect(client.listSessionMessages.mock.calls.length).toBeGreaterThan(1));
    await runtime.refresh();
    expect(transitions).not.toContain(false);
    finish();
    await vi.waitFor(() => expect(runtime.getSnapshot().isRunning).toBe(false));
    unsubscribe(); await runtime.stop();
  });

  it("does not resurrect a finished turn from stale streaming transcript rows", async () => {
    const { runtime, client } = fixture(false);
    client.listSessionMessages.mockResolvedValue({ data: [{ id: ids.message_id, role: "assistant", status: "streaming", text: "Interrupted", created_at: "2026-10-21T12:00:00Z" }], next_cursor: null });
    await runtime.start();
    expect(runtime.getSnapshot().isRunning).toBe(false);
    await runtime.refresh();
    expect(runtime.getSnapshot().isRunning).toBe(false);
    await runtime.stop();
  });

  it("stays busy while submitting and after acceptance before the first assistant message", async () => {
    const { runtime, client } = fixture(false);
    let accept!: (value: { message_id: string; turn_id: string }) => void;
    client.sendMessage.mockImplementation(() => new Promise(resolve => { accept = resolve; }));
    await runtime.start();
    const send = runtime.send("Hello");
    await vi.waitFor(() => expect(client.sendMessage).toHaveBeenCalled());
    expect(runtime.getSnapshot().isRunning).toBe(true);
    client.getSessionById.mockResolvedValue({ id: sessionId, is_running: true });
    accept({ message_id: ids.message_id, turn_id: ids.turn_id }); await send;
    expect(runtime.getSnapshot().isRunning).toBe(true);
    await runtime.stop();
  });

  it("reconciles cancellation with authoritative state even between messages", async () => {
    const { runtime } = fixture();
    await runtime.start();
    expect(runtime.getSnapshot().isRunning).toBe(true);
    await runtime.cancel();
    expect(runtime.getSnapshot().isRunning).toBe(false);
    await runtime.stop();
  });
});
