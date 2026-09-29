import { z } from "zod";
import { CaltraServerError } from "./error.js";
import type {
  CaltraAgentIdentityCreateIfMissing,
  CaltraAgentIdentityLookup,
  CaltraServerAgentIdentity,
} from "./types.js";

const AgentIdentitySchema = z.object({
  external_id: z.string().min(1).max(255),
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
}).strict();

/** Resolves and provisions stable tenant-user-owned agent_identities through the server API. */
export class CaltraAgentIdentitiesClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
    private readonly fetchImplementation: typeof fetch,
  ) {}

  async get(input: CaltraAgentIdentityCreateIfMissing): Promise<CaltraServerAgentIdentity>;
  async get(input: CaltraAgentIdentityLookup): Promise<CaltraServerAgentIdentity | null>;
  async get(input: CaltraAgentIdentityLookup | CaltraAgentIdentityCreateIfMissing): Promise<CaltraServerAgentIdentity | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("authorization", `Bearer ${this.apiKey}`);
    const response = await this.fetchImplementation(
      `${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(input.workspaceId)}/agent-identities/get`,
      {
        body: JSON.stringify({
          ...(input.syncNames ? { sync_names: {
            agentIdentity: input.syncNames.agentIdentity,
            hosted_agent: input.syncNames.hostedAgent,
          } } : {}),
          ...(createIfMissing ? {
            create_if_missing: {
              browser_visible: createIfMissing.browserVisible ?? true,
              description: createIfMissing.description ?? "",
              instructions: createIfMissing.instructions,
              name: createIfMissing.name,
            },
          } : {}),
          external_id: input.externalId,
          owner: { tenant_user_external_id: input.owner.tenantUserExternalId },
        }),
        headers,
        method: "POST",
      },
    );
    if (!response.ok) {
      const error = await CaltraServerError.fromResponse(response);
      if (!createIfMissing && error.status === 404 && error.code === "resource_not_found") return null;
      throw error;
    }
    const agentIdentity = AgentIdentitySchema.parse(await response.json());
    return { externalId: agentIdentity.external_id, id: agentIdentity.id, name: agentIdentity.name };
  }
}
