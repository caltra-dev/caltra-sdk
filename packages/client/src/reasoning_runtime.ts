import type { CaltraSessionRuntime, CaltraSessionTransport } from "./session_runtime.js";
import type { CaltraReasoningSnapshot, CaltraSessionEvent } from "./types.js";

export interface CaltraReasoningState {
  parts: CaltraReasoningSnapshot["parts"];
  loading: boolean;
  streaming: boolean;
  error: Error | null;
}

/** Owns one optional disclosure's stream independently of the main conversation. */
export class CaltraReasoningRuntime {
  private state: CaltraReasoningState = { parts: [], loading: false, streaming: false, error: null };
  private readonly listeners = new Set<() => void>();
  private controller?: AbortController;
  private connection?: Awaited<ReturnType<NonNullable<CaltraSessionTransport["openSessionReasoningEvents"]>>>;
  private ready?: Promise<void>;
  private watermark = -1;
  private terminal = false;
  private streamId: string | null = null;
  private unsubscribeTranscript?: () => void;
  private transcriptStatus?: string;

  constructor(private readonly client: CaltraSessionTransport, readonly sessionId: string, readonly messageId: string,
    private readonly activity: (resource: CaltraReasoningRuntime, active: boolean) => void = () => {},
    private readonly transcript?: Pick<CaltraSessionRuntime, "subscribe" | "getSnapshot">) {}

  readonly getSnapshot = (): CaltraReasoningState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Completed text loads once; live text subscribes before fetching to avoid gaps. */
  start(): Promise<void> {
    if (this.terminal) return Promise.resolve();
    if (this.ready) return this.ready;
    if (this.transcript && !this.unsubscribeTranscript) {
      this.transcriptStatus = this.getTranscriptStatus();
      this.unsubscribeTranscript = this.transcript.subscribe(() => {
        const status = this.getTranscriptStatus();
        if (status === this.transcriptStatus) return;
        this.transcriptStatus = status;
        // A phase can end before the answer, or resume in another part. Reconcile
        // from the main transcript even when this resource has no live stream.
        this.controller?.abort();
        const connection = this.connection;
        this.connection = undefined;
        this.ready = undefined;
        void connection?.close().catch(() => undefined);
        void this.start().catch(() => undefined);
      });
    }
    const controller = new AbortController();
    this.controller = controller;
    this.activity(this, true);
    this.ready = this.connect(controller);
    return this.ready;
  }

  /** Aborts both HTTP operations, retaining displayable text for the next expansion. */
  async stop(): Promise<void> {
    this.unsubscribeTranscript?.();
    this.unsubscribeTranscript = undefined;
    this.controller?.abort();
    this.controller = undefined;
    this.ready = undefined;
    this.activity(this, false);
    const connection = this.connection;
    this.connection = undefined;
    this.update({ loading: false });
    await connection?.close().catch(() => undefined);
  }

  private getMessage() {
    return this.transcript?.getSnapshot().messages.find(message => message.id === this.messageId);
  }

  private getTranscriptStatus(): string {
    const message = this.getMessage();
    return `${message?.status}:${message?.reasoning?.status}`;
  }

  private async connect(controller: AbortController): Promise<void> {
    const { signal } = controller;
    let connection: typeof this.connection;
    try {
      if (!this.client.getSessionReasoning) throw new Error("This transport does not support reasoning.");
      this.update({ loading: true, error: null });
      const message = this.getMessage();
      if (message?.reasoning?.status === "completed" || (message && message.status !== "streaming")) {
        this.update({ streaming: false });
        await this.refresh(signal);
        if (!signal.aborted) this.update({ loading: false });
        return;
      }
      if (!this.client.openSessionReasoningEvents) throw new Error("This transport does not support reasoning streaming.");
      connection = await this.client.openSessionReasoningEvents(this.sessionId, this.messageId, { signal });
      if (signal.aborted) { await connection.close(); return; }
      this.connection = connection;
      let buffered: CaltraSessionEvent[] | undefined = [];
      const consuming = (async () => {
        for await (const event of connection!) {
          if (signal.aborted) return;
          if (buffered) buffered.push(event);
          else await this.apply(event, signal);
        }
      })();
      void consuming.catch(() => undefined);
      await this.refresh(signal);
      if (signal.aborted) return;
      const pending = buffered;
      buffered = undefined;
      for (const event of pending) await this.apply(event, signal);
      this.update({ loading: false });
      // Continue independently. Retry or reopening connects before fetching again,
      // so events emitted while the disclosure was offline are recovered.
      void consuming.then(() => this.recover(controller), () => this.recover(controller));
    } catch (error) {
      await connection?.close().catch(() => undefined);
      if (signal.aborted) return;
      if (this.controller === controller) this.ready = undefined;
      this.update({ loading: false, error: error instanceof Error ? error : new Error("Reasoning could not be loaded.") });
      throw error;
    }
  }

  private async refresh(signal: AbortSignal): Promise<void> {
    const snapshot = await this.client.getSessionReasoning!(this.sessionId, this.messageId, { signal });
    if (signal.aborted) return;
    this.terminal = snapshot.status !== "streaming";
    this.streamId = snapshot.stream_id;
    this.watermark = snapshot.sequence;
    this.update({ parts: snapshot.parts, streaming: snapshot.status === "streaming" && snapshot.parts.some(part => part.status === "streaming") });
    if (snapshot.status !== "streaming") {
      await this.connection?.close();
    }
  }

  private async apply(event: CaltraSessionEvent, signal: AbortSignal): Promise<void> {
    if (signal.aborted || !("message_id" in event.data) || event.data.message_id !== this.messageId) return;
    if (event.event === "message.completed") { await this.refresh(signal); return; }
    if (event.event !== "reasoning.delta") return;
    const data = event.data;
    if (data.stream_id !== this.streamId || data.sequence <= this.watermark) return;
    this.watermark = data.sequence;
    const existing = this.state.parts.find(part => part.position === data.position);
    const part = { position: data.position, text: (existing?.text ?? "") + (data.delta ?? ""),
      status: data.kind === "part_completed" ? "completed" as const : "streaming" as const };
    const parts = [...this.state.parts.filter(item => item.position !== part.position), part].sort((a, b) => a.position - b.position);
    this.update({ parts, streaming: parts.some(item => item.status === "streaming") });
  }

  private async recover(controller: AbortController): Promise<void> {
    if (controller.signal.aborted || this.controller !== controller) return;
    if (this.terminal) return;
    this.ready = undefined;
    this.update({ error: new Error("Reasoning stream disconnected. Retry to catch up.") });
  }

  private update(update: Partial<CaltraReasoningState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
}
