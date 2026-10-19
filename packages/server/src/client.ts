import { z } from "zod";
import { CaltraAgentsClient } from "./agents.js";
import type { CaltraServerClientOptions } from "./types.js";
import { CaltraClientAuthorizationsClient } from "./client_authorizations.js";
import { CaltraWorkspacesClient } from "./workspaces.js";
import { CaltraAgentIdentitiesClient } from "./agent_identities.js";

const OptionsSchema = z.object({
  apiKey: z.string(),
  apiUrl: z.string().optional(),
  fetch: z.custom<typeof fetch>((value) => typeof value === "function").optional(),
  workspaceNamespace: z.string().optional(),
}).strict();

/** Provides authenticated, server-only access to Caltra resources without exposing the API key. */
export class CaltraServerClient {
  readonly agents: CaltraAgentsClient;
  readonly agentIdentities: CaltraAgentIdentitiesClient;
  readonly clientAuthorizations: CaltraClientAuthorizationsClient;
  readonly workspaces: CaltraWorkspacesClient;

  constructor(input: CaltraServerClientOptions) {
    const options = OptionsSchema.parse(input);
    const apiUrl = (options.apiUrl ?? "https://api.caltra.dev").replace(/\/+$/, "");
    const fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.agents = new CaltraAgentsClient(options.apiKey, apiUrl, fetchImplementation);
    this.agentIdentities = new CaltraAgentIdentitiesClient(options.apiKey, apiUrl, fetchImplementation);
    this.workspaces = new CaltraWorkspacesClient(options.apiKey, apiUrl, fetchImplementation, options.workspaceNamespace);
    this.clientAuthorizations = new CaltraClientAuthorizationsClient(
      options.apiKey,
      apiUrl,
      fetchImplementation,
      this.workspaces,
    );
  }
}
