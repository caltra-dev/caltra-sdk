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
  apiUrl: "https://api.caltra.dev",
  tokenProvider: async () => getShortLivedClientToken(),
});

const agents = await client.listAgents();
const session = await client.createSession({ agentId: agents.data[0].id });
const events = await client.openSessionEvents(session.id);
```

The token provider must return a short-lived Caltra client token. Do not embed a server API key in a browser bundle.

The package is ESM-only. See the [Caltra SDK repository](https://github.com/caltra-dev/caltra-sdk) for development and integration-app instructions.
