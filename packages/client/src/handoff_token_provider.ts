import { z } from "zod";
import { CaltraApiError } from "./error.js";
import type {
  CaltraHandoffTokenProviderOptions,
  CaltraTokenConfiguration,
} from "./types.js";

const TokenConfigurationSchema = z.object({
  client_token: z.string().min(1),
  expires_at: z.iso.datetime(),
  refresh_after: z.iso.datetime(),
}).strict();

/**
 * Exchanges customer-authenticated, single-use handoffs and retains only the resulting short-lived
 * Caltra client token in browser memory.
 */
export class CaltraHandoffTokenProvider {
  private readonly apiUrl: string;
  private configuration?: CaltraTokenConfiguration;
  private readonly fetchImplementation: typeof fetch;
  private pending?: Promise<CaltraTokenConfiguration>;

  constructor(private readonly options: CaltraHandoffTokenProviderOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getToken(): Promise<string> {
    return (await this.getConfiguration()).clientToken;
  }

  invalidate(): void {
    this.configuration = undefined;
  }

  private async getConfiguration(): Promise<CaltraTokenConfiguration> {
    if (
      this.configuration
      && Date.now() < this.configuration.refreshAfter.getTime()
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

  private async exchange(): Promise<CaltraTokenConfiguration> {
    const handoffCode = await this.options.handoffProvider();
    const response = await this.fetchImplementation(
      `${this.apiUrl}/client/v1/auth/handoffs/exchange`,
      {
        body: JSON.stringify({ handoff_code: handoffCode }),
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
