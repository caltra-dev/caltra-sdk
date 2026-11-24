import type { CaltraClient } from "./client.js";
import type { CaltraSession, CaltraSessionLookup } from "./types.js";

/** Groups session identity operations under the browser client's resource-oriented API. */
export class CaltraSessionsClient {
  constructor(private readonly client: CaltraClient) {}

  /** Sessions are created through an agent (`agents.get()`), never directly from an agent identity. */
  async get(input: CaltraSessionLookup): Promise<CaltraSession | null> {
    return await this.client.getSession(input);
  }

  async getById(sessionId: string): Promise<CaltraSession> {
    return await this.client.getSessionById(sessionId);
  }
}
