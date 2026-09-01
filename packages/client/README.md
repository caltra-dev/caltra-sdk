# `@caltra/client`

Framework-neutral TypeScript client for durable Caltra agent sessions in browser applications.

## Install

```bash
npm install @caltra/client
```

## Use

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

const agents = await client.listAgents();
const session = await client.createSession({ agentId: agents.data[0].id });
const events = await client.openSessionEvents(session.id);
```

The customer endpoint authenticates the current user, calls Caltra's server-side
`POST /server/v1/workspaces/{workspace_id}/client-handoffs` endpoint with the stable external user
ID and exact browser origin, and returns only `handoff_code`. The SDK exchanges each code once,
caches only the resulting short-lived client token in memory, and requests a new handoff at the
server-provided refresh time. Never embed a Caltra server API key in a browser bundle.

The organization-level Clerk connection configures the upstream identity boundary separately. Until
direct Clerk exchange becomes available for SDK sessions, browser clients still use this
provider-neutral handoff contract.

The package is ESM-only. See the [Caltra SDK repository](https://github.com/caltra-dev/caltra-sdk) for development and integration-app instructions.
