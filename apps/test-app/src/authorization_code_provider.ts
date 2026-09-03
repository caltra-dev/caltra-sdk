import { z } from "zod";

const AuthorizationSchema = z.object({
  authorization_code: z.string().min(1),
  expires_at: z.iso.datetime(),
}).strict();

/** Requests a fresh authorization code from the application's same-origin authenticated backend. */
export class TestAppAuthorizationCodeProvider {
  private readonly fetchImplementation: typeof fetch;

  constructor(fetchImplementation?: typeof fetch) {
    this.fetchImplementation = fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  async create(): Promise<string> {
    const response = await this.fetchImplementation("/api/client-authorization", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Local client authorization failed with HTTP ${response.status}.`);
    }
    return AuthorizationSchema.parse(await response.json()).authorization_code;
  }
}
