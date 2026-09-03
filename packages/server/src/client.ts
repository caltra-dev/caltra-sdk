import type { CaltraServerClientOptions } from "./types.js";
import { CaltraWorkspacesClient } from "./workspaces.js";

/** Provides authenticated, server-only access to Caltra resources without exposing the API key. */
export class CaltraServerClient {
  readonly workspaces: CaltraWorkspacesClient;

  constructor(options: CaltraServerClientOptions) {
    const apiUrl = (options.apiUrl ?? "https://api.caltra.dev").replace(/\/+$/, "");
    const fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.workspaces = new CaltraWorkspacesClient(options.apiKey, apiUrl, fetchImplementation);
  }
}
