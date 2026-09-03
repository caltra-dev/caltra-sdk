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

  async create(origin: string): Promise<TestAppClientAuthorizationResponse> {
    const response = await this.fetchImplementation(
      `${this.config.apiUrl}/server/v1/workspaces/${encodeURIComponent(this.config.workspaceId)}/client-authorizations`,
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
      const detail = await response.text();
      throw new Error(`Caltra authorization creation failed with HTTP ${response.status}: ${detail}`);
    }
    return await response.json() as TestAppClientAuthorizationResponse;
  }
}
