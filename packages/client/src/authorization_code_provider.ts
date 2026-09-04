import { z } from "zod";
import { CaltraApiError } from "./error.js";

const AuthorizationSchema = z.object({ authorization_code: z.string().min(1) }).passthrough();

/** Requests one-time authorization codes from the host application's same-origin server route. */
export class CaltraAuthorizationCodeEndpointProvider {
  constructor(
    private readonly fetchImplementation: typeof fetch,
    private readonly route: string,
    private readonly workspaceExternalId: string,
    private readonly headersProvider?: () => Promise<HeadersInit>,
  ) {}

  async get(): Promise<string> {
    const headers = new Headers(await this.headersProvider?.());
    headers.set("content-type", "application/json");
    const response = await this.fetchImplementation(this.route, {
      body: JSON.stringify({ workspace_external_id: this.workspaceExternalId }),
      credentials: "same-origin",
      headers,
      method: "POST",
    });
    if (!response.ok) throw await CaltraApiError.fromResponse(response);
    return AuthorizationSchema.parse(await response.json()).authorization_code;
  }
}
