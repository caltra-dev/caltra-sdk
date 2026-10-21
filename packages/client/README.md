# `@caltra/client`

Framework-neutral TypeScript client for agent-owned Caltra sessions in browser applications.

## Install

```bash
npm install @caltra/client
```

## Use

```ts
import { CaltraClient } from "@caltra/client";

const client = new CaltraClient({
  // Optional. Production defaults to https://api.caltra.dev.
  apiUrl: "https://api.caltra.dev",
  workspaceExternalId: piriaOrganization.id,
});

const agent = await client.agents.get();
const session = await agent.sessions.get({
  externalId: "primary",
  createIfMissing: {},
});
const events = await client.openSessionEvents(session.id);
```

By default the SDK requests authorization from the same-origin `/api/caltra/authorize` route. Set
`authorizationRoute` to override it, or provide `authorizationCodeProvider` for a custom transport.
The server route authenticates the current user, uses `@caltra/server` to create a client
authorization with the stable external user ID and exact browser origin, and returns only
`authorization_code`. The SDK authenticates each code once at `/caltra/v1/auth/authenticate`,
caches only the resulting short-lived client token in memory, and requests a new authorization at
the server-provided refresh time. Never embed a Caltra server API key in a browser bundle.

The organization-level Clerk connection configures the upstream identity boundary separately. Until
direct Clerk exchange becomes available for SDK sessions, browser clients still use this
provider-neutral client-authorization contract.

The package is ESM-only. See the [Caltra SDK repository](https://github.com/caltra-dev/caltra-sdk) for development and integration-app instructions.

Provision the user’s hosted agent through the server SDK before opening the browser. External session IDs are unique within that agent. Use `agent.sessions.create()` for a new independent conversation. Session documents include `agent`; their optional `agentIdentity` execution profile may be `null`.

### Cancellation

`await client.cancelSession(sessionId)` cancels the active turn in an owned active session and returns `{ turn_id: string | null }`; null means already idle. It uses the browser token's `messages:create` permission. Callers should refetch messages after success. API errors propagate normally. Requires the server's `POST /client/v1/sessions/:session_id/cancel` endpoint.

## Framework-neutral session runtime (0.10.0)

`CaltraClient` owns authentication and transport. `CaltraSessionRuntime` owns the in-memory state of one session and has no React or UI-framework dependencies. Creating it performs no I/O:

```ts
const runtime = client.createSessionRuntime({ sessionId });
const unsubscribe = runtime.subscribe(() => {
  const { messages, connection, historyLoaded, error, isRunning } = runtime.getSnapshot();
  // Update your UI. Do not mutate the snapshot or its messages.
});
await runtime.start();
await runtime.send("Hello");
// await runtime.cancel();
unsubscribe();
await runtime.stop();
```

Create one runtime per active client/session scope. Start is idempotent; multiple consumers share the same event stream. Retain the instance across renders. The owner calls stop when done; UI adapters only subscribe/unsubscribe. `refresh()` reconciles history; `reconnect()` restores transport while retaining loaded messages. A runtime's session ID is immutable. Use a new runtime when switching authenticated identities or sessions, and reset the UI's presentation state at that boundary.

The runtime reconciles optimistic user IDs with persisted history and exposes connection, error, loading and turn state. On current Caltra servers, `isRunning` stays true while input is being submitted or a persisted turn is queued/running, including tool execution and gaps between messages. Session updates and reconnects reconcile this state; message completion alone never clears it. Older servers that omit `is_running` retain the legacy message-activity fallback. Turn completion is distinct from completion of any larger application workflow.

`@caltra/assistant-ui` translates the runtime to assistant-ui. Other UI adapters can consume the same subscription/action contract without duplicating transport or session reconciliation. CopilotKit/AG-UI integration is not implemented.
