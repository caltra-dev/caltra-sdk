import { describe, expect, it, vi } from "vitest";
import { CaltraServerClient, CaltraServerError } from "../src/index.js";

const workspaceId = "40000000-0000-4000-8000-000000000001";

describe("CaltraWorkspacesClient", () => {
  it("returns null when lookup-only does not find the external workspace", async () => {
    const client = new CaltraServerClient({
      apiKey: "caltra_test_key",
      apiUrl: "https://api.example.test/",
      fetch: (async () => Response.json({
        code: "resource_not_found",
        detail: "The workspace was not found.",
        request_id: "request-1",
        retryable: false,
        status: 404,
        title: "Resource not found",
        type: "about:blank",
      }, { status: 404 })) as typeof fetch,
    });

    await expect(client.workspaces.get({ externalId: "piria-organization-1" }))
      .resolves.toBeNull();
  });

  it("creates a missing workspace and returns the stable external mapping", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      external_id: "piria-organization-1",
      id: workspaceId,
      name: "Acme",
    }));
    const client = new CaltraServerClient({
      apiKey: "caltra_test_key",
      apiUrl: "https://api.example.test/",
      fetch: fetchImplementation as typeof fetch,
    });

    await expect(client.workspaces.get({
      createIfMissing: { name: "Acme" },
      externalId: "piria-organization-1",
    })).resolves.toEqual({
      externalId: "piria-organization-1",
      id: workspaceId,
      name: "Acme",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation.mock.calls[0]![0].toString())
      .toBe("https://api.example.test/server/v1/workspaces/get");
    expect(fetchImplementation.mock.calls[0]![1]).toMatchObject({
      body: JSON.stringify({
        create_if_missing: { name: "Acme" },
        external_id: "piria-organization-1",
      }),
      method: "POST",
    });
    const headers = fetchImplementation.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer caltra_test_key");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("preserves structured server errors instead of treating every 404 as absence", async () => {
    const client = new CaltraServerClient({
      apiKey: "caltra_test_key",
      apiUrl: "https://api.example.test",
      fetch: (async () => Response.json({
        code: "workspace_provisioning_failed",
        detail: "The workspace could not be provisioned.",
        request_id: "request-2",
        retryable: true,
        status: 503,
        title: "Workspace provisioning failed",
        type: "about:blank",
      }, { status: 503 })) as typeof fetch,
    });

    const error = await client.workspaces.get({
      createIfMissing: { name: "Acme" },
      externalId: "piria-organization-1",
    }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CaltraServerError);
    expect(error).toMatchObject({
      code: "workspace_provisioning_failed",
      requestId: "request-2",
      retryable: true,
      status: 503,
    });
  });
});
