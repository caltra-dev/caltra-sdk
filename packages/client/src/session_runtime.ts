import {
  type CaltraSessionEvent,
  type CaltraSessionMessage,
  type CaltraSession,
} from "./types.js";
import type { CaltraClient } from "./client.js";
import { CaltraApiError } from "./error.js";

export type CaltraConnectionState = "connecting" | "connected" | "recovering" | "failed";

export interface CaltraSessionSnapshot {
  session: CaltraSession | null;
  connection: CaltraConnectionState;
  error: Error | null;
  /** True only after an authoritative history response, including an empty one. */
  historyLoaded: boolean;
  /** Queued/running turn or pending submission. Older servers fall back to message activity. */
  isRunning: boolean;
  messages: readonly CaltraSessionMessage[];
}

export interface CaltraSessionRuntimeOptions {
  retryDelay?: (attempt: number) => Promise<void>;
}

/** Minimal transport contract; useful for deterministic fixtures and custom transports. */
export type CaltraSessionTransport = Pick<CaltraClient,
  "openSessionEvents" | "listSessionMessages" | "getSessionById" | "sendMessage" | "cancelSession" | "invalidateToken">;

/** Owns reconnectable session state while keeping React and assistant-ui as presentation layers. */
export class CaltraSessionRuntime {
  private abortController?: AbortController;
  private connection?: Awaited<ReturnType<CaltraClient["openSessionEvents"]>>;
  private readonly listeners = new Set<() => void>();
  private readyPromise?: Promise<void>;
  private rejectReady?: (reason: unknown) => void;
  private resolveReady?: () => void;
  private generation = 0;
  private metadataRequest = 0;
  private legacyIsRunning = false;
  private readonly pendingSends = new Set<string>();
  private snapshot: CaltraSessionSnapshot = {
    session: null,
    connection: "connecting",
    error: null,
    historyLoaded: false,
    isRunning: false,
    messages: [],
  };

  constructor(
    private readonly client: CaltraSessionTransport,
    readonly sessionId: string,
    private readonly options: CaltraSessionRuntimeOptions = {},
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): CaltraSessionSnapshot => this.snapshot;

  async start(): Promise<void> {
    if (this.readyPromise) return await this.readyPromise;
    this.abortController = new AbortController();
    this.generation += 1;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.run(this.abortController.signal);
    return await this.readyPromise;
  }

  async stop(): Promise<void> {
    this.generation += 1;
    this.pendingSends.clear();
    const connection = this.connection;
    this.abortController?.abort();
    this.abortController = undefined;
    this.connection = undefined;
    this.readyPromise = undefined;
    this.rejectReady?.(new Error("The Caltra session connection was stopped."));
    this.rejectReady = undefined;
    this.resolveReady = undefined;
    await connection?.close().catch(() => undefined);
  }

  async refresh(): Promise<void> {
    const generation = this.generation;
    const page = await this.client.listSessionMessages(this.sessionId, { limit: 100 });
    if (generation !== this.generation) return;
    this.update({ historyLoaded: true, messages: page.data, isRunning: page.data.some((message) => message.status === "streaming") });
  }

  async refreshMetadata(): Promise<void> {
    const generation = this.generation;
    const request = ++this.metadataRequest;
    const session = await this.client.getSessionById(this.sessionId);
    if (generation === this.generation && request === this.metadataRequest) this.update({ session });
  }

  /** Restarts transport without throwing away a transcript already loaded for this session. */
  async reconnect(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async send(text: string): Promise<void> {
    await this.start();
    const generation = this.generation;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimistic: CaltraSessionMessage = {
      created_at: new Date().toISOString(),
      id: temporaryId,
      role: "user",
      status: "completed",
      text,
    };
    this.pendingSends.add(temporaryId);
    this.update({ messages: [...this.snapshot.messages, optimistic] });
    try {
      const submitted = await this.client.sendMessage(this.sessionId, { text });
      if (generation !== this.generation) return;
      this.update({
        ...(this.snapshot.session?.is_running === undefined ? {} : {
          session: { ...this.snapshot.session, is_running: true },
        }),
        messages: this.snapshot.messages.map((message) => message.id === temporaryId
          ? { ...message, id: submitted.message_id }
          : message),
      });
    } catch (error) {
      if (generation !== this.generation) throw error;
      this.update({
        error: this.toError(error),
        messages: this.snapshot.messages.filter((message) => message.id !== temporaryId),
      });
      throw error;
    } finally {
      if (generation === this.generation) {
        // Accepted input can be queued before the first assistant message. Reconcile
        // separately so a metadata failure never turns an accepted send into a retry.
        if (this.snapshot.session?.is_running !== undefined) {
          await this.refreshMetadata().catch(error => this.update({ error: this.toError(error) }));
        }
        this.pendingSends.delete(temporaryId);
        this.update({});
      }
    }
  }

  /** Cancellation uses HTTP even while SSE reconnects; history remains authoritative. */
  async cancel(): Promise<void> {
    try {
      await this.client.cancelSession(this.sessionId);
      await Promise.all([this.refresh(), this.refreshMetadata()]);
      this.update({ error: null });
    } catch (error) {
      this.update({ error: this.toError(error) });
      throw error;
    }
  }

  private async run(signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        this.update({ connection: attempt === 0 ? "connecting" : "recovering", error: null });
        const connection = await this.client.openSessionEvents(this.sessionId, { signal });
        if (signal.aborted) { await connection.close().catch(() => undefined); return; }
        this.connection = connection;
        await Promise.all([this.refresh(), this.refreshMetadata()]);
        if (signal.aborted) return;
        this.update({ connection: "connected", error: null });
        this.resolveReady?.();
        this.resolveReady = undefined;
        this.rejectReady = undefined;
        attempt = 0;
        await this.consume(this.connection, signal);
        if (!signal.aborted) throw new Error("The Caltra event stream closed.");
      } catch (error) {
        if (signal.aborted) return;
        const currentError = this.toError(error);
        if (error instanceof CaltraApiError && error.status === 401) {
          await this.client.invalidateToken();
        } else if (error instanceof CaltraApiError && !error.retryable) {
          this.update({ connection: "failed", error: currentError });
          this.rejectReady?.(error);
          return;
        }
        attempt += 1;
        this.update({ connection: "recovering", error: currentError });
        await (this.options.retryDelay ?? this.delay)(attempt);
      }
    }
  }

  private async consume(
    connection: Awaited<ReturnType<CaltraClient["openSessionEvents"]>>,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const event of connection) {
      if (signal.aborted) return;
      await this.apply(event);
    }
  }

  private async apply(event: CaltraSessionEvent): Promise<void> {
    if (event.event === "session.updated") {
      await Promise.all([this.refreshMetadata(), this.refresh()]);
      return;
    }
    // Message activity is only a hint to refresh persisted turn state. A completed
    // message may be followed by tools or another model request in the same turn.
    if (this.snapshot.session?.is_running !== undefined
      && (event.event === "message.started" || event.event === "message.completed")) await this.refreshMetadata();
    if (event.event === "tool.started") {
      const tool = { id: event.data.tool_call_id, name: event.data.tool_name, arguments: {}, status: "running" as const };
      this.update({ isRunning: true, messages: this.snapshot.messages.map(message => message.id === event.data.message_id
        ? { ...message, tool_calls: [...(message.tool_calls ?? []).filter(call => call.id !== tool.id), tool] } : message) });
      return;
    }
    if (event.event === "message.started") {
      if (!this.snapshot.messages.some((message) => message.id === event.data.message_id)) {
        this.update({
          isRunning: true,
          messages: [...this.snapshot.messages, {
            created_at: new Date().toISOString(),
            id: event.data.message_id,
            role: "assistant",
            status: "streaming",
            text: "",
          }],
        });
      } else {
        this.update({ isRunning: true });
      }
      return;
    }
    if (event.event === "message.delta") {
      const existing = this.snapshot.messages.some((message) => message.id === event.data.message_id);
      const messages = existing
        ? this.snapshot.messages.map((message) => message.id === event.data.message_id
          ? { ...message, status: "streaming" as const, text: message.text + event.data.delta }
          : message)
        : [...this.snapshot.messages, {
            created_at: new Date().toISOString(),
            id: event.data.message_id,
            role: "assistant" as const,
            status: "streaming" as const,
            text: event.data.delta,
          }];
      this.update({ isRunning: true, messages });
      return;
    }
    this.update({
      isRunning: false,
      messages: this.snapshot.messages.map((message) => message.id === event.data.message_id
        ? { ...message, status: "completed" }
        : message),
    });
    await this.refresh();
  }

  private update(update: Partial<CaltraSessionSnapshot>): void {
    if (update.isRunning !== undefined) this.legacyIsRunning = update.isRunning;
    const session = update.session === undefined ? this.snapshot.session : update.session;
    this.snapshot = { ...this.snapshot, ...update,
      isRunning: this.pendingSends.size > 0 || (session?.is_running ?? this.legacyIsRunning),
    };
    for (const listener of this.listeners) listener();
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error("Unknown Caltra session error.");
  }

  private readonly delay = async (attempt: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempt - 1), 5_000)));
  };
}
