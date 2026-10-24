import { z } from "zod";
import { CaltraServerError } from "./error.js";
import { CaltraAgentModelPolicyClient, type CaltraAgentModelPolicy, type CaltraAgentModelPolicyTarget, type CaltraAgentModelPolicyUpdate } from "./agent_model_policy.js";

export interface CaltraAgentLookup {
  workspaceId: string;
  owner: { tenantUserExternalId: string };
  syncName?: string;
  instructions?: string;
  /** Synchronizes capabilities when provided; omit to preserve UI settings, or pass [] to disable all. */
  capabilities?: Array<"web_search" | "background_execution" | "display_artifacts" | "interactive_approval" | "receive_external_events">;
  externalId?: string;
}
export interface CaltraAgentCreateIfMissing extends CaltraAgentLookup {
  createIfMissing: { name: string };
}
export interface CaltraServerAgent { id: string; name: string }

/** Resolves a user's hosted agent independently of agent_identity profiles. */
export class CaltraAgentsClient {
  constructor(private readonly apiKey: string, private readonly apiUrl: string, private readonly fetchImplementation: typeof fetch) {}
  /** Requires an environment server key with agents:provision authority over the target workspace. */
  async getModelPolicy(input: CaltraAgentModelPolicyTarget): Promise<CaltraAgentModelPolicy> {
    return new CaltraAgentModelPolicyClient(this.apiKey, this.apiUrl, this.fetchImplementation).request(input);
  }
  /** Atomically updates agent policy; existing session defaults and recorded turns are preserved. */
  async updateModelPolicy(input: CaltraAgentModelPolicyUpdate): Promise<CaltraAgentModelPolicy> {
    return new CaltraAgentModelPolicyClient(this.apiKey, this.apiUrl, this.fetchImplementation).request(input, input);
  }
  async get(input: CaltraAgentCreateIfMissing): Promise<CaltraServerAgent>;
  async get(input: CaltraAgentLookup): Promise<CaltraServerAgent | null>;
  async get(input: CaltraAgentLookup | CaltraAgentCreateIfMissing): Promise<CaltraServerAgent | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    const response = await this.fetchImplementation(`${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(input.workspaceId)}/agents/get`, {
      method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}), ...(input.externalId !== undefined ? { external_id: input.externalId } : {}), ...(input.instructions !== undefined ? { instructions: input.instructions } : {}), owner: { tenant_user_external_id: input.owner.tenantUserExternalId },
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
