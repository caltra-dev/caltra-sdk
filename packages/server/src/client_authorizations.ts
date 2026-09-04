import { z } from "zod";
import { CaltraServerError } from "./error.js";
import type {
  CaltraClientAuthorization,
  CaltraClientAuthorizationCreate,
} from "./types.js";
import type { CaltraWorkspacesClient } from "./workspaces.js";

const ClientAuthorizationSchema = z.object({
  authorization_code: z.string().min(1),
  expires_at: z.iso.datetime(),
}).strict();

/** Creates origin-bound browser authorizations without exposing Caltra credentials to the browser. */
export class CaltraClientAuthorizationsClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
    private readonly fetchImplementation: typeof fetch,
    private readonly workspaces: CaltraWorkspacesClient,
  ) {}

  async create(input: CaltraClientAuthorizationCreate): Promise<CaltraClientAuthorization> {
    const workspace = await this.workspaces.get(input.workspace);
    if (!workspace) throw new Error("The Caltra workspace was not found.");
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("authorization", `Bearer ${this.apiKey}`);
    const response = await this.fetchImplementation(
      `${this.apiUrl}/server/v1/workspaces/${encodeURIComponent(workspace.id)}/client-authorizations`,
      {
        body: JSON.stringify({
          ...(input.agentIds ? { agent_ids: input.agentIds } : {}),
          origin: input.origin,
          tenant_user: {
            external_id: input.tenantUser.externalId,
            ...(input.tenantUser.firstName === undefined ? {} : { first_name: input.tenantUser.firstName }),
            ...(input.tenantUser.lastName === undefined ? {} : { last_name: input.tenantUser.lastName }),
          },
        }),
        headers,
        method: "POST",
      },
    );
    if (!response.ok) throw await CaltraServerError.fromResponse(response);
    const authorization = ClientAuthorizationSchema.parse(await response.json());
    return {
      authorizationCode: authorization.authorization_code,
      expiresAt: new Date(authorization.expires_at),
      workspace,
    };
  }
}
