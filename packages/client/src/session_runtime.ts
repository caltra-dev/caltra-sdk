import type { CaltraMessageContext, CaltraModelSelection } from "./types.js";
import { CaltraReasoningRuntime } from "./reasoning_runtime.js";
import {
  type CaltraSessionEvent,
  type CaltraSessionMessage,
  type CaltraSession,
  type CaltraToolCall,
} from "./types.js";
import type { CaltraClient } from "./client.js";
import { CaltraApiError } from "./error.js";

export type CaltraConnectionState = "connecting" | "connected" | "recovering" | "failed";

export interface CaltraSessionSnapshot {
  session: CaltraSession | null;
  /** Selection for future sends only; never changes an accepted turn. */
  modelSelection?: CaltraModelSelection;
  connection: CaltraConnectionState;
  error: Error | null;
  /** True only after an authoritative history response, including an empty one. */
  historyLoaded: boolean;
  /** Queued/running turn or pending submission. Older servers fall back to message activity. */
  isRunning: boolean;
  messages: readonly CaltraSessionMessage[];
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  olderError: Error | null;
}

export interface CaltraSessionRuntimeOptions {
  retryDelay?: (attempt: number) => Promise<void>;
}

/** Minimal transport contract; useful for deterministic fixtures and custom transports. */
export type CaltraSessionTransport = Pick<CaltraClient,
  "openSessionEvents" | "listSessionMessages" | "getSessionById" | "sendMessage" | "cancelSession" | "invalidateToken"> & Partial<Pick<CaltraClient, "getSessionToolDetails" | "getSessionReasoning" | "openSessionReasoningEvents">>;

/** Owns reconnectable session state while keeping React and assistant-ui as presentation layers. */
export class CaltraSessionRuntime {
  private readonly pageSize = 20;
  private readonly reasoningResources = new Set<CaltraReasoningRuntime>();
  private olderCursor: string | null = null;
  private olderAnchorId: string | null = null;
  private olderPromise?: Promise<void>;
  private hasLoadedOlder = false;
  private historyRequest = 0;
  private appliedHistoryRequest = 0;
  private readonly eventIds = new Set<string>();
  private readonly canonicalMessages = new Set<string>();
  private refreshPending?: Promise<void>;
  private refreshAgain = false;
  private readonly toolDetails = new Map<string, Promise<CaltraToolCall>>();
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
  private readonly messageKeys = new Map<string, string>();
  private snapshot: CaltraSessionSnapshot = {
    session: null,
    connection: "connecting",
    error: null,
    historyLoaded: false,
    isRunning: false,
    messages: [],
    hasOlderMessages: false,
    loadingOlder: false,
    olderError: null,
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

  /** Stable consumer key across send acknowledgement and history refresh. API
   * resource operations must still use the canonical message ID in the snapshot.
   */
  readonly getMessageKey = (messageId: string): string => this.messageKeys.get(messageId) ?? messageId;

  /** Creates an independent, inert reasoning resource. Its consumer owns start/stop. */
  reasoning(messageId: string): CaltraReasoningRuntime {
    return new CaltraReasoningRuntime(this.client, this.sessionId, messageId, (resource, active) => {
      if (active) this.reasoningResources.add(resource);
      else this.reasoningResources.delete(resource);
    }, this);
  }

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
    const reasoningStops = [...this.reasoningResources].map(resource => resource.stop());
    this.generation += 1;
    this.update({ messages: this.snapshot.messages.filter(message => !this.pendingSends.has(message.id)) });
    this.pendingSends.clear();
    this.toolDetails.clear();
    const connection = this.connection;
    this.abortController?.abort();
    this.abortController = undefined;
    this.connection = undefined;
    this.readyPromise = undefined;
    this.olderPromise = undefined;
    this.update({ loadingOlder: false });
    this.rejectReady?.(new Error("The Caltra session connection was stopped."));
    this.rejectReady = undefined;
    this.resolveReady = undefined;
    await Promise.all([...reasoningStops, connection?.close().catch(() => undefined)]);
  }

  async refresh(): Promise<void> {
    const generation = this.generation;
    const request = ++this.historyRequest;
    const reasoningAtRequest = new Map(this.snapshot.messages.map(message => [message.id, message.reasoning]));
    const page = await this.client.listSessionMessages(this.sessionId, { limit: this.pageSize });
    if (generation !== this.generation || request < this.appliedHistoryRequest) return;
    this.appliedHistoryRequest = request;
    const existingIds = new Set(this.snapshot.messages.map(message => message.id));
    if ((!this.hasLoadedOlder && !this.olderPromise) || !page.data.some(message => existingIds.has(message.id))) {
      // A reconnect can introduce more than one page of unseen messages. Start
      // pagination at that new gap instead of skipping it with the old cursor.
      // An overlapping refresh must preserve an in-flight earlier-page boundary
      // so that request can advance its cursor instead of repeating the same page.
      this.olderCursor = page.next_cursor ?? null;
      this.olderAnchorId = page.data[0]?.id ?? null;
    }
    const messages = this.mergeHistory(page.data, false, !page.next_cursor, null, reasoningAtRequest);
    this.update({ historyLoaded: true, messages, hasOlderMessages: this.olderCursor !== null,
      isRunning: messages.some(message => message.status === "streaming") });
  }

  /** Fetches exactly one older page. Concurrent callers share the same request. */
  async loadOlder(): Promise<void> {
    if (this.olderPromise) return await this.olderPromise;
    if (!this.snapshot.historyLoaded || !this.olderCursor) return;
    const generation = this.generation;
    const cursor = this.olderCursor;
    const anchor = this.olderAnchorId;
    this.update({ loadingOlder: true, olderError: null });
    const pending = (async () => {
      try {
        const page = await this.client.listSessionMessages(this.sessionId, { limit: this.pageSize, cursor });
        if (generation !== this.generation) return;
        this.hasLoadedOlder = true;
        if (this.olderCursor === cursor) {
          this.olderCursor = page.next_cursor ?? null;
          this.olderAnchorId = page.data[0]?.id ?? null;
        }
        this.update({ messages: this.mergeHistory(page.data, true, false, anchor), hasOlderMessages: this.olderCursor !== null });
      } catch (error) {
        if (generation === this.generation) this.update({ olderError: this.toError(error) });
        throw error;
      } finally {
        if (generation === this.generation) {
          this.olderPromise = undefined;
          this.update({ loadingOlder: false });
        }
      }
    })();
    this.olderPromise = pending;
    return await pending;
  }

  private mergeHistory(history: readonly CaltraSessionMessage[], older: boolean, complete = false, anchor: string | null = null,
    reasoningAtRequest?: ReadonlyMap<string, CaltraSessionMessage["reasoning"]>): CaltraSessionMessage[] {
    const existing = new Map(this.snapshot.messages.map(message => [message.id, message]));
    const merged = history.map(message => {
      const live = existing.get(message.id);
      // Caltra commits canonical text at message completion; in-flight transcript
      // rows do not include token deltas. Never append deltas to canonical text.
      if (message.status !== "streaming") {
        this.canonicalMessages.add(message.id);
        return older && live ? live : message;
      }
      if (!live) return message;
      // Preserve answer deltas, but accept refreshed thinking status unless a newer
      // metadata event arrived while this history request was in flight.
      const reasoning = reasoningAtRequest && live.reasoning === reasoningAtRequest.get(message.id)
        ? message.reasoning ?? live.reasoning : live.reasoning;
      return { ...message, ...live, created_at: message.created_at, ...(reasoning ? { reasoning } : {}) };
    });
    const ids = new Set(history.map(message => message.id));
    const retained = this.snapshot.messages.filter(message => !ids.has(message.id)
      && !(complete && !older && this.canonicalMessages.has(message.id)));
    if (older) {
      // A reconnect can put the next cursor in a gap between previously loaded
      // pages. Insert before its captured boundary, not before all older history.
      const boundary = this.snapshot.messages.findIndex(message => message.id === anchor);
      const index = boundary < 0 ? 0 : boundary;
      return [...this.snapshot.messages.slice(0, index).filter(message => !ids.has(message.id)),
        ...merged, ...this.snapshot.messages.slice(index).filter(message => !ids.has(message.id))];
    }
    // Older loaded pages precede the newest page; new stream/optimistic messages
    // belong after it. Preserve their relative order without sorting timestamps.
    const firstOverlap = this.snapshot.messages.findIndex(message => ids.has(message.id));
    const retainedIds = new Set(retained.map(message => message.id));
    const before = firstOverlap < 0 ? retained.filter(message => this.canonicalMessages.has(message.id))
      : this.snapshot.messages.slice(0, firstOverlap).filter(message => retainedIds.has(message.id));
    const beforeIds = new Set(before.map(message => message.id));
    return [...before, ...merged, ...retained.filter(message => !beforeIds.has(message.id))];
  }

  /** Deduplicates expansions and caches per lifecycle state; a finished tool gets fresh details. */
  async getToolDetails(messageId: string, toolId: string): Promise<CaltraToolCall> {
    const tool = this.snapshot.messages.find(message => message.id === messageId)?.tool_calls?.find(call => call.id === toolId);
    if (!tool) throw new Error("The tool call is not available.");
    if (tool.arguments !== undefined) return tool;
    const key = JSON.stringify([messageId, toolId, tool.status]);
    const cached = this.toolDetails.get(key);
    if (cached) return cached;
    if (!this.client.getSessionToolDetails) throw new Error("This transport does not support tool details.");
    const pending = this.client.getSessionToolDetails(this.sessionId, messageId, toolId);
    this.toolDetails.set(key, pending);
    try { return await pending; }
    catch (error) { if (this.toolDetails.get(key) === pending) this.toolDetails.delete(key); throw error; }
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

  setModelSelection(selection: CaltraModelSelection | undefined): void {
    if (this.snapshot.isRunning) throw new Error("Wait for the current reply before changing the model.");
    this.update({ modelSelection: selection ? { ...selection } : undefined });
  }

  async send(text: string, options: { context?: CaltraMessageContext; modelSelection?: CaltraModelSelection } = {}): Promise<void> {
    // Snapshot both inputs before connection/authentication awaits.
    const context = options.context === undefined ? undefined : structuredClone(options.context);
    const selection = options.modelSelection ?? this.snapshot.modelSelection;
    const modelSelection = selection ? { ...selection } : undefined;
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
      const submitted = await this.client.sendMessage(this.sessionId, { text, ...(context === undefined ? {} : { context }), ...(modelSelection ? { modelSelection } : {}) });
      if (generation !== this.generation) return;
      this.messageKeys.set(submitted.message_id, temporaryId);
      this.update({
        ...(this.snapshot.session?.is_running === undefined ? {} : {
          session: { ...this.snapshot.session, is_running: true },
        }),
        messages: this.snapshot.messages.some(message => message.id === submitted.message_id)
          ? this.snapshot.messages.filter(message => message.id !== temporaryId)
          : this.snapshot.messages.map(message => message.id === temporaryId ? { ...message, id: submitted.message_id } : message),
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
        const consuming = this.consume(connection, signal);
        void consuming.catch(() => undefined);
        await Promise.all([this.refresh(), this.refreshMetadata()]);
        if (signal.aborted) return;
        this.update({ connection: "connected", error: null });
        this.resolveReady?.();
        this.resolveReady = undefined;
        this.rejectReady = undefined;
        attempt = 0;
        await consuming;
        if (!signal.aborted) throw new Error("The Caltra event stream closed.");
      } catch (error) {
        if (signal.aborted) return;
        await this.connection?.close().catch(() => undefined);
        this.connection = undefined;
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
    if (event.id) {
      if (this.eventIds.has(event.id)) return;
      this.eventIds.add(event.id);
      // Bound transport deduplication independently from loaded history.
      if (this.eventIds.size > 10_000) this.eventIds.delete(this.eventIds.values().next().value!);
    }
    if (event.event === "reasoning.delta") return; // Text belongs exclusively to a separate resource.
    if (event.event === "reasoning.updated") {
      if (this.canonicalMessages.has(event.data.message_id)) return;
      const existing = this.snapshot.messages.some(message => message.id === event.data.message_id);
      const reasoning = { status: event.data.status };
      this.update({ messages: existing
        ? this.snapshot.messages.map(message => message.id === event.data.message_id ? { ...message, reasoning } : message)
        : [...this.snapshot.messages, { id: event.data.message_id, created_at: new Date().toISOString(), role: "assistant", status: "streaming", text: "", reasoning }] });
      return;
    }
    if (event.event === "session.updated") {
      this.scheduleRefresh();
      return;
    }
    // Message activity is only a hint to refresh persisted turn state. A completed
    // message may be followed by tools or another model request in the same turn.
    if (this.snapshot.session?.is_running !== undefined
      && (event.event === "message.started" || event.event === "message.completed")) this.scheduleRefresh();
    if (event.event === "tool.started") {
      const tool = { id: event.data.tool_call_id, name: event.data.tool_name, status: "running" as const };
      this.update({ isRunning: true, messages: this.snapshot.messages.map(message => message.id === event.data.message_id
        ? { ...message, tool_calls: [...(message.tool_calls ?? []).filter(call => call.id !== tool.id), tool] } : message) });
      return;
    }
    if (event.event === "message.started") {
      if (this.canonicalMessages.has(event.data.message_id)) return;
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
      if (this.canonicalMessages.has(event.data.message_id)) return;
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
        ? { ...message, status: "completed", ...(message.reasoning ? { reasoning: { status: "completed" } } : {}) }
        : message),
    });
    this.scheduleRefresh();
  }

  /** Slow HTTP reconciliation must never prevent consumption of later events. */
  private scheduleRefresh(): void {
    if (this.refreshPending) { this.refreshAgain = true; return; }
    const generation = this.generation;
    const pending = (async () => {
      do {
        this.refreshAgain = false;
        try { await Promise.all([this.refresh(), this.refreshMetadata()]); }
        catch (error) {
          if (generation === this.generation) this.update({ error: this.toError(error) });
        }
      } while (this.refreshAgain && generation === this.generation);
    })();
    this.refreshPending = pending;
    void pending.finally(() => { if (this.refreshPending === pending) this.refreshPending = undefined; });
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
