import { describe, expect, it, vi } from "vitest";
import { CaltraReasoningRuntime } from "../src/reasoning_runtime.js";
import { CaltraSessionRuntime } from "../src/session_runtime.js";
import { CaltraSessionEventConnection } from "../src/event_connection.js";
import type { CaltraReasoningSnapshot, CaltraSessionEvent } from "../src/types.js";

const session = "10000000-0000-4000-8000-000000000001";
const message = "20000000-0000-4000-8000-000000000001";
const stream = "30000000-0000-4000-8000-000000000001";
const turn = "40000000-0000-4000-8000-000000000001";
function fixture() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const calls: string[] = [];
  let resolve!: (value: CaltraReasoningSnapshot) => void;
  const client = {
    openSessionReasoningEvents: vi.fn(async () => {
      calls.push("stream");
      return new CaltraSessionEventConnection(new Response(new ReadableStream({ start: value => { controller = value; } })));
    }),
    getSessionReasoning: vi.fn(async () => { calls.push("snapshot"); return await new Promise<CaltraReasoningSnapshot>(done => { resolve = done; }); }),
  };
  const emit = (sequence: number, delta: string, kind: "content_delta" | "part_completed" = "content_delta") => {
    const event: CaltraSessionEvent = { event: "reasoning.delta", id: String(sequence), data: {
      message_id: message, session_id: session, turn_id: turn, stream_id: stream, sequence, position: 0, kind, delta,
    } };
    controller.enqueue(new TextEncoder().encode(`event: ${event.event}\nid: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`));
  };
  const snapshot = (text: string, sequence: number): CaltraReasoningSnapshot => ({
    message_id: message, stream_id: stream, sequence, status: "streaming", parts: [{ position: 0, text, status: "streaming" }],
  });
  return { client, calls, emit, snapshot, end: () => controller.close(), resolve: (value: CaltraReasoningSnapshot) => resolve(value) };
}

describe("independent reasoning", () => {
  it("subscribes before fetching and deduplicates overlap by watermark, then catches up on reopening", async () => {
    const f = fixture();
    const resource = new CaltraReasoningRuntime(f.client as never, session, message);
    expect(f.calls).toEqual([]);
    const start = resource.start();
    await vi.waitFor(() => expect(f.calls).toEqual(["stream", "snapshot"]));
    f.emit(1, "A"); f.emit(2, "B"); f.emit(3, "C");
    f.resolve(f.snapshot("AB", 2));
    await start;
    await vi.waitFor(() => expect(resource.getSnapshot().parts[0]?.text).toBe("ABC"));
    f.emit(3, "C");
    f.emit(4, "", "part_completed");
    await vi.waitFor(() => expect(resource.getSnapshot().streaming).toBe(false));
    expect(resource.getSnapshot().parts[0]?.text).toBe("ABC");
    await resource.stop();
    expect(resource.getSnapshot().parts[0]?.text).toBe("ABC");
    const reopened = resource.start();
    await vi.waitFor(() => expect(f.calls).toEqual(["stream", "snapshot", "stream", "snapshot"]));
    f.resolve({ ...f.snapshot("ABCDE", 6), status: "completed", parts: [{ position: 0, text: "ABCDE", status: "completed" }] });
    await reopened;
    expect(resource.getSnapshot()).toMatchObject({ streaming: false, error: null, parts: [{ text: "ABCDE" }] });
    await resource.stop();
    await resource.start();
    expect(f.calls).toEqual(["stream", "snapshot", "stream", "snapshot"]);
    expect(resource.getSnapshot().loading).toBe(false);
    await resource.stop();
  });

  it("uses transcript completion to fetch without SSE, follows resumed thinking, and caches the final snapshot", async () => {
    const f = fixture();
    let messageStatus: "streaming" | "completed" = "streaming";
    let reasoningStatus: "streaming" | "completed" = "completed";
    const runtime = new CaltraSessionRuntime({ ...f.client,
      listSessionMessages: async () => ({ data: [{ id: message, role: "assistant", text: "Answer still streaming",
        status: messageStatus, reasoning: { status: reasoningStatus }, created_at: "2026-10-21T00:00:00Z" }], next_cursor: null }),
    } as never, session);
    await runtime.refresh();
    const resource = runtime.reasoning(message);
    const starting = resource.start();
    expect(f.calls).toEqual(["snapshot"]);
    f.resolve({ ...f.snapshot("First thought", 2), parts: [{ position: 0, text: "First thought", status: "completed" }] });
    await starting;
    expect(resource.getSnapshot().streaming).toBe(false);

    reasoningStatus = "streaming";
    await runtime.refresh();
    await vi.waitFor(() => expect(f.calls).toEqual(["snapshot", "stream", "snapshot"]));
    f.resolve(f.snapshot("First thought plus more", 3));
    await resource.start();
    expect(resource.getSnapshot().streaming).toBe(true);

    reasoningStatus = "completed";
    messageStatus = "completed";
    await runtime.refresh();
    expect(f.calls).toEqual(["snapshot", "stream", "snapshot", "snapshot"]);
    f.resolve({ ...f.snapshot("Final thought", 4), status: "completed", parts: [{ position: 0, text: "Final thought", status: "completed" }] });
    await resource.start();
    await resource.stop();
    await resource.start();
    expect(f.calls).toHaveLength(4);
    expect(resource.getSnapshot()).toMatchObject({ loading: false, streaming: false, parts: [{ text: "Final thought" }] });
    await runtime.stop();
  });

  it("fetches once without SSE when the transcript message was already completed", async () => {
    const f = fixture();
    const runtime = new CaltraSessionRuntime({ ...f.client,
      listSessionMessages: async () => ({ data: [{ id: message, role: "assistant", text: "Answer", status: "completed",
        reasoning: { status: "completed" }, created_at: "2026-10-21T00:00:00Z" }], next_cursor: null }),
    } as never, session);
    await runtime.refresh();
    const resource = runtime.reasoning(message);
    const starting = resource.start();
    expect(f.calls).toEqual(["snapshot"]);
    f.resolve({ ...f.snapshot("Saved thought", 4), status: "completed", parts: [{ position: 0, text: "Saved thought", status: "completed" }] });
    await starting;
    await resource.stop();
    await resource.start();
    expect(f.calls).toEqual(["snapshot"]);
    expect(resource.getSnapshot().loading).toBe(false);
    await runtime.stop();
  });

  it("does not apply a snapshot that arrives after collapsing", async () => {
    const f = fixture();
    const resource = new CaltraReasoningRuntime(f.client as never, session, message);
    const start = resource.start();
    await vi.waitFor(() => expect(f.calls).toHaveLength(2));
    await resource.stop();
    f.resolve(f.snapshot("obsolete", 2));
    await start;
    expect(resource.getSnapshot().parts).toEqual([]);
  });

  it("reports a failed fetch locally and allows retry without restarting chat", async () => {
    const f = fixture();
    f.client.getSessionReasoning.mockRejectedValueOnce(new Error("Offline"));
    const resource = new CaltraReasoningRuntime(f.client as never, session, message);
    await expect(resource.start()).rejects.toThrow("Offline");
    expect(resource.getSnapshot().error?.message).toBe("Offline");
    const retry = resource.start();
    await vi.waitFor(() => expect(f.client.getSessionReasoning).toHaveBeenCalledTimes(2));
    f.resolve({ ...f.snapshot("Recovered", 2), status: "completed" });
    await retry;
    expect(resource.getSnapshot().error).toBeNull();
    await resource.stop();
  });

  it("reports disconnection independently and refetches authoritative text on retry", async () => {
    const f = fixture();
    const resource = new CaltraReasoningRuntime(f.client as never, session, message);
    const starting = resource.start();
    await vi.waitFor(() => expect(f.calls).toHaveLength(2));
    f.resolve(f.snapshot("Before", 1)); await starting;
    f.end();
    await vi.waitFor(() => expect(resource.getSnapshot().error).not.toBeNull());
    const retry = resource.start();
    await vi.waitFor(() => expect(f.calls).toHaveLength(4));
    f.resolve({ ...f.snapshot("Before and after", 4), status: "cancelled", parts: [{position:0,text:"Before and after",status:"completed"}] });
    await retry;
    expect(resource.getSnapshot()).toMatchObject({error:null,streaming:false,parts:[{text:"Before and after"}]});
    await resource.stop();
  });

  it("stopping the main runtime aborts active disclosures, including resources reopened after stopping", async () => {
    const f = fixture();
    const runtime = new CaltraSessionRuntime(f.client as never, session);
    const resource = runtime.reasoning(message);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const starting = resource.start();
      await vi.waitFor(() => expect(f.calls).toHaveLength(attempt * 2));
      f.resolve(f.snapshot("Owned", 1)); await starting;
      const signal = f.client.openSessionReasoningEvents.mock.calls.at(-1) as unknown as [string,string,{signal:AbortSignal}];
      await runtime.stop();
      expect(signal[2].signal.aborted).toBe(true);
      expect(resource.getSnapshot().parts[0]?.text).toBe("Owned");
    }
  });
});
