import type { CaltraClient } from "./client.js";
import type { CaltraSession } from "./types.js";

/** Binds session operations to their durable runtime parent. */
export class CaltraRuntimeSessionsClient {
  constructor(private readonly client: CaltraClient, private readonly runtimeId: string) {}
  async get(input: { externalId: string; createIfMissing: Record<string, never> }): Promise<CaltraSession>;
  async get(input: { externalId: string }): Promise<CaltraSession | null>;
  async get(input: { externalId: string; createIfMissing?: Record<string, never> }): Promise<CaltraSession | null> {
    return this.client.getRuntimeSession(this.runtimeId, input);
  }
  async create(): Promise<CaltraSession> { return this.client.createRuntimeSession(this.runtimeId); }
}

/** Resolves the signed-in user's hosted runtime and exposes its session collection. */
export class CaltraRuntimesClient {
  constructor(private readonly client: CaltraClient) {}
  async get(): Promise<{ id: string; name: string; sessions: CaltraRuntimeSessionsClient }> {
    const runtime = await this.client.getRuntime();
    return { ...runtime, sessions: new CaltraRuntimeSessionsClient(this.client, runtime.id) };
  }
  sessions(runtimeId: string): CaltraRuntimeSessionsClient { return new CaltraRuntimeSessionsClient(this.client, runtimeId); }
}
