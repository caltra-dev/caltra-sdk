import { z } from "zod";
import { CaltraServerError } from "./error.js";
import type {
  CaltraAgentCreateIfMissing,
  CaltraAgentLookup,
  CaltraServerAgent,
} from "./types.js";

const AgentSchema = z.object({
  external_id: z.string().min(1).max(255),
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
}).strict();

/** Resolves and provisions stable tenant-user-owned agents through the server API. */
export class CaltraAgentsClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
    private readonly fetchImplementation: typeof fetch,
  ) {}

  async get(input: CaltraAgentCreateIfMissing): Promise<CaltraServerAgent>;
  async get(input: CaltraAgentLookup): Promise<CaltraServerAgent | null>;
  async get(input: CaltraAgentLookup | CaltraAgentCreateIfMissing): Promise<CaltraServerAgent | null> {
    const createIfMissing = "createIfMissing" in input ? input.createIfMissing : undefined;
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("authorization", `Bearer ${this.apiKey}`);
    const response = await this.fetchImplementation(
      `${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(input.workspaceId)}/agents/get`,
      {
        body: JSON.stringify({
          ...(input.syncNames ? { sync_names: {
            agent: input.syncNames.agent,
            hosted_runtime: input.syncNames.hostedRuntime,
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
    const agent = AgentSchema.parse(await response.json());
    return { externalId: agent.external_id, id: agent.id, name: agent.name };
  }
}
