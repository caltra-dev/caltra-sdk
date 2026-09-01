import { afterEach, describe, expect, it, vi } from "vitest";
import { CaltraApiError, CaltraHandoffTokenProvider } from "../src/index.js";

const now = new Date("2026-09-01T18:00:00.000Z");

describe("CaltraHandoffTokenProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exchanges a single-use handoff and caches only the short-lived client token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const handoffProvider = vi.fn(async () => "chd_first");
    const fetchImplementation = vi.fn(async () => Response.json({
      client_token: "client-token",
      expires_at: "2026-09-01T18:10:00.000Z",
      refresh_after: "2026-09-01T18:09:00.000Z",
    }));
    const provider = new CaltraHandoffTokenProvider({
      apiUrl: "https://api.caltra.dev/",
      fetch: fetchImplementation as typeof fetch,
      handoffProvider,
    });

    await expect(provider.getToken()).resolves.toBe("client-token");
    await expect(provider.getToken()).resolves.toBe("client-token");
    expect(handoffProvider).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.caltra.dev/client/v1/auth/handoffs/exchange",
      {
        body: JSON.stringify({ handoff_code: "chd_first" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  });

  it("deduplicates concurrent exchanges and obtains a new handoff after invalidation", async () => {
    const handoffProvider = vi.fn(async () => `chd_${handoffProvider.mock.calls.length}`);
    const fetchImplementation = vi.fn(async () => Response.json({
      client_token: `client-token-${fetchImplementation.mock.calls.length}`,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      refresh_after: new Date(Date.now() + 540_000).toISOString(),
    }));
    const provider = new CaltraHandoffTokenProvider({
      apiUrl: "https://api.caltra.dev",
      fetch: fetchImplementation as typeof fetch,
      handoffProvider,
    });

    await expect(Promise.all([provider.getToken(), provider.getToken()]))
      .resolves.toEqual(["client-token-1", "client-token-1"]);
    expect(handoffProvider).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    provider.invalidate();
    await expect(provider.getToken()).resolves.toBe("client-token-2");
    expect(handoffProvider).toHaveBeenCalledTimes(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("refreshes with a new handoff after the server-provided refresh time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const handoffProvider = vi.fn(async () => "chd_refresh");
    const fetchImplementation = vi.fn(async () => Response.json({
      client_token: `client-token-${fetchImplementation.mock.calls.length}`,
      expires_at: "2026-09-01T18:10:00.000Z",
      refresh_after: "2026-09-01T18:01:00.000Z",
    }));
    const provider = new CaltraHandoffTokenProvider({
      apiUrl: "https://api.caltra.dev",
      fetch: fetchImplementation as typeof fetch,
      handoffProvider,
    });

    await expect(provider.getToken()).resolves.toBe("client-token-1");
    vi.setSystemTime(new Date("2026-09-01T18:01:01.000Z"));
    await expect(provider.getToken()).resolves.toBe("client-token-2");
    expect(handoffProvider).toHaveBeenCalledTimes(2);
  });

  it("preserves structured Caltra problems from a rejected handoff", async () => {
    const provider = new CaltraHandoffTokenProvider({
      apiUrl: "https://api.caltra.dev",
      fetch: (async () => Response.json({
        code: "invalid_handoff",
        detail: "The client handoff is invalid, expired, or already used.",
        request_id: "request-1",
        retryable: false,
        status: 401,
        title: "Invalid handoff",
        type: "https://api.caltra.dev/problems/invalid-handoff",
      }, { status: 401 })) as typeof fetch,
      handoffProvider: async () => "chd_rejected",
    });

    const error = await provider.getToken().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CaltraApiError);
    expect(error).toMatchObject({ code: "invalid_handoff", status: 401 });
  });
});
