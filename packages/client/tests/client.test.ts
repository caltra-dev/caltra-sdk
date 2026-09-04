import { describe, expect, it, vi } from "vitest";
import { CaltraApiError, CaltraClient } from "../src/index.js";

const sessionId = "40000000-0000-4000-8000-000000000001";
const agentId = "50000000-0000-4000-8000-000000000001";

describe("CaltraClient", () => {
  it("adds host authentication headers to the default authorization request", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      if (String(input) === "https://host.example.test/api/caltra/authorize") {
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer host-token");
        expect(init).toMatchObject({
          body: JSON.stringify({ workspace_external_id: "organization-1" }),
          credentials: "include",
          method: "POST",
        });
        return Response.json({ authorization_code: "cac_test" });
      }
      if (String(input).endsWith("/caltra/v1/auth/authenticate")) {
        return Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      apiUrl: "https://api.example.test",
      authorizationHeadersProvider: async () => ({ authorization: "Bearer host-token" }),
      authorizationRoute: "https://host.example.test/api/caltra/authorize",
      fetch: fetchImplementation as typeof fetch,
      workspaceExternalId: "organization-1",
    });

    await expect(client.listSessions()).resolves.toEqual({ data: [], next_cursor: null });
  });

  it("keeps the browser receiver when using the global fetch implementation", async () => {
    const fetchImplementation = vi.fn(function (this: typeof globalThis, input: RequestInfo | URL) {
      expect(this).toBe(globalThis);
      if (input.toString().endsWith("/caltra/v1/auth/authenticate")) {
        return Promise.resolve(Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        }));
      }
      return Promise.resolve(Response.json({ data: [], next_cursor: null }));
    });
    vi.stubGlobal("fetch", fetchImplementation);

    try {
      const client = new CaltraClient({
        apiUrl: "https://api.example.test",
        authorizationCodeProvider: async () => "cac_test",
      });

      await expect(client.listSessions()).resolves.toEqual({ data: [], next_cursor: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the browser token for session discovery and creation", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/caltra/v1/auth/authenticate")) {
        return Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        });
      }
      if (init?.method === "POST") {
        return Response.json({
          agent: { id: agentId, name: "Support" },
          created_at: "2026-08-26T16:00:00.000Z",
          external_id: null,
          id: sessionId,
          status: "active",
          updated_at: "2026-08-26T16:00:00.000Z",
        }, { status: 201 });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      apiUrl: "https://api.example.test/",
      authorizationCodeProvider: async () => "cac_test",
      fetch: fetchImplementation as typeof fetch,
    });

    await client.listSessions({ cursor: "next", limit: 10 });
    await client.createSession({ agentId });

    const listUrl = fetchImplementation.mock.calls[1]![0] as URL;
    expect(listUrl.toString()).toBe(
      "https://api.example.test/client/v1/sessions?limit=10&cursor=next",
    );
    const listHeaders = fetchImplementation.mock.calls[1]![1]!.headers as Headers;
    expect(listHeaders.get("authorization")).toBe("Bearer client-token");
    expect(fetchImplementation.mock.calls[2]![1]).toMatchObject({
      body: JSON.stringify({ agent_id: agentId }),
      method: "POST",
    });
  });

  it("gets or creates the tenant user's stable session by external ID", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      if (input.toString().endsWith("/caltra/v1/auth/authenticate")) {
        return Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        });
      }
      return Response.json({
        agent: { id: agentId, name: "Piria Assistant" },
        created_at: "2026-09-03T18:00:00.000Z",
        external_id: "primary",
        id: sessionId,
        status: "active",
        updated_at: "2026-09-03T18:00:00.000Z",
      });
    });
    const client = new CaltraClient({
      apiUrl: "https://api.example.test",
      authorizationCodeProvider: async () => "cac_test",
      fetch: fetchImplementation as typeof fetch,
    });

    await expect(client.sessions.get({
      createIfMissing: { agentExternalId: "personal-assistant" },
      externalId: "primary",
    })).resolves.toMatchObject({ id: sessionId, external_id: "primary" });
    expect(fetchImplementation.mock.calls[1]![1]).toMatchObject({
      body: JSON.stringify({
        create_if_missing: { agent_external_id: "personal-assistant" },
        external_id: "primary",
      }),
      method: "POST",
    });
  });

  it("throws a structured Caltra error for RFC problem responses", async () => {
    const client = new CaltraClient({
      apiUrl: "https://api.example.test",
      authorizationCodeProvider: async () => "cac_test",
      fetch: (async (input) => input.toString().endsWith("/caltra/v1/auth/authenticate")
        ? Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        })
        : Response.json({
          code: "resource_not_found",
          detail: "The session is unavailable.",
          request_id: "request-1",
          retryable: false,
          status: 404,
          title: "Resource not found",
          type: "https://api.caltra.dev/problems/resource-not-found",
        }, { status: 404 })) as typeof fetch,
    });

    const error = await client.listSessionMessages(sessionId).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CaltraApiError);
    expect(error).toMatchObject({
      code: "resource_not_found",
      requestId: "request-1",
      retryable: false,
      status: 404,
    });
  });
});
