import type { CaltraServerClientOptions } from "./types.js";
import { CaltraClientAuthorizationsClient } from "./client_authorizations.js";
import { CaltraWorkspacesClient } from "./workspaces.js";
import { CaltraAgentsClient } from "./agents.js";

/** Provides authenticated, server-only access to Caltra resources without exposing the API key. */
export class CaltraServerClient {
  readonly agents: CaltraAgentsClient;
  readonly clientAuthorizations: CaltraClientAuthorizationsClient;
  readonly workspaces: CaltraWorkspacesClient;

  constructor(options: CaltraServerClientOptions) {
    const apiUrl = (options.apiUrl ?? "https://api.caltra.dev").replace(/\/+$/, "");
    const fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.agents = new CaltraAgentsClient(options.apiKey, apiUrl, fetchImplementation);
    this.workspaces = new CaltraWorkspacesClient(options.apiKey, apiUrl, fetchImplementation);
    this.clientAuthorizations = new CaltraClientAuthorizationsClient(
      options.apiKey,
      apiUrl,
      fetchImplementation,
      this.workspaces,
    );
  }
}
