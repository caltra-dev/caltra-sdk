import { describe, expect, it, vi } from "vitest";
import { CaltraApiError, CaltraClient } from "../src/index.js";

const sessionId = "40000000-0000-4000-8000-000000000001";
const agentId = "50000000-0000-4000-8000-000000000001";

describe("CaltraClient", () => {
  it("keeps the browser receiver when using the global fetch implementation", async () => {
    const fetchImplementation = vi.fn(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(Response.json({ data: [], next_cursor: null }));
    });
    vi.stubGlobal("fetch", fetchImplementation);

    try {
      const client = new CaltraClient({
        apiUrl: "https://api.example.test",
        tokenProvider: async () => "client-token",
      });

      await expect(client.listSessions()).resolves.toEqual({ data: [], next_cursor: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the browser token for session discovery and creation", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return Response.json({
          agent: { id: agentId, name: "Support" },
          created_at: "2026-08-26T16:00:00.000Z",
          id: sessionId,
          status: "active",
          updated_at: "2026-08-26T16:00:00.000Z",
        }, { status: 201 });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      apiUrl: "https://api.example.test/",
      fetch: fetchImplementation as typeof fetch,
      tokenProvider: async () => "client-token",
    });

    await client.listSessions({ cursor: "next", limit: 10 });
    await client.createSession({ agentId });

    const listUrl = fetchImplementation.mock.calls[0]![0] as URL;
    expect(listUrl.toString()).toBe(
      "https://api.example.test/client/v1/sessions?limit=10&cursor=next",
    );
    const listHeaders = fetchImplementation.mock.calls[0]![1]!.headers as Headers;
    expect(listHeaders.get("authorization")).toBe("Bearer client-token");
    expect(fetchImplementation.mock.calls[1]![1]).toMatchObject({
      body: JSON.stringify({ agent_id: agentId }),
      method: "POST",
    });
  });

  it("throws a structured Caltra error for RFC problem responses", async () => {
    const client = new CaltraClient({
      apiUrl: "https://api.example.test",
      fetch: (async () => Response.json({
        code: "resource_not_found",
        detail: "The session is unavailable.",
        request_id: "request-1",
        retryable: false,
        status: 404,
        title: "Resource not found",
        type: "https://api.caltra.dev/problems/resource-not-found",
      }, { status: 404 })) as typeof fetch,
      tokenProvider: async () => "client-token",
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
