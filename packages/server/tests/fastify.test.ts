import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import caltraFastify from "../src/fastify.js";
import type { CaltraServerClient } from "../src/index.js";

describe("Caltra Fastify plugin", () => {
  it("installs the default authorization route and delegates identity to the host", async () => {
    const create = vi.fn(async () => ({
      authorizationCode: "cac_authorized",
      expiresAt: new Date("2026-09-03T19:01:00.000Z"),
      workspace: { externalId: "org-1", id: "workspace-1", name: "Acme" },
    }));
    const app = Fastify();
    await app.register(caltraFastify, {
      client: { clientAuthorizations: { create } } as unknown as CaltraServerClient,
      resolveIdentity: async (_request, input) => ({
        userExternalId: "user-1",
        workspaceExternalId: input.requestedWorkspaceExternalId,
      }),
    });

    const response = await app.inject({
      headers: { origin: "https://app.piria.test" },
      method: "POST",
      payload: { workspace_external_id: "org-1" },
      url: "/api/caltra/authorize",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      authorization_code: "cac_authorized",
      expires_at: "2026-09-03T19:01:00.000Z",
    });
    expect(create).toHaveBeenCalledWith({
      origin: "https://app.piria.test",
      tenantUser: { externalId: "user-1" },
      workspace: { externalId: "org-1" },
    });
    await app.close();
  });
});
