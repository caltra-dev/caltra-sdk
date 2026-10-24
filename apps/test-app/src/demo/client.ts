import { CaltraClient, CaltraSessionEventConnection, type CaltraSession, type CaltraSessionMessage, type CaltraSessionEvent, type CaltraPageInput, type CaltraReasoningSnapshot } from "@caltra/client";

export const demoSessionId = "70000000-0000-4000-8000-000000000001";
const turnId = "70000000-0000-4000-8000-000000000002";
const createdAt = "2026-10-21T12:00:00.000Z";

/** In-memory demonstration only. No credentials, API calls, or shared mutable data. */
export class DemoClient extends CaltraClient {
  private streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private reasoningStreams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private generation = 0;
  private running = false;
  private failEarlier = false;
  messages: CaltraSessionMessage[] = Array.from({ length: 60 }, (_, index) => ({
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    created_at: createdAt, role: index % 2 ? "assistant" : "user", status: "completed",
    ...(index === 57 || index === 59 ? { tool_calls: [{ id: `saved-tool-${index}`, name: index === 57 ? "demo.echo" : "demo.fail",
      status: index === 57 ? "completed" as const : "failed" as const, arguments: { text: "Loaded on expansion" },
      result: index === 57 ? { text: "Lazy details loaded" } : { status: "failed", message: "Intentional sample failure" } }] } : {}),
    ...(index === 59 ? { reasoning: { status: "completed" as const } } : {}),
    text: `Saved message ${index + 1}\n\nThis is deterministic sample history. Scroll up to read it while new steps arrive. Your reading position should remain unchanged.`,
  }));

  private reasoningSnapshots = new Map<string, CaltraReasoningSnapshot>([[this.messages[59]!.id, {
    message_id: this.messages[59]!.id, stream_id: null, sequence: 0, status: "completed",
    parts: [{ position: 0, status: "completed", text: "Simulated reasoning summary: inspect the sample input, check the tool result, and prepare a concise answer." }],
  }]]);
  override async getSessionReasoning(_sessionId: string, messageId: string) {
    const snapshot = this.reasoningSnapshots.get(messageId);
    if (!snapshot) throw new Error("Sample reasoning not found.");
    return structuredClone(snapshot);
  }

  constructor(private readonly sessionId = demoSessionId) {
    super({ authorizationCodeProvider: async () => "unused-demo-code", fetch: async () => { throw new Error("The demo never uses the network."); } });
  }
  override async getSessionById(id: string): Promise<CaltraSession> {
    return { id, is_running: this.running, auto_name: false, title: this.sessionId === demoSessionId ? "Sample history" : null, title_source: "manual", title_updated_at: null,
      agentIdentity: null, agent: { id: this.sessionId, name: "Demo" }, created_at: createdAt,
      updated_at: createdAt, external_id: null, status: "active" };
  }
  override async listSessionMessages(_sessionId: string, input: CaltraPageInput = {}) {
    if (input.cursor) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.failEarlier) {
        this.failEarlier = false;
        throw new Error("Simulated earlier-history failure.");
      }
    }
    const end = input.cursor ? Number(input.cursor) : this.messages.length;
    const start = Math.max(0, end - Math.min(input.limit ?? 20, 20));
    const data = structuredClone(this.messages.slice(start, end)).map(message => ({ ...message,
      ...(message.tool_calls ? { tool_calls: message.tool_calls.map(({ id, name, status }) => ({ id, name, status })) } : {}) }));
    return { data, next_cursor: start ? String(start) : null };
  }
  failNextHistoryLoad() { this.failEarlier = true; }
  override async getSessionToolDetails(_sessionId: string, messageId: string, toolCallId: string) {
    await new Promise(resolve => setTimeout(resolve, 350));
    const tool = this.messages.find(message => message.id === messageId)?.tool_calls?.find(call => call.id === toolCallId);
    if (!tool) throw new Error("Sample tool not found.");
    return { ...structuredClone(tool), arguments: tool.arguments ?? {} };
  }
  override async openSessionEvents(_id: string, options: { signal?: AbortSignal } = {}) {
    return new CaltraSessionEventConnection(this.eventResponse(options));
  }
  eventResponse(options: { signal?: AbortSignal; reasoning?: boolean } = {}) {
    const streams = options.reasoning ? this.reasoningStreams : this.streams;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const abort = () => { if (streams.delete(controller)) controller.close(); };
    const stream = new ReadableStream<Uint8Array>({
      start: value => { controller = value; streams.add(value); },
      cancel: () => { streams.delete(controller); options.signal?.removeEventListener("abort", abort); },
    });
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  }
  private emit(event: CaltraSessionEvent, reasoningOnly = false) {
    const bytes = new TextEncoder().encode(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    for (const controller of reasoningOnly ? this.reasoningStreams : this.streams) controller.enqueue(bytes);
  }
  private later(fn: () => void, delay: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, delay);
    this.timers.add(timer);
  }
  streamSteps() {
    const generation = ++this.generation;
    this.running = true;
    this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: this.sessionId } });
    for (let index = 0; index < 8; index++) this.later(() => {
      if (generation !== this.generation) return;
      const messageId = crypto.randomUUID();
      const data = { session_id: this.sessionId, turn_id: turnId, message_id: messageId };
      this.messages.push({ id: messageId, created_at: createdAt, role: "assistant", status: "streaming", text: "" });
      this.emit({ event: "message.started", id: `${messageId}:start`, data });
      this.later(() => {
        if (generation !== this.generation) return;
        const message = this.messages.find(value => value.id === messageId)!;
        if (index % 2) {
          message.tool_calls = [{ id: messageId, name: "demo.read", arguments: {}, status: "running" }];
          this.emit({ event: "tool.started", id: `${messageId}:tool`, data: { ...data, tool_call_id: messageId, tool_name: "demo.read" } });
        } else {
          message.text = `Incoming step ${index + 1}: reading position preserved.`;
          this.emit({ event: "message.delta", id: `${messageId}:text`, data: { ...data, delta: message.text } });
        }
      }, 150);
      this.later(() => {
        if (generation !== this.generation) return;
        const message = this.messages.find(value => value.id === messageId)!;
        message.status = "completed";
        for (const tool of message.tool_calls ?? []) { tool.status = "completed"; tool.result = { ok: true }; }
        this.emit({ event: "message.completed", id: `${messageId}:end`, data });
        if (index === 7) {
          this.running = false;
          this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: this.sessionId } });
        }
      }, 550);
    }, 300 + index * 1000);
  }
  private streamThinking() {
    const generation = ++this.generation;
    const messageId = crypto.randomUUID();
    const data = { session_id: this.sessionId, turn_id: turnId, message_id: messageId };
    const message: CaltraSessionMessage = { id: messageId, created_at: createdAt, role: "assistant", status: "streaming", text: "", reasoning: { status: "streaming" } };
    const snapshot: CaltraReasoningSnapshot = { message_id: messageId, stream_id: crypto.randomUUID(), sequence: -1, status: "streaming", parts: [{ position: 0, text: "", status: "streaming" }] };
    this.messages.push(message);
    this.reasoningSnapshots.set(messageId, snapshot);
    this.running = true;
    this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: this.sessionId } });
    this.emit({ event: "message.started", id: crypto.randomUUID(), data });
    this.emit({ event: "reasoning.updated", id: crypto.randomUUID(), data: { ...data, status: "streaming" } });
    const chunks = ["Simulated reasoning summary: ", "inspect the sample input, ", "check the available details, ", "and prepare a concise answer."];
    chunks.forEach((delta, sequence) => this.later(() => {
      if (generation !== this.generation) return;
      snapshot.sequence = sequence;
      snapshot.parts[0]!.text += delta;
      this.emit({ event: "reasoning.delta", id: crypto.randomUUID(), data: { ...data, stream_id: snapshot.stream_id!, sequence, position: 0, kind: "content_delta", delta } }, true);
    }, 800 + sequence * 900));
    this.later(() => {
      if (generation !== this.generation) return;
      snapshot.status = "completed";
      snapshot.parts[0]!.status = "completed";
      message.reasoning = { status: "completed" };
      this.emit({ event: "reasoning.updated", id: crypto.randomUUID(), data: { ...data, status: "completed" } });
      message.text = "Thinking demo complete.";
      message.status = "completed";
      this.running = false;
      this.emit({ event: "message.delta", id: crypto.randomUUID(), data: { ...data, delta: message.text } });
      const completed: CaltraSessionEvent = { event: "message.completed", id: crypto.randomUUID(), data };
      this.emit(completed);
      this.emit(completed, true);
      this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: this.sessionId } });
    }, 4500);
  }
  override async sendMessage(_id: string, input: { text: string }) {
    const id = crypto.randomUUID();
    this.messages.push({ id, created_at: createdAt, role: "user", status: "completed", text: input.text });
    if (input.text.startsWith("/think")) this.streamThinking();
    else this.streamSteps();
    return { message_id: id, turn_id: turnId };
  }
  override async cancelSession() {
    this.disposeTimers();
    return { turn_id: turnId };
  }
  disposeTimers() {
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.running = false;
    for (const message of this.messages) if (message.status === "streaming") {
      message.status = "cancelled";
      if (message.reasoning) {
        message.reasoning.status = "completed";
        const snapshot = this.reasoningSnapshots.get(message.id)!;
        snapshot.status = "cancelled";
        for (const part of snapshot.parts) part.status = "completed";
        const data = { session_id: this.sessionId, turn_id: turnId, message_id: message.id };
        this.emit({ event: "reasoning.updated", id: crypto.randomUUID(), data: { ...data, status: "completed" } });
        this.emit({ event: "message.completed", id: crypto.randomUUID(), data }, true);
      }
    }
    this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: this.sessionId } });
  }
}
