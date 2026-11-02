# Caltra server SDK

Use `CaltraServerClient` only in trusted server code. Browser clients must never receive the environment API key.

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
