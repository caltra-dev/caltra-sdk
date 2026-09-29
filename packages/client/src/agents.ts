import type { CaltraClient } from "./client.js";
import type { CaltraSession } from "./types.js";

/** Binds session operations to their durable agent parent. */
export class CaltraAgentSessionsClient {
  constructor(private readonly client: CaltraClient, private readonly agentId: string) {}
  async get(input: { externalId: string; createIfMissing: { autoName?: boolean } }): Promise<CaltraSession>;
  async get(input: { externalId: string }): Promise<CaltraSession | null>;
  async get(input: { externalId: string; createIfMissing?: { autoName?: boolean } }): Promise<CaltraSession | null> {
    return this.client.getAgentSession(this.agentId, input);
  }
  async create(input: { autoName?: boolean } = {}): Promise<CaltraSession> { return this.client.createAgentSession(this.agentId, input); }
}

/** Resolves the signed-in user's hosted agent and exposes its session collection. */
export class CaltraAgentsClient {
  constructor(private readonly client: CaltraClient) {}
  async get(): Promise<{ id: string; name: string; sessions: CaltraAgentSessionsClient }> {
    const agent = await this.client.getAgent();
    return { ...agent, sessions: new CaltraAgentSessionsClient(this.client, agent.id) };
  }
  sessions(agentId: string): CaltraAgentSessionsClient { return new CaltraAgentSessionsClient(this.client, agentId); }
}
