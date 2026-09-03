import { z } from "zod";
import { CaltraApiError } from "./error.js";
import type { CaltraClientOptions, CaltraTokenConfiguration } from "./types.js";

const TokenConfigurationSchema = z.object({
  client_token: z.string().min(1),
  expires_at: z.iso.datetime(),
  refresh_after: z.iso.datetime(),
}).strict();

/** Exchanges one-time authorization codes and retains only the resulting client token in memory. */
export class CaltraClientTokenProvider {
  private configuration?: CaltraTokenConfiguration;
  private pending?: Promise<CaltraTokenConfiguration>;

  constructor(
    private readonly apiUrl: string,
    private readonly fetchImplementation: typeof fetch,
    private readonly authorizationCodeProvider: CaltraClientOptions["authorizationCodeProvider"],
  ) {}

  async getToken(): Promise<string> {
    return (await this.getConfiguration()).clientToken;
  }

  invalidate(): void {
    this.configuration = undefined;
  }

  private async getConfiguration(): Promise<CaltraTokenConfiguration> {
    if (this.configuration && Date.now() < this.configuration.refreshAfter.getTime()) {
      return this.configuration;
    }
    if (this.pending) return await this.pending;
    this.pending = this.authenticate();
    try {
      this.configuration = await this.pending;
      return this.configuration;
    } finally {
      this.pending = undefined;
    }
  }

  private async authenticate(): Promise<CaltraTokenConfiguration> {
    const authorizationCode = await this.authorizationCodeProvider();
    const response = await this.fetchImplementation(
      `${this.apiUrl}/caltra/v1/auth/authenticate`,
      {
        body: JSON.stringify({ authorization_code: authorizationCode }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) throw await CaltraApiError.fromResponse(response);
    const value = TokenConfigurationSchema.parse(await response.json());
    const configuration = {
      clientToken: value.client_token,
      expiresAt: new Date(value.expires_at),
      refreshAfter: new Date(value.refresh_after),
    };
    if (configuration.refreshAfter >= configuration.expiresAt) {
      throw new Error("Caltra returned an invalid client-token refresh window.");
    }
    return configuration;
  }
}
