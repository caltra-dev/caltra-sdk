import type { CaltraClient } from "./client.js";
import type {
  CaltraSession,
  CaltraSessionCreateIfMissing,
  CaltraSessionLookup,
} from "./types.js";

/** Groups session identity operations under the browser client's resource-oriented API. */
export class CaltraSessionsClient {
  constructor(private readonly client: CaltraClient) {}

  async get(input: CaltraSessionCreateIfMissing): Promise<CaltraSession>;
  async get(input: CaltraSessionLookup): Promise<CaltraSession | null>;
  async get(input: CaltraSessionLookup | CaltraSessionCreateIfMissing): Promise<CaltraSession | null> {
    return await this.client.getSession(input);
  }
}
