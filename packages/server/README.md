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
  externalId: "personal-assistant",
  owner: { tenantUserExternalId: user.id },
  workspaceId: workspace.id,
  createIfMissing: {
    name: "Piria Assistant",
    instructions: PIRIA_ASSISTANT_INSTRUCTIONS,
  },
});
```

Create an origin-bound client authorization for an authenticated product user without exposing the
Caltra API key or client token to browser code:

```ts
const authorization = await caltra.clientAuthorizations.create({
  origin: config.customerWebOrigin,
  tenantUser: { externalId: user.id },
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
      userExternalId: user.id,
      workspaceExternalId: requestedWorkspaceExternalId,
    };
  },
});
```

Without `createIfMissing`, `workspaces.get()` returns `null` when the external ID is unknown. With
`createIfMissing`, concurrent calls converge on the same workspace for the API key's Caltra
organization.
