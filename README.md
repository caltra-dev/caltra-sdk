# Caltra SDK

Open-source TypeScript clients for embedding agent-owned Caltra sessions in web applications.

This repository contains the server-only `@caltra/server`, the framework-neutral browser
`@caltra/client`, the assistant-ui adapter `@caltra/react`, and a local integration application
under `apps/test-app`.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The packages are ESM-only and require Node.js 24 or newer for development.

## Server usage

Use `@caltra/server` only in trusted backend code. An API key belongs to one Caltra organization,
so a customer application can map its own organization IDs directly to Caltra workspaces without
an application ID or customer-specific integration code:

```ts
import { CaltraServerClient } from "@caltra/server";

const caltra = new CaltraServerClient({ apiKey: config.caltraApiKey });
const workspace = await caltra.workspaces.get({
  externalId: organization.id,
  createIfMissing: { name: organization.name },
});

const authorization = await caltra.clientAuthorizations.create({
  origin: config.customerWebOrigin,
  tenantUser: { externalId: user.id },
  workspace: {
    externalId: organization.id,
    createIfMissing: { name: organization.name },
  },
});
```

Omit `createIfMissing` for a lookup-only call that returns `null` when the mapping does not exist.
Concurrent create-if-missing calls are idempotent and return the same workspace.

### Personal agent names

Provision a hosted agent for the authenticated user with a credential containing `agents:provision`. Use `syncName` to update its display name on subsequent calls:

```ts
const assistantName = user.firstName ? `${user.firstName}'s Assistant` : "Personal agent";
await caltra.agents.get({
  owner: { tenantUserExternalId: user.id },
  workspaceId: workspace.id,
  createIfMissing: { name: assistantName },
  syncName: assistantName,
});
```

No agent identity profile is created. Omitting `syncName` preserves the existing name. Names must contain 1–160 characters.

## Local integration application

`apps/test-app` exercises the workspace packages against a real Caltra API. Copy its example
configuration and provide a server API key whose workspace allows the test application's exact
browser origin (Vite defaults to `http://localhost:5173`).

```bash
cp apps/test-app/.env.example apps/test-app/.env.local
npm run dev --workspace=@caltra/test-app
```

```env
CALTRA_API_URL=http://api.caltra
CALTRA_API_KEY=csk_test_replace_me
CALTRA_WORKSPACE_ID=00000000-0000-4000-8000-000000000000
CALTRA_TENANT_USER_EXTERNAL_ID=sdk-test-user
```

All four variables are read by Vite's local Node process. The local server uses the API key to
create a 60-second, single-use authorization at `/api/client-authorization`; the API key and Caltra client token
are never returned by that customer-backend route or embedded in the production bundle.
Provision a hosted agent for the configured tenant user before opening the test app.
The test app resolves that agent, lists sessions, creates sessions beneath it, opens
the authenticated event stream, reloads its safe transcript, and renders it with assistant-ui
primitives.

## Client usage

```ts
import { CaltraClient } from "@caltra/client";

const client = new CaltraClient({
  // Optional. Production defaults to https://api.caltra.dev.
  apiUrl: "https://api.caltra.dev",
  authorizationCodeProvider: async () => {
    const response = await fetch("/api/caltra/client-authorization", { method: "POST" });
    if (!response.ok) throw new Error("Caltra authentication failed.");
    return (await response.json() as { authorization_code: string }).authorization_code;
  },
});

const sessions = await client.listSessions();
const agent = await client.agents.get();
const created = await agent.sessions.create();
const events = await client.openSessionEvents(created.id);
```

React applications can pass a client and selected session to `useCaltraRuntime` from
`@caltra/react`, then provide the returned agent to assistant-ui's `AssistantAgentProvider`.
The React package intentionally exports no chat UI components.

## Customer backend authorization

The application's same-origin `/api/caltra/client-authorization` route is intentionally provider-neutral. Its
existing authentication middleware resolves the signed-in user, then its server code calls:

```http
POST https://api.caltra.dev/server/v1/workspaces/{workspace_id}/client-authorizations
Authorization: Bearer csk_live_...
Content-Type: application/json

{
  "origin": "https://customer.example.com",
  "tenant_user": { "external_id": "stable-customer-user-id" }
}
```

Return only Caltra's `authorization_code` and `expires_at` fields to the browser. Each code is bound
to the configured browser origin, expires after at most 60 seconds, and can authenticate once at
`POST https://api.caltra.dev/caltra/v1/auth/authenticate`.

Organizations can configure Clerk OAuth directly in Caltra as their upstream identity boundary.
Direct Clerk exchange for SDK sessions is not available yet, so browser clients currently use the
same client-authorization contract with Clerk, Better Auth, legacy sessions, or any other customer-side provider.


### Agent-owned sessions

Provision a personal hosted agent on the server using a credential with `agents:provision`:

```ts
await server.agents.get({
  workspaceId,
  owner: { tenantUserExternalId: userId },
  createIfMissing: { name: "Personal agent" },
});
```

In the authorized browser client, resolve the agent and its stable session:

```ts
const agent = await client.agents.get();
const session = await agent.sessions.get({ externalId: "primary", createIfMissing: {} });
// Independent conversations can use agent.sessions.create().
```

The session external ID is scoped to its agent. This path creates no agent identity. Agent authorization is derived from the signed browser identity; an agent identity-downscoped token cannot create a session without a separate agent identity. Caltra API support and the `agents:provision` credential scope must be deployed before consumers switch to these methods.
