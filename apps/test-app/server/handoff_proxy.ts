import type { TestAppServerConfig } from "./config.js";

export interface TestAppClientHandoffResponse {
  expires_at: string;
  handoff_code: string;
}

/** Creates a one-time handoff while keeping the Caltra server API key outside browser code. */
export class TestAppHandoffProxy {
  constructor(
    private readonly config: TestAppServerConfig,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  async create(origin: string): Promise<TestAppClientHandoffResponse> {
    const response = await this.fetchImplementation(
      `${this.config.apiUrl}/server/v1/workspaces/${encodeURIComponent(this.config.workspaceId)}/client-handoffs`,
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
      throw new Error(`Caltra handoff creation failed with HTTP ${response.status}: ${detail}`);
    }
    return await response.json() as TestAppClientHandoffResponse;
  }
}
