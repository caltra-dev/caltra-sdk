# Caltra SDK

Open-source TypeScript clients for embedding agent-owned Caltra sessions in web applications.

This repository contains the server-only `@caltra/server`, the framework-neutral browser
`@caltra/client`, the styled chat and assistant-ui adapter `@caltra/react`, and a local integration application
under `apps/test-app`.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The packages are ESM-only and require Node.js 24 or newer for development.

See [validation and publication](docs/workflows.md) for PR checks, silent pushes,
and explicit manual package releases.

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

Enable built-in web research with `capabilities: ["web_search"]` on `caltra.agents.get()`. Caltra injects web search and page-reading tools using its Exa integration; callers do not provide a search API key. Omit `capabilities` to preserve the existing UI setting, or pass an empty array to disable all capabilities. Settings apply on the next turn. Tool requests and provider-reported costs appear under Usage → Tools.

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
the authenticated event stream, reloads its safe transcript, and renders it with the packaged `CaltraChat` component. The Appearance selector switches
between default styling and an Italian custom theme without changing the session.

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

React applications can use the styled chat directly (available since 0.9.0; loading and Markdown improvements in 0.9.1):

```tsx
import { CaltraChat } from "@caltra/react/ui";
import "@caltra/react/styles.css";

<div style={{ height: "100dvh" }}>
  <CaltraChat client={client} sessionId={session.id} />
</div>
```

The SDK owns loading, confirmed-empty welcome, transcript, Markdown, composer and reconnect
presentation. Customize labels, CSS variables or component slots. Keep `client` stable for the
same authenticated identity. The headless `useCaltraRuntime` export remains available.
See the [React package guide](packages/react/README.md) for both integration paths.

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

## UI integration layers

- `@caltra/client`: framework-neutral API client and caller-owned `CaltraSessionRuntime`.
- `@caltra/assistant-ui`: `useAssistantUiRuntime(sessionRuntime)` for custom assistant-ui composition.
- `@caltra/react/ui`: ready-made `CaltraChat`, accepting either `client + sessionId` or a supplied `runtime`.
- `@caltra/react`: compatibility `useCaltraRuntime` convenience hook and historical store exports.

See [session runtime](packages/client/README.md), [assistant-ui adapter](packages/assistant-ui/README.md), and [chat customization](packages/react/README.md). The earlier-history release uses client 0.12.1, assistant-ui 0.4.0, and react 0.14.0 with `@assistant-ui/react` 0.15.30 or later. The shared chat loads earlier pages when scrolling up and shows skeleton messages above the transcript. Activate Caltra API 0.2.95 or later before upgrading consumers: it provides lightweight summary pages, scoped tool-detail reads, and reasoning snapshots/streams. No package is published by local builds or preview validation.

## Application context

Pass a JSON object as `context` when sending a message, or supply `getContext` to `useCaltraRuntime`, `useAssistantUiRuntime`, or `CaltraChat`. The getter runs at Send time and the runtime snapshots its result before asynchronous work.

```tsx
<CaltraChat client={client} sessionId={sessionId}
  getContext={() => ({ page: { screen: "customer", resource: { type: "customer", id: currentCustomerId } } })} />
```

The hosted API accepts up to 16 KiB and 12 levels of JSON context. It stores the snapshot with the message and provides it to the model as untrusted user data. Context is omitted from transcript responses and optimistic UI messages. Send `{ page: null }` to explicitly clear a previous page; omit context for ordinary text-only clients. Workspace identity and authorization still come from the authenticated session.
## Interactive demo

After `npm install`, run `npm run demo` for the local API stub or provide `CALTRA_API_KEY` in the launch environment for a real connection. `npm run demo -- --local-stub` forces simulation; `npm run demo -- --caltra-api-key=<key>` accepts a one-off key. See [demo setup](apps/test-app/README.md) for server-side credentials, automatic workspace setup, and the standard assistant-ui Thread comparison.

## Native Thread minor release

The native Thread integration ships in `@caltra/client@0.14.0`, `@caltra/assistant-ui@0.6.0`, and `@caltra/react@0.16.0`. `CaltraChat` is the shared native Thread wrapper; existing imports from `@caltra/react/ui` remain valid. The React package includes scoped native styles and exposes `@caltra/react/ui/thread` and `@caltra/react/ui/model-selector` for direct composition. `@caltra/server@0.9.0` remains the current server SDK. See the [React integration contract](packages/react/README.md) for supported slots and compatibility details.
