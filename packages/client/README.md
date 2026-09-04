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
  workspaceExternalId: piriaOrganization.id,
});

const session = await client.sessions.get({
  externalId: "primary",
  createIfMissing: { agentExternalId: "personal-assistant" },
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
