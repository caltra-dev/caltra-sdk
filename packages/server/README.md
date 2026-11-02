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


### Isolating application instances

```ts
const caltra = new CaltraServerClient({
  apiKey: process.env.CALTRA_API_KEY!,
  workspaceNamespace: "myapp-local",
});
```

The API key determines access scope. There is no environment selector in the SDK
or server/client API. Create the appropriate key in Caltra's environment settings;
the integration supplies only that key. Obsolete environment fields are rejected.

`workspaceNamespace` optionally prefixes workspace external IDs as `namespace:externalId`.
Use distinct namespaces for development instances and previews sharing a key.
Browser workspace IDs and host-application authorization checks stay unchanged.

### Hosted-agent model policy

An environment server key with `agents:provision` can manage a hosted agent in an active workspace belonging to that key's organization and environment:

```ts
const policy = await server.agents.getModelPolicy({ workspaceId, agentId });
await server.agents.updateModelPolicy({
  workspaceId,
  agentId,
  default: { platformModelId, reasoningLevel: "high" },
  allowedChoices: [
    { platformModelId, reasoningLevel: null },
    { platformModelId, reasoningLevel: "high" },
  ],
});
```

`default: null` restores workspace/organization inheritance. Omit `default` to preserve it. `allowedChoices` replaces the additional model/reasoning pairs; omit it to preserve the list or pass `[]` to clear it. Duplicate pairs are collapsed. `reasoningLevel: null` means automatic reasoning, not every supported effort. Reads return `inheritsModelPolicy`, `default` (null when inherited), `effectiveDefault` (null when unavailable), and `allowedChoices`.

Updates are atomic. Every explicit model must be active with an active route, and a non-null reasoning level must be supported by every active route. Invalid choices return `400 invalid_model_policy`; malformed bodies return `400 invalid_request`. Invalid, expired, or revoked keys return 401, missing scope or inaccessible workspaces return 403, and absent, inactive, external, or wrong-workspace agents return 404. Errors are `CaltraServerError` instances.

Defaults apply to future sessions only. Existing sessions retain their original default, which stays selectable independently of the additional choices. Clearing additional choices does not alter recorded turns or an in-progress reply. Per-message model selection remains authorized against the session's currently available choices when a new turn is submitted.

The wire endpoints are `GET` and `PATCH /server/v1/workspaces/{workspace_id}/agents/{agent_id}/model-policy`. Keep server keys on your trusted server; browser client tokens cannot manage policy.

## Capability settings (unreleased)

The methods below require the forthcoming server SDK release. They configure saved runtime choices and environment creation defaults; they do not grant permission to a user or agent identity. The API key requires `agents:provision` in the selected environment.

```ts
const page = await server.capabilitySettings.list({
  workspaceId,
  target: { kind: "agent", id: runtimeId },
});

await server.capabilitySettings.update({
  workspaceId,
  target: { kind: "agent", id: runtimeId },
  changes: [{ capabilityId, enabled: true, mode: "summary" }],
});

await server.capabilitySettings.update({
  workspaceId,
  target: { kind: "environment", id: environmentId },
  changes: [{ capabilityId, mode: "on_demand" }],
  applyToExistingRuntimes: true,
});
```

- New runtimes copy the environment defaults. Existing runtimes keep their saved values unless an environment update explicitly applies to existing runtimes.
- New sessions copy their runtime's loading choices. Existing session loading does not change when a runtime or environment default changes.
- `on_demand`, `summary`, and `full_definition` are concrete modes. Null/inherit is rejected.
- Omission preserves each field. Disabling a runtime capability does not discard its loading choice.
- Enablement is controlled by the runtime; session targets accept only loading changes.
- Bulk application is environment-only and atomic. It patches only submitted fields on non-revoked hosted runtimes in that environment. Reads return `runtimeCount`; updates return `affectedRuntimes`.
- `agents.get` also accepts `capabilityLoading` patches when creating or looking up a runtime. Omission preserves saved settings.

The HTTP endpoints remain `/server/v1/workspaces/{workspace_id}/capability-loading/read` and `/set` for compatibility. Model-policy inheritance is separate and unchanged.
