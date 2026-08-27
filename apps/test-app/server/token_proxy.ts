import type { TestAppServerConfig } from "./config.js";

export interface TestAppClientTokenResponse {
  api_url: string;
  client_token: string;
  expires_at: string;
  refresh_after: string;
}

/** Exchanges a server credential without returning it or forwarding it to browser code. */
export class TestAppTokenProxy {
  constructor(
    private readonly config: TestAppServerConfig,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  async exchange(origin: string): Promise<TestAppClientTokenResponse> {
    const response = await this.fetchImplementation(
      `${this.config.apiUrl}/server/v1/workspaces/${encodeURIComponent(this.config.workspaceId)}/client-tokens`,
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
      throw new Error(`Caltra token exchange failed with HTTP ${response.status}: ${detail}`);
    }
    const token = await response.json() as Omit<TestAppClientTokenResponse, "api_url">;
    return { ...token, api_url: this.config.apiUrl };
  }
}
