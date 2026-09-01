# Caltra SDK

Open-source TypeScript clients for embedding permanent Caltra agent sessions in web applications.

This repository contains the framework-neutral `@caltra/client`, the assistant-ui adapter
`@caltra/react`, and a local integration application under `apps/test-app`.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The packages are ESM-only and require Node.js 24 or newer for development.

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
create a 60-second, single-use handoff at `/api/client-handoff`; the API key and Caltra client token
are never returned by that customer-backend route or embedded in the production bundle.
The test app lists published agents and permanent sessions, creates a selected agent session, opens
the authenticated event stream, reloads its safe transcript, and renders it with assistant-ui
primitives.

## Client usage

```ts
import { CaltraClient, CaltraHandoffTokenProvider } from "@caltra/client";

const handoffs = new CaltraHandoffTokenProvider({
  apiUrl: "https://api.caltra.dev",
  handoffProvider: async () => {
    const response = await fetch("/api/caltra/handoff", { method: "POST" });
    if (!response.ok) throw new Error("Caltra authentication failed.");
    return (await response.json() as { handoff_code: string }).handoff_code;
  },
});

const client = new CaltraClient({
  apiUrl: "https://api.caltra.dev",
  tokenInvalidator: () => handoffs.invalidate(),
  tokenProvider: async () => await handoffs.getToken(),
});

const sessions = await client.listSessions();
const created = await client.createSession({ agentId: "agent-uuid" });
const events = await client.openSessionEvents(created.id);
```

React applications can pass a client and selected session to `useCaltraRuntime` from
`@caltra/react`, then provide the returned runtime to assistant-ui's `AssistantRuntimeProvider`.
The React package intentionally exports no chat UI components.

## Customer backend handoff

The application's same-origin `/api/caltra/handoff` route is intentionally provider-neutral. Its
existing authentication middleware resolves the signed-in user, then its server code calls:

```http
POST https://api.caltra.dev/server/v1/workspaces/{workspace_id}/client-handoffs
Authorization: Bearer csk_live_...
Content-Type: application/json

{
  "origin": "https://customer.example.com",
  "tenant_user": { "external_id": "stable-customer-user-id" }
}
```

Return only Caltra's `handoff_code` and `expires_at` fields to the browser. Each code is bound to
the configured browser origin, expires after at most 60 seconds, and can be exchanged once.

Organizations using Clerk can instead configure Clerk OAuth directly in Caltra. That option needs
no customer backend adapter for identity; the SDK handoff remains available for custom auth,
Better Auth, legacy sessions, or any other provider resolved by the customer's backend.
