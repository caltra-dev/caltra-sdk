export interface CaltraServerClientOptions {
  apiKey: string;
  apiUrl?: string;
  fetch?: typeof fetch;
}

export interface CaltraServerWorkspace {
  externalId: string;
  id: string;
  name: string;
}

export interface CaltraClientAuthorizationCreate {
  agentIdentityIds?: string[];
  origin: string;
  tenantUser: {
    externalId: string;
    firstName?: string;
    lastName?: string;
  };
  workspace: CaltraWorkspaceLookup | CaltraWorkspaceCreateIfMissing;
}

export interface CaltraClientAuthorization {
  authorizationCode: string;
  expiresAt: Date;
  workspace: CaltraServerWorkspace;
}

export interface CaltraServerProblem {
  code: string;
  detail: string;
  request_id: string;
  retryable: boolean;
  status: number;
  title: string;
  type: string;
}

export interface CaltraWorkspaceLookup {
  externalId: string;
}

export interface CaltraWorkspaceCreateIfMissing extends CaltraWorkspaceLookup {
  createIfMissing: { name: string };
}

export interface CaltraServerAgentIdentity {
  externalId: string;
  id: string;
  name: string;
}

export interface CaltraAgentIdentityLookup {
  /** Explicitly synchronize names on every lookup, including an existing personal hosted agent. */
  syncNames?: { agentIdentity: string; hostedAgent: string };
  externalId: string;
  owner: { tenantUserExternalId: string };
  workspaceId: string;
}

export interface CaltraAgentIdentityCreateIfMissing extends CaltraAgentIdentityLookup {
  createIfMissing: {
    browserVisible?: boolean;
    description?: string;
    instructions: string;
    name: string;
  };
}
