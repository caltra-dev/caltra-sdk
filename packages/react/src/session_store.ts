import {
  CaltraApiError,
  type CaltraClient,
  type CaltraSessionEvent,
  type CaltraSessionMessage,
  type CaltraSession,
} from "@caltra/client";

export type CaltraConnectionState = "connecting" | "connected" | "recovering" | "failed";

export interface CaltraSessionSnapshot {
  session: CaltraSession | null;
  connection: CaltraConnectionState;
  error: Error | null;
  isRunning: boolean;
  messages: readonly CaltraSessionMessage[];
}

export interface CaltraSessionStoreOptions {
  retryDelay?: (attempt: number) => Promise<void>;
}

/** Owns reconnectable session state while keeping React and assistant-ui as presentation layers. */
export class CaltraSessionStore {
  private abortController?: AbortController;
  private connection?: Awaited<ReturnType<CaltraClient["openSessionEvents"]>>;
  private readonly listeners = new Set<() => void>();
  private readyPromise?: Promise<void>;
  private rejectReady?: (reason: unknown) => void;
  private resolveReady?: () => void;
  private snapshot: CaltraSessionSnapshot = {
    session: null,
    connection: "connecting",
    error: null,
    isRunning: false,
    messages: [],
  };

  constructor(
    private readonly client: CaltraClient,
    private readonly sessionId: string,
    private readonly options: CaltraSessionStoreOptions = {},
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): CaltraSessionSnapshot => this.snapshot;

  async start(): Promise<void> {
    if (this.readyPromise) return await this.readyPromise;
    this.abortController = new AbortController();
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.run(this.abortController.signal);
    return await this.readyPromise;
  }

  async stop(): Promise<void> {
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
    const page = await this.client.listSessionMessages(this.sessionId, { limit: 100 });
    this.update({ messages: page.data });
  }

  async refreshMetadata(): Promise<void> {
    const session = await this.client.getSessionById(this.sessionId);
    this.update({ session });
  }

  async send(text: string): Promise<void> {
    await this.start();
    const temporaryId = `pending-${crypto.randomUUID()}`;
    const optimistic: CaltraSessionMessage = {
      created_at: new Date().toISOString(),
      id: temporaryId,
      role: "user",
      status: "completed",
      text,
    };
    this.update({ messages: [...this.snapshot.messages, optimistic] });
    try {
      const submitted = await this.client.sendMessage(this.sessionId, { text });
      this.update({
        messages: this.snapshot.messages.map((message) => message.id === temporaryId
          ? { ...message, id: submitted.message_id }
          : message),
      });
    } catch (error) {
      this.update({
        error: this.toError(error),
        messages: this.snapshot.messages.filter((message) => message.id !== temporaryId),
      });
      throw error;
    }
  }

  private async run(signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        this.update({ connection: attempt === 0 ? "connecting" : "recovering", error: null });
        this.connection = await this.client.openSessionEvents(this.sessionId, { signal });
        await Promise.all([this.refresh(), this.refreshMetadata()]);
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
      await this.refreshMetadata();
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
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error("Unknown Caltra session error.");
  }

  private readonly delay = async (attempt: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempt - 1), 5_000)));
  };
}
