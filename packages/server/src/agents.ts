import { z } from "zod";
import { CaltraServerError } from "./error.js";

export interface CaltraAgentLookup {
  workspaceId: string;
  owner: { tenantUserExternalId: string };
  syncName?: string;
  instructions?: string;
  externalId?: string;
}
export interface CaltraAgentCreateIfMissing extends CaltraAgentLookup {
  createIfMissing: { name: string };
}
export interface CaltraServerAgent { id: string; name: string }

/** Resolves a user's hosted agent independently of agent_identity profiles. */
export class CaltraAgentsClient {
  constructor(private readonly apiKey: string, private readonly apiUrl: string, private readonly fetchImplementation: typeof fetch) {}
  async get(input: CaltraAgentCreateIfMissing): Promise<CaltraServerAgent>;
  async get(input: CaltraAgentLookup): Promise<CaltraServerAgent | null>;
  async get(input: CaltraAgentLookup | CaltraAgentCreateIfMissing): Promise<CaltraServerAgent | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    const response = await this.fetchImplementation(`${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(input.workspaceId)}/agents/get`, {
      method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...(input.externalId !== undefined ? { external_id: input.externalId } : {}), ...(input.instructions !== undefined ? { instructions: input.instructions } : {}), owner: { tenant_user_external_id: input.owner.tenantUserExternalId },
        ...(createIfMissing ? { create_if_missing: createIfMissing } : {}), ...(input.syncName ? { sync_name: input.syncName } : {}) }),
    });
    if (!response.ok) {
      const error = await CaltraServerError.fromResponse(response);
      if (!createIfMissing && error.status === 404 && error.code === "resource_not_found") return null;
      throw error;
    }
    return z.object({ id: z.string().uuid(), name: z.string().min(1).max(160) }).strict().parse(await response.json());
  }
}
