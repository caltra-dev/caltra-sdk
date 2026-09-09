import { z } from "zod";
import { CaltraServerError } from "./error.js";

export interface CaltraRuntimeLookup {
  workspaceId: string;
  owner: { tenantUserExternalId: string };
  syncName?: string;
}
export interface CaltraRuntimeCreateIfMissing extends CaltraRuntimeLookup {
  createIfMissing: { name: string };
}
export interface CaltraServerRuntime { id: string; name: string }

/** Resolves a user's hosted runtime independently of agent profiles. */
export class CaltraRuntimesClient {
  constructor(private readonly apiKey: string, private readonly apiUrl: string, private readonly fetchImplementation: typeof fetch) {}
  async get(input: CaltraRuntimeCreateIfMissing): Promise<CaltraServerRuntime>;
  async get(input: CaltraRuntimeLookup): Promise<CaltraServerRuntime | null>;
  async get(input: CaltraRuntimeLookup | CaltraRuntimeCreateIfMissing): Promise<CaltraServerRuntime | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    const response = await this.fetchImplementation(`${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(input.workspaceId)}/runtimes/get`, {
      method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ owner: { tenant_user_external_id: input.owner.tenantUserExternalId },
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
