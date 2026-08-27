interface TestAppClientConfiguration {
  api_url: string;
  client_token: string;
  expires_at: string;
  refresh_after: string;
}

/** Caches only the short-lived browser token and deduplicates concurrent refreshes. */
export class TestAppTokenProvider {
  private configuration?: TestAppClientConfiguration;
  private readonly fetchImplementation: typeof fetch;
  private pending?: Promise<TestAppClientConfiguration>;

  constructor(fetchImplementation?: typeof fetch) {
    this.fetchImplementation = fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  async getConfiguration(): Promise<TestAppClientConfiguration> {
    if (
      this.configuration
      && Date.now() < new Date(this.configuration.refresh_after).getTime()
    ) {
      return this.configuration;
    }
    if (this.pending) return await this.pending;
    this.pending = this.exchange();
    try {
      this.configuration = await this.pending;
      return this.configuration;
    } finally {
      this.pending = undefined;
    }
  }

  async getToken(): Promise<string> {
    return (await this.getConfiguration()).client_token;
  }

  invalidate(): void {
    this.configuration = undefined;
  }

  private async exchange(): Promise<TestAppClientConfiguration> {
    const response = await this.fetchImplementation("/api/client-token", { method: "POST" });
    if (!response.ok) throw new Error(`Local client-token exchange failed with HTTP ${response.status}.`);
    return await response.json() as TestAppClientConfiguration;
  }
}
