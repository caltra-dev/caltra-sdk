import { CaltraClient, CaltraSessionEventConnection, type CaltraSession, type CaltraSessionMessage, type CaltraSessionEvent, type CaltraPageInput } from "@caltra/client";

export const demoSessionId = "70000000-0000-4000-8000-000000000001";
const turnId = "70000000-0000-4000-8000-000000000002";
const createdAt = "2026-10-21T12:00:00.000Z";

/** In-memory demonstration only. No credentials, API calls, or shared mutable data. */
export class DemoClient extends CaltraClient {
  private streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private generation = 0;
  private running = false;
  messages: CaltraSessionMessage[] = Array.from({ length: 36 }, (_, index) => ({
    id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    created_at: createdAt, role: index % 2 ? "assistant" : "user", status: "completed",
    ...(index === 33 || index === 35 ? { tool_calls: [{ id: `saved-tool-${index}`, name: index === 33 ? "demo.echo" : "demo.fail",
      status: index === 33 ? "completed" as const : "failed" as const, arguments: { text: "Loaded on expansion" },
      result: index === 33 ? { text: "Lazy details loaded" } : { status: "failed", message: "Intentional sample failure" } }] } : {}),
    text: `Saved message ${index + 1}\n\nThis is deterministic sample history. Scroll up to read it while new steps arrive. Your reading position should remain unchanged.`,
  }));

  constructor() {
    super({ authorizationCodeProvider: async () => "unused-demo-code", fetch: async () => { throw new Error("The demo never uses the network."); } });
  }
  override async getSessionById(id: string): Promise<CaltraSession> {
    return { id, is_running: this.running, auto_name: false, title: "Runtime demo", title_source: "manual", title_updated_at: null,
      agentIdentity: null, agent: { id: demoSessionId, name: "Demo" }, created_at: createdAt,
      updated_at: createdAt, external_id: null, status: "active" };
  }
  override async listSessionMessages(_sessionId: string, input: CaltraPageInput = {}) {
    const end = input.cursor ? Number(input.cursor) : this.messages.length;
    const start = Math.max(0, end - (input.limit ?? 20));
    const data = structuredClone(this.messages.slice(start, end)).map(message => ({ ...message,
      ...(message.tool_calls ? { tool_calls: message.tool_calls.map(({ id, name, status }) => ({ id, name, status })) } : {}) }));
    return { data, next_cursor: start ? String(start) : null };
  }
  override async getSessionToolDetails(_sessionId: string, messageId: string, toolCallId: string) {
    await new Promise(resolve => setTimeout(resolve, 350));
    const tool = this.messages.find(message => message.id === messageId)?.tool_calls?.find(call => call.id === toolCallId);
    if (!tool) throw new Error("Sample tool not found.");
    return { ...structuredClone(tool), arguments: tool.arguments ?? {} };
  }
  override async openSessionEvents(_id: string, options: { signal?: AbortSignal } = {}) {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start: value => { controller = value; this.streams.add(value); },
      cancel: () => { this.streams.delete(controller); options.signal?.removeEventListener("abort", abort); },
    });
    const connection = new CaltraSessionEventConnection(new Response(stream));
    const abort = () => { void connection.close(); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    return connection;
  }
  private emit(event: CaltraSessionEvent) {
    const bytes = new TextEncoder().encode(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    for (const controller of this.streams) controller.enqueue(bytes);
  }
  private later(fn: () => void, delay: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, delay);
    this.timers.add(timer);
  }
  streamSteps() {
    const generation = ++this.generation;
    this.running = true;
    this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: demoSessionId } });
    for (let index = 0; index < 8; index++) this.later(() => {
      if (generation !== this.generation) return;
      const messageId = crypto.randomUUID();
      const data = { session_id: demoSessionId, turn_id: turnId, message_id: messageId };
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
          this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: demoSessionId } });
        }
      }, 550);
    }, 300 + index * 1000);
  }
  override async sendMessage(_id: string, input: { text: string }) {
    const id = crypto.randomUUID();
    this.messages.push({ id, created_at: createdAt, role: "user", status: "completed", text: input.text });
    this.streamSteps();
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
    for (const message of this.messages) if (message.status === "streaming") message.status = "cancelled";
    this.emit({ event: "session.updated", id: crypto.randomUUID(), data: { session_id: demoSessionId } });
  }
}
