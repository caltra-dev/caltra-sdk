# `@caltra/client`

Framework-neutral TypeScript client for durable Caltra agent sessions in browser applications.

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
  authorizationCodeProvider: async () => {
    const response = await fetch("/api/caltra/client-authorization", { method: "POST" });
    if (!response.ok) throw new Error("Caltra authentication failed.");
    return (await response.json() as { authorization_code: string }).authorization_code;
  },
});

const agents = await client.listAgents();
const session = await client.createSession({ agentId: agents.data[0].id });
const events = await client.openSessionEvents(session.id);
```

The customer endpoint authenticates the current user, uses `@caltra/server` to create a client
authorization with the stable external user ID and exact browser origin, and returns only
`authorization_code`. The SDK authenticates each code once at `/caltra/v1/auth/authenticate`,
caches only the resulting short-lived client token in memory, and requests a new authorization at
the server-provided refresh time. Never embed a Caltra server API key in a browser bundle.

The organization-level Clerk connection configures the upstream identity boundary separately. Until
direct Clerk exchange becomes available for SDK sessions, browser clients still use this
provider-neutral client-authorization contract.

The package is ESM-only. See the [Caltra SDK repository](https://github.com/caltra-dev/caltra-sdk) for development and integration-app instructions.
