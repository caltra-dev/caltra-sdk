import { describe, expect, it, vi } from "vitest";
import { TestAppTokenProvider } from "../src/token_provider.js";

describe("TestAppTokenProvider", () => {
  it("keeps the browser receiver when using the global fetch implementation", async () => {
    const fetchImplementation = vi.fn(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(Response.json({
        api_url: "https://api.example.test",
        client_token: "browser-token",
        expires_at: "2026-08-26T18:00:00.000Z",
        refresh_after: "2026-08-26T17:50:00.000Z",
      }));
    });
    vi.stubGlobal("fetch", fetchImplementation);

    try {
      const provider = new TestAppTokenProvider();
      await expect(provider.getToken()).resolves.toBe("browser-token");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
