import type { CaltraAuthProvider } from "./auth_provider_interface.js";

export type ClerkAuthOptions = {
  providerId: string;
  getToken: () => Promise<string | null>;
  workspace: { id: string } | { createIfMissing: { key: string; name: string } };
};

/** Uses a host application's existing Clerk session to open or create its user's workspace. */
export class ClerkAuthProvider implements CaltraAuthProvider {
  constructor(private readonly options: ClerkAuthOptions) {}

  async getSessionToken(): Promise<string> {
    const token = await this.options.getToken();
    if (!token) throw new Error("Sign in to Clerk to access this workspace.");
    return token;
  }

  async exchange(apiUrl: string, token: string, fetchImplementation: typeof fetch): Promise<Response> {
    const { providerId, workspace } = this.options;
    return fetchImplementation(`${apiUrl}/caltra/v1/auth/clerk/exchange`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ provider_id: providerId, workspace: "id" in workspace
        ? { id: workspace.id } : { create_if_missing: workspace.createIfMissing } }),
    });
  }
}
