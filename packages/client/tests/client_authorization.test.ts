import { afterEach, describe, expect, it, vi } from "vitest";
import { CaltraApiError, CaltraClient } from "../src/index.js";

const now = new Date("2026-09-01T18:00:00.000Z");

describe("Caltra client authorization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("authenticates a single-use authorization code at the production API by default", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const authorizationCodeProvider = vi.fn(async () => "cac_first");
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/caltra/v1/auth/authenticate")) {
        return Response.json({
          client_token: "client-token",
          expires_at: "2026-09-01T18:10:00.000Z",
          refresh_after: "2026-09-01T18:09:00.000Z",
        });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      authorizationCodeProvider,
      fetch: fetchImplementation as typeof fetch,
    });

    await expect(client.listAgents()).resolves.toEqual({ data: [], next_cursor: null });
    await expect(client.listAgents()).resolves.toEqual({ data: [], next_cursor: null });
    expect(authorizationCodeProvider).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      "https://api.caltra.dev/caltra/v1/auth/authenticate",
      {
        body: JSON.stringify({ authorization_code: "cac_first" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  });

  it("gets authorization from the default same-origin route", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/caltra/authorize") {
        return Response.json({ authorization_code: "cac_same_origin" });
      }
      if (input.toString().endsWith("/caltra/v1/auth/authenticate")) {
        return Response.json({
          client_token: "client-token",
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      fetch: fetchImplementation as typeof fetch,
      workspaceExternalId: "piria-organization-1",
    });

    await client.listAgents();
    expect(fetchImplementation.mock.calls[0]![0]).toBe("/api/caltra/authorize");
    expect(fetchImplementation.mock.calls[0]![1]).toMatchObject({
      body: JSON.stringify({ workspace_external_id: "piria-organization-1" }),
      credentials: "include",
      method: "POST",
    });
    expect(new Headers(fetchImplementation.mock.calls[0]![1]?.headers).get("content-type"))
      .toBe("application/json");
  });

  it("deduplicates concurrent authentication and obtains a new code after invalidation", async () => {
    const authorizationCodeProvider = vi.fn(async () => `cac_${authorizationCodeProvider.mock.calls.length}`);
    let authenticationCount = 0;
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("/caltra/v1/auth/authenticate")) {
        authenticationCount += 1;
        return Response.json({
          client_token: `client-token-${authenticationCount}`,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          refresh_after: new Date(Date.now() + 540_000).toISOString(),
        });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      apiUrl: "https://api.example.test/",
      authorizationCodeProvider,
      fetch: fetchImplementation as typeof fetch,
    });

    await expect(Promise.all([client.listAgents(), client.listAgents()])).resolves.toHaveLength(2);
    expect(authorizationCodeProvider).toHaveBeenCalledTimes(1);

    await client.invalidateToken();
    await expect(client.listAgents()).resolves.toEqual({ data: [], next_cursor: null });
    expect(authorizationCodeProvider).toHaveBeenCalledTimes(2);
  });

  it("refreshes with a new authorization code after the server-provided refresh time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const authorizationCodeProvider = vi.fn(async () => "cac_refresh");
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString().endsWith("/caltra/v1/auth/authenticate")) {
        return Response.json({
          client_token: `client-token-${authorizationCodeProvider.mock.calls.length}`,
          expires_at: "2026-09-01T18:10:00.000Z",
          refresh_after: "2026-09-01T18:01:00.000Z",
        });
      }
      return Response.json({ data: [], next_cursor: null });
    });
    const client = new CaltraClient({
      authorizationCodeProvider,
      fetch: fetchImplementation as typeof fetch,
    });

    await client.listAgents();
    vi.setSystemTime(new Date("2026-09-01T18:01:01.000Z"));
    await client.listAgents();
    expect(authorizationCodeProvider).toHaveBeenCalledTimes(2);
  });

  it("preserves structured Caltra problems from a rejected authorization code", async () => {
    const client = new CaltraClient({
      authorizationCodeProvider: async () => "cac_rejected",
      fetch: (async () => Response.json({
        code: "invalid_authorization_code",
        detail: "The client authorization code is invalid, expired, or already used.",
        request_id: "request-1",
        retryable: false,
        status: 401,
        title: "Invalid authorization code",
        type: "https://api.caltra.dev/problems/invalid-authorization-code",
      }, { status: 401 })) as typeof fetch,
    });

    const error = await client.listAgents().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CaltraApiError);
    expect(error).toMatchObject({ code: "invalid_authorization_code", status: 401 });
  });
});
