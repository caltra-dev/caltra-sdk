import type { CaltraAuthProvider } from "./auth_provider_interface.js";
import { z } from "zod";
import { CaltraApiError } from "./error.js";
import type { CaltraAuthorizationCodeProvider, CaltraTokenConfiguration } from "./types.js";

const TokenConfigurationSchema = z.object({
  client_token: z.string().min(1),
  expires_at: z.iso.datetime(),
  workspace_id: z.uuid().optional(),
  refresh_after: z.iso.datetime(),
}).strict();

/** Exchanges one-time authorization codes and retains only the resulting client token in memory. */
export class CaltraClientTokenProvider {
  private configuration?: CaltraTokenConfiguration;
  private session?: string;
  private pending?: Promise<CaltraTokenConfiguration>;

  constructor(
    private readonly apiUrl: string,
    private readonly fetchImplementation: typeof fetch,
    private readonly provider: CaltraAuthorizationCodeProvider | CaltraAuthProvider,
  ) {}

  async getToken(): Promise<string> {
    return (await this.getConfiguration()).clientToken;
  }

  invalidate(): void {
    this.configuration = undefined;
  }

  async getConfiguration(): Promise<CaltraTokenConfiguration> {
    const session = typeof this.provider === "function" ? undefined : await this.provider.getSessionToken();
    if (this.session !== session) {
      this.session = session;
      this.configuration = undefined;
      this.pending = undefined;
    }
    if (this.configuration && Date.now() < this.configuration.refreshAfter.getTime()) {
      return this.configuration;
    }
    if (this.pending) return await this.pending;
    const pending = this.authenticate(session);
    this.pending = pending;
    try {
      const result = await pending;
      if (this.pending === pending) this.configuration = result;
      return result;
    } finally {
      if (this.pending === pending) this.pending = undefined;
    }
  }

  private async authenticate(session?: string): Promise<CaltraTokenConfiguration> {
    const response = typeof this.provider !== "function"
      ? await this.provider.exchange(this.apiUrl, session!, this.fetchImplementation)
      : await this.fetchImplementation(
      `${this.apiUrl}/caltra/v1/auth/authenticate`,
      {
        body: JSON.stringify({ authorization_code: await this.provider() }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    if (!response.ok) throw await CaltraApiError.fromResponse(response);
    const value = TokenConfigurationSchema.parse(await response.json());
    const configuration = {
      ...(value.workspace_id ? { workspaceId: value.workspace_id } : {}),
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
