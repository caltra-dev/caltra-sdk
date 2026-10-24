import { CaltraServerClient } from "@caltra/server";
import type { TestAppServerConfig } from "./config.js";

export interface TestAppClientAuthorizationResponse {
  authorization_code: string;
  expires_at: string;
}

/** Creates a client authorization while keeping the Caltra server API key outside browser code. */
export class TestAppAuthorizationProxy {
  constructor(
    private readonly config: TestAppServerConfig,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  private workspace?: Promise<string>;

  private resolveWorkspace(): Promise<string> {
    if (this.config.workspaceId) return Promise.resolve(this.config.workspaceId);
    this.workspace ??= this.provision().catch(() => { this.workspace = undefined; throw new Error("Demo workspace setup failed. The key needs agents:provision and client_tokens:create."); });
    return this.workspace;
  }
  private async provision(): Promise<string> {
    const server = new CaltraServerClient({ apiKey: this.config.apiKey, apiUrl: this.config.apiUrl, fetch: this.fetchImplementation });
    const workspace = await server.workspaces.get({ externalId: "sdk-demo", createIfMissing: { name: "SDK demo" } });
    await server.agents.get({ workspaceId: workspace.id, owner: { tenantUserExternalId: this.config.tenantUserExternalId }, createIfMissing: { name: "SDK demo assistant" } });
    return workspace.id;
  }

  async create(origin: string): Promise<TestAppClientAuthorizationResponse> {
    const response = await this.fetchImplementation(
      `${this.config.apiUrl}/server/v1/workspaces/${encodeURIComponent(await this.resolveWorkspace())}/client-authorizations`,
      {
        body: JSON.stringify({
          origin,
          tenant_user: { external_id: this.config.tenantUserExternalId },
        }),
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    if (!response.ok) {
      throw new Error(`Caltra authorization creation failed with HTTP ${response.status}.`);
    }
    return await response.json() as TestAppClientAuthorizationResponse;
  }
}
