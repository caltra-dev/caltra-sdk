import { describe, expect, it, vi } from "vitest";
import { CaltraServerClient } from "../src/index.js";

const workspaceId = "40000000-0000-4000-8000-000000000001";

describe("CaltraClientAuthorizationsClient", () => {
  it("resolves the external workspace and creates a client authorization", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith("/server/v1/workspaces/get")) {
        return Response.json({
          external_id: "piria-organization-1",
          id: workspaceId,
          name: "Acme",
        });
      }
      return Response.json({
        authorization_code: "cac_authorized",
        expires_at: "2026-09-03T19:01:00.000Z",
      }, { status: 201 });
    });
    const client = new CaltraServerClient({
      apiKey: "csk_live_test",
      apiUrl: "https://api.example.test/",
      fetch: fetchImplementation as typeof fetch,
    });

    await expect(client.clientAuthorizations.create({
      agentIds: ["agent-1"],
      origin: "https://app.piria.example",
      tenantUser: {
        externalId: "piria-user-1",
        firstName: "Giulia",
        lastName: "Bianchi",
      },
      workspace: {
        createIfMissing: { name: "Acme" },
        externalId: "piria-organization-1",
      },
    })).resolves.toEqual({
      authorizationCode: "cac_authorized",
      expiresAt: new Date("2026-09-03T19:01:00.000Z"),
      workspace: {
        externalId: "piria-organization-1",
        id: workspaceId,
        name: "Acme",
      },
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[1]![0].toString()).toBe(
      `https://api.example.test/server/v1/workspaces/${workspaceId}/client-authorizations`,
    );
    expect(fetchImplementation.mock.calls[1]![1]).toMatchObject({
      body: JSON.stringify({
        agent_ids: ["agent-1"],
        origin: "https://app.piria.example",
        tenant_user: {
          external_id: "piria-user-1",
          first_name: "Giulia",
          last_name: "Bianchi",
        },
      }),
      method: "POST",
    });
    const headers = fetchImplementation.mock.calls[1]![1]!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer csk_live_test");
    expect(headers.get("content-type")).toBe("application/json");
  });
});
