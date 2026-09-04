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
  agentIds?: string[];
  origin: string;
  tenantUser: { externalId: string };
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

export interface CaltraServerAgent {
  externalId: string;
  id: string;
  name: string;
}

export interface CaltraAgentLookup {
  externalId: string;
  owner: { tenantUserExternalId: string };
  workspaceId: string;
}

export interface CaltraAgentCreateIfMissing extends CaltraAgentLookup {
  createIfMissing: {
    browserVisible?: boolean;
    description?: string;
    instructions: string;
    name: string;
  };
}
