# `@caltra/server`

The server-only Caltra SDK. Keep its API key in trusted backend code and never ship it to a browser.

```ts
import { CaltraServerClient } from "@caltra/server";

const caltra = new CaltraServerClient({ apiKey: config.caltraApiKey });

const workspace = await caltra.workspaces.get({
  externalId: piriaOrganization.id,
  createIfMissing: { name: piriaOrganization.name },
});

await caltra.agents.get({
  owner: { tenantUserExternalId: user.id },
  workspaceId: workspace.id,
  createIfMissing: {
    name: "Piria Assistant",
  },
});
```

Create an origin-bound client authorization for an authenticated product user without exposing the
Caltra API key or client token to browser code:

```ts
const authorization = await caltra.clientAuthorizations.create({
  origin: config.customerWebOrigin,
  tenantUser: {
    externalId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
  },
  workspace: {
    externalId: organization.id,
    createIfMissing: { name: organization.name },
  },
});

return { authorization_code: authorization.authorizationCode };
```

Fastify applications can install that authorization bridge at the default
`/api/caltra/authorize` route. The host callback remains responsible for authenticating its user,
authorizing the requested workspace, and running any application-specific provisioning:

```ts
import caltraFastify from "@caltra/server/fastify";

await app.register(caltraFastify, {
  client: caltra,
  resolveIdentity: async (request, { requestedWorkspaceExternalId }) => {
    const user = await piriaAuth.resolve(request);
    if (!user || !await memberships.hasAccess(user.id, requestedWorkspaceExternalId)) return null;
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      userExternalId: user.id,
      workspaceExternalId: requestedWorkspaceExternalId,
    };
  },
});
```

Structured names are optional. When supplied, they synchronize the Caltra tenant identity; omitted
fields preserve the names already stored in Caltra.

Without `createIfMissing`, `workspaces.get()` returns `null` when the external ID is unknown. With
`createIfMissing`, concurrent calls converge on the same workspace for the API key's Caltra
environment. The same external ID in another environment identifies a separate workspace.

Agent provisioning requires `agents:provision`. It creates or reuses the user’s hosted agent without creating an agent identity. Add `syncName` to update an existing agent’s display name; creation is idempotent for the same workspace and user. Caltra must expose the agent provisioning API before deploying this SDK version to consumers.

Use `caltra.agentIdentities.get(...)` when you need a separate identity with its own instructions and access relationships. That operation requires `agent-identities:provision`.


### Pinning development workspaces to a hosted environment

```ts
const caltra = CaltraServerClient.forEnvironment({
  apiKey: process.env.CALTRA_API_KEY!,
  environmentId: "60000000-0000-4000-8000-000000000001",
  workspaceNamespace: "myapp-local",
});
```

`environmentId` asserts the environment already bound to the API key. It cannot
expand or switch the key’s authority. Create separate keys in each environment’s
settings. The assertion is sent for every workspace resolution, including client
authorization; a mismatch is rejected and the SDK never retries without it. This
requires the hosted API’s environment-scoped credential support. An older API
rejects the request rather than silently provisioning in production.

`workspaceNamespace` prefixes server wire external IDs as `namespace:externalId`.
Use a distinct namespace for local development and each preview. Browser workspace
IDs and the host application's authorization checks stay unchanged. Returned
workspace documents contain the actual namespaced external ID. Both options are
optional; omitting them uses the key’s own environment and unprefixed external IDs.

`forEnvironment` requires an explicit environment. Integrations that must fail
closed with stale installed dependencies can require this entry point; older SDKs
do not expose it.
